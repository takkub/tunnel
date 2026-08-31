// Pure DNS-routing decision logic, shared by route-dns.js (web API) and
// setup-tunnel.js (interactive CLI). Deliberately does no spawning/execing of
// its own — cloudflared-CLI invocation is injected via
// opts.runCloudflaredRouteDns so this stays testable with node --test and no
// real network/process calls.
'use strict';
const fs = require('fs');
const path = require('path');
const domains = require('./domains');
const settingsStore = require('./settings-store');
const cloudflareApi = require('./cloudflare-api');

function readTunnelId(configPath) {
  const cfg = fs.readFileSync(configPath, 'utf8');
  const m = cfg.match(/^tunnel:\s*([a-f0-9-]{36})/m);
  return m ? m[1] : null;
}

/**
 * Route DNS for hostname -> tunnel, picking the zone that actually owns
 * hostname (per domains.config.json) instead of whichever zone
 * `cloudflared tunnel route dns` would use (the one tied to cert.pem from the
 * last `cloudflared tunnel login`).
 *
 * @param {string} tunnelName
 * @param {string} hostname
 * @param {object} opts
 * @param {string} opts.tunnelsDir - TUNNELS_DIR, injected so tests use a temp dir
 * @param {string} [opts.tunnelId] - skip reading config.yml when already known (setup-tunnel.js has it in memory)
 * @param {(zoneId: string, hostname: string, tunnelId: string, apiToken: string) => Promise<{ok:boolean, action?:string, error?:string}>} [opts.upsertTunnelCname] - defaults to cloudflare-api's real implementation; override in tests
 * @param {() => (string|Promise<string>)} [opts.runCloudflaredRouteDns] - invokes `cloudflared tunnel route dns <tunnelName> <hostname>` however the caller wants (execFileSync with a binary path, execSync with a docker-wrapped command, etc), returning stdout. Omit when no cloudflared fallback is available. Errors should carry .stdout/.stderr/.message like execFileSync/execSync throw.
 * @returns {Promise<{ok: boolean, message: string, method?: 'api'|'cloudflared-cli'}>}
 */
async function routeDns(tunnelName, hostname, opts) {
  const { tunnelsDir, runCloudflaredRouteDns } = opts;
  const upsertTunnelCname = opts.upsertTunnelCname || cloudflareApi.upsertTunnelCname;

  let tunnelId = opts.tunnelId || null;
  if (!tunnelId) {
    const configPath = path.join(tunnelsDir, tunnelName, 'config.yml');
    if (!fs.existsSync(configPath)) {
      return { ok: false, message: `config.yml not found for tunnel: ${tunnelName}` };
    }
    tunnelId = readTunnelId(configPath);
    if (!tunnelId) {
      return { ok: false, message: `Could not read tunnel ID from ${configPath}` };
    }
  }

  const configuredDomains = domains.loadDomains();
  const { zoneId, domain } = domains.resolveZone(hostname);

  if (configuredDomains.length > 0 && !zoneId) {
    return { ok: false, message: `domain สำหรับ "${hostname}" ยังไม่ได้เพิ่มใน Settings › Domains` };
  }

  const apiToken = settingsStore.getCloudflareToken();

  if (zoneId && apiToken) {
    let result;
    try {
      result = await upsertTunnelCname(zoneId, hostname, tunnelId, apiToken);
    } catch (e) {
      return { ok: false, message: `Failed to route DNS for ${hostname} in zone ${domain || zoneId}: ${e.message}` };
    }
    if (!result.ok) {
      return { ok: false, message: `Failed to route DNS for ${hostname} in zone ${domain || zoneId}: ${result.error}` };
    }
    return { ok: true, method: 'api', message: `Routed ${hostname} -> zone ${domain || zoneId} (${result.action}, via Cloudflare API)` };
  }

  if (!runCloudflaredRouteDns) {
    return {
      ok: false,
      message: apiToken
        ? `No Cloudflare zone resolved for ${hostname}.`
        : 'No Cloudflare API token configured (Settings) and cloudflared is not available as a fallback.'
    };
  }

  try {
    const out = await runCloudflaredRouteDns();
    const warning = '[WARN] No Cloudflare API token configured — this record was created via the cloudflared CLI, which uses the zone tied to your last "cloudflared tunnel login". If you have more than one domain, set a Cloudflare API token in Settings so DNS routes to the correct zone.';
    return { ok: true, method: 'cloudflared-cli', message: `${out || 'DNS route updated'}\n${warning}` };
  } catch (err) {
    return { ok: false, message: (err.stdout || '') + (err.stderr || err.message || 'unknown error') };
  }
}

module.exports = { routeDns, readTunnelId };
