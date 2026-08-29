const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// runtime.js resolves ROOT/DATA_DIR from TUNNEL_ROOT/TUNNEL_DATA_DIR at require
// time, so each test loads a fresh copy under its own temp root(s).
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadRuntime(root, dataDir) {
  const runtimePath = path.join(root, 'scripts', 'runtime.js');
  const binPath = path.join(root, 'scripts', 'cloudflared-bin.js');
  delete require.cache[require.resolve(runtimePath)];
  delete require.cache[require.resolve(binPath)];

  const prevRoot = process.env.TUNNEL_ROOT;
  const prevData = process.env.TUNNEL_DATA_DIR;
  process.env.TUNNEL_ROOT = root;
  if (dataDir) process.env.TUNNEL_DATA_DIR = dataDir;
  else delete process.env.TUNNEL_DATA_DIR;
  try {
    return require(runtimePath);
  } finally {
    if (prevRoot === undefined) delete process.env.TUNNEL_ROOT; else process.env.TUNNEL_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.TUNNEL_DATA_DIR; else process.env.TUNNEL_DATA_DIR = prevData;
  }
}

test('TUNNEL_DATA_DIR defaults to TUNNEL_ROOT when unset', () => {
  const root = makeTempRoot();
  const runtime = loadRuntime(root);
  assert.equal(runtime.ROOT, root);
  assert.equal(runtime.DATA_DIR, root);
  assert.equal(runtime.TUNNELS_DIR, path.join(root, 'tunnels'));
  assert.equal(runtime.CONFIG_FILE, path.join(root, 'runtime.config.json'));
});

test('TUNNEL_DATA_DIR overrides where tunnels/, runtime config, and runtime state live', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);

  assert.equal(runtime.ROOT, root);
  assert.equal(runtime.DATA_DIR, dataDir);
  assert.equal(runtime.TUNNELS_DIR, path.join(dataDir, 'tunnels'));
  assert.equal(runtime.CONFIG_FILE, path.join(dataDir, 'runtime.config.json'));
  assert.equal(runtime.getRuntimeDir('foo'), path.join(dataDir, 'runtime', 'foo'));
});

test('nativeStart() writes pid/log files under <TUNNEL_DATA_DIR>/runtime/<name>/, not the tunnel folder', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));

  // Stand in for cloudflared with the current Node binary — it starts fine
  // with junk args (no network, no real cloudflared needed) and always exists.
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => process.execPath);

  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\n');
  fs.writeFileSync(path.join(tunnelDir, 'fake-id.json'), '{}');

  const pid = runtime.nativeStart('demo');
  t.after(() => { try { runtime.nativeStop('demo'); } catch {} });

  assert.equal(typeof pid, 'number');
  assert.ok(pid > 0);

  const runDir = path.join(dataDir, 'runtime', 'demo');
  assert.ok(fs.existsSync(path.join(runDir, '.pid')));
  assert.ok(fs.existsSync(path.join(runDir, '.log')));
  assert.equal(fs.readFileSync(path.join(runDir, '.pid'), 'utf8').trim(), String(pid));
  assert.equal(fs.existsSync(path.join(tunnelDir, '.pid')), false);
});

test('nativeStatus() reflects whether the recorded pid is alive', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);

  assert.equal(runtime.nativeStatus('ghost'), false);

  const runDir = runtime.getRuntimeDir('alive');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  assert.equal(runtime.nativeStatus('alive'), true);

  const deadDir = runtime.getRuntimeDir('dead');
  fs.mkdirSync(deadDir, { recursive: true });
  fs.writeFileSync(path.join(deadDir, '.pid'), '999999999');
  assert.equal(runtime.nativeStatus('dead'), false);
});

test('nativeStop() removes the pid file', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);

  const runDir = runtime.getRuntimeDir('demo');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), '999999999');

  runtime.nativeStop('demo');

  assert.equal(fs.existsSync(path.join(runDir, '.pid')), false);
});

test('nativeStart() does not mistake tunnel.json/auth-gate.json metadata for the credentials file', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => process.execPath);

  // Config references a tunnel ID with no matching <id>.json — forces the
  // glob fallback in resolveCredentialsFile, which used to pick up any *.json.
  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\n');
  fs.writeFileSync(path.join(tunnelDir, 'tunnel.json'), JSON.stringify({ autostart: true }));
  fs.writeFileSync(path.join(tunnelDir, 'auth-gate.json'), JSON.stringify({ enabled: false }));

  assert.throws(() => runtime.nativeStart('demo'), /credentials not found/);
});

test('generateLaunchers() resolves relative credential paths against TUNNEL_DATA_DIR, not TUNNEL_ROOT', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);

  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: abc-123\n');
  fs.writeFileSync(path.join(tunnelDir, 'abc-123.json'), '{}');

  runtime.generateLaunchers('demo');

  const sh = fs.readFileSync(path.join(tunnelDir, 'start.sh'), 'utf8');
  assert.match(sh, /--credentials-file "tunnels\/demo\/abc-123\.json"/);
  assert.match(sh, /\$ROOT\/bin\/cloudflared/);

  const bat = fs.readFileSync(path.join(tunnelDir, 'start.bat'), 'utf8');
  assert.match(bat, /--credentials-file "tunnels\\demo\\abc-123\.json"/);
  assert.match(bat, /%ROOT%\\bin\\cloudflared\.exe/);
});
