// Login/verify HTTP service for the per-tunnel gate. Plain Node http — no framework.
// Endpoints (all scoped to a single tunnel via the X-Gate-Tunnel header nginx sets):
//   GET  /verify  -> 200 (valid session cookie) or 401 (nginx auth_request target)
//   GET  /login   -> renders the login page
//   POST /login   -> checks password, sets session cookie, redirects to ?next
//   GET  /logout  -> clears the session cookie
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const {
  verifyPassword,
  signSession,
  verifySession,
  cookieName,
  isSafeNextPath,
  ensureSecretFile,
  SEVEN_DAYS,
} = require('./auth-gate-crypto');

const ROOT = path.join(__dirname, '..');
const DEFAULT_TUNNELS_DIR = path.join(ROOT, 'tunnels');
const DEFAULT_TEMPLATE_PATH = path.join(ROOT, 'nginx', 'auth-gate', 'login.html');
const DEFAULT_SECRET_FILE = path.join(ROOT, 'nginx', 'auth-gate', '.secret');

const FALLBACK_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>{{tunnel}} - Sign in</title></head>
<body>
<h1>{{tunnel}}</h1>
{{error}}
<form method="post" action="/__gate/login">
<input type="hidden" name="next" value="{{next}}">
<input type="password" name="password" placeholder="Password" autofocus>
<button type="submit">Sign in</button>
</form>
</body></html>
`;

function createRateLimiter(maxAttempts, windowMs) {
  const hits = new Map();
  return {
    allow(key) {
      const now = Date.now();
      const rec = hits.get(key);
      if (!rec || now > rec.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (rec.count >= maxAttempts) return false;
      rec.count++;
      return true;
    },
  };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function readState(tunnelsDir, tunnelName) {
  try {
    const p = path.join(tunnelsDir, tunnelName, 'auth-gate.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function renderLogin(templatePath, { tunnel, error, next }) {
  let template = FALLBACK_TEMPLATE;
  try {
    if (templatePath && fs.existsSync(templatePath)) template = fs.readFileSync(templatePath, 'utf8');
  } catch {}
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
  return template
    .split('{{tunnel}}').join(escapeHtml(tunnel))
    .split('{{error}}').join(errorHtml)
    .split('{{next}}').join(escapeHtml(next));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildSessionCookie(tunnelName, secret) {
  const value = signSession(tunnelName, secret, SEVEN_DAYS);
  return `${cookieName(tunnelName)}=${value}; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=${SEVEN_DAYS}`;
}

function buildClearCookie(tunnelName) {
  return `${cookieName(tunnelName)}=; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=0`;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function createHandler(opts = {}) {
  const tunnelsDir = opts.tunnelsDir || DEFAULT_TUNNELS_DIR;
  const templatePath = opts.loginTemplatePath || DEFAULT_TEMPLATE_PATH;
  const secretFile = opts.secretFile || DEFAULT_SECRET_FILE;
  const secret = opts.secret || process.env.GATE_SECRET || process.env.SESSION_SECRET || ensureSecretFile(secretFile);
  const rateLimiter = opts.rateLimiter || createRateLimiter(5, 60 * 1000);

  return async function handler(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://internal');
    } catch {
      res.writeHead(400); res.end(); return;
    }
    const tunnelName = req.headers['x-gate-tunnel'];

    if (req.method === 'GET' && url.pathname === '/verify') {
      if (!tunnelName) { res.writeHead(401); res.end(); return; }
      const cookies = parseCookies(req.headers.cookie);
      const ok = verifySession(tunnelName, cookies[cookieName(tunnelName)], secret);
      res.writeHead(ok ? 200 : 401);
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/login') {
      if (!tunnelName) { res.writeHead(400); res.end('missing tunnel'); return; }
      const rawNext = url.searchParams.get('next') || '/';
      const next = isSafeNextPath(rawNext) ? rawNext : '/';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLogin(templatePath, { tunnel: tunnelName, error: '', next }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/login') {
      if (!tunnelName) { res.writeHead(400); res.end('missing tunnel'); return; }

      if (!rateLimiter.allow(clientIp(req))) {
        res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLogin(templatePath, { tunnel: tunnelName, error: 'Too many attempts. Try again in a minute.', next: '/' }));
        return;
      }

      let body;
      try { body = await readBody(req); } catch { res.writeHead(413); res.end(); return; }
      const params = new URLSearchParams(body);
      const password = params.get('password') || '';
      const rawNext = params.get('next') || '/';
      const next = isSafeNextPath(rawNext) ? rawNext : '/';

      const state = readState(tunnelsDir, tunnelName);
      if (state && state.enabled && verifyPassword(password, state.passwordHash)) {
        res.writeHead(302, { 'Set-Cookie': buildSessionCookie(tunnelName, secret), Location: next });
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLogin(templatePath, { tunnel: tunnelName, error: 'Incorrect password.', next }));
      return;
    }

    if (url.pathname === '/logout') {
      if (!tunnelName) { res.writeHead(400); res.end('missing tunnel'); return; }
      res.writeHead(302, { 'Set-Cookie': buildClearCookie(tunnelName), Location: '/__gate/login' });
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  };
}

module.exports = { createHandler, createRateLimiter, parseCookies };

if (require.main === module) {
  const port = parseInt(process.env.PORT || '8891', 10);
  const server = http.createServer(createHandler());
  server.listen(port, () => {
    process.stdout.write(`auth-gate-server listening on :${port}\n`);
  });
}
