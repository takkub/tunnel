// Central path resolution — honors the desktop-app env contract when present,
// falls back to the classic dev layout (repo root = one level above web/).
//
// TUNNEL_ROOT     — dir containing scripts/ (packaged: resourcesPath/app, dev: repo root)
// TUNNEL_DATA_DIR — dir for writable state: tunnels/, *.config.json (packaged: userData, dev: repo root)
import path from 'path'

const devRoot = path.resolve(process.cwd(), '..')

export const TUNNEL_ROOT = process.env.TUNNEL_ROOT || devRoot
export const TUNNEL_DATA_DIR = process.env.TUNNEL_DATA_DIR || devRoot
