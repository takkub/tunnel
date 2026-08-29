'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveConfiguredPort, acquirePort } = require('../port-resolver');

test('resolveConfiguredPort: no env, no settings -> null', () => {
  assert.equal(resolveConfiguredPort({}), null);
});

test('resolveConfiguredPort: env wins over settings', () => {
  assert.equal(resolveConfiguredPort({ envPort: '9001', settingsWebPort: 9002 }), 9001);
});

test('resolveConfiguredPort: falls back to settings when env unset', () => {
  assert.equal(resolveConfiguredPort({ settingsWebPort: 9002 }), 9002);
});

test('resolveConfiguredPort: rejects invalid env (non-numeric, out of range, 0)', () => {
  assert.equal(resolveConfiguredPort({ envPort: 'abc', settingsWebPort: 9002 }), 9002);
  assert.equal(resolveConfiguredPort({ envPort: '0' }), null);
  assert.equal(resolveConfiguredPort({ envPort: '70000' }), null);
  assert.equal(resolveConfiguredPort({ envPort: '3.5' }), null);
});

test('resolveConfiguredPort: rejects invalid settings value', () => {
  assert.equal(resolveConfiguredPort({ settingsWebPort: 0 }), null);
  assert.equal(resolveConfiguredPort({ settingsWebPort: null }), null);
});

test('acquirePort: no configured port -> uses fallback immediately', async () => {
  const calls = [];
  const port = await acquirePort(null, {
    isPortFree: async () => { calls.push('isPortFree'); return true; },
    getFallbackPort: async () => 8888,
  });
  assert.equal(port, 8888);
  assert.deepEqual(calls, []);
});

test('acquirePort: configured port free on first try -> returns it, no fallback', async () => {
  let fallbackCalled = false;
  const port = await acquirePort(9500, {
    isPortFree: async p => p === 9500,
    getFallbackPort: async () => { fallbackCalled = true; return 8888; },
    sleep: async () => {},
  });
  assert.equal(port, 9500);
  assert.equal(fallbackCalled, false);
});

test('acquirePort: retries up to `retries` times 2s apart, then falls back', async () => {
  let checks = 0;
  const sleeps = [];
  const logs = [];
  const port = await acquirePort(9500, {
    retries: 5,
    delayMs: 2000,
    isPortFree: async () => { checks++; return false; },
    getFallbackPort: async () => 8891,
    sleep: async ms => { sleeps.push(ms); },
    log: msg => logs.push(msg),
  });
  assert.equal(port, 8891);
  assert.equal(checks, 5);
  assert.deepEqual(sleeps, [2000, 2000, 2000, 2000]); // no sleep after the last attempt
  assert.equal(logs.length, 6); // 5 in-use attempts + 1 final fallback notice
  assert.match(logs[0], /configured port 9500 is in use \(attempt 1\/5\)/);
  assert.match(logs[5], /still in use after 5 attempts/);
});

test('acquirePort: succeeds on a later retry without exhausting all attempts', async () => {
  let checks = 0;
  const port = await acquirePort(9500, {
    isPortFree: async () => { checks++; return checks === 3; },
    getFallbackPort: async () => { throw new Error('fallback should not be used'); },
    sleep: async () => {},
  });
  assert.equal(port, 9500);
  assert.equal(checks, 3);
});
