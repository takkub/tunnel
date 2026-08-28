const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// settings.js resolves RUNTIME_DIR (via runtime.js) from TUNNEL_ROOT/TUNNEL_DATA_DIR
// at require time, so each test loads a fresh copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-cli-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['settings.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const modPath = path.join(root, 'scripts', 'settings.js');
  for (const f of ['settings.js', 'runtime.js', 'cloudflared-bin.js']) {
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

test('extractLoginUrl() finds the argotunnel URL amid surrounding cloudflared output', (t) => {
  const mod = loadModule(makeTempRoot());
  const text = [
    'Please open the following URL and log in with your Cloudflare account:',
    '',
    'https://dash.cloudflare.com/argotunnel?callback=https%3A%2F%2Flogin.example%2Fcb&other=1',
    '',
    'Leave cloudflared running to download the cert automatically.',
  ].join('\n');

  assert.equal(
    mod.extractLoginUrl(text),
    'https://dash.cloudflare.com/argotunnel?callback=https%3A%2F%2Flogin.example%2Fcb&other=1'
  );
});

test('extractLoginUrl() returns null when no login URL is present', (t) => {
  const mod = loadModule(makeTempRoot());
  assert.equal(mod.extractLoginUrl('cloudflared starting up...\n'), null);
});

test('cmdCloudflaredLogin() returns the parsed URL once cloudflared prints it, and starts a watcher', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-cli-data-'));
  const mod = loadModule(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));

  t.mock.method(cloudflaredBin, 'isLoggedIn', () => false);
  t.mock.method(cloudflaredBin, 'ensureCloudflared', async () => 'fake-cloudflared');

  const cp = require('child_process');
  const spawnCalls = [];
  t.mock.method(cp, 'spawn', (bin, args, opts) => {
    spawnCalls.push({ bin, args });
    if (args[0] === 'tunnel' && args[1] === 'login') {
      // Simulate cloudflared writing the login URL to its log file (fd opts.stdio[1]).
      fs.writeSync(opts.stdio[1], 'https://dash.cloudflare.com/argotunnel?callback=abc\n');
    }
    return { pid: 4242, unref() {} };
  });

  const result = await mod.cmdCloudflaredLogin({ urlWaitMs: 2000 });

  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://dash.cloudflare.com/argotunnel?callback=abc');

  const watcherCall = spawnCalls.find(c => c.args.includes('cloudflared-login-watch'));
  assert.ok(watcherCall, 'expected a detached watcher process to be spawned');
  assert.equal(watcherCall.args[watcherCall.args.length - 1], '4242');
});

test('cmdCloudflaredLogin() reports failure when no URL appears before the timeout', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-cli-data-'));
  const mod = loadModule(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));

  t.mock.method(cloudflaredBin, 'isLoggedIn', () => false);
  t.mock.method(cloudflaredBin, 'ensureCloudflared', async () => 'fake-cloudflared');

  const cp = require('child_process');
  t.mock.method(cp, 'spawn', () => ({ pid: 9999, unref() {} }));
  t.mock.method(cp, 'spawnSync', () => ({ status: 0 })); // stands in for the taskkill fallback on timeout

  const result = await mod.cmdCloudflaredLogin({ urlWaitMs: 100 });

  assert.equal(result.ok, false);
  assert.match(result.error, /Timed out/);
});

test('cmdCloudflaredLogin() short-circuits when already logged in', async (t) => {
  const root = makeTempRoot();
  const mod = loadModule(root);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));

  t.mock.method(cloudflaredBin, 'isLoggedIn', () => true);
  const cp = require('child_process');
  const spawnMock = t.mock.method(cp, 'spawn', () => { throw new Error('should not spawn cloudflared'); });

  const result = await mod.cmdCloudflaredLogin();

  assert.deepEqual(result, { ok: true, url: null, alreadyLoggedIn: true });
  assert.equal(spawnMock.mock.callCount(), 0);
});

test('cmdCloudflaredInstall() reports the installed path and version', async (t) => {
  const root = makeTempRoot();
  const mod = loadModule(root);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));

  t.mock.method(cloudflaredBin, 'ensureCloudflared', async () => '/fake/cloudflared');
  const cp = require('child_process');
  t.mock.method(cp, 'spawnSync', () => ({ stdout: 'cloudflared version 2024.1.0\n' }));

  const result = await mod.cmdCloudflaredInstall();

  assert.deepEqual(result, { ok: true, version: 'cloudflared version 2024.1.0', path: '/fake/cloudflared' });
});
