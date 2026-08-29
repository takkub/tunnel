// Per-tunnel health derived from the cloudflared log tail (native: <name>/.log
// file, docker: `docker logs --tail`), layered on top of the plain
// process/container-alive check tunnel-status.js already does.
// Usage: node tunnel-health.js <name> --json
//        node tunnel-health.js --all --json
//        node tunnel-health.js <name> --logs [--lines=200] --json
//        node tunnel-health.js <name> --clear-log --json
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  TUNNELS_DIR, getRuntimeDir,
  dockerStatus, nativeRunning, getCloudflaredProcesses,
} = require('./runtime');
const { parseLogText, deriveHealth } = require('./health-log-parser');

const DEFAULT_TAIL_BYTES = 64 * 1024;
const DEFAULT_DOCKER_TAIL_LINES = 500;

function getTunnelFolders() {
  if (!fs.existsSync(TUNNELS_DIR)) return [];
  return fs.readdirSync(TUNNELS_DIR).filter(f =>
    fs.statSync(path.join(TUNNELS_DIR, f)).isDirectory()
  );
}

// Reads up to maxBytes from the end of a file without loading the whole thing.
function readFileTail(filePath, maxBytes = DEFAULT_TAIL_BYTES) {
  if (!fs.existsSync(filePath)) return '';
  const size = fs.statSync(filePath).size;
  const start = Math.max(0, size - maxBytes);
  const len = size - start;
  if (len <= 0) return '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function readDockerLogTail(name, tailLines = DEFAULT_DOCKER_TAIL_LINES) {
  const containerName = `cloudflared-tunnel-${name}`;
  const r = spawnSync('docker', ['logs', '--tail', String(tailLines), containerName], {
    encoding: 'utf8', timeout: 10000,
  });
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

function nativeLogPath(name) {
  return path.join(getRuntimeDir(name), '.log');
}

function nativePidFile(name) {
  return path.join(getRuntimeDir(name), '.pid');
}

function readNativePid(name) {
  try {
    const raw = fs.readFileSync(nativePidFile(name), 'utf8').trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function dockerStartedAtSec(name) {
  try {
    const r = spawnSync('docker', ['inspect', '-f', '{{.State.StartedAt}}', `cloudflared-tunnel-${name}`], {
      encoding: 'utf8', timeout: 5000,
    });
    const ms = Date.parse((r.stdout || '').trim());
    return Number.isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 1000)) : null;
  } catch {
    return null;
  }
}

// Shared state (docker container names + native process list) so a multi-tunnel
// call spawns `docker ps`/process-list once instead of once per tunnel.
function getSharedState() {
  return { nativeProcesses: getCloudflaredProcesses() };
}

function getTunnelHealth(name, shared) {
  const { nativeProcesses } = shared || getSharedState();
  const isDocker = dockerStatus(name);
  const isNative = !isDocker && nativeRunning(name, nativeProcesses);
  const running = isDocker || isNative;

  let logText, logPath, pid, uptimeSec;
  if (isDocker) {
    logText = readDockerLogTail(name);
    logPath = null; // no local file — logs live in the docker daemon
    pid = null;
    uptimeSec = dockerStartedAtSec(name);
  } else {
    logPath = nativeLogPath(name);
    logText = readFileTail(logPath);
    pid = isNative ? readNativePid(name) : null;
    uptimeSec = null;
    if (isNative) {
      try { uptimeSec = Math.max(0, Math.round((Date.now() - fs.statSync(nativePidFile(name)).mtimeMs) / 1000)); } catch {}
    }
  }

  const parsed = parseLogText(logText);
  const health = deriveHealth({
    running,
    activeConnections: parsed.activeConnections,
    lastErrorAt: parsed.lastErrorAt,
    lastRegisteredAt: parsed.lastRegisteredAt,
  });

  return {
    name,
    running,
    health,
    connections: parsed.connections,
    activeConnections: parsed.activeConnections,
    lastError: parsed.lastError,
    lastEventAt: parsed.lastEventAt,
    pid,
    uptimeSec,
    logPath,
  };
}

function getAllTunnelsHealth() {
  const names = getTunnelFolders().sort();
  const shared = getSharedState();
  return names.map(name => getTunnelHealth(name, shared));
}

// Tail log lines for the /logs endpoint — reuses the same native/docker
// source selection as getTunnelHealth, but returns raw lines, not parsed state.
function getLogLines(name, lines = 200) {
  const isDocker = dockerStatus(name);
  if (isDocker) {
    const text = readDockerLogTail(name, lines);
    return { lines: text.split(/\r?\n/).filter(Boolean).slice(-lines), path: null };
  }
  const logPath = nativeLogPath(name);
  const text = readFileTail(logPath);
  return { lines: text.split(/\r?\n/).filter(Boolean).slice(-lines), path: fs.existsSync(logPath) ? logPath : null };
}

// Clears the native log file. Docker mode has no local file to clear (log
// lifecycle is owned by the docker daemon) — reports unsupported instead.
function clearLog(name) {
  if (dockerStatus(name)) {
    return { cleared: false, error: 'Clearing logs is not supported in docker mode' };
  }
  const logPath = nativeLogPath(name);
  try {
    fs.writeFileSync(logPath, '');
    return { cleared: true };
  } catch (err) {
    return { cleared: false, error: err.message };
  }
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const all = args.includes('--logs') ? false : args.includes('--all');
  const wantLogs = args.includes('--logs');
  const wantClear = args.includes('--clear-log');
  const linesArg = args.find(a => a.startsWith('--lines='));
  const lines = linesArg ? parseInt(linesArg.split('=')[1], 10) || 200 : 200;
  const name = args.find(a => !a.startsWith('--'));

  try {
    let result;
    if (wantClear) {
      if (!name) throw new Error('name required for --clear-log');
      result = clearLog(name);
    } else if (wantLogs) {
      if (!name) throw new Error('name required for --logs');
      result = getLogLines(name, lines);
    } else if (all) {
      result = { tunnels: getAllTunnelsHealth() };
    } else {
      if (!name) throw new Error('tunnel name required (or pass --all)');
      result = getTunnelHealth(name);
    }
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { getTunnelHealth, getAllTunnelsHealth, getLogLines, clearLog, readFileTail, readDockerLogTail };
