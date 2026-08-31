// Native (Docker-free) per-tunnel login gate: a single Node process that fronts every
// enabled tunnel's local service. Routes by Host header (multiple enabled tunnels share
// one process), serves /__gate/login + /__gate/logout itself, and reverse-proxies
// (streaming, incl. WebSocket upgrade) everything else to the tunnel's original service
// once a signed session cookie is present. Builtin http only, no dependencies.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { createHandler, parseCookies } = require('./auth-gate-server');
const { verifySession, cookieName, ensureSecretFile } = require('./auth-gate-crypto');
const { isCountryAllowed, renderCountryBlocked } = require('./auth-gate-country');

const ROOT = path.join(__dirname, '..');
const TUNNEL_ROOT = process.env.TUNNEL_ROOT || ROOT;
const TUNNEL_DATA_DIR = process.env.TUNNEL_DATA_DIR || TUNNEL_ROOT;

const DEFAULT_TUNNELS_DIR = path.join(TUNNEL_DATA_DIR, 'tunnels');
const DEFAULT_RUNTIME_DIR = path.join(TUNNEL_DATA_DIR, 'runtime', 'auth-gate');
const DEFAULT_SECRET_FILE = path.join(DEFAULT_RUNTIME_DIR, '.secret');
const DEFAULT_TEMPLATE_PATH = path.join(TUNNEL_ROOT, 'nginx', 'auth-gate', 'login.html');
const DEFAULT_PORT = 8890;

// Scans <tunnelsDir>/*/auth-gate.json for enabled gates and indexes them by hostname —
// rebuilt wholesale on every reload rather than diffed, since it's a handful of tiny files.
function buildRoutingTable(tunnelsDir) {
  const table = new Map();
  let names;
  try { names = fs.readdirSync(tunnelsDir); } catch { return table; }
  for (const name of names) {
    const dir = path.join(tunnelsDir, name);
    let stat;
    try { stat = fs.statSync(dir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    let state;
    try { state = JSON.parse(fs.readFileSync(path.join(dir, 'auth-gate.json'), 'utf8')); } catch { continue; }
    if (!state.enabled || !state.hostname || !state.originalService) continue;
    table.set(state.hostname, { name, originalService: state.originalService, allowedCountries: state.allowedCountries || [] });
  }
  return table;
}

function forwardedHeaders(req) {
  const headers = Object.assign({}, req.headers);
  const remote = req.socket.remoteAddress || '';
  headers['x-real-ip'] = remote;
  headers['x-forwarded-for'] = headers['x-forwarded-for'] ? `${headers['x-forwarded-for']}, ${remote}` : remote;
  headers['x-forwarded-proto'] = 'https';
  return headers;
}

function proxyRequest(req, res, target) {
  let url;
  try { url = new URL(target); } catch { res.writeHead(502); res.end('Bad gateway target'); return; }
  const client = url.protocol === 'https:' ? https : http;
  const proxyReq = client.request({
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: forwardedHeaders(req),
  }, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => { try { res.writeHead(502); res.end('Bad gateway'); } catch {} });
  req.pipe(proxyReq);
}

function proxyUpgrade(req, socket, head, target) {
  let url;
  try { url = new URL(target); } catch { socket.destroy(); return; }
  const proxyReq = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: req.url,
    method: req.method,
    headers: forwardedHeaders(req),
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    let raw = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      raw += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
    }
    raw += '\r\n';
    socket.write(raw);
    if (proxyHead && proxyHead.length) socket.write(proxyHead);
    if (head && head.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('error', () => { try { socket.destroy(); } catch {} });
  socket.on('error', () => { try { proxyReq.destroy(); } catch {} });
  proxyReq.end();
}

// opts.watch (default true) keeps the routing table current as tunnels/*/auth-gate.json
// changes; pass watch:false in tests to avoid leaking a filesystem watcher per test.
function createProxy(opts = {}) {
  const tunnelsDir = opts.tunnelsDir || DEFAULT_TUNNELS_DIR;
  const secretFile = opts.secretFile || DEFAULT_SECRET_FILE;
  const secret = opts.secret || process.env.GATE_SECRET || process.env.SESSION_SECRET || ensureSecretFile(secretFile);
  const templatePath = opts.loginTemplatePath || DEFAULT_TEMPLATE_PATH;

  let routes = buildRoutingTable(tunnelsDir);
  function reload() { routes = buildRoutingTable(tunnelsDir); }

  const runtimeDir = opts.runtimeDir || DEFAULT_RUNTIME_DIR;
  const gateHandler = createHandler({ tunnelsDir, secret, loginTemplatePath: templatePath, runtimeDir });

  async function handle(req, res) {
    const host = (req.headers.host || '').split(':')[0];
    const route = routes.get(host);
    if (!route) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Unknown host'); return; }

    // Country check runs ahead of everything else, including the gate's own
    // login/verify paths — a blocked visitor shouldn't even see the login form.
    const country = req.headers['cf-ipcountry'];
    if (!isCountryAllowed(route.allowedCountries, country, req.socket.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderCountryBlocked(country));
      return;
    }

    let url;
    try { url = new URL(req.url, 'http://internal'); } catch { res.writeHead(400); res.end(); return; }

    // /verify is nginx's internal auth_request target in docker mode; not meant to be
    // reachable directly, so keep parity here even though this proxy never calls it.
    if (url.pathname === '/__gate/verify') { res.writeHead(404); res.end(); return; }

    if (url.pathname === '/__gate' || url.pathname.startsWith('/__gate/')) {
      req.headers['x-gate-tunnel'] = route.name;
      req.url = req.url.slice('/__gate'.length) || '/';
      await gateHandler(req, res);
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    if (!verifySession(route.name, cookies[cookieName(route.name)], secret)) {
      res.writeHead(302, { Location: `/__gate/login?next=${encodeURIComponent(req.url)}` });
      res.end();
      return;
    }

    proxyRequest(req, res, route.originalService);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => { try { res.writeHead(502); res.end(); } catch {} });
  });

  server.on('upgrade', (req, socket, head) => {
    const host = (req.headers.host || '').split(':')[0];
    const route = routes.get(host);
    if (!route) { socket.destroy(); return; }
    if (!isCountryAllowed(route.allowedCountries, req.headers['cf-ipcountry'], req.socket.remoteAddress)) { socket.destroy(); return; }
    const cookies = parseCookies(req.headers.cookie);
    if (!verifySession(route.name, cookies[cookieName(route.name)], secret)) { socket.destroy(); return; }
    proxyUpgrade(req, socket, head, route.originalService);
  });

  let watcher = null;
  if (opts.watch !== false) {
    try {
      fs.mkdirSync(tunnelsDir, { recursive: true });
      watcher = fs.watch(tunnelsDir, { recursive: true }, () => reload());
    } catch {}
  }

  function close(cb) {
    if (watcher) { try { watcher.close(); } catch {} }
    server.close(cb);
  }

  return { server, reload, close };
}

module.exports = { createProxy, buildRoutingTable };

if (require.main === module) {
  const port = parseInt(process.env.AUTH_GATE_PORT || String(DEFAULT_PORT), 10);
  const { server, reload } = createProxy();
  try { process.on('SIGHUP', reload); } catch {}
  server.listen(port, () => {
    process.stdout.write(`auth-gate-proxy listening on :${port}\n`);
  });
}
