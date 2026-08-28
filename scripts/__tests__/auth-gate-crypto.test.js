const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  cookieName,
  isSafeNextPath,
  ensureSecretFile,
} = require('../auth-gate-crypto');

test('hashPassword/verifyPassword round-trip and reject wrong password', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
});

test('hashPassword never stores the plaintext password', () => {
  const stored = hashPassword('supersecret');
  assert.equal(stored.includes('supersecret'), false);
});

test('verifyPassword rejects malformed/legacy stored values safely', () => {
  assert.equal(verifyPassword('x', null), false);
  assert.equal(verifyPassword('x', ''), false);
  assert.equal(verifyPassword('x', '{SHA}not-scrypt-format'), false);
});

test('signSession/verifySession round-trip for the right tunnel + secret', () => {
  const secret = 'test-secret';
  const cookie = signSession('promptpay', secret, 3600);
  assert.equal(verifySession('promptpay', cookie, secret), true);
});

test('verifySession rejects a cookie signed for a different tunnel', () => {
  const secret = 'test-secret';
  const cookie = signSession('promptpay', secret, 3600);
  assert.equal(verifySession('other-tunnel', cookie, secret), false);
});

test('verifySession rejects a cookie signed with a different secret', () => {
  const cookie = signSession('promptpay', 'secret-a', 3600);
  assert.equal(verifySession('promptpay', cookie, 'secret-b'), false);
});

test('verifySession rejects an expired cookie', () => {
  const secret = 'test-secret';
  const cookie = signSession('promptpay', secret, -10); // already expired
  assert.equal(verifySession('promptpay', cookie, secret), false);
});

test('verifySession rejects garbage input without throwing', () => {
  assert.equal(verifySession('promptpay', 'not-a-real-cookie', 'secret'), false);
  assert.equal(verifySession('promptpay', undefined, 'secret'), false);
  assert.equal(verifySession('promptpay', '', 'secret'), false);
});

test('cookieName is namespaced per tunnel', () => {
  assert.equal(cookieName('promptpay'), 'tunnel_gate_promptpay');
  assert.notEqual(cookieName('promptpay'), cookieName('other'));
});

test('isSafeNextPath accepts a same-origin absolute path, rejects protocol-relative/external', () => {
  assert.equal(isSafeNextPath('/dashboard'), true);
  assert.equal(isSafeNextPath('/'), true);
  assert.equal(isSafeNextPath('//evil.com'), false);
  assert.equal(isSafeNextPath('https://evil.com'), false);
  assert.equal(isSafeNextPath('evil.com'), false);
  assert.equal(isSafeNextPath(''), false);
  assert.equal(isSafeNextPath(null), false);
  assert.equal(isSafeNextPath('\\evil.com'), false);
});

test('ensureSecretFile creates a persistent secret once and reuses it thereafter', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-gate-secret-'));
  const secretPath = path.join(dir, 'nested', '.secret');
  const first = ensureSecretFile(secretPath);
  assert.ok(first && first.length >= 32);
  assert.equal(fs.existsSync(secretPath), true);
  const second = ensureSecretFile(secretPath);
  assert.equal(second, first);
});
