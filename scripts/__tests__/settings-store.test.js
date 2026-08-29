const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// settings-store.js resolves DATA_DIR (via runtime.js) from TUNNEL_ROOT/TUNNEL_DATA_DIR
// at require time, so each test loads a fresh copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['settings-store.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const modPath = path.join(root, 'scripts', 'settings-store.js');
  for (const f of ['settings-store.js', 'runtime.js', 'cloudflared-bin.js']) {
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

function withEnv(t, vars) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  t.after(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  });
}

test('getCloudflareSettings() returns all-unset when nothing is configured', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: undefined });
  const mod = loadModule(root, dataDir);

  assert.deepEqual(mod.getCloudflareSettings(), { apiTokenSet: false, apiTokenMasked: null, zoneId: null });
});

test('getCloudflareSettings() falls back to .env when settings.json has no override', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'env-token-1234', ZONE_ID: 'env-zone' });
  const mod = loadModule(root, dataDir);

  const settings = mod.getCloudflareSettings();
  assert.equal(settings.apiTokenSet, true);
  assert.equal(settings.apiTokenMasked, '**********1234');
  assert.equal(settings.zoneId, 'env-zone');
});

test('setCloudflareSettings() overrides .env and persists to settings.json', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'env-token', ZONE_ID: 'env-zone' });
  const mod = loadModule(root, dataDir);

  mod.setCloudflareSettings({ apiToken: 'stored-token-5678', zoneId: 'stored-zone' });

  assert.equal(mod.getCloudflareToken(), 'stored-token-5678');
  assert.equal(mod.getZoneId(), 'stored-zone');

  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  assert.equal(onDisk.cloudflare.apiToken, 'stored-token-5678');
  assert.equal(onDisk.cloudflare.zoneId, 'stored-zone');
});

test('setCloudflareSettings() with an empty string clears the override and falls back to .env', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'env-token', ZONE_ID: undefined });
  const mod = loadModule(root, dataDir);

  mod.setCloudflareSettings({ apiToken: 'stored-token' });
  assert.equal(mod.getCloudflareToken(), 'stored-token');

  mod.setCloudflareSettings({ apiToken: '' });
  assert.equal(mod.getCloudflareToken(), 'env-token');
});

test('setCloudflareSettings() leaves an omitted key untouched', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: undefined });
  const mod = loadModule(root, dataDir);

  mod.setCloudflareSettings({ apiToken: 'token-a', zoneId: 'zone-a' });
  mod.setCloudflareSettings({ zoneId: 'zone-b' });

  assert.equal(mod.getCloudflareToken(), 'token-a');
  assert.equal(mod.getZoneId(), 'zone-b');
});

test('setCloudflareSettings() creates TUNNEL_DATA_DIR when it does not exist yet (first run)', (t) => {
  const root = makeTempRoot();
  const dataDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-')), 'not-yet-created');
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: undefined });
  const mod = loadModule(root, dataDir);

  assert.equal(fs.existsSync(dataDir), false);
  mod.setCloudflareSettings({ apiToken: 'token-a' });

  assert.equal(mod.getCloudflareToken(), 'token-a');
  assert.ok(fs.existsSync(path.join(dataDir, 'settings.json')));
});

test('getDesktopSettings() defaults to launchAtLogin:false, autostartTunnelsOnLaunch:true, webPort:null', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  const mod = loadModule(root, dataDir);

  assert.deepEqual(mod.getDesktopSettings(), { launchAtLogin: false, autostartTunnelsOnLaunch: true, webPort: null });
});

test('setDesktopSettings() persists changes and leaves omitted keys untouched', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  const mod = loadModule(root, dataDir);

  mod.setDesktopSettings({ launchAtLogin: true });
  assert.deepEqual(mod.getDesktopSettings(), { launchAtLogin: true, autostartTunnelsOnLaunch: true, webPort: null });

  mod.setDesktopSettings({ autostartTunnelsOnLaunch: false });
  assert.deepEqual(mod.getDesktopSettings(), { launchAtLogin: true, autostartTunnelsOnLaunch: false, webPort: null });

  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  assert.deepEqual(onDisk.desktop, { launchAtLogin: true, autostartTunnelsOnLaunch: false, webPort: null });
});

test('setDesktopSettings() sets and clears webPort', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-data-'));
  const mod = loadModule(root, dataDir);

  mod.setDesktopSettings({ webPort: 9001 });
  assert.deepEqual(mod.getDesktopSettings(), { launchAtLogin: false, autostartTunnelsOnLaunch: true, webPort: 9001 });

  mod.setDesktopSettings({ webPort: 0 });
  assert.deepEqual(mod.getDesktopSettings(), { launchAtLogin: false, autostartTunnelsOnLaunch: true, webPort: null });
});

test('maskToken() only ever exposes the last 4 characters', (t) => {
  const root = makeTempRoot();
  const mod = loadModule(root);

  assert.equal(mod.maskToken(null), null);
  assert.equal(mod.maskToken(''), null);
  assert.equal(mod.maskToken('ab'), '**');
  assert.equal(mod.maskToken('abcdefgh'), '****efgh');
});
