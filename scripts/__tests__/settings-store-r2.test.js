const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// settings-store.js resolves DATA_DIR (via runtime.js) from TUNNEL_ROOT/TUNNEL_DATA_DIR
// at require time, so each test loads a fresh copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-test-root-'));
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

test('getR2Settings() returns all-unset when nothing is configured', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  withEnv(t, { R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined });
  const mod = loadModule(root, dataDir);

  assert.deepEqual(mod.getR2Settings(), {
    accountId: null,
    accessKeyId: null,
    bucket: null,
    publicUrl: null,
    secretSet: false,
    secretMasked: null,
  });
});

test('getR2Settings() falls back to .env when settings.json has no override', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  withEnv(t, {
    R2_ACCOUNT_ID: 'env-account',
    R2_ACCESS_KEY_ID: 'env-key',
    R2_SECRET_ACCESS_KEY: 'env-secret-1234',
    R2_BUCKET: 'env-bucket',
  });
  const mod = loadModule(root, dataDir);

  const settings = mod.getR2Settings();
  assert.equal(settings.accountId, 'env-account');
  assert.equal(settings.accessKeyId, 'env-key');
  assert.equal(settings.bucket, 'env-bucket');
  assert.equal(settings.publicUrl, null); // publicUrl has no env fallback
  assert.equal(settings.secretSet, true);
  assert.equal(settings.secretMasked, mod.maskToken('env-secret-1234'));
});

test('setR2Settings() overrides .env and persists to settings.json, never exposing the raw secret', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  withEnv(t, { R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined });
  const mod = loadModule(root, dataDir);

  const result = mod.setR2Settings({
    accountId: 'stored-account',
    accessKeyId: 'stored-key',
    secretAccessKey: 'stored-secret-5678',
    bucket: 'stored-bucket',
    publicUrl: 'https://cdn.example.com',
  });

  assert.equal(result.accountId, 'stored-account');
  assert.equal(result.accessKeyId, 'stored-key');
  assert.equal(result.bucket, 'stored-bucket');
  assert.equal(result.publicUrl, 'https://cdn.example.com');
  assert.equal(result.secretSet, true);
  assert.equal(result.secretMasked, mod.maskToken('stored-secret-5678'));
  assert.equal(JSON.stringify(result).includes('stored-secret-5678'), false);

  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  assert.equal(onDisk.r2.accountId, 'stored-account');
  assert.equal(onDisk.r2.secretAccessKey, 'stored-secret-5678');
});

test('setR2Settings() with an empty string clears the override and falls back to .env', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  withEnv(t, { R2_ACCOUNT_ID: 'env-account', R2_SECRET_ACCESS_KEY: undefined });
  const mod = loadModule(root, dataDir);

  mod.setR2Settings({ accountId: 'stored-account' });
  assert.equal(mod.getR2Settings().accountId, 'stored-account');

  mod.setR2Settings({ accountId: '' });
  assert.equal(mod.getR2Settings().accountId, 'env-account');
});

test('setR2Settings() clears publicUrl (no env fallback) when passed null/empty', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  const mod = loadModule(root, dataDir);

  mod.setR2Settings({ publicUrl: 'https://cdn.example.com' });
  assert.equal(mod.getR2Settings().publicUrl, 'https://cdn.example.com');

  mod.setR2Settings({ publicUrl: null });
  assert.equal(mod.getR2Settings().publicUrl, null);
});

test('setR2Settings() leaves an omitted key untouched', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  withEnv(t, { R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined });
  const mod = loadModule(root, dataDir);

  mod.setR2Settings({ accountId: 'account-a', bucket: 'bucket-a' });
  mod.setR2Settings({ bucket: 'bucket-b' });

  const settings = mod.getR2Settings();
  assert.equal(settings.accountId, 'account-a');
  assert.equal(settings.bucket, 'bucket-b');
});

test('setR2Settings() creates TUNNEL_DATA_DIR when it does not exist yet (first run)', (t) => {
  const root = makeTempRoot();
  const dataDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-')), 'not-yet-created');
  withEnv(t, { R2_ACCOUNT_ID: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined, R2_BUCKET: undefined });
  const mod = loadModule(root, dataDir);

  assert.equal(fs.existsSync(dataDir), false);
  mod.setR2Settings({ accountId: 'account-a' });

  assert.equal(mod.getR2Settings().accountId, 'account-a');
  assert.ok(fs.existsSync(path.join(dataDir, 'settings.json')));
});

test('setR2Settings() does not disturb cloudflare settings stored in the same file', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-store-r2-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: undefined });
  const mod = loadModule(root, dataDir);

  mod.setCloudflareSettings({ apiToken: 'cf-token', zoneId: 'cf-zone' });
  mod.setR2Settings({ accountId: 'r2-account' });

  assert.equal(mod.getCloudflareToken(), 'cf-token');
  assert.equal(mod.getR2Settings().accountId, 'r2-account');
});
