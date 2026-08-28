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

export function runScript(scriptName: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(TUNNEL_ROOT, 'scripts', scriptName)
    const proc = spawn(NODE_BIN, [scriptPath, ...args], { cwd: TUNNEL_DATA_DIR, env: childEnv() })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('close', code => {
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
