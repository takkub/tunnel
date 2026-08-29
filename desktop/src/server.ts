import { ChildProcess, spawn } from 'child_process'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import getPort from 'get-port'
import { buildSpawnEnv } from './dotenv-env'

// Where scripts/ lives — read-only in a packaged app, the repo root in dev.
export const TUNNEL_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.resolve(__dirname, '..', '..')

// Where writable state (tunnels/, *.config.json, the auto-generated session
// secret) lives — userData in a packaged app so installs never need to write
// under Program Files/Applications, the repo root in dev to match the CLI.
export const TUNNEL_DATA_DIR = app.isPackaged
  ? app.getPath('userData')
  : path.resolve(__dirname, '..', '..')

function loadOrCreateSessionSecret(): string {
  const file = path.join(TUNNEL_DATA_DIR, '.session-secret')
  try {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (existing) return existing
  } catch {
    // no secret persisted yet
  }
  const generated = require('crypto').randomBytes(32).toString('hex')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, generated, { mode: 0o600 })
  return generated
}

let serverProcess: ChildProcess | null = null

export async function startServer(): Promise<{ port: number; url: string }> {
  const port = await getPort({ port: [8888, 8889, 8890, 8891, 8892] })
  const sessionSecret = loadOrCreateSessionSecret()

  // <TUNNEL_DATA_DIR>/.env holds ADMIN_PASSWORD/CLOUDFLARE_API_TOKEN/ZONE_ID
  // etc. — the Electron main process never reads it itself, so without this
  // the spawned Next server would have none of it (and, per middleware.ts,
  // silently skip the login gate for lack of ADMIN_PASSWORD).
  const env = buildSpawnEnv(TUNNEL_DATA_DIR, {
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    DESKTOP_MODE: '1',
    TUNNEL_ROOT,
    TUNNEL_DATA_DIR,
    SESSION_SECRET: process.env.SESSION_SECRET || sessionSecret,
  })

  if (app.isPackaged) {
    const serverJs = path.join(TUNNEL_ROOT, 'web', 'server.js')
    serverProcess = spawn(process.execPath, [serverJs], {
      cwd: path.dirname(serverJs),
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'pipe',
    })
  } else {
    // Dev: run the real `next dev` for HMR against the checked-out web/ app.
    const webDir = path.join(TUNNEL_ROOT, 'web')
    const nextBin = path.join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next')
    serverProcess = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
      cwd: webDir,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'pipe',
    })
  }

  serverProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()))
  serverProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()))
  serverProcess.on('exit', code => console.log('[server] exited with code', code))

  const url = `http://127.0.0.1:${port}`
  await waitForServer(url)
  return { port, url }
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`)
}

export function stopServer(): void {
  if (!serverProcess) return
  const proc = serverProcess
  serverProcess = null
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
  } else {
    proc.kill('SIGTERM')
  }
}
