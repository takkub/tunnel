// Starts/stops/checks the Next.js standalone web dashboard as a detached
// native background process — the non-Electron equivalent of what
// desktop/src/server.ts does for the packaged app. Does NOT set DESKTOP_MODE
// (that flag skips login when no ADMIN_PASSWORD is set — appropriate only for
// the Electron app's own trusted local server, not this general-purpose run).
// Usage: node web-serve.js <start|stop|status> [--port N]
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, DATA_DIR, getRuntimeDir, spawnDetached, killDetached } = require('./runtime');

// Loaded after runtime.js resolves DATA_DIR, so a packaged/relocated data dir
// still finds its own .env. Values land in process.env AND get captured into
// dotenvVars below — never read or logged directly here, so no secret ever
// hits stdout. dotenvVars is threaded explicitly into the spawn's env in
// start(): spawnDetached's WMI path (the default on win32) does not inherit
// this process's process.env at all, only the explicit env object passed to
// it — a plain "it's in process.env" would silently spawn the server with no
// ADMIN_PASSWORD/SESSION_SECRET and every login would 401.
let dotenvVars = {};
try {
  const parsed = require('dotenv').config({ path: path.join(DATA_DIR, '.env') }).parsed;
  if (parsed) dotenvVars = parsed;
} catch {}

const NAME = 'web';
const DEFAULT_PORT = 8888;

function standaloneServerPath() {
  return path.join(ROOT, 'web', '.next', 'standalone', 'server.js');
}

function copyDirIfMissing(src, dest) {
  if (fs.existsSync(dest) || !fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirIfMissing(s, d);
    else fs.copyFileSync(s, d);
  }
}

// `next build` (output: 'standalone') doesn't copy .next/static or public/
// into the standalone folder itself — same staging desktop/scripts/copy-standalone.js
// does for packaging, done here in place for a native run.
function stageStaticAssets(standaloneDir) {
  copyDirIfMissing(path.join(ROOT, 'web', '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
  const publicSrc = path.join(ROOT, 'web', 'public');
  if (fs.existsSync(publicSrc)) copyDirIfMissing(publicSrc, path.join(standaloneDir, 'public'));
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function status() {
  const pidFile = path.join(getRuntimeDir(NAME), '.pid');
  if (!fs.existsSync(pidFile)) return { running: false };
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (!Number.isFinite(pid) || !isAlive(pid)) return { running: false };
  return { running: true, pid };
}

function start(port = DEFAULT_PORT) {
  const existing = status();
  if (existing.running) return existing;

  const serverJs = standaloneServerPath();
  if (!fs.existsSync(serverJs)) {
    throw new Error('web/.next/standalone/server.js missing — run `npm --prefix web run build` first');
  }
  stageStaticAssets(path.dirname(serverJs));

  const runDir = getRuntimeDir(NAME);
  fs.mkdirSync(runDir, { recursive: true });
  const pidFile = path.join(runDir, '.pid');
  const logFile = path.join(runDir, '.log');

  const pid = spawnDetached(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...dotenvVars,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      TUNNEL_ROOT: ROOT,
      TUNNEL_DATA_DIR: DATA_DIR,
    },
    logFile,
  });
  fs.writeFileSync(pidFile, String(pid));
  return { running: true, pid, port };
}

function stop() {
  const pidFile = path.join(getRuntimeDir(NAME), '.pid');
  if (!fs.existsSync(pidFile)) return { running: false };
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  // Only discard our record of this pid once it's confirmed dead — see
  // runtime.js's killDetached() for why.
  if (!killDetached(pid)) return { running: true, pid };
  try { fs.unlinkSync(pidFile); } catch {}
  return { running: false };
}

function main() {
  const action = process.argv[2];
  const portFlagIndex = process.argv.indexOf('--port');
  const port = portFlagIndex !== -1
    ? parseInt(process.argv[portFlagIndex + 1], 10)
    : parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

  if (!['start', 'stop', 'status'].includes(action)) {
    process.stderr.write('Usage: node web-serve.js <start|stop|status> [--port N]\n');
    process.exit(1);
    return;
  }

  try {
    const result = action === 'start' ? start(port) : action === 'stop' ? stop() : status();
    console.log(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { start, stop, status };
