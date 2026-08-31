import { ChildProcess, spawn } from 'child_process'
import { app } from 'electron'
import fs from 'fs'
import net from 'net'
import path from 'path'
import getPort from 'get-port'
import { buildSpawnEnv } from './dotenv-env'
import { resolveConfiguredPort, acquirePort } from './port-resolver'
import { startServerWithRetry } from './server-startup'
import { appendLog, getLogPath } from './log'

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

// Mirrors settings.ts's direct read of <TUNNEL_DATA_DIR>/settings.json — see
// scripts/settings-store.js / web/lib/settings.ts for the canonical shape.
function readSettingsWebPort(): number | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(TUNNEL_DATA_DIR, 'settings.json'), 'utf8'))
    return raw?.desktop?.webPort
  } catch {
    return undefined
  }
}

function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise(resolve => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(port, host)
  })
}

// TUNNEL_WEB_PORT (env) or settings.json's desktop.webPort pins the server to
// a fixed port — needed because a Cloudflare tunnel's ingress rule points at
// a fixed localhost port (e.g. 8888): if a restart lands on 8889 instead
// (get-port's default behavior when 8888 is briefly still held by the
// previous process), the tunnel starts 502ing. Retries a few times before
// falling back to get-port, since the old process's listener can take a
// moment to release the port after exit.
async function resolvePort(): Promise<number> {
  const configuredPort = resolveConfiguredPort({
    envPort: process.env.TUNNEL_WEB_PORT,
    settingsWebPort: readSettingsWebPort(),
  })
  return acquirePort(configuredPort, {
    isPortFree,
    getFallbackPort: () => getPort({ port: [8888, 8889, 8890, 8891, 8892] }),
    log: (msg: string) => console.error(msg),
  })
}

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

function log(line: string): void {
  console.log(line)
  appendLog(TUNNEL_DATA_DIR, line)
}

function spawnServerProcess(port: number, env: NodeJS.ProcessEnv): ChildProcess {
  let proc: ChildProcess
  // stdin is ignored, not piped — nothing ever writes to it, and an
  // unconsumed piped stdin is one of the few ways a spawned Node child can
  // end up blocked before it even reaches its own listen() call. windowsHide
  // avoids a console flash on Windows. Neither was confirmed as the cause of
  // the v1.1.11 "child alive, near-zero CPU, never listening" hang — it could
  // not be reproduced directly — but both rule out a plausible contributor.
  if (app.isPackaged) {
    const serverJs = path.join(TUNNEL_ROOT, 'web', 'server.js')
    proc = spawn(process.execPath, [serverJs], {
      cwd: path.dirname(serverJs),
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } else {
    // Dev: run the real `next dev` for HMR against the checked-out web/ app.
    const webDir = path.join(TUNNEL_ROOT, 'web')
    const nextBin = path.join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next')
    proc = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
      cwd: webDir,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  }

  proc.stdout?.on('data', d => log(`[server] ${d.toString().trim()}`))
  proc.stderr?.on('data', d => log(`[server:err] ${d.toString().trim()}`))
  proc.on('exit', code => log(`[server] exited with code ${code}`))
  return proc
}

// Used by the startup retry (killing a stuck first attempt before spawning a
// second) — unlike stopServer() below, this waits for the kill to actually
// land before resolving, since the retry then reuses the same fixed port.
function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve()
      return
    }
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    proc.once('exit', done)
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
      // taskkill returning doesn't guarantee our own 'exit' listener above has
      // fired yet (and a stuck killer must never hang the retry forever), so
      // give it one brief grace window either way.
      killer.on('exit', () => setTimeout(done, 500))
      killer.on('error', () => setTimeout(done, 500))
    } else {
      proc.kill('SIGTERM')
      setTimeout(done, 2000)
    }
  })
}

export async function startServer(): Promise<{ port: number; url: string }> {
  const port = await resolvePort()
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
    APP_VERSION: app.getVersion(),
  })

  const url = `http://127.0.0.1:${port}`

  try {
    return await startServerWithRetry({
      spawnAndWait: async () => {
        serverProcess = spawnServerProcess(port, env)
        await waitForServer(url)
        return { port, url }
      },
      killPrevious: async () => {
        if (serverProcess) await killProcess(serverProcess)
        serverProcess = null
      },
      log,
    })
  } catch (err) {
    throw new Error(`${(err as Error).message}\nDetails: ${getLogPath(TUNNEL_DATA_DIR)}`)
  }
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
