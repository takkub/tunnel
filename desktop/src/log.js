// Persistent diagnostic log for the desktop app itself — main.ts, updater.ts,
// and server.ts (incl. the spawned web server's own stdout/stderr) all append
// here, since none of that currently survives anywhere once the app process
// exits (v1.1.11 update incident: an installer that silently failed to run,
// and a stuck server child, left nothing to diagnose after the fact). Kept as
// a plain, electron-free CJS module so it's unit-testable with node:test
// directly (see __tests__/log.test.js), same convention as dotenv-env.js.
'use strict';
const fs = require('fs');
const path = require('path');

const LOG_FILE = 'desktop.log';
const MAX_BYTES = 1024 * 1024; // 1MB

function getLogPath(dataDir) {
  return path.join(dataDir, 'runtime', LOG_FILE);
}

// Appends one timestamped line, rotating the file to `.log.1` (overwriting
// any previous rotation) once it exceeds MAX_BYTES so a long-running session
// can't grow it unbounded. Never throws — logging must not be able to crash
// the app it's trying to help diagnose.
function appendLog(dataDir, line) {
  const file = getLogPath(dataDir);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let size = 0;
    try { size = fs.statSync(file).size; } catch {}
    if (size > MAX_BYTES) {
      try { fs.renameSync(file, `${file}.1`); } catch {}
    }
    const stamp = new Date().toISOString();
    const text = String(line).replace(/\r?\n$/, '');
    fs.appendFileSync(file, `[${stamp}] ${text}\n`);
  } catch {
    // best-effort only
  }
}

module.exports = { LOG_FILE, MAX_BYTES, getLogPath, appendLog };
