const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWebPort, matchPublicTunnel } = require('../web-status');

test('matchPublicTunnel finds the tunnel whose config port equals the web port', () => {
  const tunnels = [
    { name: 'blog', running: true, port: 3000 },
    { name: 'tunnels', running: true, port: 8888 },
  ];
  assert.equal(matchPublicTunnel(tunnels, 8888).name, 'tunnels');
});

test('matchPublicTunnel returns null when no tunnel targets the web port', () => {
  const tunnels = [{ name: 'blog', running: true, port: 3000 }];
  assert.equal(matchPublicTunnel(tunnels, 8888), null);
});

test('matchPublicTunnel prefers a running match over a stopped duplicate on the same port', () => {
  const tunnels = [
    { name: 'old', running: false, port: 8888 },
    { name: 'current', running: true, port: 8888 },
  ];
  assert.equal(matchPublicTunnel(tunnels, 8888).name, 'current');
});

test('matchPublicTunnel falls back to the first match when none are running', () => {
  const tunnels = [
    { name: 'a', running: false, port: 8888 },
    { name: 'b', running: false, port: 8888 },
  ];
  assert.equal(matchPublicTunnel(tunnels, 8888).name, 'a');
});

test('resolveWebPort prefers the actually-bound PORT env over everything else', () => {
  assert.equal(resolveWebPort({ PORT: '9999', TUNNEL_WEB_PORT: '7000' }, 6000), 9999);
});

test('resolveWebPort falls back to TUNNEL_WEB_PORT when PORT is unset', () => {
  assert.equal(resolveWebPort({ TUNNEL_WEB_PORT: '7000' }, 6000), 7000);
});

test('resolveWebPort falls back to settings.json desktop.webPort next', () => {
  assert.equal(resolveWebPort({}, 6000), 6000);
});

test('resolveWebPort defaults to 8888 when nothing is configured', () => {
  assert.equal(resolveWebPort({}, null), 8888);
});

test('resolveWebPort ignores invalid values', () => {
  assert.equal(resolveWebPort({ PORT: 'not-a-port' }, null), 8888);
});
