const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// web-serve.js resolves ROOT/DATA_DIR (via runtime.js) from
// TUNNEL_ROOT/TUNNEL_DATA_DIR at require time, so each test loads a fresh
// copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-serve-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['web-serve.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const modPath = path.join(root, 'scripts', 'web-serve.js');
  for (const f of ['web-serve.js', 'runtime.js', 'cloudflared-bin.js']) {
    delete require.cache[require.resolve(path.join(root, 'scripts', f))];
  }
  const prevRoot = process.env.TUNNEL_ROOT;
  const prevData = process.env.TUNNEL_DATA_DIR;
  process.env.TUNNEL_ROOT = root;
  if (dataDir) process.env.TUNNEL_DATA_DIR = dataDir;
  else delete process.env.TUNNEL_DATA_DIR;
  try {
    return require(modPath);
  } finally {
    if (prevRoot === undefined) delete process.env.TUNNEL_ROOT; else process.env.TUNNEL_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.TUNNEL_DATA_DIR; else process.env.TUNNEL_DATA_DIR = prevData;
  }
}

// Stands in for the real `next build` standalone output: server.js just
// sleeps forever, ignoring whatever env/args it's given — enough to prove
// web-serve.js's own spawn/pid/stop lifecycle without needing a real Next build.
function makeFakeStandalone(root) {
  const standaloneDir = path.join(root, 'web', '.next', 'standalone');
  fs.mkdirSync(standaloneDir, { recursive: true });
  fs.writeFileSync(path.join(standaloneDir, 'server.js'), 'setInterval(() => {}, 1e9);\n');

  // Source dirs copy-staged into place alongside server.js on start.
  fs.mkdirSync(path.join(root, 'web', '.next', 'static'), { recursive: true });
  fs.writeFileSync(path.join(root, 'web', '.next', 'static', 'marker.txt'), 'static-asset');
  fs.mkdirSync(path.join(root, 'web', 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'web', 'public', 'favicon.ico'), 'icon');

  return standaloneDir;
}

test('start() throws a clear error when the standalone build is missing', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-serve-test-data-'));
  const mod = loadModule(root, dataDir);

  assert.throws(() => mod.start(8888), /npm --prefix web run build/);
});

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return predicate();
}

test('start() spawns the standalone server, stages static assets, and records pid; status()/stop() reflect it', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-serve-test-data-'));
  const standaloneDir = makeFakeStandalone(root);
  const mod = loadModule(root, dataDir);

  const result = mod.start(8888);
  t.after(() => { try { mod.stop(); } catch {} });

  assert.equal(result.running, true);
  assert.ok(result.pid > 0);
  assert.equal(result.port, 8888);

  // Static assets staged alongside server.js (next build doesn't do this itself).
  assert.equal(fs.readFileSync(path.join(standaloneDir, '.next', 'static', 'marker.txt'), 'utf8'), 'static-asset');
  assert.equal(fs.readFileSync(path.join(standaloneDir, 'public', 'favicon.ico'), 'utf8'), 'icon');

  // pid/log recorded under <DATA_DIR>/runtime/web/, not the web/ folder itself.
  const runDir = path.join(dataDir, 'runtime', 'web');
  assert.equal(fs.readFileSync(path.join(runDir, '.pid'), 'utf8').trim(), String(result.pid));
  // The launcher's startup (WMI Create returning, then the OS actually
  // scheduling the new process) isn't instantaneous — poll instead of
  // asserting the log file exists the instant start() returns.
  assert.ok(await waitFor(() => fs.existsSync(path.join(runDir, '.log'))), '.log should appear shortly after start');

  assert.deepEqual(mod.status(), { running: true, pid: result.pid });

  mod.stop();
  // See runtime.test.js's nativeStop() test for why this needs a tolerant
  // poll + idempotent retry rather than an immediate assert: stop()'s
  // internal kill-confirmation deadline can occasionally lose the race
  // against actual process death on a loaded CI runner.
  const stopped = await waitFor(() => !mod.status().running, { timeoutMs: 5000 });
  assert.ok(stopped, 'server should be stopped after stop()');
  if (fs.existsSync(path.join(runDir, '.pid'))) mod.stop();
  assert.deepEqual(mod.status(), { running: false });
  assert.equal(fs.existsSync(path.join(runDir, '.pid')), false);
});

test('start() is idempotent — a second call while already running returns the existing pid without spawning again', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-serve-test-data-'));
  makeFakeStandalone(root);
  const mod = loadModule(root, dataDir);

  const first = mod.start(8888);
  t.after(() => { try { mod.stop(); } catch {} });
  const second = mod.start(8889);

  assert.equal(second.pid, first.pid);
});

test('status() returns running:false when no pid file exists, and when the recorded pid is dead', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-serve-test-data-'));
  const mod = loadModule(root, dataDir);

  assert.deepEqual(mod.status(), { running: false });

  const runDir = path.join(dataDir, 'runtime', 'web');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), '999999999');
  assert.deepEqual(mod.status(), { running: false });
});
