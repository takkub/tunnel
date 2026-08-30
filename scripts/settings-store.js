// Persists user-editable settings (currently: Cloudflare credentials) to
// <TUNNEL_DATA_DIR>/settings.json so the desktop app never needs the user to
// hand-edit .env. .env (CLOUDFLARE_API_TOKEN / ZONE_ID) remains a fallback for
// existing installs and CI — settings.json wins when both are present.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./runtime');

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(SETTINGS_FILE, 0o600); } catch {}
}

function getCloudflareToken() {
  const raw = readRaw();
  return (raw.cloudflare && raw.cloudflare.apiToken) || process.env.CLOUDFLARE_API_TOKEN || null;
}

function getZoneId() {
  const raw = readRaw();
  return (raw.cloudflare && raw.cloudflare.zoneId) || process.env.ZONE_ID || null;
}

// Shows only the last 4 characters so the UI can confirm a token is set
// without ever displaying (or re-sending) the full secret.
function maskToken(token) {
  if (!token) return null;
  if (token.length <= 4) return '*'.repeat(token.length);
  return '*'.repeat(token.length - 4) + token.slice(-4);
}

function getCloudflareSettings() {
  const token = getCloudflareToken();
  return {
    apiTokenSet: Boolean(token),
    apiTokenMasked: maskToken(token),
    zoneId: getZoneId(),
  };
}

// Pass apiToken/zoneId as '' (or null) to clear the stored override and fall
// back to .env again; omit a key entirely to leave it untouched.
function setCloudflareSettings(update = {}) {
  const raw = readRaw();
  const cloudflare = { ...(raw.cloudflare || {}) };
  if (update.apiToken !== undefined) {
    if (!update.apiToken) delete cloudflare.apiToken;
    else cloudflare.apiToken = update.apiToken;
  }
  if (update.zoneId !== undefined) {
    if (!update.zoneId) delete cloudflare.zoneId;
    else cloudflare.zoneId = update.zoneId;
  }
  writeRaw({ ...raw, cloudflare });
  return getCloudflareSettings();
}

function getR2Field(key, envVar) {
  const raw = readRaw();
  return (raw.r2 && raw.r2[key]) || (envVar ? process.env[envVar] : null) || null;
}

function getR2Settings() {
  const secret = getR2Field('secretAccessKey', 'R2_SECRET_ACCESS_KEY');
  return {
    accountId: getR2Field('accountId', 'R2_ACCOUNT_ID'),
    accessKeyId: getR2Field('accessKeyId', 'R2_ACCESS_KEY_ID'),
    bucket: getR2Field('bucket', 'R2_BUCKET'),
    publicUrl: getR2Field('publicUrl', null),
    secretSet: Boolean(secret),
    secretMasked: maskToken(secret),
  };
}

// Pass accountId/accessKeyId/secretAccessKey/bucket/publicUrl as '' (or null)
// to clear the stored override and fall back to .env (where applicable)
// again; omit a key entirely to leave it untouched.
function setR2Settings(update = {}) {
  const raw = readRaw();
  const r2 = { ...(raw.r2 || {}) };
  for (const key of ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'publicUrl']) {
    if (update[key] === undefined) continue;
    if (!update[key]) delete r2[key];
    else r2[key] = update[key];
  }
  writeRaw({ ...raw, r2 });
  return getR2Settings();
}

const DESKTOP_DEFAULTS = { launchAtLogin: false, autostartTunnelsOnLaunch: true, webPort: null };

function getDesktopSettings() {
  const raw = readRaw();
  return { ...DESKTOP_DEFAULTS, ...(raw.desktop || {}) };
}

// Omit a key entirely to leave it untouched. Pass webPort as 0/null/'' to
// clear the override and fall back to TUNNEL_WEB_PORT/get-port again.
function setDesktopSettings(update = {}) {
  const raw = readRaw();
  const desktop = { ...DESKTOP_DEFAULTS, ...(raw.desktop || {}) };
  if (update.launchAtLogin !== undefined) desktop.launchAtLogin = Boolean(update.launchAtLogin);
  if (update.autostartTunnelsOnLaunch !== undefined) desktop.autostartTunnelsOnLaunch = Boolean(update.autostartTunnelsOnLaunch);
  if (update.webPort !== undefined) desktop.webPort = update.webPort ? Number(update.webPort) : null;
  writeRaw({ ...raw, desktop });
  return getDesktopSettings();
}

module.exports = {
  SETTINGS_FILE,
  getCloudflareToken,
  getZoneId,
  maskToken,
  getCloudflareSettings,
  setCloudflareSettings,
  getR2Settings,
  setR2Settings,
  getDesktopSettings,
  setDesktopSettings,
};
