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

// nativeStart() always invokes its binary with fixed cloudflared-style args
// ('tunnel --config ... run'), which a real node.exe stand-in would choke on
// (it treats the bare 'tunnel' token as an entry-script path to resolve —
// MODULE_NOT_FOUND, instant exit). A self-contained batch loop sidesteps
// that: it ignores whatever args it's given and just runs, independent of
// cwd (unlike a script needing module resolution), so it works the same way
// under both spawnDetached() launch paths (WMI-via-cmd.exe and the plain
// spawn fallback).
function makeSleeperBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-bin-'));
  const cmdPath = path.join(dir, 'sleeper.cmd');
  fs.writeFileSync(cmdPath, '@echo off\r\n:loop\r\nping -n 2 127.0.0.1 >nul\r\ngoto loop\r\n');
  return cmdPath;
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return predicate();
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

test('nativeStart() writes pid/log files under <TUNNEL_DATA_DIR>/runtime/<name>/, not the tunnel folder', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => makeSleeperBin());

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
  assert.equal(fs.readFileSync(path.join(runDir, '.pid'), 'utf8').trim(), String(pid));
  assert.equal(fs.existsSync(path.join(tunnelDir, '.pid')), false);

  // The launcher's own startup (WMI Create returning, then the OS actually
  // scheduling and running the new process) isn't instantaneous, so the log
  // file the launched process opens for its stdout/stderr may not exist the
  // instant nativeStart() returns — poll for it instead of asserting immediately.
  assert.ok(await waitFor(() => fs.existsSync(path.join(runDir, '.log'))), '.log should appear shortly after start');
});

test('nativeStop() actually terminates a real nativeStart()-launched process, not just a fake pid', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => makeSleeperBin());

  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\n');
  fs.writeFileSync(path.join(tunnelDir, 'fake-id.json'), '{}');

  const pid = runtime.nativeStart('demo');
  t.after(() => { try { require('child_process').spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']); } catch {} });
  assert.ok(await waitFor(() => { try { process.kill(pid, 0); return true; } catch { return false; } }));

  runtime.nativeStop('demo');

  const dead = await waitFor(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  assert.ok(dead, 'process should be gone after nativeStop()');
  assert.equal(fs.existsSync(path.join(runtime.getRuntimeDir('demo'), '.pid')), false);
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

test('nativeStart() rewrites host.docker.internal ingress entries to localhost, including path-scoped rules', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);
  const cloudflaredBin = require(path.join(root, 'scripts', 'cloudflared-bin.js'));
  t.mock.method(cloudflaredBin, 'getCloudflaredPath', () => process.execPath);

  // Mirrors a tunnel created under Docker mode, with a second path-scoped
  // ingress rule (like admin-wash-locker-dev in the real migration).
  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), `tunnel: fake-id
credentials-file: /etc/cloudflared/fake-id.json

ingress:
  - hostname: demo.example.com
    path: /downloads/.*
    service: http://host.docker.internal:14611
  - hostname: demo.example.com
    service: http://host.docker.internal:14603
  - service: http_status:404
`);
  fs.writeFileSync(path.join(tunnelDir, 'fake-id.json'), '{}');

  const pid = runtime.nativeStart('demo');
  t.after(() => { try { runtime.nativeStop('demo'); } catch {} });
  assert.ok(pid > 0);

  const rewritten = fs.readFileSync(path.join(tunnelDir, 'config.yml'), 'utf8');
  assert.doesNotMatch(rewritten, /host\.docker\.internal/);
  assert.match(rewritten, /service: http:\/\/localhost:14611/);
  assert.match(rewritten, /service: http:\/\/localhost:14603/);
  // credentials-file (a Docker-only path unrelated to ingress host) is untouched.
  assert.match(rewritten, /credentials-file: \/etc\/cloudflared\/fake-id\.json/);
});

test('rewriteIngressHostForMode() rewrites localhost -> host.docker.internal for docker mode (the reverse direction)', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);

  const configPath = path.join(dataDir, 'config.yml');
  fs.writeFileSync(configPath, `ingress:
  - hostname: demo.example.com
    service: http://localhost:6720
  - service: http_status:404
`);

  const changed = runtime.rewriteIngressHostForMode(configPath, 'docker');
  assert.equal(changed, true);
  assert.match(fs.readFileSync(configPath, 'utf8'), /service: http:\/\/host\.docker\.internal:6720/);

  // Idempotent: already-correct config reports no change.
  assert.equal(runtime.rewriteIngressHostForMode(configPath, 'docker'), false);
});

test('nativeStart() refuses to double-start a tunnel that is already running natively', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));
  const runtime = loadRuntime(root, dataDir);

  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\n');
  fs.writeFileSync(path.join(tunnelDir, 'fake-id.json'), '{}');

  const runDir = runtime.getRuntimeDir('demo');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));

  assert.throws(() => runtime.nativeStart('demo'), /already running natively/);
});

test('nativeStart()-spawned child survives its parent process exiting outright', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-data-'));

  const tunnelDir = path.join(dataDir, 'tunnels', 'demo');
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\n');
  fs.writeFileSync(path.join(tunnelDir, 'fake-id.json'), '{}');

  const sleeperBin = makeSleeperBin();

  // A harness process that calls nativeStart() and immediately exits,
  // printing the grandchild's pid first. A plain spawn(detached:true) child
  // would survive *this* (it only needs to outlive the calling process, not
  // a whole enclosing process tree) — the real-world failure this guards
  // against (a pane's cleanup killing its entire tree) isn't reproducible in
  // a unit test, but this still exercises nativeStart() end-to-end through a
  // genuinely separate process rather than just this same test process.
  const harness = `
    process.env.TUNNEL_ROOT = ${JSON.stringify(root)};
    process.env.TUNNEL_DATA_DIR = ${JSON.stringify(dataDir)};
    const cloudflaredBin = require(${JSON.stringify(path.join(root, 'scripts', 'cloudflared-bin.js'))});
    cloudflaredBin.getCloudflaredPath = () => ${JSON.stringify(sleeperBin)};
    const runtime = require(${JSON.stringify(path.join(root, 'scripts', 'runtime.js'))});
    const pid = runtime.nativeStart('demo');
    process.stdout.write(String(pid));
    // No process.exit() — the spawned grandchild is detached+unref'd (or, on
    // win32, not even a descendant of this process at all) so it won't hold
    // the event loop open; letting the process exit naturally (instead of
    // process.exit()) guarantees the stdout write above is flushed before
    // the process object goes away, even where stdout is a pipe with async
    // writes (e.g. Windows).
  `;
  const { execFileSync } = require('child_process');
  const grandchildPid = parseInt(
    execFileSync(process.execPath, ['-e', harness], { encoding: 'utf8' }).trim(),
    10
  );
  t.after(() => { try { require('child_process').spawnSync('taskkill', ['/PID', String(grandchildPid), '/T', '/F']); } catch {} });

  assert.ok(grandchildPid > 0);
  const alive = await waitFor(() => {
    try { process.kill(grandchildPid, 0); return true; } catch { return false; }
  });
  assert.ok(alive, 'grandchild should still be alive after its spawning process exited');
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
