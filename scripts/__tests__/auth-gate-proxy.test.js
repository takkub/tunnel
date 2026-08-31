const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');

const { createProxy, buildRoutingTable } = require('../auth-gate-proxy');
const { hashPassword, signSession, cookieName } = require('../auth-gate-crypto');

const SECRET = 'test-secret';

function makeTunnel(tunnelsDir, name, { hostname, originalService, password, allowedCountries }) {
  const dir = path.join(tunnelsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'auth-gate.json'), JSON.stringify({
    enabled: true,
    passwordHash: hashPassword(password),
    originalService,
    gatePort: 8890,
    hostname,
    allowedCountries: allowedCountries || [],
  }));
}

function startOrigin(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function startProxy(opts = {}) {
  const tunnelsDir = opts.tunnelsDir || fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-proxy-tunnels-'));
  const { server, reload, close } = createProxy(Object.assign({ tunnelsDir, secret: SECRET, watch: false }, opts));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, reload, close, port: server.address().port, tunnelsDir };
}

function stop(close) {
  return new Promise(resolve => close(resolve));
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

test('buildRoutingTable only includes enabled tunnels with hostname + originalService', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-proxy-table-'));
  makeTunnel(dir, 'a', { hostname: 'a.example.com', originalService: 'http://localhost:4000', password: 'x' });
  fs.mkdirSync(path.join(dir, 'b'), { recursive: true }); // no state file at all
  fs.mkdirSync(path.join(dir, 'c'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'c', 'auth-gate.json'), JSON.stringify({ enabled: false, hostname: 'c.example.com', originalService: 'x' }));
  const table = buildRoutingTable(dir);
  assert.equal(table.size, 1);
  assert.equal(table.get('a.example.com').name, 'a');
});

test('unknown Host header returns 404', async () => {
  const { port, close } = await startProxy();
  try {
    const res = await req(port, { path: '/', headers: { Host: 'nope.example.com' } });
    assert.equal(res.status, 404);
  } finally { await stop(close); }
});

test('a request with no session cookie redirects to /__gate/login with next preserved', async () => {
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: 'http://127.0.0.1:1', password: 'secret123' });
    reload();
    const res = await req(port, { path: '/dashboard?x=1', headers: { Host: 'pay.example.com' } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/__gate/login?next=%2Fdashboard%3Fx%3D1');
  } finally { await stop(close); }
});

test('GET /__gate/verify is blocked directly (internal-only, matches docker mode)', async () => {
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: 'http://127.0.0.1:1', password: 'secret123' });
    reload();
    const res = await req(port, { path: '/__gate/verify', headers: { Host: 'pay.example.com' } });
    assert.equal(res.status, 404);
  } finally { await stop(close); }
});

test('POST /__gate/login with the correct password sets a cookie, then a proxied request with it reaches the origin', async () => {
  const origin = await startOrigin((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`hit:${req.headers.host}:${req.url}`);
  });
  const originPort = origin.address().port;
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: `http://127.0.0.1:${originPort}`, password: 'secret123' });
    reload();

    const body = 'password=secret123';
    const loginRes = await req(port, {
      method: 'POST',
      path: '/__gate/login',
      headers: { Host: 'pay.example.com', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    assert.equal(loginRes.status, 302);
    const setCookie = [].concat(loginRes.headers['set-cookie'])[0].split(';')[0];
    assert.match(setCookie, new RegExp(`^${cookieName('promptpay')}=`));

    const appRes = await req(port, { path: '/app/page', headers: { Host: 'pay.example.com', Cookie: setCookie } });
    assert.equal(appRes.status, 200);
    // Host is preserved as the public tunnel hostname when forwarded, same as nginx's proxy_set_header Host $host
    assert.equal(appRes.body, 'hit:pay.example.com:/app/page');
  } finally { await stop(close); origin.close(); }
});

test('a request with a valid pre-signed cookie is proxied straight through, streaming the response body', async () => {
  const bigChunk = 'x'.repeat(50000);
  const origin = await startOrigin((req, res) => {
    res.writeHead(200);
    res.write(bigChunk);
    res.end(bigChunk);
  });
  const originPort = origin.address().port;
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: `http://127.0.0.1:${originPort}`, password: 'secret123' });
    reload();
    const cookie = `${cookieName('promptpay')}=${signSession('promptpay', SECRET, 3600)}`;
    const res = await req(port, { path: '/', headers: { Host: 'pay.example.com', Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.equal(res.body, bigChunk + bigChunk);
  } finally { await stop(close); origin.close(); }
});

test('a cookie signed for a different tunnel does not grant access', async () => {
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: 'http://127.0.0.1:1', password: 'secret123' });
    reload();
    const cookie = `${cookieName('promptpay')}=${signSession('other-tunnel', SECRET, 3600)}`;
    const res = await req(port, { path: '/', headers: { Host: 'pay.example.com', Cookie: cookie } });
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^\/__gate\/login/);
  } finally { await stop(close); }
});

test('a request from a country outside the allowlist gets a bilingual 403, even with a valid session cookie', async () => {
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: 'http://127.0.0.1:1', password: 'secret123', allowedCountries: ['TH'] });
    reload();
    const cookie = `${cookieName('promptpay')}=${signSession('promptpay', SECRET, 3600)}`;
    const res = await req(port, { path: '/', headers: { Host: 'pay.example.com', Cookie: cookie, 'CF-IPCountry': 'US' } });
    assert.equal(res.status, 403);
    assert.match(res.body, /ไม่อนุญาตให้เข้าถึงจากประเทศนี้/);
    assert.match(res.body, /not allowed/);
  } finally { await stop(close); }
});

test('a request from an allowed country reaches the origin as normal', async () => {
  const origin = await startOrigin((req, res) => { res.writeHead(200); res.end('ok'); });
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: `http://127.0.0.1:${origin.address().port}`, password: 'secret123', allowedCountries: ['TH', 'US'] });
    reload();
    const cookie = `${cookieName('promptpay')}=${signSession('promptpay', SECRET, 3600)}`;
    const res = await req(port, { path: '/', headers: { Host: 'pay.example.com', Cookie: cookie, 'CF-IPCountry': 'TH' } });
    assert.equal(res.status, 200);
    assert.equal(res.body, 'ok');
  } finally { await stop(close); origin.close(); }
});

test('the country block also applies to the gate\'s own login page, before it ever renders', async () => {
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: 'http://127.0.0.1:1', password: 'secret123', allowedCountries: ['TH'] });
    reload();
    const res = await req(port, { path: '/__gate/login', headers: { Host: 'pay.example.com', 'CF-IPCountry': 'RU' } });
    assert.equal(res.status, 403);
  } finally { await stop(close); }
});

// (The "missing header from a non-local address" case is covered at the unit
// level in auth-gate-country.test.js — this suite's client always connects
// over loopback, so that scenario can't be reproduced over a real socket here.)
test('a missing cf-ipcountry header from the loopback address is allowed (local dev bypass)', async () => {
  const origin = await startOrigin((req, res) => { res.writeHead(200); res.end('ok'); });
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'promptpay', { hostname: 'pay.example.com', originalService: `http://127.0.0.1:${origin.address().port}`, password: 'secret123', allowedCountries: ['TH'] });
    reload();
    const cookie = `${cookieName('promptpay')}=${signSession('promptpay', SECRET, 3600)}`;
    const res = await req(port, { path: '/', headers: { Host: 'pay.example.com', Cookie: cookie } });
    assert.equal(res.status, 200);
  } finally { await stop(close); origin.close(); }
});

test('two enabled tunnels share one proxy process, routed independently by Host header', async () => {
  const originA = await startOrigin((req, res) => { res.writeHead(200); res.end('A'); });
  const originB = await startOrigin((req, res) => { res.writeHead(200); res.end('B'); });
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'a', { hostname: 'a.example.com', originalService: `http://127.0.0.1:${originA.address().port}`, password: 'pa' });
    makeTunnel(tunnelsDir, 'b', { hostname: 'b.example.com', originalService: `http://127.0.0.1:${originB.address().port}`, password: 'pb' });
    reload();

    const cookieA = `${cookieName('a')}=${signSession('a', SECRET, 3600)}`;
    const cookieB = `${cookieName('b')}=${signSession('b', SECRET, 3600)}`;
    const resA = await req(port, { path: '/', headers: { Host: 'a.example.com', Cookie: cookieA } });
    const resB = await req(port, { path: '/', headers: { Host: 'b.example.com', Cookie: cookieB } });
    assert.equal(resA.body, 'A');
    assert.equal(resB.body, 'B');
  } finally { await stop(close); originA.close(); originB.close(); }
});

test('reload() picks up a newly enabled tunnel without restarting the process', async () => {
  const origin = await startOrigin((req, res) => { res.writeHead(200); res.end('late'); });
  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    let res = await req(port, { path: '/', headers: { Host: 'late.example.com' } });
    assert.equal(res.status, 404);

    makeTunnel(tunnelsDir, 'late', { hostname: 'late.example.com', originalService: `http://127.0.0.1:${origin.address().port}`, password: 'secret123' });
    reload();

    const cookie = `${cookieName('late')}=${signSession('late', SECRET, 3600)}`;
    res = await req(port, { path: '/', headers: { Host: 'late.example.com', Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.equal(res.body, 'late');
  } finally { await stop(close); origin.close(); }
});

test('WebSocket upgrade with a valid cookie is proxied through to the origin', async () => {
  const origin = http.createServer();
  origin.on('upgrade', (req, socket, head) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n\r\n'
    );
    socket.write('echo:hello');
    socket.end();
  });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  const originPort = origin.address().port;

  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'ws', { hostname: 'ws.example.com', originalService: `http://127.0.0.1:${originPort}`, password: 'secret123' });
    reload();
    const cookie = `${cookieName('ws')}=${signSession('ws', SECRET, 3600)}`;

    const received = await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          `GET / HTTP/1.1\r\n` +
          `Host: ws.example.com\r\n` +
          `Cookie: ${cookie}\r\n` +
          `Connection: Upgrade\r\n` +
          `Upgrade: websocket\r\n\r\n`
        );
      });
      let data = '';
      socket.on('data', chunk => {
        data += chunk.toString();
        if (data.includes('echo:hello')) { socket.end(); resolve(data); }
      });
      socket.on('error', reject);
      setTimeout(() => reject(new Error('timeout waiting for upgrade echo')), 5000);
    });

    assert.match(received, /101 Switching Protocols/);
    assert.match(received, /echo:hello/);
  } finally { await stop(close); origin.close(); }
});

test('a WebSocket upgrade with no valid cookie is refused (socket destroyed, no origin hit)', async () => {
  let originHit = false;
  const origin = http.createServer();
  origin.on('upgrade', (req, socket) => { originHit = true; socket.destroy(); });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));

  const { port, tunnelsDir, reload, close } = await startProxy();
  try {
    makeTunnel(tunnelsDir, 'ws', { hostname: 'ws.example.com', originalService: `http://127.0.0.1:${origin.address().port}`, password: 'secret123' });
    reload();

    await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          `GET / HTTP/1.1\r\n` +
          `Host: ws.example.com\r\n` +
          `Connection: Upgrade\r\n` +
          `Upgrade: websocket\r\n\r\n`
        );
      });
      socket.on('close', resolve);
      socket.on('error', resolve);
      setTimeout(resolve, 500);
    });
    assert.equal(originHit, false);
  } finally { await stop(close); origin.close(); }
});
