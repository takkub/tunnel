const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createHandler, createRateLimiter } = require('../auth-gate-server');
const { hashPassword, signSession, cookieName } = require('../auth-gate-crypto');

const SECRET = 'test-secret';

function makeTunnel(tunnelsDir, name, password) {
  const dir = path.join(tunnelsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'auth-gate.json'), JSON.stringify({
    enabled: true,
    passwordHash: hashPassword(password),
    originalService: 'http://host.docker.internal:4000',
    gatePort: 8890,
  }));
}

function startServer(opts) {
  const tunnelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-server-tunnels-'));
  const handler = createHandler({
    tunnelsDir,
    secret: SECRET,
    rateLimiter: createRateLimiter(5, 60000),
    ...opts,
  });
  const server = http.createServer(handler);
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, tunnelsDir }));
  });
}

function stop(server) {
  return new Promise(resolve => server.close(resolve));
}

function req(port, { method = 'GET', path: p, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

test('GET /verify with no tunnel header and no cookie is denied', async () => {
  const { server, port } = await startServer();
  try {
    const res = await req(port, { path: '/verify' });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('GET /verify for a tunnel with no session cookie is denied', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const res = await req(port, { path: '/verify', headers: { 'X-Gate-Tunnel': 'promptpay' } });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('GET /verify with a valid signed cookie for that tunnel is allowed', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const cookie = signSession('promptpay', SECRET, 3600);
    const res = await req(port, {
      path: '/verify',
      headers: { 'X-Gate-Tunnel': 'promptpay', Cookie: `${cookieName('promptpay')}=${cookie}` },
    });
    assert.equal(res.status, 200);
  } finally { await stop(server); }
});

test('GET /verify with a cookie signed for a different tunnel is denied', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const cookie = signSession('other-tunnel', SECRET, 3600);
    const res = await req(port, {
      path: '/verify',
      headers: { 'X-Gate-Tunnel': 'promptpay', Cookie: `${cookieName('promptpay')}=${cookie}` },
    });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('GET /login renders the tunnel name with no error by default', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const res = await req(port, { path: '/login', headers: { 'X-Gate-Tunnel': 'promptpay' } });
    assert.equal(res.status, 200);
    assert.match(res.body, /promptpay/);
    assert.match(res.headers['content-type'], /text\/html/);
  } finally { await stop(server); }
});

test('GET /login HTML-escapes an attacker-controlled next value (no attribute breakout)', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const malicious = '/"><script>alert(1)</script>';
    const res = await req(port, {
      path: `/login?next=${encodeURIComponent(malicious)}`,
      headers: { 'X-Gate-Tunnel': 'promptpay' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.includes('<script>alert(1)</script>'), false);
    assert.equal(res.body.includes('"><script>'), false);
    assert.match(res.body, /value="[^"]*&quot;&gt;&lt;script&gt;/);
  } finally { await stop(server); }
});

test('POST /login with the wrong password re-renders with an error and sets no cookie', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const body = 'password=wrong';
    const res = await req(port, {
      method: 'POST',
      path: '/login',
      headers: { 'X-Gate-Tunnel': 'promptpay', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.match(res.body.toLowerCase(), /error|incorrect|invalid/);
  } finally { await stop(server); }
});

test('POST /login with the correct password sets a session cookie and redirects to next', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const body = 'password=secret123&next=%2Fdashboard';
    const res = await req(port, {
      method: 'POST',
      path: '/login',
      headers: { 'X-Gate-Tunnel': 'promptpay', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/dashboard');
    const setCookie = [].concat(res.headers['set-cookie']).join('; ');
    assert.match(setCookie, new RegExp(`${cookieName('promptpay')}=`));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /Path=\//);
  } finally { await stop(server); }
});

test('POST /login with an off-site next falls back to "/" (no open redirect)', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const body = 'password=secret123&next=' + encodeURIComponent('https://evil.example/');
    const res = await req(port, {
      method: 'POST',
      path: '/login',
      headers: { 'X-Gate-Tunnel': 'promptpay', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/');
  } finally { await stop(server); }
});

test('a session issued by POST /login is accepted by /verify', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const body = 'password=secret123';
    const loginRes = await req(port, {
      method: 'POST',
      path: '/login',
      headers: { 'X-Gate-Tunnel': 'promptpay', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    const setCookie = [].concat(loginRes.headers['set-cookie'])[0].split(';')[0];
    const verifyRes = await req(port, { path: '/verify', headers: { 'X-Gate-Tunnel': 'promptpay', Cookie: setCookie } });
    assert.equal(verifyRes.status, 200);
  } finally { await stop(server); }
});

test('repeated failed logins from the same IP are rate-limited', async () => {
  const { server, port, tunnelsDir } = await startServer({ rateLimiter: createRateLimiter(3, 60000) });
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const body = 'password=wrong';
    const headers = { 'X-Gate-Tunnel': 'promptpay', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) };
    let last;
    for (let i = 0; i < 4; i++) {
      last = await req(port, { method: 'POST', path: '/login', headers, body });
    }
    assert.equal(last.status, 429);
  } finally { await stop(server); }
});

test('GET /logout clears the session cookie', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'secret123');
    const res = await req(port, { path: '/logout', headers: { 'X-Gate-Tunnel': 'promptpay' } });
    const setCookie = [].concat(res.headers['set-cookie']).join('; ');
    assert.match(setCookie, new RegExp(`${cookieName('promptpay')}=;`));
    assert.match(setCookie, /Max-Age=0/);
  } finally { await stop(server); }
});

test('/verify for a tunnel with no auth-gate.json fails closed (401)', async () => {
  const { server, port } = await startServer();
  try {
    const res = await req(port, { path: '/verify', headers: { 'X-Gate-Tunnel': 'unknown-tunnel' } });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('changing the password immediately invalidates the old one (state read fresh each request)', async () => {
  const { server, port, tunnelsDir } = await startServer();
  try {
    makeTunnel(tunnelsDir, 'promptpay', 'oldpass');
    fs.writeFileSync(path.join(tunnelsDir, 'promptpay', 'auth-gate.json'), JSON.stringify({
      enabled: true, passwordHash: hashPassword('newpass'), originalService: 'x', gatePort: 8890,
    }));
    const body = 'password=oldpass';
    const res = await req(port, {
      method: 'POST',
      path: '/login',
      headers: { 'X-Gate-Tunnel': 'promptpay', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['set-cookie'], undefined);
  } finally { await stop(server); }
});
