// Per-tunnel login lockout: counts failed logins across all IPs (the rate
// limiter in auth-gate-server.js is per-IP and doesn't stop a distributed
// attempt spread across many addresses). >=20 failures in a 10 minute window
// locks the tunnel's gate for 15 minutes. State lives in-memory in whichever
// process is actually serving logins (auth-gate-server.js / auth-gate-proxy.js),
// and is mirrored to runtime/auth-gate/state.json so `auth-gate.js status`,
// which runs in a separate short-lived process, can read it back.
'use strict';
const fs = require('fs');
const path = require('path');

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const FAILURE_THRESHOLD = 20;
const LOCKOUT_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// ponytail: single-file rotation (rename + start fresh) rather than a proper
// rotating log — fine at this volume (failed logins only), and the 24h count
// only reads the current file, so a rotation can undercount for a few hours
// after it fires. Upgrade path: read log + log.1 in countFailedLogins24h if
// that ever matters.
const LOG_ROTATE_BYTES = 1024 * 1024;

function statePath(runtimeDir) {
  return path.join(runtimeDir, 'state.json');
}

function logPath(runtimeDir) {
  return path.join(runtimeDir, 'failed-logins.log');
}

function countFailedLogins24h(runtimeDir, tunnel, nowMs) {
  let text;
  try { text = fs.readFileSync(logPath(runtimeDir), 'utf8'); } catch { return 0; }
  const cutoff = nowMs - DAY_MS;
  let count = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.tunnel === tunnel && Date.parse(entry.ts) >= cutoff) count++;
  }
  return count;
}

function readPersistedState(runtimeDir, tunnel) {
  try {
    const all = JSON.parse(fs.readFileSync(statePath(runtimeDir), 'utf8'));
    const entry = all[tunnel];
    if (!entry) return { lockedUntil: null, failedLogins24h: 0 };
    return { lockedUntil: entry.lockedUntil || null, failedLogins24h: entry.failedLogins24h || 0 };
  } catch {
    return { lockedUntil: null, failedLogins24h: 0 };
  }
}

function createLockoutTracker(opts = {}) {
  const runtimeDir = opts.runtimeDir;
  const now = opts.now || (() => Date.now());
  const failureWindowMs = opts.failureWindowMs || FAILURE_WINDOW_MS;
  const failureThreshold = opts.failureThreshold || FAILURE_THRESHOLD;
  const lockoutMs = opts.lockoutMs || LOCKOUT_MS;

  const failures = new Map(); // tunnel -> timestamps within the sliding window
  const lockedUntil = new Map(); // tunnel -> epoch ms

  function isLocked(tunnel) {
    const t = lockedUntil.get(tunnel);
    if (!t) return false;
    if (now() >= t) { lockedUntil.delete(tunnel); return false; }
    return true;
  }

  function lockRemainingMinutes(tunnel) {
    const t = lockedUntil.get(tunnel);
    if (!t) return 0;
    return Math.max(1, Math.ceil((t - now()) / 60000));
  }

  function appendLog(tunnel, ip, country, ua) {
    if (!runtimeDir) return;
    try { fs.mkdirSync(runtimeDir, { recursive: true }); } catch {}
    const p = logPath(runtimeDir);
    try {
      const size = fs.statSync(p).size;
      if (size >= LOG_ROTATE_BYTES) fs.renameSync(p, `${p}.1`);
    } catch {}
    const line = `${JSON.stringify({ ts: new Date(now()).toISOString(), tunnel, ip: ip || 'unknown', country: country || null, ua: ua || null })}\n`;
    try { fs.appendFileSync(p, line); } catch {}
  }

  function persist(tunnel) {
    if (!runtimeDir) return;
    try { fs.mkdirSync(runtimeDir, { recursive: true }); } catch {}
    let all = {};
    try { all = JSON.parse(fs.readFileSync(statePath(runtimeDir), 'utf8')); } catch {}
    all[tunnel] = {
      lockedUntil: lockedUntil.has(tunnel) ? new Date(lockedUntil.get(tunnel)).toISOString() : null,
      failedLogins24h: countFailedLogins24h(runtimeDir, tunnel, now()),
    };
    try { fs.writeFileSync(statePath(runtimeDir), JSON.stringify(all, null, 2)); } catch {}
  }

  function recordFailure(tunnel, { ip, country, ua } = {}) {
    appendLog(tunnel, ip, country, ua);
    const n = now();
    const arr = (failures.get(tunnel) || []).filter(ts => n - ts < failureWindowMs);
    arr.push(n);
    if (arr.length >= failureThreshold) {
      lockedUntil.set(tunnel, n + lockoutMs);
      failures.delete(tunnel);
    } else {
      failures.set(tunnel, arr);
    }
    persist(tunnel);
  }

  function recordSuccess(tunnel) {
    failures.delete(tunnel);
    lockedUntil.delete(tunnel);
    persist(tunnel);
  }

  return { isLocked, lockRemainingMinutes, recordFailure, recordSuccess, countFailedLogins24h: t => countFailedLogins24h(runtimeDir, t, now()) };
}

function renderLockout(minutes) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Too many attempts</title></head>
<body>
<h1>429</h1>
<p>พยายามเข้าสู่ระบบผิดหลายครั้ง ลองใหม่ใน ${minutes} นาที</p>
<p>Too many failed login attempts. Try again in ${minutes} minute(s).</p>
</body></html>
`;
}

module.exports = {
  createLockoutTracker,
  readPersistedState,
  renderLockout,
  FAILURE_WINDOW_MS,
  FAILURE_THRESHOLD,
  LOCKOUT_MS,
};
