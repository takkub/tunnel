// Runs scripts/autostart.js the same way tunnels.ts runs start-all.js /
// stop-all.js — shells out with ELECTRON_RUN_AS_NODE + CI=1 — but captures
// stdout to parse the --json summary instead of just resolving on exit 0.
import { spawn } from 'child_process'
import path from 'path'
import { TUNNEL_ROOT, TUNNEL_DATA_DIR } from './server'
import { buildSpawnEnv } from './dotenv-env'

export interface AutostartSummary {
  mode: string
  started: string[]
  skipped: string[]
  failed: { name: string; error: string }[]
}

export function runAutostartTunnels(): Promise<AutostartSummary> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(TUNNEL_ROOT, 'scripts', 'autostart.js')
    const proc = spawn(process.execPath, [scriptPath, '--json'], {
      cwd: TUNNEL_DATA_DIR,
      env: buildSpawnEnv(TUNNEL_DATA_DIR, { CI: '1', TUNNEL_ROOT, TUNNEL_DATA_DIR, ELECTRON_RUN_AS_NODE: '1' }),
    })

    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', d => (stdout += d.toString()))
    proc.stderr?.on('data', d => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`autostart.js exited ${code}: ${stderr.trim() || '(no stderr)'}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (err) {
        reject(new Error(`Failed to parse autostart.js output: ${(err as Error).message}`))
      }
    })
  })
}

export function formatAutostartSummary(summary: AutostartSummary): string {
  const parts: string[] = []
  if (summary.started.length) parts.push(`Started: ${summary.started.join(', ')}`)
  if (summary.skipped.length) parts.push(`Already running: ${summary.skipped.join(', ')}`)
  if (summary.failed.length) parts.push(`Failed: ${summary.failed.map(f => f.name).join(', ')}`)
  return parts.length ? parts.join(' · ') : 'No autostart tunnels configured'
}
