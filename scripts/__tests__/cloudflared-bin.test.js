const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// cloudflared-bin.js resolves BIN_DIR/legacy paths from TUNNEL_ROOT/TUNNEL_DATA_DIR
// at require time, so each test gets a fresh copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-bin-test-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'cloudflared-bin.js'), path.join(dir, 'scripts', 'cloudflared-bin.js'));
  return dir;
}

function loadModule(root, dataDir) {
  const modPath = path.join(root, 'scripts', 'cloudflared-bin.js');
  delete require.cache[require.resolve(modPath)];
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

function withPlatform(t, platform, arch) {
  const origPlatform = process.platform;
  const origArch = process.arch;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
  t.after(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    Object.defineProperty(process, 'arch', { value: origArch, configurable: true });
  });
}

test('releaseAsset() maps platform/arch to the right cloudflared release asset', (t) => {
  const root = makeTempRoot();
  const mod = loadModule(root);

  const cases = [
    ['win32', 'x64', 'cloudflared-windows-amd64.exe'],
    ['win32', 'arm64', 'cloudflared-windows-arm64.exe'],
    ['darwin', 'x64', 'cloudflared-darwin-amd64.tgz'],
    ['darwin', 'arm64', 'cloudflared-darwin-arm64.tgz'],
    ['linux', 'x64', 'cloudflared-linux-amd64'],
    ['linux', 'arm64', 'cloudflared-linux-arm64'],
    ['linux', 'arm', 'cloudflared-linux-arm'],
  ];

  for (const [platform, arch, expected] of cases) {
    withPlatform(t, platform, arch);
    assert.equal(mod.releaseAsset(), expected, `${platform}/${arch}`);
  }
});

test('releaseAsset() throws for an unsupported platform', (t) => {
  const root = makeTempRoot();
  const mod = loadModule(root);
  withPlatform(t, 'sunos', 'x64');
  assert.throws(() => mod.releaseAsset(), /Unsupported platform/);
});

test('findCloudflared() returns null when nothing is installed', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-bin-data-'));
  const mod = loadModule(root, dataDir);

  // Force the PATH lookup to fail too, regardless of what's actually installed
  // on the machine running the tests.
  t.mock.method(require('child_process'), 'spawnSync', () => ({ status: 1 }));

  assert.equal(mod.findCloudflared(), null);
  assert.throws(() => mod.getCloudflaredPath(), /cloudflared not found/);
});

test('findCloudflared() prefers the managed <TUNNEL_DATA_DIR>/bin binary', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-bin-data-'));
  const mod = loadModule(root, dataDir);

  fs.mkdirSync(mod.BIN_DIR, { recursive: true });
  const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const managedPath = path.join(mod.BIN_DIR, binName);
  fs.writeFileSync(managedPath, '');

  t.mock.method(require('child_process'), 'spawnSync', (bin) => ({ status: bin === managedPath ? 0 : 1 }));

  assert.equal(mod.findCloudflared(), managedPath);
});

test('downloadCloudflared() saves the downloaded binary under <TUNNEL_DATA_DIR>/bin and verifies it runs', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-bin-data-'));
  const mod = loadModule(root, dataDir);

  // This test only exercises the non-archive (Windows) download path — no
  // real network access, no real cloudflared binary.
  withPlatform(t, 'win32', 'x64');

  const fakeBytes = Buffer.from('fake-cloudflared-binary');
  const https = require('https');
  t.mock.method(https, 'get', (url, options, callback) => {
    const dataHandlers = [];
    const res = {
      statusCode: 200,
      headers: {},
      on(event, handler) {
        if (event === 'data') dataHandlers.push(handler);
        if (event === 'end') setImmediate(() => { dataHandlers.forEach(h => h(fakeBytes)); handler(); });
      },
      resume() {},
    };
    callback(res);
    return { on() {}, setTimeout() {} };
  });
  t.mock.method(require('child_process'), 'spawnSync', () => ({ status: 0 }));

  const dest = await mod.downloadCloudflared();

  assert.equal(dest, path.join(mod.BIN_DIR, 'cloudflared.exe'));
  assert.ok(fs.existsSync(dest));
  assert.deepEqual(fs.readFileSync(dest), fakeBytes);
});

test('ensureCloudflared() skips the download when already installed', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-bin-data-'));
  const mod = loadModule(root, dataDir);

  fs.mkdirSync(mod.BIN_DIR, { recursive: true });
  const binName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const managedPath = path.join(mod.BIN_DIR, binName);
  fs.writeFileSync(managedPath, '');
  t.mock.method(require('child_process'), 'spawnSync', (bin) => ({ status: bin === managedPath ? 0 : 1 }));

  const https = require('https');
  const getMock = t.mock.method(https, 'get', () => { throw new Error('should not hit the network'); });

  const result = await mod.ensureCloudflared();

  assert.equal(result, managedPath);
  assert.equal(getMock.mock.callCount(), 0);
});
