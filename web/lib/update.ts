// Reads <TUNNEL_DATA_DIR>/update-status.json (written by desktop/src/updater.ts)
// and writes update-request.json — the only channel between this web UI and
// the Electron main process, since there is no IPC bridge (same convention as
// web/lib/settings.ts's desktop block / desktop/src/settings.ts). Mirrors
// desktop/src/update-status.js's shape and defaults.
import fs from 'fs'
import path from 'path'
import { TUNNEL_DATA_DIR } from './paths'

const STATUS_FILE = path.join(TUNNEL_DATA_DIR, 'update-status.json')
const REQUEST_FILE = path.join(TUNNEL_DATA_DIR, 'update-request.json')

export type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
  state: UpdateState
  version: string | null
  currentVersion: string | null
  percent: number | null
  message: string | null
  at: number | null
}

const DEFAULT_STATUS: UpdateStatus = {
  state: 'idle',
  version: null,
  currentVersion: null,
  percent: null,
  message: null,
  at: null,
}

export function getUpdateStatus(): UpdateStatus {
  try {
    const raw = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'))
    return { ...DEFAULT_STATUS, ...raw }
  } catch {
    return { ...DEFAULT_STATUS }
  }
}

export type UpdateAction = 'check' | 'install'

export function requestUpdateAction(action: UpdateAction): void {
  fs.mkdirSync(path.dirname(REQUEST_FILE), { recursive: true })
  fs.writeFileSync(REQUEST_FILE, JSON.stringify({ action, at: Date.now() }, null, 2) + '\n')
}
