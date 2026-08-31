// Wires electron-updater to two files under TUNNEL_DATA_DIR since there is no
// IPC channel between the web UI and the main process (same convention as
// settings.ts): the web UI writes update-request.json (via POST
// /api/desktop/update), this module polls it every ~2s the same way
// settings.ts's watchDesktopSettings polls settings.json, and every
// autoUpdater event — including the silent auto-check at launch — is mirrored
// into update-status.json for the web UI (and the tray) to read back.
import { spawn } from 'child_process'
import { app, Notification, Tray } from 'electron'
import { TUNNEL_DATA_DIR } from './server'
import { readUpdateRequest, writeUpdateStatus, clearUpdateRequest } from './update-status'
import { appendLog } from './log'
import { findPendingInstaller, buildInstallerArgs } from './updater-pending'

const POLL_INTERVAL_MS = 2000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
// A request file written before this process started is a leftover from a
// previous app session that quit before acting on it — pollUpdateRequests
// must never replay it (v1.1.11 incident: a stale 'install' request fired
// installUpdate() on every boot with nothing downloaded this session yet).
const APP_START_TIME = Date.now()

function log(line: string): void {
  console.log(line)
  appendLog(TUNNEL_DATA_DIR, line)
}

let autoUpdaterRef: import('electron-updater').AppUpdater | null = null
let trayRef: Tray | null = null
let lastRequestAt = -1
let onDownloadedCallback: ((version: string) => void) | null = null
// Tracks whether *this* process actually has a completed download electron-updater
// knows about — installUpdate() uses it to decide whether quitAndInstall() is even
// worth trying before falling back to a disk-based pending installer.
let hasDownloadedUpdate = false

function loadAutoUpdater(): import('electron-updater').AppUpdater | null {
  if (autoUpdaterRef) return autoUpdaterRef
  try {
    // Loaded lazily so dev/unpackaged runs never need electron-updater's
    // network calls or a configured publish feed.
    const { autoUpdater } = require('electron-updater')
    autoUpdaterRef = autoUpdater
    return autoUpdaterRef
  } catch (err) {
    console.error('[updater] not available:', (err as Error).message)
    return null
  }
}

function setStatus(update: Parameters<typeof writeUpdateStatus>[1]) {
  writeUpdateStatus(TUNNEL_DATA_DIR, update)
}

// Registers autoUpdater's event listeners once, mirroring every event into
// update-status.json. Safe to call even when unpackaged/unavailable — it
// no-ops in that case. `onDownloaded` fires once a download finishes so the
// caller (main.ts) can add a tray-menu "install" item — there is no dialog.
export function initUpdater(tray: Tray | null, onDownloaded?: (version: string) => void): void {
  trayRef = tray
  onDownloadedCallback = onDownloaded ?? null
  const autoUpdater = loadAutoUpdater()
  if (!autoUpdater) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log('[updater] checking-for-update')
    hasDownloadedUpdate = false
    setStatus({ state: 'checking', currentVersion: app.getVersion() })
  })
  autoUpdater.on('update-available', info => {
    log(`[updater] update-available ${info.version}`)
    setStatus({ state: 'available', version: info.version, currentVersion: app.getVersion() })
  })
  autoUpdater.on('update-not-available', () => {
    log('[updater] update-not-available')
    hasDownloadedUpdate = false
    setStatus({ state: 'up-to-date', currentVersion: app.getVersion(), version: null })
  })
  autoUpdater.on('download-progress', progress => {
    setStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', info => {
    log(`[updater] update-downloaded ${info.version}`)
    hasDownloadedUpdate = true
    setStatus({ state: 'downloaded', version: info.version, percent: 100 })
    trayRef?.setToolTip(`Tunnel Manager — อัปเดต v${info.version} พร้อมติดตั้ง`)
    onDownloadedCallback?.(info.version)
  })
  autoUpdater.on('error', err => {
    log(`[updater] error ${err.message}`)
    setStatus({ state: 'error', message: err.message })
  })
}

// Fire-and-forget: called once at launch (never blocks window/tray creation)
// and on-demand from the tray's "Check for Updates…" item / a web-UI request.
export function checkForUpdates(): void {
  if (!app.isPackaged) return
  const autoUpdater = loadAutoUpdater()
  if (!autoUpdater) return
  autoUpdater.checkForUpdates().catch((err: Error) => {
    log(`[updater] checkForUpdates failed: ${err.message}`)
    setStatus({ state: 'error', message: err.message })
  })
}

// Tray-triggered manual check — same as checkForUpdates() but also notifies
// via a balloon/OS notification once the result is known, since a
// user-initiated click expects visible feedback (unlike the silent
// auto-check at launch).
export function checkForUpdatesManual(): void {
  if (!app.isPackaged) {
    notify('Check for Updates', 'ฟีเจอร์อัปเดตใช้ได้เฉพาะแอปที่ติดตั้งแล้ว (ไม่ใช่ dev build)')
    return
  }
  const autoUpdater = loadAutoUpdater()
  if (!autoUpdater) {
    notify('Check for Updates', 'ตัวอัปเดตไม่พร้อมใช้งาน')
    return
  }

  const onNotAvailable = () => {
    notify('Tunnel Manager', `เป็นเวอร์ชันล่าสุดแล้ว (v${app.getVersion()})`)
    cleanup()
  }
  const onAvailable = (info: { version: string }) => {
    notify('Tunnel Manager', `พบเวอร์ชัน v${info.version} — กำลังดาวน์โหลด…`)
    cleanup()
  }
  const onError = (err: Error) => {
    notify('Check for Updates — ผิดพลาด', err.message)
    cleanup()
  }
  const cleanup = () => {
    autoUpdater.removeListener('update-not-available', onNotAvailable)
    autoUpdater.removeListener('update-available', onAvailable)
    autoUpdater.removeListener('error', onError)
  }

  autoUpdater.once('update-not-available', onNotAvailable)
  autoUpdater.once('update-available', onAvailable)
  autoUpdater.once('error', onError)

  checkForUpdates()
}

// Quits and installs an already-downloaded update — reached from the tray's
// "ติดตั้งอัปเดต vX" item and from POST /api/desktop/update { action: 'install' }
// (via pollUpdateRequests below). isSilent+isForceRunAfter matches the NSIS
// one-click config: no installer UI, app relaunches itself once done.
//
// A "no update filepath, can't quit and install" failure (electron-updater's
// own message, seen in production: this process's autoUpdater had nothing
// downloaded when installUpdate() ran) surfaces asynchronously through the
// 'error' event above, not as a thrown exception from quitAndInstall() itself
// — BaseUpdater.quitAndInstall only ever calls app.quit() *after* a real
// install was actually triggered, so a failure here never quits the app on
// its own. This still needs its own handling though: without a fallback the
// app was just stuck unable to update despite a perfectly good installer
// already sitting on disk from an earlier download.
export function installUpdate(): void {
  const autoUpdater = loadAutoUpdater()
  if (!autoUpdater) {
    setStatus({ state: 'error', message: 'ตัวอัปเดตไม่พร้อมใช้งาน' })
    return
  }
  log('[updater] installUpdate requested')

  if (hasDownloadedUpdate) {
    const onInstallError = (err: Error) => {
      log(`[updater] quitAndInstall reported an error, trying pending-installer fallback: ${err.message}`)
      installFromPendingDisk()
    }
    autoUpdater.once('error', onInstallError)
    setTimeout(() => autoUpdater.removeListener('error', onInstallError), 5000)
    try {
      autoUpdater.quitAndInstall(true, true)
    } catch (err) {
      autoUpdater.removeListener('error', onInstallError)
      log(`[updater] quitAndInstall threw, trying pending-installer fallback: ${(err as Error).message}`)
      installFromPendingDisk()
    }
    return
  }

  installFromPendingDisk()
}

// Fallback used when electron-updater's own in-memory state doesn't have a
// download to install (this process never ran the download, or its state
// didn't survive a restart) but a previously-downloaded installer is still
// sitting in its on-disk cache. Never quits the app unless a replacement
// installer was actually launched.
function installFromPendingDisk(): void {
  const installerPath = findPendingInstaller(app.getPath('userData'), app.getName(), process.platform)
  if (!installerPath) {
    log('[updater] no pending installer found on disk — giving up')
    setStatus({ state: 'error', message: 'ไม่พบไฟล์ตัวติดตั้งที่ดาวน์โหลดไว้ — กด Check for Updates อีกครั้ง' })
    return
  }
  log(`[updater] found pending installer on disk: ${installerPath}`)

  if (process.platform === 'darwin') {
    // No supported way to silently launch a .dmg/.pkg by hand — retry
    // electron-updater's own install flow, which is what actually knows how.
    try {
      loadAutoUpdater()?.quitAndInstall(true, true)
    } catch (err) {
      log(`[updater] macOS quitAndInstall retry threw: ${(err as Error).message}`)
      setStatus({ state: 'error', message: (err as Error).message })
    }
    return
  }

  try {
    const child = spawn(installerPath, buildInstallerArgs(process.platform), { detached: true, stdio: 'ignore' })
    child.unref()
    log(`[updater] spawned pending installer (pid ${child.pid})`)
    app.quit()
  } catch (err) {
    log(`[updater] failed to spawn pending installer: ${(err as Error).message}`)
    setStatus({ state: 'error', message: `ติดตั้งอัตโนมัติไม่สำเร็จ: ${(err as Error).message}` })
  }
}

// Re-checks every 6h in addition to the launch-time check, so a long-running
// session still picks up updates without the user opening the tray menu.
export function startPeriodicChecks(): NodeJS.Timeout {
  return setInterval(checkForUpdates, CHECK_INTERVAL_MS)
}

function notify(title: string, body: string): void {
  if (process.platform === 'win32' && trayRef) {
    trayRef.displayBalloon({ title, content: body })
    return
  }
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

// Polls update-request.json's mtime every ~2s (same rationale as
// settings.ts's watchDesktopSettings: fs.watch is unreliable across the
// atomic rename some writers use) and runs the requested action once per
// write — 'check' triggers a manual check, 'install' quits and installs an
// already-downloaded update. A request older than this process's own start
// time is a leftover from before this launch (the previous app instance
// quit — or was killed — before consuming it) and must never be replayed;
// the request file is removed once handled either way so it doesn't keep
// getting re-evaluated by every future launch.
export function pollUpdateRequests(): NodeJS.Timeout {
  return setInterval(() => {
    const request = readUpdateRequest(TUNNEL_DATA_DIR)
    if (!request || request.at === lastRequestAt) return
    lastRequestAt = request.at

    if (request.at < APP_START_TIME) {
      log(`[updater] ignoring stale update request from before this session: ${JSON.stringify(request)}`)
      clearUpdateRequest(TUNNEL_DATA_DIR)
      return
    }

    if (request.action === 'check') {
      checkForUpdatesManual()
    } else if (request.action === 'install') {
      installUpdate()
    }
    clearUpdateRequest(TUNNEL_DATA_DIR)
  }, POLL_INTERVAL_MS)
}
