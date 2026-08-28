// Read-only cloudflared status check, mirroring scripts/cloudflared-bin.js's
// binary resolution. Installing/logging in goes through scripts/settings.js
// via runScript instead, since those need real subprocess control.
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { TUNNEL_ROOT, TUNNEL_DATA_DIR } from './paths'

function binName(): string {
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
}

function isExecutable(bin: string): boolean {
  try {
    return spawnSync(bin, ['--version'], { stdio: 'pipe', timeout: 10000 }).status === 0
  } catch {
    return false
  }
}

function findCloudflared(): string | null {
  const managed = path.join(TUNNEL_DATA_DIR, 'bin', binName())
  if (fs.existsSync(managed) && isExecutable(managed)) return managed

  if (process.platform === 'win32') {
    const legacy = path.join(TUNNEL_ROOT, 'cloudflared.exe')
    if (fs.existsSync(legacy) && isExecutable(legacy)) return legacy
  }

  if (isExecutable('cloudflared')) return 'cloudflared'
  return null
}

export interface CloudflaredStatus {
  installed: boolean
  version: string | null
  path: string | null
  loggedIn: boolean
}

export function getCloudflaredStatus(): CloudflaredStatus {
  const bin = findCloudflared()
  let version: string | null = null
  if (bin) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10000 })
    version = (r.stdout || '').trim() || null
  }
  return {
    installed: Boolean(bin),
    version,
    path: bin,
    loggedIn: fs.existsSync(path.join(os.homedir(), '.cloudflared', 'cert.pem')),
  }
}
