// Shared runtime helper: mode detection + docker/native operations
const { execSync, spawn } = require('child_process');
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
  const composeFile = path.join(ROOT, `docker-compose-cloudflare-${name}.yml`);
  if (!fs.existsSync(composeFile)) throw new Error(`No compose file for ${name}`);
  execSync(`docker compose -f "${composeFile}" up -d`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
}

function dockerStop(name) {
  const composeFile = path.join(ROOT, `docker-compose-cloudflare-${name}.yml`);
  if (!fs.existsSync(composeFile)) throw new Error(`No compose file for ${name}`);
  execSync(`docker compose -f "${composeFile}" down`, { encoding: 'utf8', cwd: ROOT, stdio: 'pipe' });
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
  if (!fs.existsSync(pidFile)) throw new Error(`No .pid file for tunnel: ${name}`);
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

// Enumerate available tunnels by mode
function getTunnelNames() {
  if (!fs.existsSync(TUNNELS_DIR)) return [];
  return fs.readdirSync(TUNNELS_DIR).filter(f => {
    if (!fs.statSync(path.join(TUNNELS_DIR, f)).isDirectory()) return false;
    return fs.existsSync(path.join(TUNNELS_DIR, f, 'config.yml'));
  });
}

function getDockerTunnelNames() {
  return fs.readdirSync(ROOT)
    .filter(f => f.startsWith('docker-compose-cloudflare-') && f.endsWith('.yml'))
    .map(f => f.match(/docker-compose-cloudflare-(.+)\.yml/)[1]);
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
  nativeStart,
  nativeStop,
  nativeStatus,
  getTunnelNames,
  getDockerTunnelNames,
};
