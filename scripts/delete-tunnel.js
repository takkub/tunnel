const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const tunnelName = process.argv[2];
if (!tunnelName) {
  console.error('Usage: node delete-tunnel.js <tunnelName>');
  process.exit(1);
}

if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tunnelName)) {
  console.error('Invalid tunnel name');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');

function execFile(bin, args) {
  try {
    execFileSync(bin, args, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function getCloudflaredBin() {
  const localExe = path.join(projectRoot, 'cloudflared.exe');
  try { execFileSync(localExe, ['--version'], { stdio: 'pipe' }); return localExe; } catch {}
  try { execFileSync('cloudflared', ['--version'], { stdio: 'pipe' }); return 'cloudflared'; } catch {}
  return null;
}

function getHostnamesFromConfig(name) {
  try {
    const configPath = path.join(projectRoot, 'tunnels', name, 'config.yml');
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
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
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
    req.end();
  });
}

async function deleteDnsRecords(hostnames) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.ZONE_ID;
  if (!token || !zoneId) {
    console.warn('[WARN] Missing CLOUDFLARE_API_TOKEN or ZONE_ID, skipping DNS deletion');
    return;
  }
  for (const hostname of hostnames) {
    try {
      const res = await cfRequest('GET', `/client/v4/zones/${zoneId}/dns_records?name=${hostname}`);
      if (!res || !res.success || !res.result?.length) {
        console.warn(`[WARN] No DNS record found for: ${hostname}`);
        continue;
      }
      for (const record of res.result) {
        const del = await cfRequest('DELETE', `/client/v4/zones/${zoneId}/dns_records/${record.id}`);
        if (del?.success) console.log(`[OK] Deleted DNS record: ${hostname}`);
        else console.warn(`[WARN] Failed to delete DNS record: ${hostname}`);
      }
    } catch (err) {
      console.warn(`[WARN] DNS error for ${hostname}: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`Deleting tunnel: ${tunnelName}`);

  // Step 1: Stop docker
  const composeFile = path.join(projectRoot, `docker-compose-cloudflare-${tunnelName}.yml`);
  if (fs.existsSync(composeFile)) {
    console.log('[1/5] Stopping Docker container...');
    const ok = execFile('docker', ['compose', '-f', composeFile, 'down']);
    if (!ok) console.warn('[WARN] docker compose down failed, continuing...');
  } else {
    console.log('[1/5] No docker-compose file found, skipping...');
  }

  // Step 2: Delete cloudflare tunnel
  console.log('[2/5] Deleting Cloudflare tunnel...');
  const bin = getCloudflaredBin();
  if (bin) {
    const ok = execFile(bin, ['tunnel', 'delete', '-f', tunnelName]);
    if (!ok) console.warn('[WARN] tunnel delete failed, continuing...');
  } else {
    console.warn('[WARN] cloudflared not found, skipping tunnel delete');
  }

  // Step 3: Delete DNS records
  console.log('[3/5] Deleting DNS records...');
  const hostnames = getHostnamesFromConfig(tunnelName);
  if (hostnames.length > 0) {
    await deleteDnsRecords(hostnames);
  } else {
    console.log('No hostnames found in config, skipping DNS deletion');
  }

  // Step 4: Delete tunnel folder
  console.log('[4/5] Deleting tunnel folder...');
  const tunnelsBase = path.resolve(projectRoot, 'tunnels');
  const tunnelDir = path.resolve(tunnelsBase, tunnelName);
  if (!tunnelDir.startsWith(tunnelsBase + path.sep)) {
    console.warn('[WARN] Unsafe tunnel path, skipping folder deletion');
  } else if (fs.existsSync(tunnelDir)) {
    try {
      fs.rmSync(tunnelDir, { recursive: true, force: true });
      console.log(`[OK] Deleted: tunnels/${tunnelName}/`);
    } catch (err) {
      console.warn(`[WARN] Could not delete folder: ${err.message}`);
    }
  } else {
    console.log('No tunnel folder found, skipping...');
  }

  // Step 5: Delete docker-compose file
  console.log('[5/5] Deleting docker-compose file...');
  if (fs.existsSync(composeFile)) {
    try {
      fs.unlinkSync(composeFile);
      console.log(`[OK] Deleted: docker-compose-cloudflare-${tunnelName}.yml`);
    } catch (err) {
      console.warn(`[WARN] Could not delete file: ${err.message}`);
    }
  } else {
    console.log('No docker-compose file found, skipping...');
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
