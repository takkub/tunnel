const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveOrigin, resolveHost, isLoopbackHost } = require('../../web/lib/redirect-origin');

test('resolveOrigin prefers the public Host over the internal bind address (tunnel case)', () => {
  const headers = new Headers({ host: 'tunnels.sabuytube.xyz' });
  const origin = resolveOrigin(headers, 'localhost:8888', 'http:');
  assert.equal(origin, 'https://tunnels.sabuytube.xyz');
});

test('resolveOrigin builds a full redirect Location for a tunneled request', () => {
  const headers = new Headers({ host: 'tunnels.sabuytube.xyz' });
  const origin = resolveOrigin(headers, 'localhost:8888', 'http:');
  const loginUrl = new URL('/login', origin);
  assert.equal(loginUrl.toString(), 'https://tunnels.sabuytube.xyz/login');
});

test('resolveOrigin prefers x-forwarded-host over Host when present', () => {
  const headers = new Headers({
    host: 'internal-proxy:80',
    'x-forwarded-host': 'tunnels.sabuytube.xyz',
  });
  const origin = resolveOrigin(headers, 'localhost:8888', 'http:');
  assert.equal(origin, 'https://tunnels.sabuytube.xyz');
});

test('resolveOrigin ignores x-forwarded-proto for a tunneled host (Next injects http for the raw local hop)', () => {
  const headers = new Headers({ host: 'tunnels.sabuytube.xyz', 'x-forwarded-proto': 'http' });
  const origin = resolveOrigin(headers, 'localhost:8888', 'http:');
  assert.equal(origin, 'https://tunnels.sabuytube.xyz');
});

test('resolveOrigin stays http for a direct local request (no proxy involved)', () => {
  const headers = new Headers({ host: 'localhost:8888' });
  const origin = resolveOrigin(headers, 'localhost:8888', 'http:');
  assert.equal(origin, 'http://localhost:8888');
});

test('resolveOrigin falls back to the internal host when no Host header is present', () => {
  const headers = new Headers();
  const origin = resolveOrigin(headers, 'localhost:8888', 'http:');
  assert.equal(origin, 'http://localhost:8888');
});

// middleware.ts's DESKTOP_MODE-without-ADMIN_PASSWORD bypass gates on
// isLoopbackHost(resolveHost(...)) — same helpers resolveOrigin uses, tested
// directly here since middleware.ts itself pulls in next/server.
test('resolveHost/isLoopbackHost: a direct localhost request is treated as loopback (desktop bypass applies)', () => {
  const headers = new Headers({ host: 'localhost:8888' });
  const host = resolveHost(headers, 'localhost:8888');
  assert.equal(isLoopbackHost(host), true);
});

test('resolveHost/isLoopbackHost: a request over a cloudflared tunnel is not loopback (desktop bypass must not apply)', () => {
  const headers = new Headers({ host: 'tunnels.sabuytube.xyz' });
  const host = resolveHost(headers, 'localhost:8888');
  assert.equal(isLoopbackHost(host), false);
});

test('resolveHost/isLoopbackHost: a spoofed X-Forwarded-Host still overrides Host, and a tunnel domain there is not loopback', () => {
  const headers = new Headers({ host: 'localhost:8888', 'x-forwarded-host': 'tunnels.sabuytube.xyz' });
  const host = resolveHost(headers, 'localhost:8888');
  assert.equal(isLoopbackHost(host), false);
});

test('resolveHost/isLoopbackHost: 127.0.0.1 and both ::1 forms are loopback too', () => {
  assert.equal(isLoopbackHost(resolveHost(new Headers({ host: '127.0.0.1:8888' }), 'localhost:8888')), true);
  assert.equal(isLoopbackHost(resolveHost(new Headers({ host: '[::1]:8888' }), 'localhost:8888')), true);
  assert.equal(isLoopbackHost('::1'), true);
});
