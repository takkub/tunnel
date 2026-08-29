'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readUpdateStatus,
  writeUpdateStatus,
  readUpdateRequest,
  writeUpdateRequest,
} = require('../update-status');

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-update-status-'));
}

test('readUpdateStatus: no file yet -> idle defaults', () => {
  const dir = tmpDataDir();
  assert.deepEqual(readUpdateStatus(dir), {
    state: 'idle',
    version: null,
    currentVersion: null,
    percent: null,
    message: null,
    at: null,
  });
});

test('writeUpdateStatus: persists and merges over previous fields', () => {
  const dir = tmpDataDir();
  writeUpdateStatus(dir, { state: 'checking', currentVersion: '1.1.2' });
  const afterCheck = readUpdateStatus(dir);
  assert.equal(afterCheck.state, 'checking');
  assert.equal(afterCheck.currentVersion, '1.1.2');
  assert.equal(typeof afterCheck.at, 'number');

  writeUpdateStatus(dir, { state: 'available', version: '1.2.0' });
  const afterAvailable = readUpdateStatus(dir);
  assert.equal(afterAvailable.state, 'available');
  assert.equal(afterAvailable.version, '1.2.0');
  // currentVersion from the earlier write is preserved, not clobbered.
  assert.equal(afterAvailable.currentVersion, '1.1.2');
});

test('writeUpdateStatus: creates the data dir if missing', () => {
  const dir = path.join(tmpDataDir(), 'nested', 'deeper');
  writeUpdateStatus(dir, { state: 'downloading', percent: 42 });
  assert.equal(readUpdateStatus(dir).percent, 42);
});

test('readUpdateStatus: corrupt file falls back to defaults', () => {
  const dir = tmpDataDir();
  fs.writeFileSync(path.join(dir, 'update-status.json'), '{not json');
  assert.equal(readUpdateStatus(dir).state, 'idle');
});

test('readUpdateRequest: no file yet -> null', () => {
  const dir = tmpDataDir();
  assert.equal(readUpdateRequest(dir), null);
});

test('writeUpdateRequest/readUpdateRequest: round-trips action + timestamp', () => {
  const dir = tmpDataDir();
  const written = writeUpdateRequest(dir, 'check');
  assert.equal(written.action, 'check');
  assert.equal(typeof written.at, 'number');
  assert.deepEqual(readUpdateRequest(dir), written);

  writeUpdateRequest(dir, 'install');
  assert.equal(readUpdateRequest(dir).action, 'install');
});
