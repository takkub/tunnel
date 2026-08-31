// Optional Cloudflare-side country block for a tunnel's gate: a custom WAF rule
// in the zone's http_request_firewall_custom ruleset that blocks every request
// to the tunnel's hostname whose ip.geoip.country isn't in allowedCountries.
// This runs *before* the request ever reaches cloudflared/the gate — a stronger
// guarantee than the app-layer check in auth-gate-proxy.js, at the cost of
// needing a Cloudflare API token with WAF edit permission.
'use strict';
const settingsStore = require('./settings-store');
// Referenced as cloudflareApi.cfApiRequest(...) rather than destructured, so
// tests can mock the method on the module object (t.mock.method) and have it
// take effect here too.
const cloudflareApi = require('./cloudflare-api');
const { normalizeCountryList } = require('./auth-gate-country');

const RULESET_PHASE = 'http_request_firewall_custom';

function ruleDescription(name) {
  return `tunnel-manager:${name}`;
}

// Pure — no network call, so this is what gets unit-tested for correctness.
function buildRulePayload(name, hostname, allowedCountries) {
  const countries = normalizeCountryList(allowedCountries);
  const countryList = countries.map(c => `"${c}"`).join(' ');
  const expression = `(http.host eq "${hostname}" and not ip.geoip.country in {${countryList}})`;
  return {
    action: 'block',
    description: ruleDescription(name),
    expression,
  };
}

function formatWafError(res) {
  const errs = (res && res.errors) || [];
  if (errs.some(e => e.code === 10000 || /authentication|permission/i.test(e.message || ''))) {
    return 'Cloudflare API token is missing the "Zone > Firewall Services > Edit" (WAF) permission for this zone — check Zone Resources on the token.';
  }
  if (errs.length) return errs.map(e => e.message).join('; ');
  return 'Unknown Cloudflare API error';
}

async function getCustomRuleset(zoneId, apiToken) {
  const res = await cloudflareApi.cfApiRequest('GET', `/client/v4/zones/${zoneId}/rulesets/phases/${RULESET_PHASE}/entrypoint`, apiToken);
  if (!res || !res.success) return { ruleset: null, error: formatWafError(res) };
  return { ruleset: res.result, error: null };
}

// Creates the rule if this tunnel has none yet (existingRuleId falsy, or no
// longer present in the ruleset), otherwise updates it in place — same
// ruleId either way lets a later removeCountryRule() find it again.
async function upsertCountryRule(name, hostname, allowedCountries, existingRuleId) {
  const apiToken = settingsStore.getCloudflareToken();
  const zoneId = settingsStore.getZoneId();
  if (!apiToken || !zoneId) {
    return { ok: false, error: 'Cloudflare API token or Zone ID is not set — configure it in Settings first.' };
  }

  const { ruleset, error } = await getCustomRuleset(zoneId, apiToken);
  if (!ruleset) return { ok: false, error };

  const payload = buildRulePayload(name, hostname, allowedCountries);
  const hasExisting = existingRuleId && ruleset.rules.some(r => r.id === existingRuleId);

  let res;
  try {
    res = hasExisting
      ? await cloudflareApi.cfApiRequest('PATCH', `/client/v4/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existingRuleId}`, apiToken, payload)
      : await cloudflareApi.cfApiRequest('POST', `/client/v4/zones/${zoneId}/rulesets/${ruleset.id}/rules`, apiToken, payload);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!res || !res.success) return { ok: false, error: formatWafError(res) };

  const rules = (res.result && res.result.rules) || [];
  const rule = hasExisting ? rules.find(r => r.id === existingRuleId) : rules[rules.length - 1];
  if (!rule || !rule.id) return { ok: false, error: 'Cloudflare accepted the rule but returned no rule id.' };
  return { ok: true, ruleId: rule.id };
}

async function removeCountryRule(ruleId) {
  if (!ruleId) return { ok: true };
  const apiToken = settingsStore.getCloudflareToken();
  const zoneId = settingsStore.getZoneId();
  if (!apiToken || !zoneId) {
    return { ok: false, error: 'Cloudflare API token or Zone ID is not set — configure it in Settings first.' };
  }

  const { ruleset, error } = await getCustomRuleset(zoneId, apiToken);
  if (!ruleset) return { ok: false, error };
  if (!ruleset.rules.some(r => r.id === ruleId)) return { ok: true }; // already gone

  let res;
  try {
    res = await cloudflareApi.cfApiRequest('DELETE', `/client/v4/zones/${zoneId}/rulesets/${ruleset.id}/rules/${ruleId}`, apiToken);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (res && res.success === false) return { ok: false, error: formatWafError(res) };
  return { ok: true };
}

module.exports = { buildRulePayload, upsertCountryRule, removeCountryRule, ruleDescription };
