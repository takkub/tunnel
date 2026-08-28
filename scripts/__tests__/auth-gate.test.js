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
  for (const f of ['runtime.js', 'cloudflared-bin.js', 'auth-gate.js', 'auth-gate-crypto.js']) {
    fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, 'scripts', f));
  }
  return dir;
}

function loadAuthGate(root) {
  const modPath = path.join(root, 'scripts', 'auth-gate.js');
  for (const f of ['runtime.js', 'cloudflared-bin.js', 'auth-gate.js', 'auth-gate-crypto.js']) {
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

test('status() returns disabled defaults when no state file exists', () => {
  const root = makeTempRoot();
  writeConfig(root, 'promptpay', 'pay.example.com', 4000);
  const { status } = loadAuthGate(root);
  assert.deepEqual(status('promptpay'), { enabled: false, gatePort: null });
});

test('enable() rewrites ingress service to the gate port and saves originalService', () => {
  const root = makeTempRoot();
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
  assert.deepEqual(status('promptpay'), { enabled: false, gatePort: null });
  assert.equal(fs.existsSync(path.join(root, 'nginx', 'auth-gate', 'conf.d', 'promptpay.conf')), false);
});

test('changePassword() updates the hash without touching config.yml ingress', () => {
  const root = makeTempRoot();
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
  assert.deepEqual(status('promptpay'), { enabled: false, gatePort: null });
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
