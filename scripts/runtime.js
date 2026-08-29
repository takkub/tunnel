// Shared runtime helper: mode detection + docker/native operations
const { execSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Namespace import (not destructured) so tests can mock getCloudflaredPath at call time.
const cloudflaredBin = require('./cloudflared-bin');

// TUNNEL_ROOT: directory containing scripts/ (defaults to the repo root).
// TUNNEL_DATA_DIR: directory holding tunnels/, .env, and runtime config
// (defaults to TUNNEL_ROOT for backward compat). Kept separate so a packaged
// Electron app can ship code under TUNNEL_ROOT while writing user data
// (tunnels, credentials, pid/log files) to a writable per-user directory.
const ROOT = process.env.TUNNEL_ROOT || path.join(__dirname, '..');
const DATA_DIR = process.env.TUNNEL_DATA_DIR || ROOT;
const TUNNELS_DIR = path.join(DATA_DIR, 'tunnels');
const CONFIG_FILE = path.join(DATA_DIR, 'runtime.config.json');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');

function getRuntimeDir(name) {
  return path.join(RUNTIME_DIR, name);
}

function getCloudflaredBin() {
  return cloudflaredBin.getCloudflaredPath();
}

// True when this process runs inside a Docker container
function isInContainer() {
  return fs.existsSync('/.dockerenv');
}

// Resolve the project root directory as it exists on the Docker HOST (not inside
// this container). Needed when a script running inside the web container spawns
// sibling containers via the Docker socket: compose volumes with relative paths
// ("./tunnels") are resolved by the HOST daemon against the HOST filesystem.
let _hostProjectDir = null;
function getHostProjectDir() {
  if (_hostProjectDir) return _hostProjectDir;

  // 1. Explicit override (set via docker-compose-web.yml environment)
  if (process.env.HOST_PROJECT_DIR) {
    _hostProjectDir = process.env.HOST_PROJECT_DIR.replace(/\\/g, '/').replace(/\/$/, '');
    return _hostProjectDir;
  }

  // 2. Auto-detect: inspect our own container via container ID from cgroup
  try {
    const cg = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const m = cg.match(/[a-f0-9]{64}/);
    if (m) {
      const shortId = m[0].slice(0, 12);
      const raw = execSync(
        `docker inspect "${shortId}" --format "{{index .Config.Labels \\"com.docker.compose.project.working_dir\\"}}"`,
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      if (raw) {
        _hostProjectDir = raw.replace(/\\/g, '/').replace(/\/$/, '');
        return _hostProjectDir;
      }
      // Also try .Mounts fallback
      const mraw = execSync(`docker inspect "${shortId}" --format "{{json .Mounts}}"`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      const mounts = JSON.parse(mraw);
      const mount = mounts.find(mt => mt.Destination === '/app/tunnels' && mt.Type === 'bind');
      if (mount && mount.Source) {
        _hostProjectDir = mount.Source.replace(/\\/g, '/').replace(/\/$/, '').replace(/\/tunnels$/, '');
        return _hostProjectDir;
      }
    }
  } catch {}

  throw new Error(
    'Cannot resolve host project dir. Set HOST_PROJECT_DIR env var in docker-compose-web.yml.'
  );
}

function getHostTunnelsDir() {
  return getHostProjectDir() + '/tunnels';
}

function isDockerAvailable() {
  try {
    execSync('docker ps', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function getRuntimeMode() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (['auto', 'docker', 'native'].includes(cfg.mode)) return cfg.mode;
    }
  } catch {}
  return 'auto';
}

function getEffectiveMode() {
  const mode = getRuntimeMode();
  if (mode === 'docker') return 'docker';
  if (mode === 'native') return 'native';
  return isDockerAvailable() ? 'docker' : 'native';
}

// A tunnel's ingress config.yml hardcodes a host that only resolves in one
// runtime: 'host.docker.internal' (docker mode) or 'localhost' (native mode) —
// see create-tunnel.js's `mode === 'docker' ? host.docker.internal : localhost`.
// A tunnel started under the *other* mode (e.g. after a docker->native switch,
// or a fleet with mixed per-tunnel modes) needs its `service:` lines rewritten
// first, or cloudflared connects to the edge fine but every request 502s
// because it can't reach the unreachable host. Rewrites every ingress rule in
// the file (not just one hostname), reusing the same host-per-mode mapping
// auth-gate.js's rewriteServiceForHostname() already writes at enable time.
function rewriteIngressHostForMode(configPath, mode) {
  if (!fs.existsSync(configPath)) return false;
  const text = fs.readFileSync(configPath, 'utf8');
  const pattern = mode === 'docker'
    ? /(\bservice:\s*https?:\/\/)localhost(:)/g
    : /(\bservice:\s*https?:\/\/)host\.docker\.internal(:)/g;
  const replacement = mode === 'docker' ? '$1host.docker.internal$2' : '$1localhost$2';
  if (!pattern.test(text)) return false;
  fs.writeFileSync(configPath, text.replace(pattern, replacement));
  return true;
}

// Docker operations
function dockerStart(name) {
  const composeFile = path.join(TUNNELS_DIR, name, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) throw new Error(`No compose file for ${name}`);

  rewriteIngressHostForMode(path.join(TUNNELS_DIR, name, 'config.yml'), 'docker');

  const containerName = `cloudflared-tunnel-${name}`;

  if (isInContainer()) {
    // When running inside the web container, docker compose resolves relative volume "."
    // to the container path (/app/tunnels/<name>), which the HOST daemon can't see.
    // Use docker run with the explicit HOST path instead.
    const hostTunnelDir = getHostTunnelsDir() + '/' + name;
    try { execSync(`docker rm -f "${containerName}"`, { encoding: 'utf8', stdio: 'pipe' }); } catch {}
    execSync(
      `docker run -d` +
      ` --name "${containerName}"` +
      ` --user 0:0` +
      ` --restart unless-stopped` +
      ` --label com.docker.compose.project=tunnel` +
      ` --label "com.docker.compose.service=cloudflared-${name}"` +
      ` --label com.docker.compose.container-number=1` +
      ` -v "${hostTunnelDir}:/etc/cloudflared"` +
      ` --add-host host.docker.internal:host-gateway` +
      ` cloudflare/cloudflared:latest` +
      ` tunnel --config /etc/cloudflared/config.yml run`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return;
  }

  try {
    execSync(`docker compose -p tunnel -f "${composeFile}" up -d`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
  } catch (err) {
    // Name conflict: stale container with same name from outside this compose project
    try {
      execSync(`docker rm -f "${containerName}"`, { encoding: 'utf8', stdio: 'pipe' });
    } catch {}
    execSync(`docker compose -p tunnel -f "${composeFile}" up -d`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
  }
}

function dockerStop(name) {
  const containerName = `cloudflared-tunnel-${name}`;
  const composeFile = path.join(TUNNELS_DIR, name, 'docker-compose.yml');
  if (fs.existsSync(composeFile)) {
    try {
      execSync(`docker compose -p tunnel -f "${composeFile}" down`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
    } catch {}
  }
  // Fallback: force-remove container if still running (e.g. started from old/different compose project)
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: 'pipe' });
    if (out.split('\n').map(l => l.trim()).includes(containerName)) {
      execSync(`docker rm -f "${containerName}"`, { encoding: 'utf8', stdio: 'pipe' });
    }
  } catch {}
}

function dockerStatus(name) {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    const containerName = `cloudflared-tunnel-${name}`;
    return out.split('\n').map(l => l.trim()).includes(containerName);
  } catch {
    return false;
  }
}

// Fetch all running docker container names at once (Set) — call once, reuse across tunnels
function getDockerContainerNames() {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    return new Set(out.split('\n').map(l => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

// Fetch all running cloudflared process command lines at once — call once, reuse across tunnels
function getCloudflaredProcesses() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cloudflared.exe' } | ForEach-Object { $_.CommandLine }",
      ], { encoding: 'utf8', timeout: 10000 });
      if (!r.stdout) return [];
      return r.stdout.split('\n').filter(l => l.trim()).map(l => ({ cmdline: l.trim() }));
    } else {
      const r = spawnSync('ps', ['-eo', 'args'], { encoding: 'utf8', timeout: 5000 });
      if (!r.stdout) return [];
      return r.stdout.split('\n').filter(l => l.includes('cloudflared')).map(l => ({ cmdline: l.trim() }));
    }
  } catch {
    return [];
  }
}

// Check if a tunnel is running natively — checks .pid first, then falls back to process scan.
// Pass the result of getCloudflaredProcesses() so we only spawn once per status cycle.
function nativeRunning(name, processes) {
  const pidFile = path.join(getRuntimeDir(name), '.pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    try { process.kill(pid, 0); return true; } catch {}
    // stale .pid — fall through to process scan
  }
  if (!processes || !processes.length) return false;
  const fragment = path.join('tunnels', name, 'config.yml');   // OS-native separators
  const fragmentFwd = `tunnels/${name}/config.yml`;             // forward-slash form (launchers)
  return processes.some(p => p.cmdline.includes(fragment) || p.cmdline.includes(fragmentFwd));
}

// Filenames that live in a tunnel dir but are never a credentials file —
// excluded from resolveCredentialsFile's glob fallback below.
const NON_CREDENTIAL_JSON_FILES = new Set(['tunnel.json', 'auth-gate.json']);

// Resolve local credentials file for a tunnel (bypasses docker-only path in config.yml)
function resolveCredentialsFile(tunnelDir, configPath) {
  // Try tunnel ID from config.yml first
  try {
    const cfg = fs.readFileSync(configPath, 'utf8');
    const m = cfg.match(/^tunnel:\s*([a-f0-9-]{36})/m);
    if (m) {
      const candidate = path.join(tunnelDir, `${m[1]}.json`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}
  // Fallback: glob *.json excluding cert.pem and known non-credential metadata files
  const entries = fs.readdirSync(tunnelDir).filter(f => f.endsWith('.json') && !NON_CREDENTIAL_JSON_FILES.has(f));
  if (entries.length === 1) return path.join(tunnelDir, entries[0]);
  if (entries.length > 1) return path.join(tunnelDir, entries[0]); // best effort
  return null;
}

// Spawns `bin args...` fully detached, with stdout+stderr appended to
// logFile, surviving not just this process exiting but this process's whole
// tree being torn down — confirmed necessary via a real docker->native
// migration where 8/9 native cloudflared processes died when the operator's
// terminal/agent pane closed, despite detached:true+unref(); root cause: the
// pane's own cleanup kills its whole process tree (a Job Object on Windows),
// which plain spawn(detached:true) does not escape (Node has no
// CREATE_BREAKAWAY_FROM_JOB option).
//
// On win32, routes the launch through WMI's Win32_Process.Create (via
// PowerShell's Invoke-CimMethod): a separate, SYSTEM-hosted provider process
// (WmiPrvSE.exe) creates it on our behalf, so the result is never a
// descendant of our own process tree at all — confirmed empirically (the new
// process's parent is WmiPrvSE.exe, not us) — and Invoke-CimMethod returns
// the real pid directly, so no fragile after-the-fact cmdline matching is
// needed. Win32_Process.Create has no way to hand it extra env vars or a
// cwd directly, so both are threaded through as `cmd.exe /c set "K=V" && ...`
// chaining ahead of the real command. Falls back to a plain detached spawn
// (still correct for "this process exits normally", just not for "this
// process's whole tree gets killed") if WMI is unavailable.
//
// On POSIX, detached:true already calls setsid(), which is sufficient — Job
// Objects are a Windows-only concept.
// Keeps POSIX-fallback-spawned ChildProcess objects reachable. detached+unref'd
// with no other JS reference, the object can be garbage-collected before the
// child exits; once that happens Node stops waiting() on that pid, so a later
// kill() succeeds at the OS level but leaves an unreaped zombie that
// process.kill(pid, 0) still reports as alive (confirmed via CI: killDetached()
// waiting out its full deadline against a process it had already killed —
// Windows has no zombie state, so this never surfaces there). Entries are
// dropped once the child actually exits.
const posixSpawnedChildren = new Map();

function spawnDetached(bin, args, { cwd, env, logFile } = {}) {
  let pid;
  if (process.platform === 'win32') {
    try {
      const dq = s => `"${String(s).replace(/"/g, '""')}"`;
      const setPrefix = Object.entries(env || {})
        .map(([k, v]) => `set ${dq(`${k}=${v}`)} && `)
        .join('');
      const cdPrefix = cwd ? `cd /d ${dq(cwd)} && ` : '';
      const command = [dq(bin), ...args.map(dq)].join(' ') + ` > ${dq(logFile)} 2>&1`;
      const inner = `${cdPrefix}${setPrefix}${command}`;
      // cmd.exe's `/c` has a well-known quirk: when the command starts with a
      // quoted token (our binary path, quoted for spaces) and contains other
      // quoted segments, it mis-parses redirection unless the *entire*
      // command is wrapped in one more, outer pair of quotes — confirmed
      // empirically (without this the process launches but silently never
      // runs the redirected command, no log file, dies within ~1s).
      const cmdLine = `cmd.exe /c "${inner}"`;
      const psLiteral = `'${cmdLine.replace(/'/g, "''")}'`;
      // Win32_Process.Create ignores our own process's console/window state —
      // without an explicit hidden Win32_ProcessStartup, WMI pops a real,
      // visible cmd.exe console window on the user's desktop for every launch
      // (confirmed: this flashed on-screen during plain `npm test` runs).
      // ShowWindow=0 (SW_HIDE) suppresses it. `-ClassName Win32_ProcessStartup`
      // on New-CimInstance produces an instance CIM's type-checker rejects for
      // this embedded parameter ("Type mismatch") — it must be built from
      // Get-CimClass instead. CreateFlags is *not* a usable property here:
      // setting it (e.g. to CREATE_NO_WINDOW) makes Create() itself fail with
      // ReturnValue=21 (invalid parameter) — confirmed empirically; ShowWindow
      // alone is sufficient and is the documented technique for this.
      const psScript = `$si = New-CimInstance -CimClass (Get-CimClass -ClassName Win32_ProcessStartup) -ClientOnly -Property @{ShowWindow=0}; (Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${psLiteral}; ProcessStartupInformation=$si}).ProcessId`;
      const r = spawnSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command', psScript,
      ], { encoding: 'utf8', timeout: 15000, windowsHide: true });
      const wmiPid = parseInt((r.stdout || '').trim(), 10);
      if (r.status === 0 && Number.isFinite(wmiPid) && wmiPid > 0) pid = wmiPid;
    } catch {}
    // WMI path unavailable/failed — fall through to the plain spawn below.
  }
  if (pid === undefined) {
    const logFd = fs.openSync(logFile, 'a');
    const proc = spawn(bin, args, {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      // detached so the tunnel outlives this process; on POSIX this also makes
      // proc.pid a process-group leader, letting nativeStop kill the whole group.
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd],
    });
    posixSpawnedChildren.set(proc.pid, proc);
    proc.on('exit', () => posixSpawnedChildren.delete(proc.pid));
    proc.on('error', () => {}); // e.g. bin missing/non-executable — avoid an uncaught 'error' event
    proc.unref();
    fs.closeSync(logFd);
    pid = proc.pid;
  }
  // WMI's Create call (and, rarely, even a plain spawn under heavy load) can
  // return before the OS has fully registered the new pid — confirmed
  // empirically, an immediate taskkill against a just-returned pid
  // occasionally found nothing and the process survived as an orphan. Wait
  // here, once, at the source, so every caller gets a pid that's actually
  // live rather than each having to guard against "not visible yet".
  const deadline = Date.now() + 1500;
  while (!isAlive(pid) && Date.now() < deadline) sleepSync(75);
  return pid;
}

// Native operations — pid file + log file live under <TUNNEL_DATA_DIR>/runtime/<name>/,
// separate from the tunnel's config folder so they survive independently of it
// and stay out of anything that gets synced/packaged from tunnels/.
function nativeStart(name) {
  // Refuse a double-start: a caller that skips its own pre-check (or races
  // one) would otherwise leave two cloudflared processes fighting over the
  // same tunnel ID (seen in production: autostart.js started a tunnel that
  // was already running natively).
  if (nativeRunning(name, getCloudflaredProcesses())) {
    throw new Error(`Tunnel already running natively: ${name}`);
  }

  const bin = getCloudflaredBin();
  const tunnelDir = path.join(TUNNELS_DIR, name);
  const configPath = path.join(tunnelDir, 'config.yml');
  if (!fs.existsSync(configPath)) throw new Error(`No config.yml for tunnel: ${name}`);

  const credPath = resolveCredentialsFile(tunnelDir, configPath);
  if (!credPath) throw new Error(`credentials not found for ${name}`);

  rewriteIngressHostForMode(configPath, 'native');

  const runDir = getRuntimeDir(name);
  fs.mkdirSync(runDir, { recursive: true });
  const pidFile = path.join(runDir, '.pid');
  const logFile = path.join(runDir, '.log');

  const pid = spawnDetached(bin, ['tunnel', '--config', configPath, '--credentials-file', credPath, 'run'], { logFile });
  fs.writeFileSync(pidFile, String(pid));
  return pid;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Kills a spawnDetached()-launched process (and its subtree, on Windows via
// taskkill /T — needed because a WMI-launched process's recorded pid is
// often an intermediate cmd.exe, not the real binary). spawnDetached()
// already waits for the pid to be confirmed alive before handing it back, so
// this only needs to verify the kill itself landed, retrying briefly if not.
// Returns whether the pid is confirmed gone, so a caller can avoid
// discarding its own record of a pid that's still — rarely, under heavy
// system load — actually alive.
function killDetached(pid) {
  if (!Number.isFinite(pid) || !isAlive(pid)) return true; // already gone
  const attempt = () => {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 5000 });
    } else {
      // Negative pid targets the whole process group (see the `detached` note above).
      try { process.kill(-pid); } catch { try { process.kill(pid); } catch {} }
    }
  };
  attempt();
  // Deadline confirmed via CI (both ubuntu-latest and windows-latest): a
  // single taskkill/spawnSync round trip already costs real wall-clock time
  // under load, and a local run of this same test measured 5982ms end-to-end
  // against the old 3000ms deadline — comfortable locally but CI's slower/
  // busier runners routinely tipped it over (nativeStop() and web-serve.js's
  // stop() both bailed out early reporting the process still alive, moments
  // before it actually exited). 10s gives real CI headroom; re-issuing the
  // kill only once a second (not every 150ms poll) avoids piling more
  // taskkill/spawnSync calls onto an already-loaded runner.
  const killDeadline = Date.now() + 10000;
  let lastAttempt = Date.now();
  while (isAlive(pid) && Date.now() < killDeadline) {
    sleepSync(150);
    if (Date.now() - lastAttempt >= 1000) {
      attempt();
      lastAttempt = Date.now();
    }
  }
  return !isAlive(pid);
}

function nativeStop(name) {
  const pidFile = path.join(getRuntimeDir(name), '.pid');
  if (!fs.existsSync(pidFile)) return; // already stopped
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  // Only discard our record of this pid once it's confirmed dead — losing
  // the pid file for a process that's still actually running (kill failed)
  // would make status checks silently forget about it.
  if (!killDetached(pid)) return;
  try { fs.unlinkSync(pidFile); } catch {}
}

function nativeStatus(name) {
  const pidFile = path.join(getRuntimeDir(name), '.pid');
  if (!fs.existsSync(pidFile)) return false;
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Generate per-tunnel start launchers in tunnels/<name>/
// Launchers run cloudflared FOREGROUND: closing the window/terminal stops the tunnel.
// nativeStart (used by web dashboard) remains detached as before.
// Launchers locate their own root via %~dp0/$(dirname), which resolves to
// TUNNEL_DATA_DIR (tunnels/<name>/../..) regardless of where TUNNEL_ROOT lives —
// so no env vars need to travel with the launcher file itself.
function generateLaunchers(name) {
  const tunnelDir = path.join(TUNNELS_DIR, name);
  fs.mkdirSync(tunnelDir, { recursive: true });

  const configPath = path.join(tunnelDir, 'config.yml');
  const credPath = fs.existsSync(configPath)
    ? resolveCredentialsFile(tunnelDir, configPath)
    : null;

  // Relative paths from the data dir using forward slashes
  const relConfig = `tunnels/${name}/config.yml`;
  const relCred = credPath
    ? credPath.replace(DATA_DIR + path.sep, '').replace(/\\/g, '/')
    : `tunnels/${name}/<credentials>.json`;

  // Windows .bat — foreground: close window = tunnel stops immediately
  const relConfigWin = relConfig.replace(/\//g, '\\');
  const relCredWin = relCred.replace(/\//g, '\\');
  const batLines = [
    '@echo off',
    'setlocal',
    `:: Start tunnel: ${name}  (foreground — close this window to stop the tunnel)`,
    'set "ROOT=%~dp0..\\.."',
    'cd /d "%ROOT%"',
    'if exist "%ROOT%\\bin\\cloudflared.exe" (',
    `    "%ROOT%\\bin\\cloudflared.exe" tunnel --config "${relConfigWin}" --credentials-file "${relCredWin}" run`,
    ') else if exist "%ROOT%\\cloudflared.exe" (',
    `    "%ROOT%\\cloudflared.exe" tunnel --config "${relConfigWin}" --credentials-file "${relCredWin}" run`,
    ') else (',
    `    cloudflared tunnel --config "${relConfigWin}" --credentials-file "${relCredWin}" run`,
    ')',
  ];
  fs.writeFileSync(path.join(tunnelDir, 'start.bat'), batLines.join('\r\n') + '\r\n');

  // Unix shell — foreground: Ctrl-C or closing terminal stops the tunnel
  const shLines = [
    '#!/usr/bin/env bash',
    `# Start tunnel: ${name}  (foreground — Ctrl-C or close terminal to stop)`,
    'ROOT="$(cd "$(dirname "$0")/../.." && pwd)"',
    'cd "$ROOT"',
    'if [ -x "$ROOT/bin/cloudflared" ]; then',
    `  exec "$ROOT/bin/cloudflared" tunnel --config "${relConfig}" --credentials-file "${relCred}" run`,
    'else',
    `  exec cloudflared tunnel --config "${relConfig}" --credentials-file "${relCred}" run`,
    'fi',
  ];
  const sh = shLines.join('\n') + '\n';

  const shPath = path.join(tunnelDir, 'start.sh');
  fs.writeFileSync(shPath, sh);
  try { fs.chmodSync(shPath, 0o755); } catch {}

  const commandPath = path.join(tunnelDir, 'start.command');
  fs.writeFileSync(commandPath, sh);
  try { fs.chmodSync(commandPath, 0o755); } catch {}
}

// Enumerate available tunnels by mode
function getTunnelNames() {
  if (!fs.existsSync(TUNNELS_DIR)) return [];
  return fs.readdirSync(TUNNELS_DIR).filter(f => {
    if (!fs.statSync(path.join(TUNNELS_DIR, f)).isDirectory()) return false;
    return fs.existsSync(path.join(TUNNELS_DIR, f, 'config.yml'));
  });
}

function getDockerTunnelNames() {
  if (!fs.existsSync(TUNNELS_DIR)) return [];
  return fs.readdirSync(TUNNELS_DIR).filter(f => {
    if (!fs.statSync(path.join(TUNNELS_DIR, f)).isDirectory()) return false;
    return fs.existsSync(path.join(TUNNELS_DIR, f, 'docker-compose.yml'));
  });
}

module.exports = {
  ROOT,
  DATA_DIR,
  TUNNELS_DIR,
  CONFIG_FILE,
  RUNTIME_DIR,
  getRuntimeDir,
  getCloudflaredBin,
  isInContainer,
  getHostProjectDir,
  getHostTunnelsDir,
  isDockerAvailable,
  getRuntimeMode,
  getEffectiveMode,
  dockerStart,
  dockerStop,
  dockerStatus,
  getDockerContainerNames,
  rewriteIngressHostForMode,
  spawnDetached,
  killDetached,
  nativeStart,
  nativeStop,
  nativeStatus,
  getCloudflaredProcesses,
  nativeRunning,
  getTunnelNames,
  getDockerTunnelNames,
  generateLaunchers,
};
