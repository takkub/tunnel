// Wires electron-updater to two files under TUNNEL_DATA_DIR since there is no
// IPC channel between the web UI and the main process (same convention as
// settings.ts): the web UI writes update-request.json (via POST
// /api/desktop/update), this module polls it every ~2s the same way
// settings.ts's watchDesktopSettings polls settings.json, and every
// autoUpdater event — including the silent auto-check at launch — is mirrored
// into update-status.json for the web UI (and the tray) to read back.
import { app, dialog, Notification, Tray } from 'electron'
import { TUNNEL_DATA_DIR } from './server'
import { readUpdateRequest, writeUpdateStatus } from './update-status'

const POLL_INTERVAL_MS = 2000

let autoUpdaterRef: import('electron-updater').AppUpdater | null = null
let trayRef: Tray | null = null
let lastRequestAt = -1

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
// no-ops in that case.
export function initUpdater(tray: Tray | null): void {
  trayRef = tray
  const autoUpdater = loadAutoUpdater()
  if (!autoUpdater) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] checking-for-update')
    setStatus({ state: 'checking', currentVersion: app.getVersion() })
  })
  autoUpdater.on('update-available', info => {
    console.log('[updater] update-available', info.version)
    setStatus({ state: 'available', version: info.version, currentVersion: app.getVersion() })
  })
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] update-not-available')
    setStatus({ state: 'up-to-date', currentVersion: app.getVersion(), version: null })
  })
  autoUpdater.on('download-progress', progress => {
    console.log('[updater] download-progress', Math.round(progress.percent))
    setStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', info => {
    console.log('[updater] update-downloaded', info.version)
    setStatus({ state: 'downloaded', version: info.version, percent: 100 })
    notifyDownloaded(info.version)
  })
  autoUpdater.on('error', err => {
    console.error('[updater] error', err.message)
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
    console.error('[updater]', err.message)
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

function notifyDownloaded(version: string): void {
  dialog
    .showMessageBox({
      type: 'info',
      title: 'อัปเดตพร้อมติดตั้ง',
      message: `ดาวน์โหลดเวอร์ชัน v${version} เสร็จแล้ว — รีสตาร์ทเพื่อติดตั้งตอนนี้เลยไหม?`,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) {
        const autoUpdater = loadAutoUpdater()
        autoUpdater?.quitAndInstall()
      }
    })
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
// already-downloaded update.
export function pollUpdateRequests(): NodeJS.Timeout {
  return setInterval(() => {
    const request = readUpdateRequest(TUNNEL_DATA_DIR)
    if (!request || request.at === lastRequestAt) return
    lastRequestAt = request.at
    if (request.action === 'check') {
      checkForUpdatesManual()
    } else if (request.action === 'install') {
      const autoUpdater = loadAutoUpdater()
      autoUpdater?.quitAndInstall()
    }
  }, POLL_INTERVAL_MS)
}
