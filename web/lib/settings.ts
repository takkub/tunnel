// Mirrors scripts/settings-store.js — both read/write the same
// <TUNNEL_DATA_DIR>/settings.json directly (same convention as
// domains.js / web/app/api/settings/domains, runtime.js / lib/runtime.ts).
import fs from 'fs'
import path from 'path'
import { TUNNEL_DATA_DIR } from './paths'

const SETTINGS_FILE = path.join(TUNNEL_DATA_DIR, 'settings.json')

interface StoredCloudflare { apiToken?: string; zoneId?: string }
interface StoredSettings { cloudflare?: StoredCloudflare }

function readRaw(): StoredSettings {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeRaw(data: StoredSettings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  try { fs.chmodSync(SETTINGS_FILE, 0o600) } catch {}
}

function getCloudflareToken(): string | null {
  return readRaw().cloudflare?.apiToken || process.env.CLOUDFLARE_API_TOKEN || null
}

function getZoneId(): string | null {
  return readRaw().cloudflare?.zoneId || process.env.ZONE_ID || null
}

function maskToken(token: string | null): string | null {
  if (!token) return null
  if (token.length <= 4) return '*'.repeat(token.length)
  return '*'.repeat(token.length - 4) + token.slice(-4)
}

export interface CloudflareSettingsView {
  apiTokenSet: boolean
  apiTokenMasked: string | null
  zoneId: string | null
}

export function getCloudflareSettings(): CloudflareSettingsView {
  const token = getCloudflareToken()
  return { apiTokenSet: Boolean(token), apiTokenMasked: maskToken(token), zoneId: getZoneId() }
}

// Pass apiToken/zoneId as '' to clear the stored override and fall back to
// .env again; omit a key entirely to leave it untouched.
export function setCloudflareSettings(update: { apiToken?: string; zoneId?: string }): CloudflareSettingsView {
  const raw = readRaw()
  const cloudflare: StoredCloudflare = { ...raw.cloudflare }
  if (update.apiToken !== undefined) {
    if (!update.apiToken) delete cloudflare.apiToken
    else cloudflare.apiToken = update.apiToken
  }
  if (update.zoneId !== undefined) {
    if (!update.zoneId) delete cloudflare.zoneId
    else cloudflare.zoneId = update.zoneId
  }
  writeRaw({ ...raw, cloudflare })
  return getCloudflareSettings()
}
