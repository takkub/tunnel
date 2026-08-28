import { app, BrowserWindow, Menu, Tray, dialog, shell } from 'electron'
import path from 'path'
import { startServer, stopServer } from './server'
import { startAllTunnels, stopAllTunnels } from './tunnels'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverUrl = ''
let quitting = false

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
  try {
    const { url } = await startServer()
    serverUrl = url
  } catch (err) {
    dialog.showErrorBox('Tunnel Manager', `Failed to start the local server:\n${(err as Error).message}`)
    app.quit()
    return
  }

  createWindow()
  createTray()
  checkForUpdates()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
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

function checkForUpdates() {
  if (!app.isPackaged) return
  try {
    // Loaded lazily so dev/unpackaged runs never need electron-updater's
    // network calls or a configured publish feed.
    const { autoUpdater } = require('electron-updater')
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error('[updater]', err.message)
    })
  } catch (err) {
    console.error('[updater] not available:', (err as Error).message)
  }
}
