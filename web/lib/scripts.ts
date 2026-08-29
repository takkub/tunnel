import { spawn } from 'child_process'
import path from 'path'
import { TUNNEL_ROOT, TUNNEL_DATA_DIR } from './paths'

// Electron packs its own Node runtime — when running under it, `node` isn't
// necessarily on PATH, so spawn the current executable in "run as Node" mode instead.
const UNDER_ELECTRON = Boolean(process.env.ELECTRON_RUN_AS_NODE || process.versions.electron)
const NODE_BIN = UNDER_ELECTRON ? process.execPath : 'node'

function childEnv() {
  return {
    ...process.env,
    CI: '1',
    TUNNEL_ROOT,
    TUNNEL_DATA_DIR,
    // Required alongside process.execPath: without it, the Electron binary
    // launches as a full Electron app instead of running the script as plain Node.
    ...(UNDER_ELECTRON ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }
}

export function runScript(scriptName: string, args: string[] = [], opts: { timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(TUNNEL_ROOT, 'scripts', scriptName)
    const proc = spawn(NODE_BIN, [scriptPath, ...args], { cwd: TUNNEL_DATA_DIR, env: childEnv() })
    let out = ''
    let err = ''
    let timedOut = false
    // Last-resort safety net: every individual step inside these scripts is
    // meant to be bounded on its own (see delete-tunnel.js's DOCKER_TIMEOUT_MS
    // / CLOUDFLARED_TIMEOUT_MS), but this catches anything that isn't —
    // without it, an API route awaiting this promise would hang right along
    // with the child instead of returning a clear error.
    const timer = opts.timeoutMs
      ? setTimeout(() => { timedOut = true; proc.kill('SIGKILL') }, opts.timeoutMs)
      : null
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('close', code => {
      if (timer) clearTimeout(timer)
      if (timedOut) { reject(new Error(`${scriptName} timed out after ${opts.timeoutMs}ms`)); return }
      if (code === 0) resolve(out)
      else reject(new Error(err || out || `Exit ${code}`))
    })
  })
}

export function streamScript(scriptName: string, args: string[] = [], onData: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(TUNNEL_ROOT, 'scripts', scriptName)
    const proc = spawn(NODE_BIN, [scriptPath, ...args], { cwd: TUNNEL_DATA_DIR, env: childEnv() })
    proc.stdout.on('data', (d: Buffer) => { d.toString().split('\n').filter(Boolean).forEach(onData) })
    proc.stderr.on('data', (d: Buffer) => { d.toString().split('\n').filter(Boolean).forEach(onData) })
    proc.on('close', code => { code === 0 ? resolve() : reject(new Error(`Exit ${code}`)) })
  })
}
