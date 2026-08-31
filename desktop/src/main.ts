import { app, BrowserWindow, Menu, Tray, Notification, dialog, shell } from 'electron'
import path from 'path'
import { startServer, stopServer, TUNNEL_DATA_DIR } from './server'
import { startAllTunnels, stopAllTunnels } from './tunnels'
import { runAutostartTunnels, formatAutostartSummary, AutostartSummary } from './autostart'
import { readDesktopSettings, applyLoginItemSettings, watchDesktopSettings } from './settings'
import {
  initUpdater,
  checkForUpdatesManual,
  checkForUpdates,
  pollUpdateRequests,
  installUpdate,
  startPeriodicChecks,
} from './updater'
import { appendLog } from './log'

function log(line: string): void {
  console.log(line)
  appendLog(TUNNEL_DATA_DIR, line)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverUrl = ''
let quitting = false
let downloadedUpdateVersion: string | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(bootstrap)

  app.on('window-all-closed', () => {
    // keep running in the tray — quitting is only via the tray menu
  })

  app.on('before-quit', () => {
    quitting = true
    stopServer()
  })
}

async function bootstrap() {
  log(`[main] bootstrap starting — app v${app.getVersion()}, packaged=${app.isPackaged}`)
  try {
    const { url } = await startServer()
    serverUrl = url
    log(`[main] server started at ${url}`)
  } catch (err) {
    log(`[main] failed to start the local server: ${(err as Error).message}`)
    dialog.showErrorBox('Tunnel Manager', `Failed to start the local server:\n${(err as Error).message}`)
    app.quit()
    return
  }

  applyLoginItemSettings(readDesktopSettings())
  watchDesktopSettings(settings => applyLoginItemSettings(settings))

  createWindow(shouldStartHidden())
  createTray()
  initUpdater(tray, version => {
    downloadedUpdateVersion = version
    rebuildTrayMenu()
  })
  pollUpdateRequests()
  startPeriodicChecks()
  autostartTunnelsIfEnabled()
  checkForUpdates()
}

// --hidden is how we relaunch ourselves as a Windows/Linux login item (passed
// via setLoginItemSettings' `args`); wasOpenedAsHidden is macOS's equivalent
// signal for a login item opened via openAsHidden.
function shouldStartHidden(): boolean {
  if (process.argv.includes('--hidden')) return true
  return Boolean(app.getLoginItemSettings().wasOpenedAsHidden)
}

function createWindow(hidden: boolean) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: !hidden,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(serverUrl)

  mainWindow.on('close', event => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'build', 'tray.png'))
  tray.setToolTip('Tunnel Manager')
  rebuildTrayMenu()
  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function rebuildTrayMenu(busy = false) {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Tunnel Manager',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    {
      label: 'Check for Updates…',
      enabled: !busy,
      click: () => checkForUpdatesManual(),
    },
    ...(downloadedUpdateVersion
      ? [
          {
            label: `ติดตั้งอัปเดต v${downloadedUpdateVersion}`,
            enabled: !busy,
            click: () => installUpdate(),
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: 'Start All Tunnels',
      enabled: !busy,
      click: () => runTrayAction('Start All Tunnels', startAllTunnels),
    },
    {
      label: 'Stop All Tunnels',
      enabled: !busy,
      click: () => runTrayAction('Stop All Tunnels', stopAllTunnels),
    },
    {
      label: 'Autostart Tunnels Now',
      enabled: !busy,
      click: () =>
        runTrayAction('Autostart Tunnels Now', async () => {
          const summary = await runAutostartTunnels()
          showAutostartNotification(summary)
        }),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
}

async function runTrayAction(label: string, action: () => Promise<void>) {
  rebuildTrayMenu(true)
  try {
    await action()
    mainWindow?.webContents.reload()
  } catch (err) {
    dialog.showErrorBox(label, (err as Error).message)
  } finally {
    rebuildTrayMenu(false)
  }
}

// Fire-and-forget: never blocks window/tray creation on the autostart run.
function autostartTunnelsIfEnabled() {
  if (readDesktopSettings().autostartTunnelsOnLaunch === false) return
  runAutostartTunnels()
    .then(summary => {
      log(`[autostart] ${formatAutostartSummary(summary)}`)
      showAutostartNotification(summary)
    })
    .catch(err => {
      log(`[autostart] failed: ${(err as Error).message}`)
      if (Notification.isSupported()) {
        new Notification({ title: 'Autostart Tunnels — failed', body: (err as Error).message }).show()
      }
    })
}

function showAutostartNotification(summary: AutostartSummary) {
  const body = formatAutostartSummary(summary)
  const title = summary.failed.length ? 'Autostart Tunnels — issues' : 'Autostart Tunnels'
  if (process.platform === 'win32' && tray) {
    tray.displayBalloon({ title, content: body })
    return
  }
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}
