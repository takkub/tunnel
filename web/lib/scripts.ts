import { spawn } from 'child_process'
import path from 'path'

const ROOT = path.resolve(process.cwd(), '..')

export function runScript(scriptName: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(ROOT, 'scripts', scriptName)
    const proc = spawn('node', [scriptPath, ...args], { cwd: ROOT, env: { ...process.env, CI: '1' } })
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
    const scriptPath = path.join(ROOT, 'scripts', scriptName)
    const proc = spawn('node', [scriptPath, ...args], { cwd: ROOT, env: { ...process.env, CI: '1' } })
    proc.stdout.on('data', (d: Buffer) => { d.toString().split('\n').filter(Boolean).forEach(onData) })
    proc.stderr.on('data', (d: Buffer) => { d.toString().split('\n').filter(Boolean).forEach(onData) })
    proc.on('close', code => { code === 0 ? resolve() : reject(new Error(`Exit ${code}`)) })
  })
}
