'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServerWithRetry } = require('../server-startup');

test('startServerWithRetry: returns the first attempt\'s result without retrying when it succeeds', async () => {
  let spawnCalls = 0;
  let killCalls = 0;
  const result = await startServerWithRetry({
    spawnAndWait: async () => { spawnCalls++; return { port: 8888, url: 'http://127.0.0.1:8888' }; },
    killPrevious: async () => { killCalls++; },
  });
  assert.deepEqual(result, { port: 8888, url: 'http://127.0.0.1:8888' });
  assert.equal(spawnCalls, 1);
  assert.equal(killCalls, 0);
});

test('startServerWithRetry: kills the stuck attempt and retries exactly once on failure', async () => {
  let spawnCalls = 0;
  let killCalls = 0;
  const result = await startServerWithRetry({
    spawnAndWait: async () => {
      spawnCalls++;
      if (spawnCalls === 1) throw new Error('Server did not respond within 30000ms');
      return { port: 8888, url: 'http://127.0.0.1:8888' };
    },
    killPrevious: async () => { killCalls++; },
  });
  assert.deepEqual(result, { port: 8888, url: 'http://127.0.0.1:8888' });
  assert.equal(spawnCalls, 2);
  assert.equal(killCalls, 1);
});

test('startServerWithRetry: throws the retry\'s own error when both attempts fail, without a third try', async () => {
  let spawnCalls = 0;
  await assert.rejects(
    () => startServerWithRetry({
      spawnAndWait: async () => { spawnCalls++; throw new Error(`attempt ${spawnCalls} failed`); },
      killPrevious: async () => {},
    }),
    /attempt 2 failed/
  );
  assert.equal(spawnCalls, 2);
});

test('startServerWithRetry: logs both the initial failure and a final give-up message', async () => {
  const lines = [];
  await assert.rejects(() => startServerWithRetry({
    spawnAndWait: async () => { throw new Error('stuck'); },
    killPrevious: async () => {},
    log: line => lines.push(line),
  }));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /retrying once/);
  assert.match(lines[1], /giving up/);
});
