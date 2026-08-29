const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// tunnel-meta.js resolves TUNNELS_DIR (via runtime.js) from TUNNEL_ROOT/TUNNEL_DATA_DIR
// at require time, so each test loads a fresh copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-meta-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['tunnel-meta.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const modPath = path.join(root, 'scripts', 'tunnel-meta.js');
  for (const f of ['tunnel-meta.js', 'runtime.js', 'cloudflared-bin.js']) {
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

test('getAutostart() defaults to false when no tunnel.json exists', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-meta-data-'));
  const mod = loadModule(root, dataDir);

  assert.equal(mod.getAutostart('demo'), false);
});

test('setAutostart() persists the flag and getAutostart() reflects it', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-meta-data-'));
  const mod = loadModule(root, dataDir);

  mod.setAutostart('demo', true);
  assert.equal(mod.getAutostart('demo'), true);

  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'tunnels', 'demo', 'tunnel.json'), 'utf8'));
  assert.equal(onDisk.autostart, true);

  mod.setAutostart('demo', false);
  assert.equal(mod.getAutostart('demo'), false);
});

test('getAutostart() defaults missing field to false without clobbering existing tunnel.json keys', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-meta-data-'));
  const mod = loadModule(root, dataDir);

  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'tunnel.json'), JSON.stringify({ note: 'existing tunnel, pre-autostart field' }));

  assert.equal(mod.getAutostart('demo'), false);

  mod.setAutostart('demo', true);
  const onDisk = JSON.parse(fs.readFileSync(path.join(tunnelDir, 'tunnel.json'), 'utf8'));
  assert.equal(onDisk.autostart, true);
  assert.equal(onDisk.note, 'existing tunnel, pre-autostart field');
});
