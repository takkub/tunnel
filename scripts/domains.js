const fs = require('fs');
const path = require('path');
const { ROOT } = require('./runtime');
const settingsStore = require('./settings-store');

const CONFIG_PATH = path.join(ROOT, 'domains.config.json');

function loadDomains() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).domains || [];
  } catch {
    return [];
  }
}

function saveDomains(domains) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ domains }, null, 2) + '\n');
}

/** Extract root domain from hostname, e.g. app.sabuytube.xyz -> sabuytube.xyz */
function rootDomain(hostname) {
  const parts = hostname.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

/**
 * Return zoneId for a hostname by matching its root domain in domains.config.json.
 * Falls back to settings.json/.env ZONE_ID if no match found.
 */
function getZoneIdForHostname(hostname) {
  const rd = rootDomain(hostname);
  const entry = loadDomains().find(d => d.domain === rd);
  return (entry && entry.zoneId) || settingsStore.getZoneId();
}

module.exports = { loadDomains, saveDomains, getZoneIdForHostname, rootDomain };
