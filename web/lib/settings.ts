// Mirrors scripts/settings-store.js — both read/write the same
// <TUNNEL_DATA_DIR>/settings.json directly (same convention as
// domains.js / web/app/api/settings/domains, runtime.js / lib/runtime.ts).
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { TUNNEL_DATA_DIR } from './paths'
import { getEnvValue } from './env-file'
import { updateEnvFile } from './env-writer'

const SETTINGS_FILE = path.join(TUNNEL_DATA_DIR, 'settings.json')

interface StoredCloudflare { apiToken?: string; zoneId?: string; zoneName?: string }
interface StoredR2 { accountId?: string; accessKeyId?: string; secretAccessKey?: string; bucket?: string; publicUrl?: string; analyticsToken?: string }
interface StoredDesktop { launchAtLogin?: boolean; autostartTunnelsOnLaunch?: boolean; webPort?: number | null }
interface StoredSettings { cloudflare?: StoredCloudflare; r2?: StoredR2; desktop?: StoredDesktop }

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
  return readRaw().cloudflare?.apiToken || getEnvValue(TUNNEL_DATA_DIR, 'CLOUDFLARE_API_TOKEN') || null
}

function getZoneId(): string | null {
  return readRaw().cloudflare?.zoneId || getEnvValue(TUNNEL_DATA_DIR, 'ZONE_ID') || null
}

function getZoneName(): string | null {
  return readRaw().cloudflare?.zoneName || null
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
  zoneName: string | null
}

export function getCloudflareSettings(): CloudflareSettingsView {
  const token = getCloudflareToken()
  return { apiTokenSet: Boolean(token), apiTokenMasked: maskToken(token), zoneId: getZoneId(), zoneName: getZoneName() }
}

// Pass apiToken/zoneId/zoneName as '' to clear the stored override (apiToken/
// zoneId fall back to .env again); omit a key entirely to leave it untouched.
export function setCloudflareSettings(update: { apiToken?: string; zoneId?: string; zoneName?: string }): CloudflareSettingsView {
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
  if (update.zoneName !== undefined) {
    if (!update.zoneName) delete cloudflare.zoneName
    else cloudflare.zoneName = update.zoneName
  }
  writeRaw({ ...raw, cloudflare })
  return getCloudflareSettings()
}

function getR2Field(key: keyof StoredR2, envVar: string | null): string | null {
  return readRaw().r2?.[key] || (envVar ? getEnvValue(TUNNEL_DATA_DIR, envVar) : null) || null
}

export interface R2SettingsView {
  accountId: string | null
  accessKeyId: string | null
  bucket: string | null
  publicUrl: string | null
  secretSet: boolean
  secretMasked: string | null
  analyticsTokenSet: boolean
  analyticsTokenMasked: string | null
}

export function getR2Settings(): R2SettingsView {
  const secret = getR2Field('secretAccessKey', 'R2_SECRET_ACCESS_KEY')
  const analyticsToken = getR2Field('analyticsToken', null)
  return {
    accountId: getR2Field('accountId', 'R2_ACCOUNT_ID'),
    accessKeyId: getR2Field('accessKeyId', 'R2_ACCESS_KEY_ID'),
    bucket: getR2Field('bucket', 'R2_BUCKET'),
    publicUrl: getR2Field('publicUrl', null),
    secretSet: Boolean(secret),
    secretMasked: maskToken(secret),
    analyticsTokenSet: Boolean(analyticsToken),
    analyticsTokenMasked: maskToken(analyticsToken),
  }
}

// Pass accountId/accessKeyId/secretAccessKey/bucket/publicUrl/analyticsToken
// as '' to clear the stored override (falls back to .env where applicable);
// omit a key entirely to leave it untouched.
export function setR2Settings(update: { accountId?: string; accessKeyId?: string; secretAccessKey?: string; bucket?: string; publicUrl?: string; analyticsToken?: string }): R2SettingsView {
  const raw = readRaw()
  const r2: StoredR2 = { ...raw.r2 }
  for (const key of ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'publicUrl', 'analyticsToken'] as const) {
    if (update[key] === undefined) continue
    if (!update[key]) delete r2[key]
    else r2[key] = update[key]
  }
  writeRaw({ ...raw, r2 })
  return getR2Settings()
}

// --- Admin password ------------------------------------------------------
// Unlike everything above, ADMIN_PASSWORD (and SESSION_SECRET) live in
// <TUNNEL_DATA_DIR>/.env, not settings.json — that's the file web-serve.js /
// desktop/src/server.ts already thread into the spawned Next server's env,
// and hand-editing .env must keep working for existing installs.
//
// setAdminPassword() also mirrors the new value(s) onto this process's own
// process.env so a Node.js-runtime read (getEnvValue() below, or
// lib/auth.ts's getSecret()) sees them immediately on this same running
// server — no restart needed for POST /api/auth/login. It deliberately does
// NOT reach middleware.ts's Edge Runtime sandbox, which reads
// process.env.SESSION_SECRET captured at that runtime's own startup: a
// SESSION_SECRET generated here for the very first time can require a real
// process restart before an Edge-verified cookie round-trips correctly.
// ADMIN_PASSWORD itself is only ever checked in the Node.js-runtime login
// route, so a plain password change always applies immediately either way.
export interface AdminSettingsView {
  passwordSet: boolean
}

export function getAdminSettings(): AdminSettingsView {
  return { passwordSet: Boolean(getEnvValue(TUNNEL_DATA_DIR, 'ADMIN_PASSWORD')) }
}

export function setAdminPassword(password: string): void {
  const updates: Record<string, string> = { ADMIN_PASSWORD: password }
  if (!getEnvValue(TUNNEL_DATA_DIR, 'SESSION_SECRET')) {
    updates.SESSION_SECRET = crypto.randomBytes(32).toString('hex')
  }
  updateEnvFile(TUNNEL_DATA_DIR, updates)
  for (const [key, value] of Object.entries(updates)) process.env[key] = value
}

const DESKTOP_DEFAULTS: Required<StoredDesktop> = { launchAtLogin: false, autostartTunnelsOnLaunch: true, webPort: null }

export interface DesktopSettingsView {
  launchAtLogin: boolean
  autostartTunnelsOnLaunch: boolean
  webPort: number | null
}

export function getDesktopSettings(): DesktopSettingsView {
  return { ...DESKTOP_DEFAULTS, ...readRaw().desktop }
}

// Omit a key entirely to leave it untouched. Pass webPort as 0/null to clear
// the override and fall back to TUNNEL_WEB_PORT/get-port again.
export function setDesktopSettings(update: { launchAtLogin?: boolean; autostartTunnelsOnLaunch?: boolean; webPort?: number | null }): DesktopSettingsView {
  const raw = readRaw()
  const desktop: StoredDesktop = { ...DESKTOP_DEFAULTS, ...raw.desktop }
  if (update.launchAtLogin !== undefined) desktop.launchAtLogin = Boolean(update.launchAtLogin)
  if (update.autostartTunnelsOnLaunch !== undefined) desktop.autostartTunnelsOnLaunch = Boolean(update.autostartTunnelsOnLaunch)
  if (update.webPort !== undefined) desktop.webPort = update.webPort ? Number(update.webPort) : null
  writeRaw({ ...raw, desktop })
  return getDesktopSettings()
}
