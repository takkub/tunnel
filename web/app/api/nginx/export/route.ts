import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = path.resolve(process.cwd(), '..', 'nginx-sites.config.json')

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { exportMode?: string }
    const exportMode = body.exportMode === 'edge-snippet' ? 'edge-snippet' : 'standalone'

    // Persist exportMode so nginx-gen.js picks it up from config
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      cfg.exportMode = exportMode
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n')
    } catch { /* nginx-gen.js defaults to standalone if config unreadable */ }

    const stdout = await runScript('nginx-gen.js')
    const result = JSON.parse(stdout.trim()) as { ok: boolean; mode: string; path: string; files: string[] }
    return NextResponse.json({ ok: true, mode: result.mode, path: result.path, files: result.files })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
