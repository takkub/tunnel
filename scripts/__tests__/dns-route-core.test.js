const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// dns-route-core.js does no spawning/network of its own — the Cloudflare
// upsert is injected via opts.upsertTunnelCname and the cloudflared-CLI
// fallback via opts.runCloudflaredRouteDns, so these tests never touch a real
// network or binary. domains.js/settings-store.js still resolve DATA_DIR via
// runtime.js at require time, so each test loads a fresh copy under its own
// temp root (same pattern as domains.test.js/settings-store.test.js).
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['dns-route-core.js', 'domains.js', 'settings-store.js', 'runtime.js', 'cloudflared-bin.js', 'cloudflare-api.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir) {
  const files = ['dns-route-core.js', 'domains.js', 'settings-store.js', 'runtime.js', 'cloudflared-bin.js', 'cloudflare-api.js'];
  for (const f of files) {
    delete require.cache[require.resolve(path.join(root, 'scripts', f))];
  }
  const prevRoot = process.env.TUNNEL_ROOT;
  const prevData = process.env.TUNNEL_DATA_DIR;
  process.env.TUNNEL_ROOT = root;
  process.env.TUNNEL_DATA_DIR = dataDir;
  try {
    return {
      dnsRouteCore: require(path.join(root, 'scripts', 'dns-route-core.js')),
      domains: require(path.join(root, 'scripts', 'domains.js'))
    };
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

function makeTunnel(dataDir, name, tunnelId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') {
  const tunnelDir = path.join(dataDir, 'tunnels', name);
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), `tunnel: ${tunnelId}\ncredentials-file: ${tunnelId}.json\n`);
  return tunnelId;
}

test('routeDns(): creates a CNAME via the Cloudflare API in the hostname\'s own zone (2nd domain case)', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123' });
  const { dnsRouteCore, domains } = loadModule(root, dataDir);
  domains.saveDomains([
    { domain: 'first.com', zoneId: 'zone-first' },
    { domain: 'second.com', zoneId: 'zone-second' }
  ]);
  const tunnelId = makeTunnel(dataDir, 'app-tunnel');

  const calls = [];
  const result = await dnsRouteCore.routeDns('app-tunnel', 'app.second.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    upsertTunnelCname: async (zoneId, hostname, tid, apiToken) => {
      calls.push({ zoneId, hostname, tid, apiToken });
      return { ok: true, action: 'created' };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.method, 'api');
  assert.deepEqual(calls, [{ zoneId: 'zone-second', hostname: 'app.second.com', tid: tunnelId, apiToken: 'tok-123' }]);
});

test('routeDns(): updates an existing tunnel CNAME (re-run / tunnel recreated with a new ID)', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123' });
  const { dnsRouteCore, domains } = loadModule(root, dataDir);
  domains.saveDomains([{ domain: 'example.com', zoneId: 'zone-example' }]);
  makeTunnel(dataDir, 'app-tunnel');

  const result = await dnsRouteCore.routeDns('app-tunnel', 'app.example.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    upsertTunnelCname: async () => ({ ok: true, action: 'updated' })
  });

  assert.equal(result.ok, true);
  assert.match(result.message, /updated/);
});

test('routeDns(): a conflicting non-tunnel record surfaces as a failure, not a silent success', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123' });
  const { dnsRouteCore, domains } = loadModule(root, dataDir);
  domains.saveDomains([{ domain: 'example.com', zoneId: 'zone-example' }]);
  makeTunnel(dataDir, 'app-tunnel');

  const result = await dnsRouteCore.routeDns('app-tunnel', 'app.example.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    upsertTunnelCname: async () => ({ ok: false, error: 'A A record for app.example.com already exists (content: 1.2.3.4) — remove it manually first.' })
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /already exists/);
});

test('routeDns(): hostname on an undeclared domain fails instead of guessing a zone', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123' });
  const { dnsRouteCore, domains } = loadModule(root, dataDir);
  domains.saveDomains([{ domain: 'first.com', zoneId: 'zone-first' }]);
  makeTunnel(dataDir, 'app-tunnel');

  let upsertCalled = false;
  const result = await dnsRouteCore.routeDns('app-tunnel', 'app.unregistered.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    upsertTunnelCname: async () => { upsertCalled = true; return { ok: true, action: 'created' }; }
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Settings/);
  assert.equal(upsertCalled, false);
});

test('routeDns(): no API token configured falls back to the injected cloudflared CLI runner, with a warning', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: undefined, ZONE_ID: undefined });
  const { dnsRouteCore, domains } = loadModule(root, dataDir);
  domains.saveDomains([{ domain: 'example.com', zoneId: 'zone-example' }]);
  makeTunnel(dataDir, 'app-tunnel');

  let cliCalled = false;
  const result = await dnsRouteCore.routeDns('app-tunnel', 'app.example.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    runCloudflaredRouteDns: () => { cliCalled = true; return 'Added CNAME record.'; }
  });

  assert.equal(result.ok, true);
  assert.equal(result.method, 'cloudflared-cli');
  assert.equal(cliCalled, true);
  assert.match(result.message, /WARN/);
});

test('routeDns(): legacy single-zone install (no domains.config.json) with a token still routes via the API', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123', ZONE_ID: 'legacy-zone' });
  const { dnsRouteCore } = loadModule(root, dataDir);
  makeTunnel(dataDir, 'app-tunnel');

  const calls = [];
  const result = await dnsRouteCore.routeDns('app-tunnel', 'app.example.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    upsertTunnelCname: async (zoneId, hostname) => { calls.push({ zoneId, hostname }); return { ok: true, action: 'created' }; }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ zoneId: 'legacy-zone', hostname: 'app.example.com' }]);
});

test('routeDns(): reads tunnelId from config.yml when not passed explicitly', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123' });
  const { dnsRouteCore, domains } = loadModule(root, dataDir);
  domains.saveDomains([{ domain: 'example.com', zoneId: 'zone-example' }]);
  const tunnelId = makeTunnel(dataDir, 'app-tunnel', 'ffffffff-1111-2222-3333-444444444444');

  const calls = [];
  await dnsRouteCore.routeDns('app-tunnel', 'app.example.com', {
    tunnelsDir: path.join(dataDir, 'tunnels'),
    upsertTunnelCname: async (zoneId, hostname, tid) => { calls.push(tid); return { ok: true, action: 'created' }; }
  });

  assert.deepEqual(calls, [tunnelId]);
});

test('routeDns(): missing config.yml and no explicit tunnelId fails cleanly', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-route-core-test-data-'));
  withEnv(t, { CLOUDFLARE_API_TOKEN: 'tok-123' });
  const { dnsRouteCore } = loadModule(root, dataDir);
  fs.mkdirSync(path.join(dataDir, 'tunnels'), { recursive: true });

  const result = await dnsRouteCore.routeDns('missing-tunnel', 'app.example.com', {
    tunnelsDir: path.join(dataDir, 'tunnels')
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /config.yml not found/);
});
