const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// tunnel-status.js is a plain top-level script (no exported run()), so it's
// exercised the same way the web dashboard calls it: spawned as a real child
// process against a temp TUNNEL_ROOT/TUNNEL_DATA_DIR, JSON parsed from stdout.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-status-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of [
    'tunnel-status.js', 'runtime.js', 'cloudflared-bin.js', 'auth-gate.js', 'auth-gate-crypto.js', 'tunnel-meta.js',
    'auth-gate-country.js', 'auth-gate-lockout.js', 'auth-gate-cf-rule.js', 'cloudflare-api.js', 'settings-store.js', 'domains.js',
  ]) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function makeTunnel(dataDir, name, { hostname = `${name}.example.com`, port = 6720 } = {}) {
  const tunnelDir = path.join(dataDir, 'tunnels', name);
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), `tunnel: fake-id
credentials-file: fake-id.json

ingress:
  - hostname: ${hostname}
    service: http://localhost:${port}
  - service: http_status:404
`);
  return tunnelDir;
}

function runStatus(root, dataDir, args = []) {
  const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'tunnel-status.js'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, TUNNEL_ROOT: root, TUNNEL_DATA_DIR: dataDir, PATH: process.env.PATH },
  });
  return JSON.parse(out);
}

test('tunnel-status.js reports running:true for a tunnel with a live native pid, false once it dies', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-status-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));

  makeTunnel(dataDir, 'alive', { port: 6720 });
  const runDir = path.join(dataDir, 'runtime', 'alive');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));

  makeTunnel(dataDir, 'dead', { port: 7000 });
  const deadRunDir = path.join(dataDir, 'runtime', 'dead');
  fs.mkdirSync(deadRunDir, { recursive: true });
  fs.writeFileSync(path.join(deadRunDir, '.pid'), '999999999');

  const { tunnels } = runStatus(root, dataDir);
  const byName = Object.fromEntries(tunnels.map(t => [t.name, t]));

  assert.equal(byName.alive.running, true);
  assert.equal(byName.alive.port, 6720);
  assert.equal(byName.dead.running, false);
});

test('tunnel-status.js checks both docker and native regardless of effective runtime mode', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-status-test-data-'));
  // Effective mode left unset (auto) — native liveness must still be honored
  // even when getEffectiveMode() would resolve to 'docker' in an environment
  // where Docker happens to be available (this sandbox has Docker installed).
  makeTunnel(dataDir, 'native-tunnel');
  const runDir = path.join(dataDir, 'runtime', 'native-tunnel');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));

  const { tunnels } = runStatus(root, dataDir);
  assert.equal(tunnels.find(t => t.name === 'native-tunnel').running, true);
});

test('tunnel-status.js supports filtering to a single tunnel by name', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-status-test-data-'));
  makeTunnel(dataDir, 'one');
  makeTunnel(dataDir, 'two');

  const { tunnels } = runStatus(root, dataDir, ['one']);
  assert.deepEqual(tunnels.map(t => t.name), ['one']);
});
