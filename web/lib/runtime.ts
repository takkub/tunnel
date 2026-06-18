import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(process.cwd(), '..')
const CONFIG_FILE = path.join(ROOT, 'runtime.config.json')

export function isDockerAvailable(): boolean {
  try {
    execSync('docker ps', { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

export function getRuntimeMode(): 'auto' | 'docker' | 'native' {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      if (['auto', 'docker', 'native'].includes(cfg.mode)) return cfg.mode as 'auto' | 'docker' | 'native'
    }
  } catch {}
  return 'auto'
}

export function getEffectiveMode(): 'docker' | 'native' {
  const mode = getRuntimeMode()
  if (mode === 'docker') return 'docker'
  if (mode === 'native') return 'native'
  return isDockerAvailable() ? 'docker' : 'native'
}

export function setRuntimeMode(mode: 'auto' | 'docker' | 'native'): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ mode }, null, 2))
}
