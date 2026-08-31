// Namespace imports (not destructured) for child_process/runtime/cloudflared-bin
// so tests can mock execFileSync/nativeStatus/nativeStop/getEffectiveMode/
// getDockerContainerNames/findCloudflared at call time — see runtime.js's own
// note on why cloudflared-bin is imported the same way.
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ui = require('./ui-helper');
const runtime = require('./runtime');
const cloudflaredBin = require('./cloudflared-bin');
const settingsStore = require('./settings-store');
const domains = require('./domains');
try { require('dotenv').config({ path: path.join(runtime.DATA_DIR, '.env') }); } catch {}

// Bounded so a hung Docker Desktop / cloudflared login prompt / offline
// network can never stall the whole delete indefinitely (the original bug:
// `docker compose down` with no timeout hung forever against an unresponsive
// Docker Desktop, leaving the UI's delete button spinning permanently).
// Overridable only for tests, which fake a hanging binary and need to prove
// the bound is enforced without actually waiting 20-30s of real time.
const DOCKER_TIMEOUT_MS = Number(process.env.DELETE_TUNNEL_DOCKER_TIMEOUT_MS) || 20000;
const CLOUDFLARED_TIMEOUT_MS = Number(process.env.DELETE_TUNNEL_CLOUDFLARED_TIMEOUT_MS) || 30000;

async function resolveTunnelName() {
  const arg = process.argv[2];

  if (arg) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(arg)) {
      console.error('Invalid tunnel name');
      process.exit(1);
    }
    return arg;
  }

  if (!process.stdin.isTTY) {
    console.error('Usage: node delete-tunnel.js <tunnelName>');
    process.exit(1);
  }

  // Interactive picker — names come from a controlled list (no injection risk)
  const names = runtime.getTunnelNames().sort();
  if (names.length === 0) {
    ui.fail('No tunnels found');
    process.exit(1);
  }

  let selected;
  try {
    selected = await ui.selectFromList(
      'Select tunnel to delete',
      names.map(n => ({ label: n, value: n }))
    );
  } catch {
    console.log(`${ui.c.yellow}Cancelled${ui.c.reset}`);
    process.exit(0);
  }

  // Confirm before irreversible delete (default: No)
  let confirmed;
  try {
    confirmed = await ui.confirmAction(`Delete "${selected}"? This cannot be undone.`, false);
  } catch {
    console.log(`${ui.c.yellow}Cancelled${ui.c.reset}`);
    process.exit(0);
  }

  if (!confirmed) {
    console.log(`${ui.c.yellow}Cancelled${ui.c.reset}`);
    process.exit(0);
  }

  return selected;
}

// stdio 'pipe' (never 'inherit') matters as much as the timeout itself: a
// docker/cloudflared child that's killed after timing out can still leave a
// grandchild holding its inherited stdout fd open (docker CLI's own helper
// process, cloudflared's update checker, etc.) — with 'inherit' that
// grandchild would be holding open the *same* fd as this whole script's own
// stdout, which is what the web API's runScript() reads from; the API call
// would then hang waiting for that pipe to close even though delete-tunnel.js
// itself already timed out and moved on. 'pipe' scopes each fd to just this
// one execFileSync call.
function execFile(bin, args, timeoutMs) {
  try {
    cp.execFileSync(bin, args, { stdio: 'pipe', timeout: timeoutMs });
    return { ok: true };
  } catch (err) {
    if (err.code === 'ETIMEDOUT') {
      return { ok: false, error: `timed out after ${timeoutMs}ms` };
    }
    if (err.signal) {
      return { ok: false, error: `killed by ${err.signal}` };
    }
    const stderr = (err.stderr || '').toString().trim();
    return { ok: false, error: stderr || err.message };
  }
}

// Docker is only ever touched when there's real evidence it's needed: the
// runtime is explicitly configured for docker mode, or a live container for
// this exact tunnel is found via a single bounded `docker ps` (handles a
// tunnel left running from before a docker->native mode switch). In plain
// native mode with no such container, docker is never invoked at all — the
// scenario that actually hung in production (native mode, unresponsive
// Docker Desktop) now costs at most one 5s-bounded check, not an indefinite
// wait.
function shouldTryDocker(tunnelName) {
  if (runtime.getEffectiveMode() === 'docker') return true;
  return runtime.getDockerContainerNames().has(`cloudflared-tunnel-${tunnelName}`);
}

function getHostnamesFromConfig(name) {
  try {
    const configPath = path.join(runtime.TUNNELS_DIR, name, 'config.yml');
    if (!fs.existsSync(configPath)) return [];
    const content = fs.readFileSync(configPath, 'utf8');
    const hostnames = [];
    const regex = /hostname:\s*(\S+)/g;
    let m;
    while ((m = regex.exec(content)) !== null) hostnames.push(m[1]);
    return hostnames;
  } catch (_) { return []; }
}

function cfRequest(method, urlPath) {
  return new Promise(resolve => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${settingsStore.getCloudflareToken()}`,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function deleteDnsRecords(hostnames) {
  const token = settingsStore.getCloudflareToken();
  if (!token) {
    console.warn('[WARN] Missing Cloudflare API token, skipping DNS deletion');
    return [];
  }
  const failed = [];
  for (const hostname of hostnames) {
    // Resolve per-hostname, not a single fixed settingsStore.getZoneId() —
    // a hostname on a 2nd+ domain lives in a different zone (see domains.js).
    const { zoneId } = domains.resolveZone(hostname);
    if (!zoneId) {
      console.warn(`[WARN] Could not resolve Cloudflare zone for ${hostname} (add its domain in Settings › Domains), skipping DNS deletion`);
      failed.push(`DNS ${hostname}: zone not resolved`);
      continue;
    }
    try {
      const res = await cfRequest('GET', `/client/v4/zones/${zoneId}/dns_records?name=${hostname}`);
      if (!res || !res.success || !res.result?.length) {
        console.warn(`[WARN] No DNS record found for: ${hostname}`);
        continue;
      }
      for (const record of res.result) {
        const del = await cfRequest('DELETE', `/client/v4/zones/${zoneId}/dns_records/${record.id}`);
        if (del?.success) console.log(`[OK] Deleted DNS record: ${hostname}`);
        else { console.warn(`[WARN] Failed to delete DNS record: ${hostname}`); failed.push(`DNS ${hostname}`); }
      }
    } catch (err) {
      console.warn(`[WARN] DNS error for ${hostname}: ${err.message}`);
      failed.push(`DNS ${hostname}: ${err.message}`);
    }
  }
  return failed;
}

// Core delete logic, factored out of main() so tests can call it directly
// against a temp TUNNEL_ROOT/TUNNEL_DATA_DIR with fake docker/cloudflared
// binaries on PATH, without going through the interactive picker or
// process.exit(). Returns the list of steps that didn't fully succeed —
// deletion is always best-effort: a failed step is logged and the rest of
// the sequence still runs, so one hung/missing piece can never leave the
// tunnel folder (and therefore the "delete" button) stuck.
async function deleteTunnel(tunnelName) {
  const failedSteps = [];
  console.log(`Deleting tunnel: ${tunnelName}`);

  console.log('[1/5] Stopping tunnel...');
  if (runtime.nativeStatus(tunnelName)) {
    runtime.nativeStop(tunnelName);
    if (runtime.nativeStatus(tunnelName)) {
      ui.warning('Native tunnel process could not be stopped');
      failedSteps.push('native stop');
    }
  }
  if (shouldTryDocker(tunnelName)) {
    const composeFile = path.join(runtime.TUNNELS_DIR, tunnelName, 'docker-compose.yml');
    if (fs.existsSync(composeFile)) {
      const r = execFile('docker', ['compose', '-p', 'tunnel', '-f', composeFile, 'down'], DOCKER_TIMEOUT_MS);
      if (!r.ok) { ui.warning(`docker compose down failed: ${r.error}`); failedSteps.push(`docker compose down: ${r.error}`); }
    }
    // Force-remove by known name too (handles containers started via `docker run`,
    // not just compose) — "No such container" just means there was nothing to
    // remove here, not a real failure.
    const r2 = execFile('docker', ['rm', '-f', `cloudflared-tunnel-${tunnelName}`], DOCKER_TIMEOUT_MS);
    if (!r2.ok && !/no such container/i.test(r2.error)) {
      ui.warning(`docker rm failed: ${r2.error}`);
      failedSteps.push(`docker rm: ${r2.error}`);
    }
  }

  console.log('[2/5] Deleting Cloudflare tunnel...');
  const bin = cloudflaredBin.findCloudflared();
  if (bin) {
    const cleanup = execFile(bin, ['tunnel', 'cleanup', tunnelName], CLOUDFLARED_TIMEOUT_MS);
    if (!cleanup.ok) { ui.warning(`tunnel cleanup failed: ${cleanup.error}`); failedSteps.push(`cloudflared cleanup: ${cleanup.error}`); }
    const del = execFile(bin, ['tunnel', 'delete', '-f', tunnelName], CLOUDFLARED_TIMEOUT_MS);
    if (!del.ok) { ui.warning(`tunnel delete failed: ${del.error}`); failedSteps.push(`cloudflared delete: ${del.error}`); }
  } else {
    ui.warning('cloudflared not found, skipping tunnel delete');
    failedSteps.push('cloudflared not found');
  }

  console.log('[3/5] Deleting DNS records...');
  const hostnames = getHostnamesFromConfig(tunnelName);
  if (hostnames.length > 0) {
    failedSteps.push(...await deleteDnsRecords(hostnames));
  } else {
    console.log('No hostnames found in config, skipping DNS deletion');
  }

  console.log('[4/5] Deleting tunnel folder...');
  const tunnelsBase = path.resolve(runtime.TUNNELS_DIR);
  const tunnelDir = path.resolve(tunnelsBase, tunnelName);
  if (!tunnelDir.startsWith(tunnelsBase + path.sep)) {
    ui.warning('Unsafe tunnel path, skipping folder deletion');
    failedSteps.push('unsafe tunnel path');
  } else if (fs.existsSync(tunnelDir)) {
    try {
      fs.rmSync(tunnelDir, { recursive: true, force: true });
      console.log(`[OK] Deleted: tunnels/${tunnelName}/ (including launchers)`);
    } catch (err) {
      ui.warning(`Could not delete folder: ${err.message}`);
      failedSteps.push(`folder delete: ${err.message}`);
    }
  } else {
    console.log('No tunnel folder found, skipping...');
  }

  // Step 5: (compose is inside tunnel folder — already removed in step 4)
  console.log('[5/5] docker-compose.yml removed with tunnel folder.');

  if (failedSteps.length > 0) {
    ui.warning(`Completed with ${failedSteps.length} step(s) that did not fully succeed:`);
    failedSteps.forEach(s => console.log(`   - ${s}`));
  }
  console.log('Done.');
  return failedSteps;
}

async function main() {
  const tunnelName = await resolveTunnelName();
  await deleteTunnel(tunnelName);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { deleteTunnel, shouldTryDocker };
