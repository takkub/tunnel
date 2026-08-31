const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createLockoutTracker, readPersistedState, renderLockout, FAILURE_THRESHOLD } = require('../auth-gate-lockout');

function tempRuntimeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-lockout-'));
}

test('not locked before the failure threshold is reached', () => {
  const runtimeDir = tempRuntimeDir();
  const tracker = createLockoutTracker({ runtimeDir });
  for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) tracker.recordFailure('promptpay', { ip: `1.2.3.${i}` });
  assert.equal(tracker.isLocked('promptpay'), false);
});

test('locks after the failure threshold within the window, and unlocks after lockoutMs', () => {
  const runtimeDir = tempRuntimeDir();
  let now = 1_000_000;
  const tracker = createLockoutTracker({ runtimeDir, now: () => now, failureThreshold: 5, failureWindowMs: 60_000, lockoutMs: 30_000 });

  for (let i = 0; i < 5; i++) tracker.recordFailure('promptpay', { ip: `1.2.3.${i}` });
  assert.equal(tracker.isLocked('promptpay'), true);
  assert.equal(tracker.lockRemainingMinutes('promptpay'), 1); // ceil(30s/60s) => 1

  now += 30_001;
  assert.equal(tracker.isLocked('promptpay'), false);
});

test('failures from many different IPs all count toward one tunnel-wide lockout', () => {
  const runtimeDir = tempRuntimeDir();
  const tracker = createLockoutTracker({ runtimeDir, failureThreshold: 3 });
  tracker.recordFailure('promptpay', { ip: '1.1.1.1' });
  tracker.recordFailure('promptpay', { ip: '2.2.2.2' });
  assert.equal(tracker.isLocked('promptpay'), false);
  tracker.recordFailure('promptpay', { ip: '3.3.3.3' });
  assert.equal(tracker.isLocked('promptpay'), true);
});

test('a successful login clears the failure count and any active lock', () => {
  const runtimeDir = tempRuntimeDir();
  const tracker = createLockoutTracker({ runtimeDir, failureThreshold: 3 });
  tracker.recordFailure('promptpay', { ip: '1.1.1.1' });
  tracker.recordFailure('promptpay', { ip: '2.2.2.2' });
  tracker.recordFailure('promptpay', { ip: '3.3.3.3' });
  assert.equal(tracker.isLocked('promptpay'), true);

  tracker.recordSuccess('promptpay');
  assert.equal(tracker.isLocked('promptpay'), false);

  // one more failure alone should not immediately re-lock
  tracker.recordFailure('promptpay', { ip: '1.1.1.1' });
  assert.equal(tracker.isLocked('promptpay'), false);
});

test('failures outside the sliding window do not count toward the threshold', () => {
  const runtimeDir = tempRuntimeDir();
  let now = 0;
  const tracker = createLockoutTracker({ runtimeDir, now: () => now, failureThreshold: 3, failureWindowMs: 1000 });
  tracker.recordFailure('promptpay', { ip: '1.1.1.1' });
  tracker.recordFailure('promptpay', { ip: '2.2.2.2' });
  now += 2000; // window elapsed
  tracker.recordFailure('promptpay', { ip: '3.3.3.3' });
  assert.equal(tracker.isLocked('promptpay'), false);
});

test('recordFailure persists lockedUntil + failedLogins24h to state.json, readable by readPersistedState', () => {
  const runtimeDir = tempRuntimeDir();
  const tracker = createLockoutTracker({ runtimeDir, failureThreshold: 2 });
  tracker.recordFailure('promptpay', { ip: '1.1.1.1', country: 'TH', ua: 'curl' });
  tracker.recordFailure('promptpay', { ip: '2.2.2.2' });

  const persisted = readPersistedState(runtimeDir, 'promptpay');
  assert.equal(persisted.failedLogins24h, 2);
  assert.notEqual(persisted.lockedUntil, null);

  const logLine = fs.readFileSync(path.join(runtimeDir, 'failed-logins.log'), 'utf8').trim().split('\n')[0];
  const entry = JSON.parse(logLine);
  assert.equal(entry.tunnel, 'promptpay');
  assert.equal(entry.ip, '1.1.1.1');
  assert.equal(entry.country, 'TH');
});

test('readPersistedState returns zero defaults for a tunnel with no recorded failures', () => {
  const runtimeDir = tempRuntimeDir();
  assert.deepEqual(readPersistedState(runtimeDir, 'nope'), { lockedUntil: null, failedLogins24h: 0 });
});

test('lockout counters are independent per tunnel', () => {
  const runtimeDir = tempRuntimeDir();
  const tracker = createLockoutTracker({ runtimeDir, failureThreshold: 2 });
  tracker.recordFailure('a', { ip: '1.1.1.1' });
  tracker.recordFailure('a', { ip: '2.2.2.2' });
  assert.equal(tracker.isLocked('a'), true);
  assert.equal(tracker.isLocked('b'), false);
});

test('renderLockout mentions the remaining minutes in Thai and English', () => {
  const html = renderLockout(7);
  assert.match(html, /ลองใหม่ใน 7 นาที/);
  assert.match(html, /7 minute/);
});
