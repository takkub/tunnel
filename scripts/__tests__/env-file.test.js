const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getEnvValue, parseEnvFile, __resetCacheForTests } = require('../../web/lib/env-file');

function makeDataDir(envContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-file-test-'));
  if (envContent !== undefined) fs.writeFileSync(path.join(dir, '.env'), envContent);
  return dir;
}

function withEnv(t, vars) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  t.after(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

test('parseEnvFile parses plain, quoted, and commented lines', () => {
  const vars = parseEnvFile([
    '# a comment',
    '',
    'PLAIN=hello',
    'DOUBLE_QUOTED="hello world"',
    "SINGLE_QUOTED='hello world'",
    'IGNORED WITHOUT EQUALS',
  ].join('\n'));
  assert.deepEqual(vars, { PLAIN: 'hello', DOUBLE_QUOTED: 'hello world', SINGLE_QUOTED: 'hello world' });
});

test('getEnvValue returns null when the file and process.env both lack the key', (t) => {
  const dir = makeDataDir('OTHER=1\n');
  withEnv(t, { ADMIN_PASSWORD: undefined });
  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), null);
});

test('getEnvValue returns null when .env does not exist at all', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-file-test-'));
  withEnv(t, { ADMIN_PASSWORD: undefined });
  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), null);
});

test('getEnvValue reads a value from the .env file when process.env lacks it', (t) => {
  const dir = makeDataDir('ADMIN_PASSWORD=hunter2\n');
  withEnv(t, { ADMIN_PASSWORD: undefined });
  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), 'hunter2');
});

test('getEnvValue prefers process.env over the .env file', (t) => {
  const dir = makeDataDir('ADMIN_PASSWORD=from-file\n');
  withEnv(t, { ADMIN_PASSWORD: 'from-real-env' });
  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), 'from-real-env');
});

test('getEnvValue picks up a change written to .env after the first read (mtime cache invalidates)', (t) => {
  const dir = makeDataDir('ADMIN_PASSWORD=first\n');
  withEnv(t, { ADMIN_PASSWORD: undefined });
  t.after(() => __resetCacheForTests(dir));

  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), 'first');

  // Force the mtime forward explicitly — successive writes within the same
  // tick can land on an identical mtime on coarser filesystems.
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, 'ADMIN_PASSWORD=second\n');
  const bumped = new Date(Date.now() + 5000);
  fs.utimesSync(envPath, bumped, bumped);

  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), 'second');
});

test('getEnvValue serves the cached value again when the file is unchanged', (t) => {
  const dir = makeDataDir('ADMIN_PASSWORD=stable\n');
  withEnv(t, { ADMIN_PASSWORD: undefined });
  t.after(() => __resetCacheForTests(dir));

  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), 'stable');
  assert.equal(getEnvValue(dir, 'ADMIN_PASSWORD'), 'stable');
});
