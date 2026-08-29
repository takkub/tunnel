const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// tunnel-health.js is a plain top-level script (no exported run() usable
// without loading modules under a custom TUNNEL_ROOT), so like
// tunnel-status.test.js it's exercised spawned as a real child process
// against a temp TUNNEL_ROOT/TUNNEL_DATA_DIR, JSON parsed from stdout.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['tunnel-health.js', 'health-log-parser.js', 'runtime.js', 'cloudflared-bin.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function makeTunnel(dataDir, name) {
  const tunnelDir = path.join(dataDir, 'tunnels', name);
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\ncredentials-file: fake-id.json\n');
  return tunnelDir;
}

function runHealth(root, dataDir, args) {
  const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'tunnel-health.js'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, TUNNEL_ROOT: root, TUNNEL_DATA_DIR: dataDir, PATH: process.env.PATH },
  });
  return JSON.parse(out);
}

test('tunnel-health.js: stopped tunnel reports health "stopped" regardless of log content', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'stopped-tunnel');

  const result = runHealth(root, dataDir, ['stopped-tunnel', '--json']);
  assert.equal(result.running, false);
  assert.equal(result.health, 'stopped');
  assert.equal(result.pid, null);
});

test('tunnel-health.js: stopped tunnel with a stale log reports connections=[] and activeConnections=0', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'stale-stopped');
  const runDir = path.join(dataDir, 'runtime', 'stale-stopped');
  fs.mkdirSync(runDir, { recursive: true });
  // no .pid file -> not running, but an old log from a previous, healthy run
  const log = [0, 1, 2, 3]
    .map(i => `2024-05-01T12:00:0${i}Z INF Registered tunnel connection connIndex=${i} location=bkk09 protocol=quic`)
    .join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, '.log'), log);

  const result = runHealth(root, dataDir, ['stale-stopped', '--json']);
  assert.equal(result.running, false);
  assert.equal(result.health, 'stopped');
  assert.deepEqual(result.connections, []);
  assert.equal(result.activeConnections, 0);
});

test('tunnel-health.js: running native tunnel with 4 registered connections -> connected', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'healthy');
  const runDir = path.join(dataDir, 'runtime', 'healthy');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  const log = [0, 1, 2, 3]
    .map(i => `2024-05-01T12:00:0${i}Z INF Registered tunnel connection connIndex=${i} location=bkk09 protocol=quic`)
    .join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, '.log'), log);

  const result = runHealth(root, dataDir, ['healthy', '--json']);
  assert.equal(result.running, true);
  assert.equal(result.health, 'connected');
  assert.equal(result.activeConnections, 4);
  assert.equal(result.pid, process.pid);
  assert.equal(result.logPath, path.join(runDir, '.log'));
});

test('tunnel-health.js: running tunnel with a fresh tunnel-level ERR after connecting -> error, with hint', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'erroring');
  const runDir = path.join(dataDir, 'runtime', 'erroring');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  const log = [
    '2024-05-01T12:00:00Z INF Registered tunnel connection connIndex=0 location=bkk09 protocol=quic',
    '2024-05-01T12:10:00Z ERR Couldn\'t start tunnel error="Provided Tunnel Credentials are invalid"',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, '.log'), log);

  const result = runHealth(root, dataDir, ['erroring', '--json']);
  assert.equal(result.health, 'error');
  assert.match(result.lastError.message, /Tunnel Credentials/);
  assert.equal(result.lastError.hint, 'credentials ผิด/ถูกลบใน Cloudflare');
  assert.equal(result.originError, null);
});

test('tunnel-health.js: recent origin-service error with a live connection -> origin-down, tunnel itself unaffected', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'origin-down-tunnel');
  const runDir = path.join(dataDir, 'runtime', 'origin-down-tunnel');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  const registeredAt = new Date(Date.now() - 60_000).toISOString();
  const errAt = new Date(Date.now() - 5_000).toISOString();
  const log = [
    `${registeredAt} INF Registered tunnel connection connIndex=0 location=bkk09 protocol=quic`,
    `${errAt} ERR Request failed error="Unable to reach the origin service: dial tcp 127.0.0.1:3000: connect: connection refused"`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, '.log'), log);

  const result = runHealth(root, dataDir, ['origin-down-tunnel', '--json']);
  assert.equal(result.health, 'origin-down');
  assert.equal(result.lastError, null);
  assert.ok(result.originError);
  assert.match(result.originError.message, /Unable to reach the origin service/);
  assert.equal(result.originError.hint, 'service ปลายทาง (localhost) ไม่ตอบ');
  assert.ok(result.originError.ageSec < 120);
  assert.deepEqual(result.lastOriginError, result.originError);
});

test('tunnel-health.js: stale origin-service error outside the 120s window does not flag origin-down', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'origin-recovered');
  const runDir = path.join(dataDir, 'runtime', 'origin-recovered');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  const registeredAt = new Date(Date.now() - 600_000).toISOString();
  const errAt = new Date(Date.now() - 300_000).toISOString();
  const log = [
    `${registeredAt} INF Registered tunnel connection connIndex=0 location=bkk09 protocol=quic`,
    `${errAt} ERR Request failed error="Unable to reach the origin service: dial tcp 127.0.0.1:3000: connect: connection refused"`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, '.log'), log);

  const result = runHealth(root, dataDir, ['origin-recovered', '--json']);
  assert.equal(result.health, 'degraded'); // only 1 of 4 connections, but not origin-down anymore
  assert.equal(result.originError, null);
  assert.ok(result.lastOriginError); // still surfaced as info
  assert.ok(result.lastOriginError.ageSec >= 120);
});

test('tunnel-health.js: running but never Registered past the 90s grace period -> error with hint', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'stuck-connecting');
  const runDir = path.join(dataDir, 'runtime', 'stuck-connecting');
  fs.mkdirSync(runDir, { recursive: true });
  const pidFile = path.join(runDir, '.pid');
  fs.writeFileSync(pidFile, String(process.pid));
  const oldTime = new Date(Date.now() - 120_000);
  fs.utimesSync(pidFile, oldTime, oldTime); // uptimeSec is derived from the .pid file's mtime

  const result = runHealth(root, dataDir, ['stuck-connecting', '--json']);
  assert.equal(result.health, 'error');
  assert.equal(result.activeConnections, 0);
  assert.ok(result.lastError);
  assert.equal(result.lastError.hint, 'register ไม่สำเร็จ ดู log');
});

test('tunnel-health.js: empty/missing log file -> connecting while running', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'starting');
  const runDir = path.join(dataDir, 'runtime', 'starting');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  // no .log file written yet — cloudflared just launched

  const result = runHealth(root, dataDir, ['starting', '--json']);
  assert.equal(result.running, true);
  assert.equal(result.health, 'connecting');
  assert.equal(result.activeConnections, 0);
  assert.equal(result.lastError, null);
});

test('tunnel-health.js --all: reports every tunnel in one call', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'one');
  makeTunnel(dataDir, 'two');

  const { tunnels } = runHealth(root, dataDir, ['--all', '--json']);
  assert.deepEqual(tunnels.map(t => t.name), ['one', 'two']);
  assert.ok(tunnels.every(t => t.health === 'stopped'));
});

// A fake `docker` on PATH that logs every invocation's args to logFile (one
// line each) and reports a single running container, "cloudflared-tunnel-two".
function makeFakeDockerBin(logFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-fake-docker-'));
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'docker.cmd'),
      `@echo off\r\necho %* >> "${logFile}"\r\necho cloudflared-tunnel-two\r\n`);
  } else {
    const shPath = path.join(dir, 'docker');
    fs.writeFileSync(shPath, `#!/usr/bin/env bash\necho "$@" >> "${logFile}"\necho cloudflared-tunnel-two\n`);
    fs.chmodSync(shPath, 0o755);
  }
  return dir;
}

test('tunnel-health.js --all: shape matches web/lib/health.ts (TunnelHealthResponse) and docker is queried once, not once per tunnel', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  const logFile = path.join(dataDir, 'docker-calls.log');
  fs.writeFileSync(logFile, '');
  makeTunnel(dataDir, 'one');
  makeTunnel(dataDir, 'two');

  const fakeDockerDir = makeFakeDockerBin(logFile);
  const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'tunnel-health.js'), '--all', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, TUNNEL_ROOT: root, TUNNEL_DATA_DIR: dataDir, PATH: `${fakeDockerDir}${path.delimiter}${process.env.PATH}` },
  });
  const result = JSON.parse(out);

  // Shape: { tunnels: TunnelHealth[] } — exactly the fields web/lib/health.ts
  // declares, so the UI's optional-chained reads (health?.activeConnections
  // etc.) actually find data instead of silently falling through to "?".
  assert.deepEqual(Object.keys(result), ['tunnels']);
  assert.equal(result.tunnels.length, 2);
  const expectedKeys = [
    'name', 'running', 'health', 'connections', 'activeConnections',
    'lastError', 'originError', 'lastOriginError', 'lastEventAt', 'pid', 'uptimeSec', 'logPath',
  ].sort();
  for (const t of result.tunnels) {
    assert.deepEqual(Object.keys(t).sort(), expectedKeys);
  }
  const two = result.tunnels.find(t => t.name === 'two');
  assert.equal(two.running, true, '"two" should be reported running (docker container present)');

  // One shared `docker ps` call for the whole --all batch, not one per tunnel —
  // otherwise an unresponsive Docker Desktop turns into N hangs instead of one
  // and /api/tunnels/health never resolves (the root cause of the "?/4" badge).
  // `docker logs`/`docker inspect` are still legitimately per-container (only
  // "two" is docker-mode here, so exactly one of each) — only `ps` is batched.
  const calls = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  const psCalls = calls.filter(c => c.trim().startsWith('ps'));
  assert.equal(psCalls.length, 1, `expected exactly 1 'docker ps' invocation, got ${psCalls.length}: ${calls.join(' | ')}`);
});

test('tunnel-health.js --logs: returns tail lines and the log path', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'logged');
  const runDir = path.join(dataDir, 'runtime', 'logged');
  fs.mkdirSync(runDir, { recursive: true });
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
  fs.writeFileSync(path.join(runDir, '.log'), lines.join('\n') + '\n');

  const result = runHealth(root, dataDir, ['logged', '--logs', '--lines=3', '--json']);
  assert.deepEqual(result.lines, ['line 7', 'line 8', 'line 9']);
  assert.equal(result.path, path.join(runDir, '.log'));
});

test('tunnel-health.js --clear-log: truncates the native log file', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'clearme');
  const runDir = path.join(dataDir, 'runtime', 'clearme');
  fs.mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, '.log');
  fs.writeFileSync(logPath, 'old content\n');

  const result = runHealth(root, dataDir, ['clearme', '--clear-log', '--json']);
  assert.equal(result.cleared, true);
  assert.equal(fs.readFileSync(logPath, 'utf8'), '');
});
