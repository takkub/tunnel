// App version for display — desktop app sets APP_VERSION (from Electron's
// app.getVersion()) since web/package.json's version is a stub; everything
// else falls back to the root package.json, the source of truth for releases.
import fs from 'fs'
import path from 'path'
import { TUNNEL_ROOT } from './paths'

export function getAppVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(TUNNEL_ROOT, 'package.json'), 'utf8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}
