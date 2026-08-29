// Reports whether this dashboard is reachable only on localhost or also
// through a public Cloudflare Tunnel — GET /api/web-status (web/) just
// JSON.parses this script's stdout, same convention as tunnel-health.js.
// Usage: node web-status.js --json
'use strict';
const { listTunnels } = require('./tunnel-status');
const { getDesktopSettings } = require('./settings-store');

const DEFAULT_PORT = 8888;

function parsePort(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

// The port this dashboard is actually bound to wins (process.env.PORT — set
// by web-serve.js/desktop's spawn, or by `next start -p`); only when that's
// unavailable do we fall back to the *configured* port (same TUNNEL_WEB_PORT
// env > settings.json desktop.webPort priority as desktop/src/port-resolver.js),
// then the hardcoded default.
function resolveWebPort(env = process.env, settingsWebPort = getDesktopSettings().webPort) {
  return (
    parsePort(env.PORT) ??
    parsePort(env.TUNNEL_WEB_PORT) ??
    parsePort(settingsWebPort) ??
    DEFAULT_PORT
  );
}

// Finds the tunnel (if any) whose ingress service points at the web port —
// that's the tunnel making this dashboard reachable from the internet.
// Prefers a running match so a leftover stopped tunnel on the same port
// never hides a live one.
function matchPublicTunnel(tunnels, webPort) {
  const matches = tunnels.filter(t => t.port === webPort);
  if (matches.length === 0) return null;
  return matches.find(t => t.running) || matches[0];
}

if (require.main === module) {
  const port = resolveWebPort();
  const match = matchPublicTunnel(listTunnels(), port);
  let publicTunnel = null;
  if (match) {
    const { getTunnelHealth } = require('./tunnel-health');
    const health = getTunnelHealth(match.name);
    publicTunnel = { name: match.name, hostname: match.hostname, running: match.running, health: health.health };
  }
  console.log(JSON.stringify({ port, publicTunnel }, null, 2));
}

module.exports = { resolveWebPort, matchPublicTunnel };
