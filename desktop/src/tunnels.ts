// Start/Stop-all for the tray menu — shells out to the same scripts the web
// UI drives, so behavior stays identical to the browser Start/Stop buttons.
import { spawn } from 'child_process'
import path from 'path'
import { TUNNEL_ROOT, TUNNEL_DATA_DIR } from './server'

function runScript(scriptName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(TUNNEL_ROOT, 'scripts', scriptName)
    const proc = spawn(process.execPath, [scriptPath], {
      cwd: TUNNEL_DATA_DIR,
      env: { ...process.env, CI: '1', TUNNEL_ROOT, TUNNEL_DATA_DIR, ELECTRON_RUN_AS_NODE: '1' },
    })
    proc.on('error', reject)
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`${scriptName} exited ${code}`))))
  })
}

export const startAllTunnels = () => runScript('start-all.js')
export const stopAllTunnels = () => runScript('stop-all.js')
