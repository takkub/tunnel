const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// domains.js resolves ROOT/DATA_DIR (via runtime.js) and settingsStore at
// require time, so each test loads a fresh copy under its own temp root.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['domains.js', 'settings-store.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const files = ['domains.js', 'settings-store.js', 'runtime.js', 'cloudflared-bin.js'];
  for (const f of files) {
    delete require.cache[require.resolve(path.join(root, 'scripts', f))];
  }
  const prevRoot = process.env.TUNNEL_ROOT;
  const prevData = process.env.TUNNEL_DATA_DIR;
  process.env.TUNNEL_ROOT = root;
  if (dataDir) process.env.TUNNEL_DATA_DIR = dataDir;
  else delete process.env.TUNNEL_DATA_DIR;
  try {
    return require(path.join(root, 'scripts', 'domains.js'));
  } finally {
    if (prevRoot === undefined) delete process.env.TUNNEL_ROOT; else process.env.TUNNEL_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.TUNNEL_DATA_DIR; else process.env.TUNNEL_DATA_DIR = prevData;
  }
}

// CLOUDFLARE_API_TOKEN/ZONE_ID are read lazily (at call time, not require
// time) by settings-store.js, so — unlike TUNNEL_ROOT/TUNNEL_DATA_DIR above —
// they must stay set for the duration of the test, not just during require().
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

test('resolveZone(): suffix match against a configured domain', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  const mod = loadModule(root, dataDir);
  mod.saveDomains([{ domain: 'example.com', zoneId: 'zone-example' }]);

  assert.deepEqual(mod.resolveZone('app.example.com'), { zoneId: 'zone-example', domain: 'example.com', source: 'domains' });
  assert.deepEqual(mod.resolveZone('example.com'), { zoneId: 'zone-example', domain: 'example.com', source: 'domains' });
});

test('resolveZone(): picks the longest/most-specific match across multiple configured domains', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  const mod = loadModule(root, dataDir);
  mod.saveDomains([
    { domain: 'example.com', zoneId: 'zone-example' },
    { domain: 'sub.example.com', zoneId: 'zone-sub' }
  ]);

  assert.equal(mod.resolveZone('app.sub.example.com').zoneId, 'zone-sub');
  assert.equal(mod.resolveZone('other.example.com').zoneId, 'zone-example');
});

test('resolveZone(): handles multi-label TLDs correctly (unlike the old 2-label rootDomain split)', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  const mod = loadModule(root, dataDir);
  mod.saveDomains([{ domain: 'example.co.th', zoneId: 'zone-th' }]);

  assert.equal(mod.resolveZone('app.example.co.th').zoneId, 'zone-th');
});

test('resolveZone(): a second configured domain resolves to its own zone, not the first domain\'s', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  const mod = loadModule(root, dataDir);
  mod.saveDomains([
    { domain: 'first.com', zoneId: 'zone-first' },
    { domain: 'second.com', zoneId: 'zone-second' }
  ]);

  assert.equal(mod.resolveZone('sub.second.com').zoneId, 'zone-second');
});

test('resolveZone(): domains configured but hostname matches none -> null zoneId, no silent fallback', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: 'env-zone-should-not-be-used' });
  const mod = loadModule(root, dataDir);
  mod.saveDomains([{ domain: 'example.com', zoneId: 'zone-example' }]);

  assert.deepEqual(mod.resolveZone('unrelated.org'), { zoneId: null, domain: null, source: null });
});

test('resolveZone(): legacy fallback to settings zoneId only when domains.config.json has no entries', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: 'legacy-zone' });
  const mod = loadModule(root, dataDir);

  assert.deepEqual(mod.resolveZone('anything.example.com'), { zoneId: 'legacy-zone', domain: null, source: 'settings' });
});

test('loadDomains()/saveDomains() use TUNNEL_DATA_DIR, matching the web Settings > Domains API route', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  const mod = loadModule(root, dataDir);

  mod.saveDomains([{ domain: 'example.com', zoneId: 'z1' }]);

  assert.ok(fs.existsSync(path.join(dataDir, 'domains.config.json')));
  assert.ok(!fs.existsSync(path.join(root, 'domains.config.json')));
});

test('loadDomains(): falls back to reading a legacy ROOT-based domains.config.json when DATA_DIR has none', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  fs.writeFileSync(path.join(root, 'domains.config.json'), JSON.stringify({ domains: [{ domain: 'legacy.com', zoneId: 'zone-legacy' }] }));
  const mod = loadModule(root, dataDir);

  assert.deepEqual(mod.loadDomains(), [{ domain: 'legacy.com', zoneId: 'zone-legacy' }]);
});

test('loadDomains(): DATA_DIR domains.config.json takes precedence over a legacy ROOT one', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domains-test-data-'));
  fs.writeFileSync(path.join(root, 'domains.config.json'), JSON.stringify({ domains: [{ domain: 'legacy.com', zoneId: 'zone-legacy' }] }));
  const mod = loadModule(root, dataDir);
  mod.saveDomains([{ domain: 'current.com', zoneId: 'zone-current' }]);

  assert.deepEqual(mod.loadDomains(), [{ domain: 'current.com', zoneId: 'zone-current' }]);
});
