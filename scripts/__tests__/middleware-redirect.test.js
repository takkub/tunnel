const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveOrigin } = require('../../web/lib/redirect-origin');

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
