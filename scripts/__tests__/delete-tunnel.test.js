const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// delete-tunnel.js resolves ROOT/DATA_DIR (via runtime.js) from
// TUNNEL_ROOT/TUNNEL_DATA_DIR at require time, so each test loads a fresh
// copy under its own temp root. It never invokes real docker/cloudflared —
// docker/cloudflared/runtime are exercised entirely via node:test's `t.mock`
// against the actual functions delete-tunnel.js calls (it imports
// child_process/runtime/cloudflared-bin as namespaces rather than
// destructuring, specifically so this works — see the comment at the top of
// delete-tunnel.js). This also sidesteps a real Windows gotcha: execFileSync
// (no shell) resolves a bare 'docker' via PATHEXT in extension-major order
// across the whole PATH, so a real docker.exe elsewhere on PATH would always
// beat a fake docker.cmd placed earlier in PATH — mocking the call directly
// is both faster and actually reliable cross-platform.
function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-root-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['delete-tunnel.js', 'runtime.js', 'cloudflared-bin.js', 'ui-helper.js', 'settings-store.js', 'domains.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadModule(root, dataDir, env = {}) {
  const files = ['delete-tunnel.js', 'runtime.js', 'cloudflared-bin.js', 'ui-helper.js', 'settings-store.js', 'domains.js'];
  for (const f of files) {
    delete require.cache[require.resolve(path.join(root, 'scripts', f))];
  }
  const prevRoot = process.env.TUNNEL_ROOT;
  const prevData = process.env.TUNNEL_DATA_DIR;
  const prevEnv = {};
  for (const k of Object.keys(env)) prevEnv[k] = process.env[k];
  process.env.TUNNEL_ROOT = root;
  process.env.TUNNEL_DATA_DIR = dataDir;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    return {
      mod: require(path.join(root, 'scripts', 'delete-tunnel.js')),
      runtime: require(path.join(root, 'scripts', 'runtime.js')),
      cloudflaredBin: require(path.join(root, 'scripts', 'cloudflared-bin.js')),
    };
  } finally {
    if (prevRoot === undefined) delete process.env.TUNNEL_ROOT; else process.env.TUNNEL_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.TUNNEL_DATA_DIR; else process.env.TUNNEL_DATA_DIR = prevData;
    for (const k of Object.keys(env)) {
      if (prevEnv[k] === undefined) delete process.env[k]; else process.env[k] = prevEnv[k];
    }
  }
}

function makeTunnel(dataDir, name, { docker = false } = {}) {
  const tunnelDir = path.join(dataDir, 'tunnels', name);
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, 'config.yml'), 'tunnel: fake-id\ncredentials-file: fake-id.json\n');
  if (docker) fs.writeFileSync(path.join(tunnelDir, 'docker-compose.yml'), 'services: {}\n');
  return tunnelDir;
}

// Records every mocked execFileSync call and, by default, succeeds silently
// (matching a real docker/cloudflared invocation that produced no stdout).
function mockExecFileSync(t, handler) {
  const calls = [];
  const cp = require('child_process');
  t.mock.method(cp, 'execFileSync', (bin, args, opts) => {
    calls.push({ bin, args, opts });
    if (handler) return handler(bin, args, opts);
    return '';
  });
  return calls;
}

function etimedout() {
  return Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
}

test('shouldTryDocker(): true when effectiveMode is docker, even with no matching container', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const { mod, runtime } = loadModule(root, dataDir);
  t.mock.method(runtime, 'getEffectiveMode', () => 'docker');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());

  assert.equal(mod.shouldTryDocker('demo'), true);
});

test('shouldTryDocker(): true in native mode when a matching container is found (leftover from a docker->native switch)', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const { mod, runtime } = loadModule(root, dataDir);
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set(['cloudflared-tunnel-demo']));

  assert.equal(mod.shouldTryDocker('demo'), true);
});

test('shouldTryDocker(): false in native mode with no matching container — docker is never touched', (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const { mod, runtime } = loadModule(root, dataDir);
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());

  assert.equal(mod.shouldTryDocker('demo'), false);
});

test('deleteTunnel(): native mode, tunnel not running, no docker container — docker is never invoked at all', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo');
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  const calls = mockExecFileSync(t);

  const failedSteps = await mod.deleteTunnel('demo');

  assert.deepEqual(failedSteps, []);
  assert.ok(calls.every(c => c.bin !== 'docker'), `expected no docker calls, got: ${JSON.stringify(calls)}`);
  assert.equal(fs.existsSync(tunnelDir), false, 'tunnel folder should be gone');
});

test('deleteTunnel(): docker mode runs `compose down` then `rm -f` with the right args and bounded timeouts', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo', { docker: true });
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'docker');
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  const calls = mockExecFileSync(t);

  const failedSteps = await mod.deleteTunnel('demo');

  assert.deepEqual(failedSteps, []);
  const down = calls.find(c => c.bin === 'docker' && c.args[0] === 'compose');
  assert.ok(down, 'expected a `docker compose ... down` call');
  assert.deepEqual(down.args, ['compose', '-p', 'tunnel', '-f', path.join(dataDir, 'tunnels', 'demo', 'docker-compose.yml'), 'down']);
  assert.equal(down.opts.timeout, 20000);
  const rm = calls.find(c => c.bin === 'docker' && c.args[0] === 'rm');
  assert.ok(rm, 'expected a `docker rm -f` call');
  assert.deepEqual(rm.args, ['rm', '-f', 'cloudflared-tunnel-demo']);
  assert.equal(fs.existsSync(tunnelDir), false, 'tunnel folder should be gone');
});

test('deleteTunnel(): a docker timeout is logged as a failed step but cloudflared delete and folder removal still run', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo', { docker: true });
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'docker');
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  const calls = mockExecFileSync(t, (bin) => { if (bin === 'docker') throw etimedout(); return ''; });

  const failedSteps = await mod.deleteTunnel('demo');

  assert.ok(failedSteps.some(s => /docker compose down: timed out after 20000ms/.test(s)), failedSteps.join(' | '));
  // docker rm is still attempted independently after compose down fails.
  assert.ok(failedSteps.some(s => /docker rm: timed out after 20000ms/.test(s)), failedSteps.join(' | '));
  // cloudflared cleanup/delete still ran despite the docker failure.
  assert.ok(calls.some(c => c.bin === '/fake/cloudflared' && c.args[1] === 'cleanup'));
  assert.ok(calls.some(c => c.bin === '/fake/cloudflared' && c.args[1] === 'delete'));
  assert.equal(fs.existsSync(tunnelDir), false, 'tunnel folder should still be deleted despite the docker hang');
});

test('deleteTunnel(): "No such container" from `docker rm` is not treated as a failure', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  makeTunnel(dataDir, 'demo', { docker: true });
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'docker');
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  mockExecFileSync(t, (bin, args) => {
    if (bin === 'docker' && args[0] === 'rm') {
      throw Object.assign(new Error('Command failed'), { stderr: Buffer.from('Error: No such container: cloudflared-tunnel-demo\n') });
    }
    return '';
  });

  const failedSteps = await mod.deleteTunnel('demo');

  assert.ok(!failedSteps.some(s => s.startsWith('docker rm')), failedSteps.join(' | '));
});

test('deleteTunnel(): cloudflared not found is reported as a failed step but folder removal still runs', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo');
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());
  t.mock.method(cloudflaredBin, 'findCloudflared', () => null);
  mockExecFileSync(t);

  const failedSteps = await mod.deleteTunnel('demo');

  assert.deepEqual(failedSteps, ['cloudflared not found']);
  assert.equal(fs.existsSync(tunnelDir), false);
});

test('deleteTunnel(): cloudflared cleanup and delete each time out independently — both bounded, both reported', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo');
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  const calls = mockExecFileSync(t, (bin) => { if (bin === '/fake/cloudflared') throw etimedout(); return ''; });

  const failedSteps = await mod.deleteTunnel('demo');

  assert.ok(failedSteps.some(s => /cloudflared cleanup: timed out after 30000ms/.test(s)), failedSteps.join(' | '));
  assert.ok(failedSteps.some(s => /cloudflared delete: timed out after 30000ms/.test(s)), failedSteps.join(' | '));
  assert.ok(calls.every(c => c.opts.timeout === 30000 || c.bin === 'docker'));
  assert.equal(fs.existsSync(tunnelDir), false);
});

test('deleteTunnel(): a native tunnel that fails to stop is reported as a failed step but deletion still proceeds', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo');
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  t.mock.method(runtime, 'nativeStatus', () => true); // still "running" even after nativeStop() is called
  t.mock.method(runtime, 'nativeStop', () => {});
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  mockExecFileSync(t);

  const failedSteps = await mod.deleteTunnel('demo');

  assert.ok(failedSteps.includes('native stop'), failedSteps.join(' | '));
  assert.equal(fs.existsSync(tunnelDir), false);
});

test('deleteTunnel(): DELETE_TUNNEL_DOCKER_TIMEOUT_MS / DELETE_TUNNEL_CLOUDFLARED_TIMEOUT_MS env overrides are threaded through to execFileSync', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  makeTunnel(dataDir, 'demo', { docker: true });
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir, {
    DELETE_TUNNEL_DOCKER_TIMEOUT_MS: '111',
    DELETE_TUNNEL_CLOUDFLARED_TIMEOUT_MS: '222',
  });
  t.mock.method(runtime, 'nativeStatus', () => false);
  t.mock.method(runtime, 'getEffectiveMode', () => 'docker');
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  const calls = mockExecFileSync(t);

  await mod.deleteTunnel('demo');

  assert.ok(calls.filter(c => c.bin === 'docker').every(c => c.opts.timeout === 111));
  assert.ok(calls.filter(c => c.bin === '/fake/cloudflared').every(c => c.opts.timeout === 222));
});

test('deleteTunnel(): fully successful native-mode path reports no failed steps', async (t) => {
  const root = makeTempRoot();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-tunnel-test-data-'));
  const tunnelDir = makeTunnel(dataDir, 'demo');
  const { mod, runtime, cloudflaredBin } = loadModule(root, dataDir);
  // Running on the first check (before nativeStop()), stopped by the second.
  let statusCalls = 0;
  t.mock.method(runtime, 'nativeStatus', () => (++statusCalls === 1));
  t.mock.method(runtime, 'nativeStop', () => {});
  t.mock.method(runtime, 'getEffectiveMode', () => 'native');
  t.mock.method(runtime, 'getDockerContainerNames', () => new Set());
  t.mock.method(cloudflaredBin, 'findCloudflared', () => '/fake/cloudflared');
  mockExecFileSync(t);

  const failedSteps = await mod.deleteTunnel('demo');

  assert.deepEqual(failedSteps, []);
  assert.equal(fs.existsSync(tunnelDir), false);
});
