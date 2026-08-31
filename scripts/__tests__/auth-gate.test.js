const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyPassword } = require('../auth-gate-crypto');

// Isolate each test run under a throwaway project root, since auth-gate.js resolves
// paths relative to runtime.js's ROOT (path.join(__dirname, '..')) at require time.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-test-'));
  fs.mkdirSync(path.join(dir, 'tunnels'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'nginx', 'auth-gate'), { recursive: true });
  const files = [
    'runtime.js', 'cloudflared-bin.js', 'auth-gate.js', 'auth-gate-crypto.js', 'auth-gate-proxy.js', 'auth-gate-server.js',
    'auth-gate-country.js', 'auth-gate-lockout.js', 'auth-gate-cf-rule.js', 'cloudflare-api.js', 'settings-store.js', 'domains.js',
  ];
  for (const f of files) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadAuthGate(root) {
  const modPath = path.join(root, 'scripts', 'auth-gate.js');
  const files = [
    'runtime.js', 'cloudflared-bin.js', 'auth-gate.js', 'auth-gate-crypto.js', 'auth-gate-proxy.js', 'auth-gate-server.js',
    'auth-gate-country.js', 'auth-gate-lockout.js', 'auth-gate-cf-rule.js', 'cloudflare-api.js', 'settings-store.js', 'domains.js',
  ];
  for (const f of files) {
    delete require.cache[require.resolve(path.join(root, 'scripts', f))];
  }
  return require(modPath);
}

function writeConfig(root, name, hostname, port) {
  const dir = path.join(root, 'tunnels', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.yml'), `tunnel: fake-id
credentials-file: /etc/cloudflared/fake-id.json

protocol: auto

ingress:
  - hostname: ${hostname}
    service: http://host.docker.internal:${port}
  - service: http_status:404
`);
  return dir;
}

const NO_DOCKER = { skipDocker: true, skipTunnelRestart: true };

// getEffectiveMode()'s 'auto' default shells out to `docker ps` to decide
// docker-vs-native, so a test that doesn't pin a mode would silently run in
// whichever mode this machine's live Docker availability happens to produce.
// Tests asserting docker-mode behavior (host.docker.internal, nginx conf.d)
// must force it explicitly, same as forceNativeMode() below does for native.
function forceDockerMode(root) {
  fs.writeFileSync(path.join(root, 'runtime.config.json'), JSON.stringify({ mode: 'docker' }));
}

test('status() returns disabled defaults when no state file exists', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { status } = loadAuthGate(root);
  assert.deepEqual(status('promptpay'), { enabled: false, gatePort: null, allowedCountries: [], cloudflareBlock: false, failedLogins24h: 0, lockedUntil: null });
});

test('enable() rewrites ingress service to the gate port and saves originalService', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, readState } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);

  const configText = fs.readFileSync(path.join(root, 'tunnels', 'promptpay', 'config.yml'), 'utf8');
  assert.match(configText, /service: http:\/\/host\.docker\.internal:8890/);

  const state = readState('promptpay');
  assert.equal(state.enabled, true);
  assert.equal(state.originalService, 'http://host.docker.internal:4000');
  assert.equal(state.username, undefined);
  assert.ok(verifyPassword('secret123', state.passwordHash));
});

test('enable() rejects an invalid tunnel name', () => {
  const root = makeTempRoot();
  const { enable } = loadAuthGate(root);
  assert.throws(() => enable('../evil', 'secret123', NO_DOCKER), /Invalid tunnel name/);
});

test('disable() restores the original ingress service and clears state', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, disable, status } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);
  disable('promptpay', NO_DOCKER);

  const configText = fs.readFileSync(path.join(root, 'tunnels', 'promptpay', 'config.yml'), 'utf8');
  assert.match(configText, /service: http:\/\/host\.docker\.internal:4000/);
  assert.equal(configText.includes('8890'), false);
  assert.deepEqual(status('promptpay'), { enabled: false, gatePort: null, allowedCountries: [], cloudflareBlock: false, failedLogins24h: 0, lockedUntil: null });
  assert.equal(fs.existsSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf')), false);
});

test('changePassword() updates the hash without touching config.yml ingress', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, changePassword, readState } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);
  const before = readState('promptpay').passwordHash;

  changePassword('promptpay', 'newpass456', NO_DOCKER);
  const after = readState('promptpay').passwordHash;

  assert.notEqual(before, after);
  assert.ok(verifyPassword('newpass456', after));
  assert.equal(verifyPassword('secret123', after), false);
  const configText = fs.readFileSync(path.join(root, 'tunnels', 'promptpay', 'config.yml'), 'utf8');
  assert.match(configText, /service: http:\/\/host\.docker\.internal:8890/);
});

test('changePassword() throws when the gate is not enabled', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { changePassword } = loadAuthGate(root);
  assert.throws(() => changePassword('promptpay', 'x', NO_DOCKER), /not enabled/);
});

test('generated nginx conf uses auth_request against the gate service, not auth_basic', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);

  const conf = fs.readFileSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf'), 'utf8');
  assert.match(conf, /server_name pay\.example\.com;/);
  assert.match(conf, /absolute_redirect off;/);
  assert.match(conf, /port_in_redirect off;/);
  assert.match(conf, /auth_request \/__gate\/verify;/);
  assert.match(conf, /error_page 401 = @login;/);
  assert.match(conf, /location = \/__gate\/verify \{/);
  assert.match(conf, /internal;/);
  assert.match(conf, /proxy_pass_request_body off;/);
  assert.match(conf, /proxy_set_header X-Gate-Tunnel promptpay;/);
  assert.match(conf, /proxy_set_header Cookie \$http_cookie;/);
  assert.match(conf, /location \/__gate\/ \{/);
  assert.match(conf, /location @login \{/);
  assert.match(conf, /return 302 \/__gate\/login\?next=\$request_uri;/);
  assert.match(conf, /proxy_pass http:\/\/host\.docker\.internal:4000;/);
  assert.match(conf, /proxy_set_header Upgrade \$http_upgrade;/);
  assert.equal(conf.includes('auth_basic'), false);
  assert.equal(conf.includes('htpasswd'), false);
});

test('disable() leaves a default_server in conf.d so nginx keeps listening on :80 with zero tunnels enabled', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, disable } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);
  disable('promptpay', NO_DOCKER);

  const confd = fs.readdirSync(path.join(root, 'nginx', 'auth-gate', 'conf.d'));
  const hasListener = confd.some(f => {
    const text = fs.readFileSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', f), 'utf8');
    return /listen\s+80/.test(text);
  });
  assert.equal(hasListener, true);
});

test('enable() does not create an htpasswd file (no longer used)', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);
  assert.equal(fs.existsSync(path.join(root, 'nginx', 'auth-gate', 'htpasswd')), false);
});

function forceNativeMode(root) {
  fs.writeFileSync(path.join(root, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
}

test('enable() in native mode rewrites ingress to localhost instead of host.docker.internal', () => {
  const root = makeTempRoot();
  forceNativeMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, readState } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);

  const configText = fs.readFileSync(path.join(root, 'tunnels', 'promptpay', 'config.yml'), 'utf8');
  assert.match(configText, /service: http:\/\/localhost:8890/);
  assert.equal(configText.includes('host.docker.internal'), false);

  const state = readState('promptpay');
  assert.equal(state.enabled, true);
  assert.equal(state.hostname, 'pay.example.com');
  assert.equal(state.originalService, 'http://host.docker.internal:4000');
});

test('enable() in native mode does not write an nginx gate conf', () => {
  const root = makeTempRoot();
  forceNativeMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);
  assert.equal(fs.existsSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf')), false);
});

test('disable() in native mode restores ingress and clears state without touching nginx conf.d', () => {
  const root = makeTempRoot();
  forceNativeMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, disable, status } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);
  disable('promptpay', NO_DOCKER);

  const configText = fs.readFileSync(path.join(root, 'tunnels', 'promptpay', 'config.yml'), 'utf8');
  assert.match(configText, /service: http:\/\/host\.docker\.internal:4000/);
  assert.deepEqual(status('promptpay'), { enabled: false, gatePort: null, allowedCountries: [], cloudflareBlock: false, failedLogins24h: 0, lockedUntil: null });
});

function makeSleeperBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-sleeper-'));
  if (process.platform === 'win32') {
    const cmdPath = path.join(dir, 'sleeper.cmd');
    fs.writeFileSync(cmdPath, '@echo off\r\n:loop\r\nping -n 2 127.0.0.1 >nul\r\ngoto loop\r\n');
    return cmdPath;
  }
  const scriptPath = path.join(dir, 'sleeper.js');
  fs.writeFileSync(scriptPath, '#!/usr/bin/env node\nsetInterval(() => {}, 1e9);\n');
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return predicate();
}

// Regression test for the incident this task fixes: enabling the gate on an
// already-running tunnel used to rewrite config.yml + auth-gate.json but never
// touch the live cloudflared process, so it kept serving the *old* (pre-gate)
// ingress — the UI showed a "Password" badge while public traffic bypassed
// the gate entirely. restartTunnelIfRunning() must actually stop+start it.
test('enable() restarts an already-running native tunnel so the rewritten (gated) ingress actually takes effect', async (t) => {
  const root = makeTempRoot();
  forceNativeMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  fs.writeFileSync(path.join(root, 'tunnels', 'promptpay', 'fake-id.json'), '{}');
  const { enable } = loadAuthGate(root);

  const runtime = require(path.join(root, 'scripts', 'runtime.js'));
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => makeSleeperBin());

  const beforePid = runtime.nativeStart('promptpay');
  t.after(() => { try { runtime.nativeStop('promptpay'); } catch {} });
  assert.ok(await waitFor(() => { try { process.kill(beforePid, 0); return true; } catch { return false; } }));

  const result = enable('promptpay', 'secret123', { skipDocker: true });
  assert.equal(result.restartError, undefined);

  // The pre-gate process must be gone, replaced by a new one under the rewritten config.
  const oldGone = await waitFor(() => { try { process.kill(beforePid, 0); return false; } catch { return true; } }, { timeoutMs: 5000 });
  assert.ok(oldGone, 'the process running under the old (pre-gate) ingress should have been stopped');
  assert.equal(runtime.nativeStatus('promptpay'), true);

  const configText = fs.readFileSync(path.join(root, 'tunnels', 'promptpay', 'config.yml'), 'utf8');
  assert.match(configText, /service: http:\/\/localhost:8890/);
});

test('enable()/disable() do not attempt a restart, and add no restartError, when the tunnel is not running', () => {
  const root = makeTempRoot();
  forceNativeMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, disable } = loadAuthGate(root);

  const enableResult = enable('promptpay', 'secret123', { skipDocker: true });
  assert.equal('restartError' in enableResult, false);

  const disableResult = disable('promptpay', { skipDocker: true });
  assert.equal('restartError' in disableResult, false);
});

test('status() includes the new security fields with sensible disabled/enabled defaults', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, status } = loadAuthGate(root);

  enable('promptpay', 'secret123', NO_DOCKER);
  const s = status('promptpay');
  assert.deepEqual(s.allowedCountries, []);
  assert.equal(s.cloudflareBlock, false);
  assert.equal(s.failedLogins24h, 0);
  assert.equal(s.lockedUntil, null);
});

test('setCountries() rejects an invalid code or too many countries', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCountries } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);

  assert.throws(() => setCountries('promptpay', ['th', '1x']), /invalid code/);
  assert.throws(() => setCountries('promptpay', Array(21).fill('TH')), /max 20/);
});

test('setCountries() persists the (uppercased) list and reflects it in status()', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCountries, status } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);

  setCountries('promptpay', ['th', 'us'], NO_DOCKER);
  assert.deepEqual(status('promptpay').allowedCountries, ['TH', 'US']);
});

test('setCountries() in docker mode embeds a cf-ipcountry check in the tunnel\'s nginx conf', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCountries } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);

  setCountries('promptpay', ['th', 'us'], NO_DOCKER);
  const conf = fs.readFileSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf'), 'utf8');
  assert.match(conf, /if \(\$http_cf_ipcountry !~ \^\(TH\|US\)\$\) \{/);
  assert.match(conf, /ไม่อนุญาตให้เข้าถึงจากประเทศนี้/);
});

test('setCountries() with an empty list removes the country check from the nginx conf', () => {
  const root = makeTempRoot();
  forceDockerMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCountries } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);
  setCountries('promptpay', ['th'], NO_DOCKER);
  setCountries('promptpay', [], NO_DOCKER);
  const conf = fs.readFileSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf'), 'utf8');
  assert.equal(conf.includes('http_cf_ipcountry'), false);
});

test('setCountries() in native mode does not touch nginx conf.d', () => {
  const root = makeTempRoot();
  forceNativeMode(root);
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCountries, status } = loadAuthGate(root);
  enable('promptpay', 'secret123', { skipDocker: true });
  setCountries('promptpay', ['th'], { skipDocker: true });

  assert.equal(fs.existsSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf')), false);
  assert.deepEqual(status('promptpay').allowedCountries, ['TH']);
});

test('setCountries() rejects an invalid tunnel name', () => {
  const root = makeTempRoot();
  const { setCountries } = loadAuthGate(root);
  assert.throws(() => setCountries('../evil', ['TH']), /Invalid tunnel name/);
});

test('setCloudflareBlock(true) without a configured Cloudflare token surfaces cfError instead of throwing, and cloudflareBlock stays false', async () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCloudflareBlock, status } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);

  const prevToken = process.env.CLOUDFLARE_API_TOKEN;
  const prevZone = process.env.ZONE_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.ZONE_ID;
  try {
    const res = await setCloudflareBlock('promptpay', true);
    assert.equal(res.cloudflareBlock, false);
    assert.match(res.cfError, /Cloudflare API token/);
    assert.equal(status('promptpay').cloudflareBlock, false);
  } finally {
    if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = prevToken;
    if (prevZone === undefined) delete process.env.ZONE_ID; else process.env.ZONE_ID = prevZone;
  }
});

test('setCloudflareBlock(false) with no rule ever set is a no-op (no network call attempted)', async () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { enable, setCloudflareBlock, status } = loadAuthGate(root);
  enable('promptpay', 'secret123', NO_DOCKER);

  const res = await setCloudflareBlock('promptpay', false);
  assert.equal(res.cloudflareBlock, false);
  assert.equal('cfError' in res, false);
  assert.equal(status('promptpay').cloudflareBlock, false);
});

test('enable() honors TUNNEL_DATA_DIR for tunnels/ resolution', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-data-'));
  fs.mkdirSync(path.join(dataDir, 'tunnels'), { recursive: true });
  writeConfig(dataDir, 'promptpay', 'pay.example.com', 4000);

  const prevDataDir = process.env.TUNNEL_DATA_DIR;
  process.env.TUNNEL_DATA_DIR = dataDir;
  try {
    const { enable, readState } = loadAuthGate(root);
    enable('promptpay', 'secret123', NO_DOCKER);
    const state = readState('promptpay');
    assert.equal(state.enabled, true);
    assert.equal(
      fs.existsSync(path.join(dataDir, 'tunnels', 'promptpay', 'auth-gate.json')),
      true
    );
  } finally {
    if (prevDataDir === undefined) delete process.env.TUNNEL_DATA_DIR;
    else process.env.TUNNEL_DATA_DIR = prevDataDir;
  }
});

// Regression test for the v1.1.11 update incident this task fixes: the native
// gate proxy used to be launched with a plain child_process.spawn(detached:true),
// which is still a descendant of this process in the Windows process tree — so
// desktop/src/server.ts's stopServer() (`taskkill /pid <web server pid> /T /F`,
// run on every app quit/restart) killed it right along with the web server, even
// though native tunnels themselves (launched via runtime.js's WMI-routed
// spawnDetached) correctly survived. ensureNativeGateRunning() must route
// through the same spawnDetached so the gate proxy is equally taskkill-proof,
// and stopNativeGateIfIdle() must fully reap it (via killDetached) rather than
// leaving an orphaned process if the recorded pid is only an intermediate shell.
test('ensureNativeGateRunning() launches a process that survives a taskkill-style tree-kill of the process that launched it, and stopNativeGateIfIdle() fully reaps it', async (t) => {
  const root = makeTempRoot();
  const gatePort = 20000 + Math.floor(Math.random() * 10000);
  const { nativeGateRunning, stopNativeGateIfIdle } = loadAuthGate(root);
  t.after(() => stopNativeGateIfIdle());

  // Calls ensureNativeGateRunning() from inside a throwaway child process — a
  // stand-in for the desktop app's web server, which is what actually calls it
  // in production — then keeps that stand-in alive so it can be tree-killed
  // exactly like desktop/src/server.ts's stopServer() does (`taskkill /pid
  // <web server pid> /T /F` on every app quit/restart). Before this fix, a
  // plain child_process.spawn(detached:true) here would still be reaped by
  // that tree-kill; ensureNativeGateRunning's spawnDetached (WMI-routed on
  // Windows) must not be.
  const authGatePath = path.join(root, 'scripts', 'auth-gate.js');
  const parentScript = `require(${JSON.stringify(authGatePath)}).ensureNativeGateRunning(); setInterval(() => {}, 1e9);`;
  const { spawn, spawnSync } = require('child_process');
  const parent = spawn(process.execPath, ['-e', parentScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AUTH_GATE_PORT: String(gatePort) },
  });
  parent.unref();

  const parentAlive = await waitFor(() => { try { process.kill(parent.pid, 0); return true; } catch { return false; } });
  assert.ok(parentAlive, 'stand-in parent process should have started');

  const pidFile = path.join(root, 'runtime', 'auth-gate', '.pid');
  const gateStarted = await waitFor(() => fs.existsSync(pidFile), { timeoutMs: 10000 });
  assert.ok(gateStarted, 'ensureNativeGateRunning() (run inside the stand-in parent) should have written the gate pid file');
  const gatePid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  assert.ok(Number.isFinite(gatePid));
  assert.equal(nativeGateRunning(), true);

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(parent.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-parent.pid, 'SIGKILL'); } catch { try { process.kill(parent.pid, 'SIGKILL'); } catch {} }
  }

  // Give the tree-kill a moment, then confirm the gate is still alive — this
  // is the actual regression check.
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(nativeGateRunning(), true, 'gate proxy must survive a tree-kill of the process that launched it');

  stopNativeGateIfIdle();
  const reaped = await waitFor(() => { try { process.kill(gatePid, 0); return false; } catch { return true; } }, { timeoutMs: 5000 });
  assert.ok(reaped, 'stopNativeGateIfIdle() should fully reap the gate process, not just drop the pid file');
  assert.equal(fs.existsSync(pidFile), false);
});

// Production incident: the gate proxy died within ~1s of every spawn (missing
// ELECTRON_RUN_AS_NODE launched a second Electron GUI instance that hit the
// single-instance lock and quit) but ensureNativeGateRunning() never noticed —
// it wrote the pid file and returned, leaving callers believing the gate was
// up while nothing listened on its port. Stand in for that crash with a
// proxy script that exits immediately instead of actually mocking Electron.
test('ensureNativeGateRunning() throws (and clears the pid file) when the proxy process dies immediately after spawn', async (t) => {
  const root = makeTempRoot();
  const proxyScript = path.join(root, 'scripts', 'auth-gate-proxy.js');
  fs.writeFileSync(proxyScript, "process.stderr.write('boom: simulated startup crash\\n'); process.exit(1);\n");

  const { ensureNativeGateRunning, nativeGateRunning } = loadAuthGate(root);
  t.after(() => { try { require(path.join(root, 'scripts', 'auth-gate.js')).stopNativeGateIfIdle(); } catch {} });

  assert.throws(() => ensureNativeGateRunning(), /exited immediately after spawn.*boom: simulated startup crash/s);
  assert.equal(nativeGateRunning(), false);
  assert.equal(fs.existsSync(path.join(root, 'runtime', 'auth-gate', '.pid')), false, 'a crashed proxy must not leave a stale pid file behind');
});
