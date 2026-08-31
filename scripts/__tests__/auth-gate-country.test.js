const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCountryList, assertValidCountries, isCountryAllowed, isLocalAddress, renderCountryBlocked } = require('../auth-gate-country');

test('normalizeCountryList upcases and drops invalid codes', () => {
  assert.deepEqual(normalizeCountryList(['th', 'US', 'xx1', 123, null]), ['TH', 'US']);
  assert.deepEqual(normalizeCountryList(null), []);
});

test('assertValidCountries throws on a bad code and on too many entries', () => {
  assert.throws(() => assertValidCountries(['th', '123']), /invalid code/);
  assert.throws(() => assertValidCountries(Array(21).fill('TH')), /max 20/);
  assert.deepEqual(assertValidCountries(['th', 'us']), ['TH', 'US']);
});

test('isCountryAllowed: empty allowlist permits everything', () => {
  assert.equal(isCountryAllowed([], 'RU', '1.2.3.4'), true);
});

test('isCountryAllowed: matching/non-matching country codes', () => {
  assert.equal(isCountryAllowed(['TH', 'US'], 'TH', '1.2.3.4'), true);
  assert.equal(isCountryAllowed(['TH', 'US'], 'ru', '1.2.3.4'), false);
});

test('isCountryAllowed: XX/T1 are always rejected when a list is set', () => {
  assert.equal(isCountryAllowed(['TH'], 'XX', '1.2.3.4'), false);
  assert.equal(isCountryAllowed(['TH'], 'T1', '1.2.3.4'), false);
});

test('isCountryAllowed: missing header from a non-local address is denied', () => {
  assert.equal(isCountryAllowed(['TH'], undefined, '1.2.3.4'), false);
});

test('isCountryAllowed: missing header from 127.0.0.1 is allowed (local dev bypass)', () => {
  assert.equal(isCountryAllowed(['TH'], undefined, '127.0.0.1'), true);
  assert.equal(isCountryAllowed(['TH'], undefined, '::1'), true);
});

test('isLocalAddress', () => {
  assert.equal(isLocalAddress('127.0.0.1'), true);
  assert.equal(isLocalAddress('10.0.0.5'), false);
});

test('renderCountryBlocked escapes the country code and mentions it in both languages', () => {
  const html = renderCountryBlocked('<b>XX</b>');
  assert.equal(html.includes('<b>XX</b>'), false);
  assert.match(html, /ไม่อนุญาตให้เข้าถึงจากประเทศนี้/);
  assert.match(html, /not allowed/);
});
