// Per-tunnel login gate: rewrites a tunnel's ingress to route through a shared
// nginx + login-service pair (nginx/auth-gate/) instead of the app directly.
// nginx does auth_request against auth-gate-server.js (cookie-based session),
// redirecting unauthenticated visitors to a login page served by that same service.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  ROOT,
  TUNNELS_DIR: RUNTIME_TUNNELS_DIR,
  CONFIG_FILE,
  isInContainer,
  getHostProjectDir,
  getEffectiveMode,
  dockerStatus,
  dockerStop,
  dockerStart,
  nativeRunning,
  nativeStop,
  nativeStart,
  getCloudflaredProcesses,
  spawnDetached,
  killDetached,
} = require('./runtime');
const { hashPassword, ensureSecretFile } = require('./auth-gate-crypto');
const { assertValidCountries } = require('./auth-gate-country');
const { readPersistedState } = require('./auth-gate-lockout');
const cfRule = require('./auth-gate-cf-rule');

const NGINX_AUTH_GATE_DIR = path.join(ROOT, 'nginx', 'auth-gate');
const CONFD_DIR = path.join(NGINX_AUTH_GATE_DIR, 'conf.d');
const COMPOSE_FILE = path.join(NGINX_AUTH_GATE_DIR, 'docker-compose.yml');
const SECRET_FILE = path.join(NGINX_AUTH_GATE_DIR, '.secret');

const GATE_CONTAINER = 'tunnel-auth-gate';
const GATE_SERVER_CONTAINER = 'tunnel-auth-gate-server';
const DEFAULT_GATE_PORT = 8890;
const DEFAULT_GATE_SVC_PORT = 8891;

// TUNNEL_ROOT/TUNNEL_DATA_DIR are read defensively here (runtime.js may not yet honor
// them) so tunnels/ and the native gate's runtime dir resolve consistently even before
// runtime.js gains the same env support; default (no env vars set) matches RUNTIME_TUNNELS_DIR
// exactly, so existing behavior/tests are unaffected.
const TUNNEL_ROOT = process.env.TUNNEL_ROOT || ROOT;
const TUNNEL_DATA_DIR = process.env.TUNNEL_DATA_DIR || TUNNEL_ROOT;
const TUNNELS_DIR = process.env.TUNNEL_DATA_DIR ? path.join(TUNNEL_DATA_DIR, 'tunnels') : RUNTIME_TUNNELS_DIR;

const RUNTIME_AUTH_GATE_DIR = path.join(TUNNEL_DATA_DIR, 'runtime', 'auth-gate');
const NATIVE_GATE_PID_FILE = path.join(RUNTIME_AUTH_GATE_DIR, '.pid');
const NATIVE_GATE_LOG_FILE = path.join(RUNTIME_AUTH_GATE_DIR, '.log');
const AUTH_GATE_PROXY_SCRIPT = path.join(__dirname, 'auth-gate-proxy.js');

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function assertValidName(name) {
  if (!name || !NAME_RE.test(name)) throw new Error('Invalid tunnel name');
}

function getConfigPath(name) {
  return path.join(TUNNELS_DIR, name, 'config.yml');
}

function getStatePath(name) {
  return path.join(TUNNELS_DIR, name, 'auth-gate.json');
}

function readState(name) {
  const p = getStatePath(name);
  const empty = { enabled: false, passwordHash: null, originalService: null, gatePort: null, allowedCountries: [], cfRuleId: null };
  if (!fs.existsSync(p)) return empty;
  try {
    return { ...empty, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return empty;
  }
}

function writeState(name, state) {
  fs.mkdirSync(path.dirname(getStatePath(name)), { recursive: true });
  fs.writeFileSync(getStatePath(name), JSON.stringify(state, null, 2));
}

function getHostnameFromConfig(name) {
  const configPath = getConfigPath(name);
  if (!fs.existsSync(configPath)) return null;
  const content = fs.readFileSync(configPath, 'utf8');
  const match = content.match(/hostname:\s*(\S+)/);
  return match ? match[1] : null;
}

function getGatePort() {
  if (process.env.AUTH_GATE_PORT) return parseInt(process.env.AUTH_GATE_PORT, 10);
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (cfg.authGatePort) return parseInt(cfg.authGatePort, 10);
    }
  } catch {}
  return DEFAULT_GATE_PORT;
}

function getGateServicePort() {
  if (process.env.AUTH_GATE_SVC_PORT) return parseInt(process.env.AUTH_GATE_SVC_PORT, 10);
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (cfg.authGateServicePort) return parseInt(cfg.authGateServicePort, 10);
    }
  } catch {}
  return DEFAULT_GATE_SVC_PORT;
}

// Finds the ingress entry for `hostname` and swaps its `service:` line for `newService`.
// Returns the rewritten text plus the service value that was there before.
function rewriteServiceForHostname(configText, hostname, newService) {
  const lines = configText.split(/\r?\n/);
  let inTargetEntry = false;
  let originalService = null;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hostMatch = line.match(/^\s*-\s*hostname:\s*(\S+)\s*$/);
    if (hostMatch) {
      inTargetEntry = hostMatch[1] === hostname;
      continue;
    }
    const newListEntry = line.match(/^\s*-\s*\S+:/);
    if (newListEntry) {
      inTargetEntry = false;
      continue;
    }
    if (inTargetEntry) {
      const svcMatch = line.match(/^(\s*)service:\s*(\S+)\s*$/);
      if (svcMatch) {
        originalService = svcMatch[2];
        lines[i] = `${svcMatch[1]}service: ${newService}`;
        found = true;
        inTargetEntry = false;
      }
    }
  }

  if (!found) throw new Error(`hostname '${hostname}' not found in ingress config`);
  return { text: lines.join('\n'), originalService };
}

function ensureUpgradeMapFile() {
  const p = path.join(CONFD_DIR, '_upgrade-map.conf');
  if (fs.existsSync(p)) return;
  fs.writeFileSync(p, `map $http_upgrade $connection_upgrade {\n    default upgrade;\n    ''      close;\n}\n`);
}

// Without at least one `server { listen 80; }` block, nginx has nothing bound to the
// port at all once the last protected tunnel is disabled — connections get refused
// instead of a clean response. This default_server keeps a listener alive always,
// and closes anything that doesn't match a known tunnel's server_name.
function ensureDefaultServerFile() {
  const p = path.join(CONFD_DIR, '_default.conf');
  if (fs.existsSync(p)) return;
  fs.writeFileSync(p, `server {\n    listen 80 default_server;\n    server_name _;\n    return 444;\n}\n`);
}

// $http_cf_ipcountry comes from Cloudflare on every request proxied through
// the tunnel; blocking on it here means a disallowed country never even
// reaches auth_request, matching the native proxy's check in auth-gate-proxy.js.
function countryCheckSnippet(allowedCountries) {
  const list = (allowedCountries || []).map(c => String(c).toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c));
  if (!list.length) return '';
  return `        if ($http_cf_ipcountry !~ ^(${list.join('|')})$) {
            return 403;
        }
`;
}

function writeGateConfig(name, hostname, originalService, allowedCountries) {
  fs.mkdirSync(CONFD_DIR, { recursive: true });
  const svcPort = getGateServicePort();
  const countryCheck = countryCheckSnippet(allowedCountries);
  const conf = `server {
    listen 80;
    server_name ${hostname};
    absolute_redirect off;
    port_in_redirect off;

    location / {
${countryCheck}        auth_request /__gate/verify;
        error_page 401 = @login;

        proxy_pass ${originalService};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }

    location = /__gate/verify {
        internal;
        proxy_pass http://host.docker.internal:${svcPort}/verify;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Gate-Tunnel ${name};
        proxy_set_header Cookie $http_cookie;
    }

    location /__gate/ {
${countryCheck}        proxy_pass http://host.docker.internal:${svcPort}/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Gate-Tunnel ${name};
    }

    location @login {
        return 302 /__gate/login?next=$request_uri;
    }
${countryCheck ? `
    error_page 403 = @country_blocked;
    location @country_blocked {
        default_type text/html;
        return 403 "<!doctype html><html><head><meta charset=\\"utf-8\\"><title>Access denied</title></head><body><h1>403</h1><p>ไม่อนุญาตให้เข้าถึงจากประเทศนี้ ($http_cf_ipcountry)</p><p>Access from this country is not allowed ($http_cf_ipcountry).</p></body></html>";
    }
` : ''}}
`;
  fs.writeFileSync(path.join(CONFD_DIR, `${name}.conf`), conf);
  ensureUpgradeMapFile();
  ensureDefaultServerFile();
}

function removeGateConfig(name) {
  const p = path.join(CONFD_DIR, `${name}.conf`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function writeComposeFile() {
  fs.mkdirSync(NGINX_AUTH_GATE_DIR, { recursive: true });
  const compose = `services:
  ${GATE_CONTAINER}:
    image: nginx:alpine
    container_name: ${GATE_CONTAINER}
    restart: unless-stopped
    ports:
      - "\${AUTH_GATE_PORT:-${DEFAULT_GATE_PORT}}:80"
    volumes:
      - ./conf.d:/etc/nginx/conf.d:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"

  ${GATE_SERVER_CONTAINER}:
    image: node:alpine
    container_name: ${GATE_SERVER_CONTAINER}
    restart: unless-stopped
    command: node /app/scripts/auth-gate-server.js
    working_dir: /app
    environment:
      PORT: \${AUTH_GATE_SVC_PORT:-${DEFAULT_GATE_SVC_PORT}}
    ports:
      - "\${AUTH_GATE_SVC_PORT:-${DEFAULT_GATE_SVC_PORT}}:\${AUTH_GATE_SVC_PORT:-${DEFAULT_GATE_SVC_PORT}}"
    volumes:
      - ../../scripts:/app/scripts:ro
      - ../../tunnels:/app/tunnels:ro
      - ../../nginx:/app/nginx:ro
      - ../../runtime/auth-gate:/app/runtime/auth-gate
`;
  fs.writeFileSync(COMPOSE_FILE, compose);
}

function isGateRunning() {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: 'pipe' });
    const names = out.split('\n').map(l => l.trim());
    return names.includes(GATE_CONTAINER) && names.includes(GATE_SERVER_CONTAINER);
  } catch {
    return false;
  }
}

function ensureGateRunningInContainer() {
  const hostDir = getHostProjectDir() + '/nginx/auth-gate';
  const hostScriptsDir = getHostProjectDir() + '/scripts';
  const hostTunnelsDir = getHostProjectDir() + '/tunnels';
  const hostNginxDir = getHostProjectDir() + '/nginx';
  const hostRuntimeDir = getHostProjectDir() + '/runtime/auth-gate';
  const port = getGatePort();
  const svcPort = getGateServicePort();

  try { execSync(`docker rm -f "${GATE_CONTAINER}"`, { stdio: 'pipe' }); } catch {}
  execSync(
    `docker run -d` +
    ` --name "${GATE_CONTAINER}"` +
    ` --restart unless-stopped` +
    ` --label com.docker.compose.project=tunnel` +
    ` --label "com.docker.compose.service=${GATE_CONTAINER}"` +
    ` --label com.docker.compose.container-number=1` +
    ` -p ${port}:80` +
    ` -v "${hostDir}/conf.d:/etc/nginx/conf.d:ro"` +
    ` --add-host host.docker.internal:host-gateway` +
    ` nginx:alpine`,
    { encoding: 'utf8', stdio: 'pipe' }
  );

  try { execSync(`docker rm -f "${GATE_SERVER_CONTAINER}"`, { stdio: 'pipe' }); } catch {}
  execSync(
    `docker run -d` +
    ` --name "${GATE_SERVER_CONTAINER}"` +
    ` --restart unless-stopped` +
    ` --label com.docker.compose.project=tunnel` +
    ` --label "com.docker.compose.service=${GATE_SERVER_CONTAINER}"` +
    ` --label com.docker.compose.container-number=1` +
    ` -e PORT=${svcPort}` +
    ` -p ${svcPort}:${svcPort}` +
    ` -v "${hostScriptsDir}:/app/scripts:ro"` +
    ` -v "${hostTunnelsDir}:/app/tunnels:ro"` +
    ` -v "${hostNginxDir}:/app/nginx:ro"` +
    ` -v "${hostRuntimeDir}:/app/runtime/auth-gate"` +
    ` -w /app` +
    ` node:alpine` +
    ` node /app/scripts/auth-gate-server.js`,
    { encoding: 'utf8', stdio: 'pipe' }
  );
}

function ensureGateRunningHost() {
  const env = { ...process.env, AUTH_GATE_PORT: String(getGatePort()), AUTH_GATE_SVC_PORT: String(getGateServicePort()) };
  try {
    execSync(`docker compose -p tunnel -f "${COMPOSE_FILE}" up -d`, { cwd: NGINX_AUTH_GATE_DIR, encoding: 'utf8', stdio: 'pipe', env });
  } catch {
    try { execSync(`docker rm -f "${GATE_CONTAINER}" "${GATE_SERVER_CONTAINER}"`, { stdio: 'pipe' }); } catch {}
    execSync(`docker compose -p tunnel -f "${COMPOSE_FILE}" up -d`, { cwd: NGINX_AUTH_GATE_DIR, encoding: 'utf8', stdio: 'pipe', env });
  }
}

function ensureGateRunning() {
  fs.mkdirSync(CONFD_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_AUTH_GATE_DIR, { recursive: true });
  ensureUpgradeMapFile();
  ensureDefaultServerFile();
  ensureSecretFile(SECRET_FILE);
  writeComposeFile();
  if (isGateRunning()) return;
  if (isInContainer()) ensureGateRunningInContainer();
  else ensureGateRunningHost();
}

function reloadGate() {
  try {
    execSync(`docker exec ${GATE_CONTAINER} nginx -s reload`, { stdio: 'pipe' });
  } catch {
    try { execSync(`docker restart ${GATE_CONTAINER}`, { stdio: 'pipe' }); } catch {}
  }
}

// Native (Docker-free) gate process: one shared node scripts/auth-gate-proxy.js, managed
// the same way native tunnels are (detached spawn + pid file), routing table refreshed
// via its own tunnels/ file watcher and — best effort, POSIX only — SIGHUP on reload.
function nativeGateRunning() {
  if (!fs.existsSync(NATIVE_GATE_PID_FILE)) return false;
  const pid = parseInt(fs.readFileSync(NATIVE_GATE_PID_FILE, 'utf8').trim(), 10);
  if (!Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Launched via runtime.js's spawnDetached (WMI-routed on Windows), not a plain
// child_process.spawn — a plain spawn is still a descendant of this process in
// the Windows process tree even with detached:true, so desktop/src/server.ts's
// stopServer() (`taskkill /pid <web server pid> /T /F`, run on every app quit/
// restart) killed the gate proxy right along with the web server. WMI-routing
// makes the new process a child of WmiPrvSE.exe instead, so it now survives an
// app restart the same way native tunnels already do.
function ensureNativeGateRunning() {
  fs.mkdirSync(RUNTIME_AUTH_GATE_DIR, { recursive: true });
  if (nativeGateRunning()) return;
  const pid = spawnDetached(process.execPath, [AUTH_GATE_PROXY_SCRIPT], {
    env: { AUTH_GATE_PORT: String(getGatePort()), TUNNEL_ROOT, TUNNEL_DATA_DIR },
    logFile: NATIVE_GATE_LOG_FILE,
  });
  fs.writeFileSync(NATIVE_GATE_PID_FILE, String(pid));
}

function reloadNativeGate() {
  if (!fs.existsSync(NATIVE_GATE_PID_FILE)) return;
  const pid = parseInt(fs.readFileSync(NATIVE_GATE_PID_FILE, 'utf8').trim(), 10);
  if (!Number.isFinite(pid)) return;
  try { process.kill(pid, 'SIGHUP'); } catch {}
}

// Stops the shared native gate process once no tunnel has the gate enabled anymore.
function stopNativeGateIfIdle() {
  if (!fs.existsSync(NATIVE_GATE_PID_FILE)) return;
  let anyEnabled = false;
  if (fs.existsSync(TUNNELS_DIR)) {
    for (const n of fs.readdirSync(TUNNELS_DIR)) {
      if (readState(n).enabled) { anyEnabled = true; break; }
    }
  }
  if (anyEnabled) return;
  const pid = parseInt(fs.readFileSync(NATIVE_GATE_PID_FILE, 'utf8').trim(), 10);
  // killDetached, not a bare process.kill: on Windows the recorded pid is the
  // intermediate WMI-launched cmd.exe (see ensureNativeGateRunning), so a
  // plain kill would leave the real proxy process running orphaned.
  if (Number.isFinite(pid)) killDetached(pid);
  try { fs.unlinkSync(NATIVE_GATE_PID_FILE); } catch {}
}

// config.yml and gate state are already persisted by the time this runs, so a
// restart failure doesn't lose the toggle itself — but it does mean the live
// process is still serving the *old* ingress (pre-gate, for enable; still
// gated, for disable), so callers must surface `error` rather than swallow it:
// a silently-failed restart previously showed a "Password" badge with the app
// convinced the gate was live while public traffic kept hitting the tunnel
// directly. nativeRunning() (unlike a bare pid-file check) also catches a
// "foreign" cloudflared process this app never recorded a .pid for — e.g.
// started via the generated start.bat/start.sh launcher, or a manual
// cloudflared invocation — so that case gets a real stop+start instead of a
// silent no-op too (nativeStop() knows how to find and kill it).
function restartTunnelIfRunning(name) {
  try {
    if (dockerStatus(name)) {
      dockerStop(name);
      dockerStart(name);
      return { restarted: true };
    }
    if (nativeRunning(name, getCloudflaredProcesses())) {
      nativeStop(name);
      nativeStart(name);
      return { restarted: true };
    }
    return { restarted: false }; // not running — nothing to restart, not an error
  } catch (e) {
    return { restarted: false, error: e.message };
  }
}

function enable(name, password, opts) {
  opts = opts || {};
  assertValidName(name);
  if (!password) throw new Error('password required');
  const configPath = getConfigPath(name);
  if (!fs.existsSync(configPath)) throw new Error(`No config.yml for tunnel: ${name}`);
  const hostname = getHostnameFromConfig(name);
  if (!hostname) throw new Error(`No hostname found in config for tunnel: ${name}`);

  const mode = getEffectiveMode();
  const state = readState(name);
  const gatePort = state.gatePort || getGatePort();

  if (!state.enabled) {
    const gateHost = mode === 'native' ? 'localhost' : 'host.docker.internal';
    const configText = fs.readFileSync(configPath, 'utf8');
    const { text, originalService } = rewriteServiceForHostname(configText, hostname, `http://${gateHost}:${gatePort}`);
    fs.writeFileSync(configPath, text);
    state.originalService = originalService;
  }

  state.enabled = true;
  state.passwordHash = hashPassword(password);
  state.gatePort = gatePort;
  state.hostname = hostname;
  delete state.username; // legacy field from the basic-auth design — no longer used
  writeState(name, state);

  if (mode === 'native') {
    if (!opts.skipDocker) {
      ensureNativeGateRunning();
      reloadNativeGate();
    }
  } else {
    writeGateConfig(name, hostname, state.originalService, state.allowedCountries);
    if (!opts.skipDocker) {
      ensureGateRunning();
      reloadGate();
    }
  }
  const restart = opts.skipTunnelRestart ? { restarted: false } : restartTunnelIfRunning(name);

  return restart.error ? { ...status(name), restartError: restart.error } : status(name);
}

function disable(name, opts) {
  opts = opts || {};
  assertValidName(name);
  const state = readState(name);
  if (!state.enabled) return status(name);

  const mode = getEffectiveMode();
  const configPath = getConfigPath(name);
  const hostname = getHostnameFromConfig(name);
  if (hostname && fs.existsSync(configPath) && state.originalService) {
    const configText = fs.readFileSync(configPath, 'utf8');
    const { text } = rewriteServiceForHostname(configText, hostname, state.originalService);
    fs.writeFileSync(configPath, text);
  }

  if (mode !== 'native') removeGateConfig(name);
  const p = getStatePath(name);
  if (fs.existsSync(p)) fs.unlinkSync(p);

  if (!opts.skipDocker) {
    if (mode === 'native') {
      reloadNativeGate();
      stopNativeGateIfIdle();
    } else {
      reloadGate();
    }
  }
  const restart = opts.skipTunnelRestart ? { restarted: false } : restartTunnelIfRunning(name);

  return restart.error ? { ...status(name), restartError: restart.error } : status(name);
}

function changePassword(name, password, opts) {
  opts = opts || {};
  assertValidName(name);
  if (!password) throw new Error('password required');
  const state = readState(name);
  if (!state.enabled) throw new Error(`Auth gate not enabled for ${name}`);

  state.passwordHash = hashPassword(password);
  writeState(name, state);

  if (!opts.skipDocker) {
    // cookie value is only ever verified by the running gate service, which reads
    // auth-gate.json fresh per request — no reload needed for a password change.
    if (getEffectiveMode() === 'native') ensureNativeGateRunning();
    else ensureGateRunning();
  }

  return status(name);
}

// Country allowlist for the gate itself (app-layer, always in effect once
// set) — separate from and independent of the optional Cloudflare WAF rule
// (setCloudflareBlock), which is a stronger but off-by-default extra layer.
function setCountries(name, countries, opts) {
  opts = opts || {};
  assertValidName(name);
  const list = assertValidCountries(countries || []);
  const state = readState(name);
  state.allowedCountries = list;
  writeState(name, state);

  if (state.enabled) {
    const mode = getEffectiveMode();
    if (mode === 'native') {
      if (!opts.skipDocker) reloadNativeGate();
    } else if (state.hostname) {
      writeGateConfig(name, state.hostname, state.originalService, list);
      if (!opts.skipDocker) reloadGate();
    }
  }

  return status(name);
}

// Optional Cloudflare-side block, layered on top of setCountries — see
// auth-gate-cf-rule.js. Network call, so this is the one auth-gate.js action
// that's async; enable/disable/changePassword/setCountries stay synchronous.
async function setCloudflareBlock(name, wantEnabled) {
  assertValidName(name);
  const state = readState(name);

  if (!wantEnabled) {
    if (!state.cfRuleId) return status(name);
    const res = await cfRule.removeCountryRule(state.cfRuleId);
    if (!res.ok) return { ...status(name), cfError: res.error };
    state.cfRuleId = null;
    writeState(name, state);
    return status(name);
  }

  if (!state.enabled || !state.hostname) {
    throw new Error(`Auth gate not enabled for ${name} — enable it before adding a Cloudflare country block`);
  }
  const res = await cfRule.upsertCountryRule(name, state.hostname, state.allowedCountries, state.cfRuleId);
  if (!res.ok) return { ...status(name), cfError: res.error };
  state.cfRuleId = res.ruleId;
  writeState(name, state);
  return status(name);
}

function status(name) {
  const state = readState(name);
  const lockout = state.enabled ? readPersistedState(RUNTIME_AUTH_GATE_DIR, name) : { lockedUntil: null, failedLogins24h: 0 };
  return {
    enabled: !!state.enabled,
    gatePort: state.enabled ? state.gatePort : null,
    allowedCountries: state.allowedCountries || [],
    cloudflareBlock: !!state.cfRuleId,
    failedLogins24h: lockout.failedLogins24h,
    lockedUntil: lockout.lockedUntil,
  };
}

module.exports = {
  enable,
  disable,
  changePassword,
  setCountries,
  setCloudflareBlock,
  status,
  readState,
  rewriteServiceForHostname,
  getGatePort,
  getGateServicePort,
  isGateRunning,
  ensureGateRunning,
  nativeGateRunning,
  ensureNativeGateRunning,
  reloadNativeGate,
  stopNativeGateIfIdle,
};

function parseCsvArg(raw) {
  if (!raw || raw === '-') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

if (require.main === module) {
  (async () => {
    const [action, name, ...rest] = process.argv.slice(2);
    try {
      let result;
      if (action === 'enable') result = enable(name, rest[0]);
      else if (action === 'disable') result = disable(name);
      else if (action === 'change-password') result = changePassword(name, rest[0]);
      else if (action === 'status') result = status(name);
      else if (action === 'set-countries') result = setCountries(name, parseCsvArg(rest[0]));
      else if (action === 'cf-country-rule') result = await setCloudflareBlock(name, rest[0] === 'on');
      else {
        process.stderr.write('Usage: node auth-gate.js <enable|disable|change-password|status|set-countries|cf-country-rule> <tunnelName> [arg]\n');
        process.exit(1);
        return;
      }
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch (e) {
      process.stderr.write((e instanceof Error ? e.message : String(e)) + '\n');
      process.exit(1);
    }
  })();
}
