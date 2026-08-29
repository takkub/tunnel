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

test('tunnel-health.js: running tunnel with a fresh ERR after connecting -> error, with hint', () => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-health-test-data-'));
  fs.writeFileSync(path.join(dataDir, 'runtime.config.json'), JSON.stringify({ mode: 'native' }));
  makeTunnel(dataDir, 'erroring');
  const runDir = path.join(dataDir, 'runtime', 'erroring');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '.pid'), String(process.pid));
  const log = [
    '2024-05-01T12:00:00Z INF Registered tunnel connection connIndex=0 location=bkk09 protocol=quic',
    '2024-05-01T12:10:00Z ERR Unable to reach the origin service: connection refused',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(runDir, '.log'), log);

  const result = runHealth(root, dataDir, ['erroring', '--json']);
  assert.equal(result.health, 'error');
  assert.match(result.lastError.message, /Unable to reach the origin service/);
  assert.equal(result.lastError.hint, 'service ปลายทาง (localhost) ไม่ตอบ');
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
