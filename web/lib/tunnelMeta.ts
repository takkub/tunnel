// Mirrors scripts/tunnel-meta.js — both read/write the same
// <TUNNELS_DIR>/<name>/tunnel.json directly (same convention as
// settings-store.js / lib/settings.ts).
import fs from 'fs'
import path from 'path'
import { TUNNELS_DIR } from './paths'

interface TunnelMeta { autostart?: boolean }

const DEFAULTS: Required<TunnelMeta> = { autostart: false }

function getMetaPath(name: string): string {
  return path.join(TUNNELS_DIR, name, 'tunnel.json')
}

function readMeta(name: string): Required<TunnelMeta> {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(getMetaPath(name), 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeMeta(name: string, meta: Required<TunnelMeta>): void {
  const p = getMetaPath(name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(meta, null, 2) + '\n')
}

export function getAutostart(name: string): boolean {
  return readMeta(name).autostart === true
}

export function setAutostart(name: string, autostart: boolean): boolean {
  const meta = readMeta(name)
  meta.autostart = Boolean(autostart)
  writeMeta(name, meta)
  return meta.autostart
}
