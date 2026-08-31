const fs = require('fs');
const path = require('path');
const { ROOT, DATA_DIR } = require('./runtime');
const settingsStore = require('./settings-store');

// Must match web/app/api/settings/domains/route.ts's TUNNEL_DATA_DIR-based
// path — that route is what actually writes domains added via Settings ›
// Domains. Previously this pointed at ROOT, so a packaged desktop app (where
// ROOT = resourcesPath/app and DATA_DIR = userData) never saw any domain the
// user added: getZoneIdForHostname() silently fell back to the single
// settings.json zoneId for every hostname, routing every 2nd+ domain's DNS
// into the wrong zone.
const CONFIG_PATH = path.join(DATA_DIR, 'domains.config.json');
// Legacy location (pre-fix installs, or any setup where ROOT === DATA_DIR
// already) — read-only fallback so an existing domains.config.json next to
// scripts/ isn't silently orphaned.
const LEGACY_CONFIG_PATH = path.join(ROOT, 'domains.config.json');

function loadDomains() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).domains || [];
  } catch {
    if (CONFIG_PATH !== LEGACY_CONFIG_PATH) {
      try {
        return JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, 'utf8')).domains || [];
      } catch {}
    }
    return [];
  }
}

function saveDomains(domains) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ domains }, null, 2) + '\n');
}

/** Extract root domain from hostname, e.g. app.sabuytube.xyz -> sabuytube.xyz.
 * Legacy 2-label heuristic — wrong for multi-label TLDs (co.th, etc). Kept
 * only as a display helper; resolveZone() below no longer uses it. */
function rootDomain(hostname) {
  const parts = hostname.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

/**
 * Resolve which configured domain (and zone) owns a hostname, by suffix
 * match against domains.config.json entries (hostname === d.domain, or
 * hostname ends with "." + d.domain), preferring the longest/most-specific
 * match. Unlike the old rootDomain() 2-label split, this handles multi-label
 * TLDs (e.g. "app.example.co.th" matching a configured "example.co.th")
 * correctly.
 *
 * Falls back to settings.json/.env ZONE_ID only when domains.config.json has
 * no entries at all (legacy single-zone install). When domains ARE
 * configured but none match this hostname, returns a null zoneId rather than
 * guessing — silently using the wrong zone is exactly the bug this fixes.
 *
 * @returns {{zoneId: string|null, domain: string|null, source: 'domains'|'settings'|null}}
 */
function resolveZone(hostname) {
  const configured = loadDomains();
  let best = null;
  for (const d of configured) {
    if (!d || !d.domain) continue;
    if (hostname === d.domain || hostname.endsWith('.' + d.domain)) {
      if (!best || d.domain.length > best.domain.length) best = d;
    }
  }
  if (best) return { zoneId: best.zoneId || null, domain: best.domain, source: 'domains' };

  if (configured.length === 0) {
    const zoneId = settingsStore.getZoneId();
    if (zoneId) return { zoneId, domain: null, source: 'settings' };
  }
  return { zoneId: null, domain: null, source: null };
}

/**
 * Return zoneId for a hostname. Prefer resolveZone() where the caller can
 * also use `domain`/`source` to report *why* (e.g. an unmatched domain).
 */
function getZoneIdForHostname(hostname) {
  return resolveZone(hostname).zoneId;
}

module.exports = { loadDomains, saveDomains, getZoneIdForHostname, resolveZone, rootDomain, CONFIG_PATH };
