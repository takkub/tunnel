import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = path.resolve(process.cwd(), '..', 'nginx-sites.config.json')

interface SiteEntry { serverName: string; upstream: string }
interface SitesConfig { sites: SiteEntry[] }

function readConfig(): SitesConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as SitesConfig
    return { sites: Array.isArray(raw.sites) ? raw.sites : [] }
  } catch {
    return { sites: [] }
  }
}

function writeConfig(cfg: SitesConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n')
}

export async function GET() {
  return NextResponse.json(readConfig())
}

export async function POST(req: Request) {
  try {
    const { serverName, upstream } = await req.json() as Partial<SiteEntry>
    if (!serverName?.trim() || !upstream?.trim()) {
      return NextResponse.json({ error: 'serverName and upstream are required' }, { status: 400 })
    }
    const cfg = readConfig()
    const idx = cfg.sites.findIndex(s => s.serverName === serverName)
    if (idx >= 0) {
      cfg.sites[idx].upstream = upstream
    } else {
      cfg.sites.push({ serverName, upstream })
    }
    writeConfig(cfg)
    return NextResponse.json({ ok: true, sites: cfg.sites })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const serverName = searchParams.get('serverName')
    if (!serverName) {
      return NextResponse.json({ error: 'serverName query param required' }, { status: 400 })
    }
    const cfg = readConfig()
    cfg.sites = cfg.sites.filter(s => s.serverName !== serverName)
    writeConfig(cfg)
    return NextResponse.json({ ok: true, sites: cfg.sites })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
