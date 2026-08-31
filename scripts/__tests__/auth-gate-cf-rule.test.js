const test = require('node:test');
const assert = require('node:assert/strict');

const cloudflareApi = require('../cloudflare-api');
const settingsStore = require('../settings-store');
const { buildRulePayload, upsertCountryRule, removeCountryRule } = require('../auth-gate-cf-rule');

test('buildRulePayload: pure expression builder, no network call', () => {
  const payload = buildRulePayload('promptpay', 'pay.example.com', ['th', 'us']);
  assert.equal(payload.action, 'block');
  assert.equal(payload.description, 'tunnel-manager:promptpay');
  assert.equal(payload.expression, '(http.host eq "pay.example.com" and not ip.geoip.country in {"TH" "US"})');
});

test('buildRulePayload: empty allowlist still produces a well-formed (always-block) expression', () => {
  const payload = buildRulePayload('promptpay', 'pay.example.com', []);
  assert.equal(payload.expression, '(http.host eq "pay.example.com" and not ip.geoip.country in {})');
});

test('upsertCountryRule: no api token configured -> ok:false, no throw', async (t) => {
  t.mock.method(settingsStore, 'getCloudflareToken', () => null);
  t.mock.method(settingsStore, 'getZoneId', () => 'zone1');
  const res = await upsertCountryRule('promptpay', 'pay.example.com', ['TH'], null);
  assert.equal(res.ok, false);
  assert.match(res.error, /Cloudflare API token/);
});

test('upsertCountryRule: creates a new rule (POST) when no existing rule id is recorded', async (t) => {
  const entrypoint = { success: true, result: { id: 'ruleset1', rules: [] } };
  t.mock.method(settingsStore, 'getCloudflareToken', () => 'tok');
  t.mock.method(settingsStore, 'getZoneId', () => 'zone1');
  const calls = [];
  t.mock.method(cloudflareApi, 'cfApiRequest', async (method, urlPath, apiToken, body) => {
    calls.push({ method, urlPath, body });
    if (method === 'GET') return entrypoint;
    if (method === 'POST') return { success: true, result: { rules: [{ id: 'newrule1' }] } };
    throw new Error(`unexpected method ${method}`);
  });

  const res = await upsertCountryRule('promptpay', 'pay.example.com', ['TH'], null);
  assert.equal(res.ok, true);
  assert.equal(res.ruleId, 'newrule1');
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[1].urlPath, /\/rulesets\/ruleset1\/rules$/);
});

test('upsertCountryRule: updates in place (PATCH) when the existing rule id is still present', async (t) => {
  const entrypoint = { success: true, result: { id: 'ruleset1', rules: [{ id: 'rule1' }] } };
  t.mock.method(settingsStore, 'getCloudflareToken', () => 'tok');
  t.mock.method(settingsStore, 'getZoneId', () => 'zone1');
  const calls = [];
  t.mock.method(cloudflareApi, 'cfApiRequest', async (method, urlPath, apiToken, body) => {
    calls.push({ method, urlPath, body });
    if (method === 'GET') return entrypoint;
    if (method === 'PATCH') return { success: true, result: { rules: [{ id: 'rule1' }] } };
    throw new Error(`unexpected method ${method}`);
  });

  const res = await upsertCountryRule('promptpay', 'pay.example.com', ['TH', 'US'], 'rule1');
  assert.equal(res.ok, true);
  assert.equal(res.ruleId, 'rule1');
  assert.equal(calls[1].method, 'PATCH');
  assert.match(calls[1].urlPath, /\/rules\/rule1$/);
});

test('upsertCountryRule: a 403/permission-style Cloudflare error is surfaced as cfError text, not thrown', async (t) => {
  const entrypoint = { success: true, result: { id: 'ruleset1', rules: [] } };
  t.mock.method(settingsStore, 'getCloudflareToken', () => 'tok');
  t.mock.method(settingsStore, 'getZoneId', () => 'zone1');
  t.mock.method(cloudflareApi, 'cfApiRequest', async (method) => {
    if (method === 'GET') return entrypoint;
    return { success: false, errors: [{ code: 10000, message: 'Authentication error' }] };
  });

  const res = await upsertCountryRule('promptpay', 'pay.example.com', ['TH'], null);
  assert.equal(res.ok, false);
  assert.match(res.error, /WAF.*permission/i);
});

test('removeCountryRule: no ruleId is a no-op success', async () => {
  const res = await removeCountryRule(null);
  assert.equal(res.ok, true);
});

test('removeCountryRule: deletes an existing rule', async (t) => {
  const entrypoint = { success: true, result: { id: 'ruleset1', rules: [{ id: 'rule1' }] } };
  t.mock.method(settingsStore, 'getCloudflareToken', () => 'tok');
  t.mock.method(settingsStore, 'getZoneId', () => 'zone1');
  const calls = [];
  t.mock.method(cloudflareApi, 'cfApiRequest', async (method, urlPath) => {
    calls.push({ method, urlPath });
    if (method === 'GET') return entrypoint;
    if (method === 'DELETE') return { success: true, result: {} };
    throw new Error('unexpected');
  });

  const res = await removeCountryRule('rule1');
  assert.equal(res.ok, true);
  assert.equal(calls[1].method, 'DELETE');
});

test('removeCountryRule: rule already gone from the ruleset is treated as success', async (t) => {
  const entrypoint = { success: true, result: { id: 'ruleset1', rules: [] } };
  t.mock.method(settingsStore, 'getCloudflareToken', () => 'tok');
  t.mock.method(settingsStore, 'getZoneId', () => 'zone1');
  t.mock.method(cloudflareApi, 'cfApiRequest', async () => entrypoint);

  const res = await removeCountryRule('rule1');
  assert.equal(res.ok, true);
});
