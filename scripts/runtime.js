// Shared runtime helper: mode detection + docker/native operations
const { execSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TUNNELS_DIR = path.join(ROOT, 'tunnels');
const CONFIG_FILE = path.join(ROOT, 'runtime.config.json');

function getCloudflaredBin() {
  if (process.platform === 'win32') {
    const bundled = path.join(ROOT, 'cloudflared.exe');
    if (fs.existsSync(bundled)) return bundled;
    return 'cloudflared';
  }
  // macOS/Linux — verify PATH
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
  } catch {
    const hint = process.platform === 'darwin'
      ? 'brew install cloudflared'
      : 'install cloudflared via your package manager (apt/yum/pacman)';
    throw new Error(`cloudflared not found. Install with: ${hint}`);
  }
  return 'cloudflared';
}

// True when this process runs inside a Docker container
function isInContainer() {
  return fs.existsSync('/.dockerenv');
}

// Resolve where the tunnels/ directory lives on the Docker HOST.
// Needed when dockerStart runs inside the web container: compose volumes with relative paths
// are resolved against the HOST filesystem, not the container filesystem.
let _hostTunnelsDir = null;
function getHostTunnelsDir() {
  if (_hostTunnelsDir) return _hostTunnelsDir;

  // 1. Explicit override (set via docker-compose-web.yml environment)
  if (process.env.HOST_PROJECT_DIR) {
    _hostTunnelsDir = process.env.HOST_PROJECT_DIR.replace(/\\/g, '/').replace(/\/$/, '') + '/tunnels';
    return _hostTunnelsDir;
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
        _hostTunnelsDir = raw.replace(/\\/g, '/').replace(/\/$/, '') + '/tunnels';
        return _hostTunnelsDir;
      }
      // Also try .Mounts fallback
      const mraw = execSync(`docker inspect "${shortId}" --format "{{json .Mounts}}"`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      const mounts = JSON.parse(mraw);
      const mount = mounts.find(mt => mt.Destination === '/app/tunnels' && mt.Type === 'bind');
      if (mount && mount.Source) {
        _hostTunnelsDir = mount.Source.replace(/\\/g, '/').replace(/\/$/, '');
        return _hostTunnelsDir;
      }
    }
  } catch {}

  throw new Error(
    'Cannot resolve host project dir. Set HOST_PROJECT_DIR env var in docker-compose-web.yml.'
  );
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

// Docker operations
function dockerStart(name) {
  const composeFile = path.join(TUNNELS_DIR, name, 'docker-compose.yml');
  if (!fs.existsSync(composeFile)) throw new Error(`No compose file for ${name}`);

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
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: 'pipe' });
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
  const pidFile = path.join(TUNNELS_DIR, name, '.pid');
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
  // Fallback: glob *.json excluding cert.pem
  const entries = fs.readdirSync(tunnelDir).filter(f => f.endsWith('.json'));
  if (entries.length === 1) return path.join(tunnelDir, entries[0]);
  if (entries.length > 1) return path.join(tunnelDir, entries[0]); // best effort
  return null;
}

// Native operations
function nativeStart(name) {
  const bin = getCloudflaredBin();
  const tunnelDir = path.join(TUNNELS_DIR, name);
  const configPath = path.join(tunnelDir, 'config.yml');
  if (!fs.existsSync(configPath)) throw new Error(`No config.yml for tunnel: ${name}`);

  const credPath = resolveCredentialsFile(tunnelDir, configPath);
  if (!credPath) throw new Error(`credentials not found for ${name}`);

  const pidFile = path.join(tunnelDir, '.pid');
  const logFile = path.join(tunnelDir, '.log');

  const logFd = fs.openSync(logFile, 'a');
  const proc = spawn(bin, [
    'tunnel',
    '--config', configPath,
    '--credentials-file', credPath,
    'run',
  ], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  proc.unref();
  fs.closeSync(logFd);
  fs.writeFileSync(pidFile, String(proc.pid));
  return proc.pid;
}

function nativeStop(name) {
  const pidFile = path.join(TUNNELS_DIR, name, '.pid');
  if (!fs.existsSync(pidFile)) return; // already stopped
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  try { process.kill(pid); } catch {}
  fs.unlinkSync(pidFile);
}

function nativeStatus(name) {
  const pidFile = path.join(TUNNELS_DIR, name, '.pid');
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
function generateLaunchers(name) {
  const tunnelDir = path.join(TUNNELS_DIR, name);
  fs.mkdirSync(tunnelDir, { recursive: true });

  const configPath = path.join(tunnelDir, 'config.yml');
  const credPath = fs.existsSync(configPath)
    ? resolveCredentialsFile(tunnelDir, configPath)
    : null;

  // Relative paths from project root using forward slashes
  const relConfig = `tunnels/${name}/config.yml`;
  const relCred = credPath
    ? credPath.replace(ROOT + path.sep, '').replace(/\\/g, '/')
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
    'if exist "%ROOT%\\cloudflared.exe" (',
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
    `exec cloudflared tunnel --config "${relConfig}" --credentials-file "${relCred}" run`,
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
  TUNNELS_DIR,
  CONFIG_FILE,
  getCloudflaredBin,
  isDockerAvailable,
  getRuntimeMode,
  getEffectiveMode,
  dockerStart,
  dockerStop,
  dockerStatus,
  getDockerContainerNames,
  nativeStart,
  nativeStop,
  nativeStatus,
  getCloudflaredProcesses,
  nativeRunning,
  getTunnelNames,
  getDockerTunnelNames,
  generateLaunchers,
};
