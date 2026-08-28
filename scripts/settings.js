// CLI used by the web settings API to install/login cloudflared without
// shelling the user out to a terminal. Prints one JSON line to stdout.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const cloudflaredBin = require('./cloudflared-bin');
const { RUNTIME_DIR } = require('./runtime');

const LOGIN_URL_RE = /https:\/\/dash\.cloudflare\.com\/argotunnel\?\S+/;
const LOGIN_URL_WAIT_MS = 15000;
const LOGIN_TOTAL_TIMEOUT_MS = 5 * 60 * 1000;
const LOGIN_POLL_MS = 1000;

function loginRunDir() {
  return path.join(RUNTIME_DIR, '_cloudflared-login');
}

function extractLoginUrl(text) {
  const m = text.match(LOGIN_URL_RE);
  return m ? m[0] : null;
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') cp.spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
    else process.kill(pid);
  } catch {}
}

// Spawns `cloudflared tunnel login`, detached so it survives this short-lived
// CLI process, logging its output to a file (not a pipe) so nothing depends
// on us staying alive to drain it.
function startLoginProcess(bin) {
  const dir = loginRunDir();
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, '.log');
  const logFd = fs.openSync(logFile, 'a');
  const proc = cp.spawn(bin, ['tunnel', 'login'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  proc.unref();
  fs.closeSync(logFd);
  return { pid: proc.pid, logFile };
}

function waitForUrlInLog(logFile, timeoutMs) {
  return new Promise(resolve => {
    const start = Date.now();
    (function tick() {
      let content = '';
      try { content = fs.readFileSync(logFile, 'utf8'); } catch {}
      const url = extractLoginUrl(content);
      if (url) return resolve(url);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, 300);
    })();
  });
}

// Runs inside the detached watcher process spawned by cmdCloudflaredLogin —
// outlives the CLI call that already answered the API request.
function watchForCertOrTimeout(pid, timeoutMs) {
  return new Promise(resolve => {
    const start = Date.now();
    (function tick() {
      if (cloudflaredBin.isLoggedIn()) return resolve('logged-in');
      if (Date.now() - start >= timeoutMs) {
        killPid(pid);
        return resolve('timeout');
      }
      setTimeout(tick, LOGIN_POLL_MS);
    })();
  });
}

async function cmdCloudflaredInstall() {
  const installedPath = await cloudflaredBin.ensureCloudflared();
  const r = cp.spawnSync(installedPath, ['--version'], { encoding: 'utf8', timeout: 10000 });
  return { ok: true, version: (r.stdout || '').trim() || null, path: installedPath };
}

async function cmdCloudflaredLogin(opts = {}) {
  const urlWaitMs = opts.urlWaitMs || LOGIN_URL_WAIT_MS;
  if (cloudflaredBin.isLoggedIn()) return { ok: true, url: null, alreadyLoggedIn: true };

  const bin = await cloudflaredBin.ensureCloudflared();
  const { pid, logFile } = api.startLoginProcess(bin);
  const url = await api.waitForUrlInLog(logFile, urlWaitMs);

  if (!url) {
    killPid(pid);
    return { ok: false, error: 'Timed out waiting for the login URL from cloudflared' };
  }

  // Hand off the 5-minute cert.pem wait to a process independent of this one
  // so the API can answer as soon as we have the URL.
  const watcher = cp.spawn(process.execPath, [__filename, 'cloudflared-login-watch', String(pid)], {
    detached: true,
    stdio: 'ignore',
  });
  watcher.unref();

  return { ok: true, url };
}

async function cmdCloudflaredLoginWatch(pidArg) {
  await api.watchForCertOrTimeout(Number(pidArg), LOGIN_TOTAL_TIMEOUT_MS);
}

// Exported as one object (not destructured by callers) so tests can mock
// startLoginProcess/waitForUrlInLog/watchForCertOrTimeout independently of
// the orchestration functions that call them via `api.*`.
const api = module.exports = {
  extractLoginUrl,
  startLoginProcess,
  waitForUrlInLog,
  watchForCertOrTimeout,
  cmdCloudflaredInstall,
  cmdCloudflaredLogin,
  cmdCloudflaredLoginWatch,
};

if (require.main === module) {
  const cmd = process.argv[2];
  (async () => {
    if (cmd === 'cloudflared-install') {
      console.log(JSON.stringify(await cmdCloudflaredInstall()));
    } else if (cmd === 'cloudflared-login') {
      console.log(JSON.stringify(await cmdCloudflaredLogin()));
    } else if (cmd === 'cloudflared-login-watch') {
      await cmdCloudflaredLoginWatch(process.argv[3]);
    } else {
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
    }
  })().catch(err => {
    console.log(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  });
}
