const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadDotEnvVars, buildSpawnEnv } = require('../../desktop/src/dotenv-env');

function makeDataDir(envContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-dotenv-test-'));
  if (envContent !== undefined) fs.writeFileSync(path.join(dir, '.env'), envContent);
  return dir;
}

test('loadDotEnvVars returns {} when .env does not exist', () => {
  const dir = makeDataDir();
  assert.deepEqual(loadDotEnvVars(dir), {});
});

test('loadDotEnvVars parses key=value pairs from .env', () => {
  const dir = makeDataDir('ADMIN_PASSWORD=hunter2\nCLOUDFLARE_API_TOKEN=abc123\n');
  assert.deepEqual(loadDotEnvVars(dir), { ADMIN_PASSWORD: 'hunter2', CLOUDFLARE_API_TOKEN: 'abc123' });
});

test('buildSpawnEnv fills in .env values that are not on process.env', () => {
  const dir = makeDataDir('ADMIN_PASSWORD=hunter2\n');
  const prev = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    const env = buildSpawnEnv(dir);
    assert.equal(env.ADMIN_PASSWORD, 'hunter2');
  } finally {
    if (prev === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = prev;
  }
});

test('buildSpawnEnv never lets a .env value override a real process.env value already set', () => {
  const dir = makeDataDir('ADMIN_PASSWORD=from-dotenv\n');
  const prev = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'from-real-env';
  try {
    const env = buildSpawnEnv(dir);
    assert.equal(env.ADMIN_PASSWORD, 'from-real-env');
  } finally {
    if (prev === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = prev;
  }
});

test('buildSpawnEnv lets explicit overrides win over both .env and process.env', () => {
  const dir = makeDataDir('PORT=9999\n');
  const env = buildSpawnEnv(dir, { PORT: '8888' });
  assert.equal(env.PORT, '8888');
});
