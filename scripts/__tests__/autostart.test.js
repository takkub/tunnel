const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// autostart.js/tunnel-meta.js/runtime.js all resolve their paths from
// TUNNEL_ROOT/TUNNEL_DATA_DIR at require time — each test loads a fresh copy
// under its own temp root, forced into native mode (this sandbox has Docker
// available, so getEffectiveMode() would otherwise pick 'docker').
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostart-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['autostart.js', 'tunnel-meta.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const modPath = path.join(root, 'scripts', 'autostart.js');
  const runtimePath = path.join(root, 'scripts', 'runtime.js');
  const binPath = path.join(root, 'scripts', 'cloudflared-bin.js');
  for (const f of ['autostart.js', 'tunnel-meta.js', 'runtime.js', 'cloudflared-bin.js']) {
    delete require.cache[require.resolve(path.join(root, 'scripts', f))];
  }
  const prevRoot = process.env.TUNNEL_ROOT;
  const prevData = process.env.TUNNEL_DATA_DIR;
  process.env.TUNNEL_ROOT = root;
  if (dataDir) process.env.TUNNEL_DATA_DIR = dataDir;
  else delete process.env.TUNNEL_DATA_DIR;
  try {
    // Force native mode so the test doesn't depend on Docker availability.
    fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
    const cloudflaredBin = require(binPath);
    return { mod: require(modPath), runtime: require(runtimePath), cloudflaredBin };
  } finally {
    if (prevRoot === undefined) delete process.env.TUNNEL_ROOT; else process.env.TUNNEL_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.TUNNEL_DATA_DIR; else process.env.TUNNEL_DATA_DIR = prevData;
  }
}

function makeTunnel(dataDir, name, { withCredentials = true } = {}) {
  const tunnelDir = path.join(dataDir, 'tunnels', name);
  fs.mkdirSync(tunnelDir, { recursive: true });
  // getTunnelNames() requires config.yml to even list the folder as a tunnel.
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\n');
  if (withCredentials) {
    fs.writeFileSync(path.join(tunnelDir, 'fake-id.json'), '{}');
  }
  return tunnelDir;
}

test('run() starts autostart tunnels that are not running, skips running ones, ignores autostart=false, and reports failures', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostart-test-data-'));
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);

  // Stand in for cloudflared with the current Node binary (always exists, no network needed).
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => process.execPath);

  // A: flagged, not running -> should start
  makeTunnel(dataDir, 'stopped-flagged');
  const { setAutostart } = require(path.join(root, 'scripts', 'tunnel-meta.js'));
  setAutostart('stopped-flagged', true);

  // B: flagged, already running (own pid) -> should skip
  makeTunnel(dataDir, 'running-flagged');
  setAutostart('running-flagged', true);
  const runDir = runtime.getRuntimeDir('running-flagged');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));

  // C: not flagged -> should be ignored entirely
  makeTunnel(dataDir, 'stopped-unflagged');

  // D: flagged but missing credentials file -> nativeStart throws -> failed
  makeTunnel(dataDir, 'broken-flagged', { withCredentials: false });
  setAutostart('broken-flagged', true);

  const summary = mod.run();
  t.after(() => { try { runtime.nativeStop('stopped-flagged'); } catch {} });

  assert.equal(summary.mode, 'native');
  assert.deepEqual(summary.started, ['stopped-flagged']);
  assert.deepEqual(summary.skipped, ['running-flagged']);
  assert.equal(summary.failed.length, 1);
  assert.equal(summary.failed[0].name, 'broken-flagged');
  assert.match(summary.failed[0].error, /credentials/);
});

test('run() returns empty lists when no tunnels exist', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostart-test-data-'));
  const { mod } = loadModule(root, dataDir);

  const summary = mod.run();
  assert.deepEqual(summary, { mode: 'native', started: [], skipped: [], failed: [] });
});
