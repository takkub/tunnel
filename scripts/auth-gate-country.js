// Country allowlist for the per-tunnel gate: pure helpers shared by the native
// proxy (auth-gate-proxy.js), the nginx conf generator (auth-gate.js), and the
// route.ts input validator, so all three agree on what counts as a valid code
// and what "blocked" means.
'use strict';

const CODE_RE = /^[A-Z]{2}$/;
const MAX_COUNTRIES = 20;

function normalizeCountryList(countries) {
  if (!Array.isArray(countries)) return [];
  return countries.map(c => String(c).toUpperCase()).filter(c => CODE_RE.test(c));
}

// Throws on anything invalid — used where input must be rejected outright
// (CLI, and defense-in-depth inside auth-gate.js) rather than silently filtered.
function assertValidCountries(countries) {
  if (!Array.isArray(countries)) throw new Error('allowedCountries must be an array');
  if (countries.length > MAX_COUNTRIES) throw new Error(`allowedCountries: max ${MAX_COUNTRIES} countries`);
  const upper = countries.map(c => String(c).toUpperCase());
  for (const c of upper) {
    if (!CODE_RE.test(c)) throw new Error(`allowedCountries: invalid code "${c}"`);
  }
  return upper;
}

function isLocalAddress(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// Cloudflare sends XX (unknown) or T1 (Tor) as cf-ipcountry values — neither is
// a real country, so treat them as "not in the allowlist" rather than matching
// them against user-supplied codes.
function isCountryAllowed(allowedCountries, countryHeader, remoteAddress) {
  const list = normalizeCountryList(allowedCountries);
  if (!list.length) return true;
  if (!countryHeader) return isLocalAddress(remoteAddress);
  const code = String(countryHeader).toUpperCase();
  if (code === 'XX' || code === 'T1') return false;
  return list.includes(code);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderCountryBlocked(countryCode) {
  const code = escapeHtml(countryCode || '-');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Access denied</title></head>
<body>
<h1>403</h1>
<p>ไม่อนุญาตให้เข้าถึงจากประเทศนี้ (${code})</p>
<p>Access from this country is not allowed (${code}).</p>
</body></html>
`;
}

module.exports = {
  normalizeCountryList,
  assertValidCountries,
  isLocalAddress,
  isCountryAllowed,
  renderCountryBlocked,
  MAX_COUNTRIES,
  CODE_RE,
};
