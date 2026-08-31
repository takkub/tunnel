'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getLogPath, appendLog, MAX_BYTES } = require('../log');

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-desktop-log-'));
}

test('appendLog: creates runtime/desktop.log and writes a timestamped line', () => {
  const dir = tmpDataDir();
  appendLog(dir, 'hello world');
  const content = fs.readFileSync(getLogPath(dir), 'utf8');
  assert.match(content, /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] hello world\n$/);
});

test('appendLog: appends across multiple calls rather than overwriting', () => {
  const dir = tmpDataDir();
  appendLog(dir, 'first');
  appendLog(dir, 'second');
  const lines = fs.readFileSync(getLogPath(dir), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /first$/);
  assert.match(lines[1], /second$/);
});

test('appendLog: rotates to .log.1 once the file exceeds MAX_BYTES', () => {
  const dir = tmpDataDir();
  const file = getLogPath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(MAX_BYTES + 1));

  appendLog(dir, 'after rotation');

  assert.equal(fs.statSync(`${file}.1`).size, MAX_BYTES + 1);
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /after rotation\n$/);
  assert.ok(content.length < MAX_BYTES, 'the live log file should be small again after rotation');
});

test('appendLog: never throws even if the data dir cannot be created', () => {
  // A file path used as a directory can't be mkdir'd into — appendLog must
  // swallow the failure rather than crash the caller.
  const dir = tmpDataDir();
  const blocker = path.join(dir, 'blocked');
  fs.writeFileSync(blocker, 'not a directory');
  assert.doesNotThrow(() => appendLog(path.join(blocker, 'nested'), 'should not throw'));
});
