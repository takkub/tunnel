// Reads/writes <TUNNEL_DATA_DIR>/update-status.json and update-request.json —
// the only channel between the web UI (no IPC to the main process) and
// electron-updater. Mirrors the settings.ts / web/lib/settings.ts split: the
// web UI writes a request file, src/updater.ts polls it (same ~2s mtime-poll
// pattern as settings.ts's watchDesktopSettings), runs the requested
// autoUpdater action, and records every event back into the status file for
// the web UI to poll. Kept as a plain, electron-free CJS module so it's
// unit-testable with node:test directly (see __tests__/update-status.test.js).
'use strict';
const fs = require('fs');
const path = require('path');

const STATUS_FILE = 'update-status.json';
const REQUEST_FILE = 'update-request.json';

const DEFAULT_STATUS = {
  state: 'idle', // idle | checking | up-to-date | available | downloading | downloaded | error
  version: null,
  currentVersion: null,
  percent: null,
  message: null,
  at: null,
};

function readUpdateStatus(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, STATUS_FILE), 'utf8'));
    return { ...DEFAULT_STATUS, ...raw };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

// Merges `update` over the current status (so callers only pass the fields
// that changed) and stamps `at` with the current time.
function writeUpdateStatus(dataDir, update) {
  const next = { ...readUpdateStatus(dataDir), ...update, at: Date.now() };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, STATUS_FILE), JSON.stringify(next, null, 2) + '\n');
  return next;
}

function readUpdateRequest(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, REQUEST_FILE), 'utf8'));
  } catch {
    return null;
  }
}

// action: 'check' | 'install'
function writeUpdateRequest(dataDir, action) {
  const request = { action, at: Date.now() };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, REQUEST_FILE), JSON.stringify(request, null, 2) + '\n');
  return request;
}

module.exports = {
  STATUS_FILE,
  REQUEST_FILE,
  DEFAULT_STATUS,
  readUpdateStatus,
  writeUpdateStatus,
  readUpdateRequest,
  writeUpdateRequest,
};
