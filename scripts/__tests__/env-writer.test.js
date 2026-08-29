const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { updateEnvFile, quoteValue } = require('../../web/lib/env-writer');

function makeDataDir(envContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-writer-test-'));
  if (envContent !== undefined) fs.writeFileSync(path.join(dir, '.env'), envContent);
  return dir;
}

test('quoteValue wraps in double quotes and escapes embedded quotes/backslashes', () => {
  assert.equal(quoteValue('hello'), '"hello"');
  assert.equal(quoteValue('hello world'), '"hello world"');
  assert.equal(quoteValue('say "hi"'), '"say \\"hi\\""');
  assert.equal(quoteValue('back\\slash'), '"back\\\\slash"');
});

test('updateEnvFile creates the file when it does not exist yet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-writer-test-'));
  updateEnvFile(dir, { ADMIN_PASSWORD: 'hunter2' });

  const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.equal(content, 'ADMIN_PASSWORD="hunter2"\n');
});

test('updateEnvFile creates TUNNEL_DATA_DIR when it does not exist yet (first run)', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'env-writer-test-'));
  const dir = path.join(parent, 'not-yet-created');
  assert.equal(fs.existsSync(dir), false);

  updateEnvFile(dir, { ADMIN_PASSWORD: 'hunter2' });
  assert.ok(fs.existsSync(path.join(dir, '.env')));
});

test('updateEnvFile replaces an existing key in place without disturbing other lines', () => {
  const dir = makeDataDir([
    '# Admin Panel Auth',
    'ADMIN_PASSWORD=old-password',
    '',
    'CLOUDFLARE_API_TOKEN=some-token',
    'ZONE_ID=some-zone',
    '',
  ].join('\n'));

  updateEnvFile(dir, { ADMIN_PASSWORD: 'new-password' });

  const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.match(content, /^# Admin Panel Auth$/m);
  assert.match(content, /^ADMIN_PASSWORD="new-password"$/m);
  assert.match(content, /^CLOUDFLARE_API_TOKEN=some-token$/m);
  assert.match(content, /^ZONE_ID=some-zone$/m);
});

test('updateEnvFile appends a brand-new key that was not already present', () => {
  const dir = makeDataDir('CLOUDFLARE_API_TOKEN=some-token\n');

  updateEnvFile(dir, { ADMIN_PASSWORD: 'hunter2', SESSION_SECRET: 'deadbeef' });

  const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.match(content, /^CLOUDFLARE_API_TOKEN=some-token$/m);
  assert.match(content, /^ADMIN_PASSWORD="hunter2"$/m);
  assert.match(content, /^SESSION_SECRET="deadbeef"$/m);
});

test('updateEnvFile quotes a value containing spaces and special characters', () => {
  const dir = makeDataDir('');
  updateEnvFile(dir, { ADMIN_PASSWORD: 'p@ss word #1' });

  const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.equal(content, 'ADMIN_PASSWORD="p@ss word #1"\n');
});

test('updateEnvFile never writes the secret value anywhere but the target file (no console output)', () => {
  const dir = makeDataDir('');
  const originalLog = console.log;
  const originalError = console.error;
  const seen = [];
  console.log = (...args) => seen.push(args.join(' '));
  console.error = (...args) => seen.push(args.join(' '));
  try {
    updateEnvFile(dir, { ADMIN_PASSWORD: 'super-secret-value' });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(seen.some((line) => line.includes('super-secret-value')), false);
});
