// Reads <TUNNEL_DATA_DIR>/settings.json's `desktop` block and applies it to
// the OS login-item registration. Mirrors scripts/settings-store.js /
// web/lib/settings.ts's shape and defaults — this file only reads (the web
// UI is the only writer, via PUT /api/settings), so it stays a plain
// standalone reader rather than importing web/lib (outside desktop's rootDir
// and pulls in Next.js).
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { TUNNEL_DATA_DIR } from './server'

const SETTINGS_FILE = path.join(TUNNEL_DATA_DIR, 'settings.json')
const POLL_INTERVAL_MS = 2000

export interface DesktopSettings {
  launchAtLogin: boolean
  autostartTunnelsOnLaunch: boolean
}

const DEFAULTS: DesktopSettings = { launchAtLogin: false, autostartTunnelsOnLaunch: true }

export function readDesktopSettings(): DesktopSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    return { ...DEFAULTS, ...(raw.desktop || {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

// Applies launchAtLogin to the OS, then reads it back and logs if the OS
// didn't end up matching what we asked for (e.g. the user removed the login
// item by hand in System Settings) — no UI, this is diagnostic only.
export function applyLoginItemSettings(settings: DesktopSettings): void {
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    openAsHidden: true, // macOS only; ignored elsewhere
    args: ['--hidden'], // Windows/Linux: how we detect a login-item launch
  })

  const actual = app.getLoginItemSettings()
  if (actual.openAtLogin !== settings.launchAtLogin) {
    console.log(
      `[settings] login item drifted from settings.json: wanted openAtLogin=${settings.launchAtLogin}, OS reports ${actual.openAtLogin}`
    )
  }
}

// Polls settings.json's mtime every ~2s (fs.watch is unreliable across the
// atomic rename some editors/writers use, and the web UI's PUT handler may
// rewrite-in-place or via rename depending on platform) and invokes
// `onChange` with the freshly parsed settings whenever the file changes.
export function watchDesktopSettings(onChange: (settings: DesktopSettings) => void): NodeJS.Timeout {
  let lastMtimeMs = -1
  try {
    lastMtimeMs = fs.statSync(SETTINGS_FILE).mtimeMs
  } catch {
    // no settings.json yet — first poll that sees one will fire onChange
  }

  return setInterval(() => {
    let mtimeMs: number
    try {
      mtimeMs = fs.statSync(SETTINGS_FILE).mtimeMs
    } catch {
      return
    }
    if (mtimeMs === lastMtimeMs) return
    lastMtimeMs = mtimeMs
    onChange(readDesktopSettings())
  }, POLL_INTERVAL_MS)
}
