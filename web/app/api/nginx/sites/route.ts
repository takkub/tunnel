import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { TUNNEL_DATA_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = path.join(TUNNEL_DATA_DIR, 'nginx-sites.config.json')

interface LocationEntry {
  path: string
  upstream: string
  websocket?: boolean
  rateLimitAuth?: boolean
}

interface SiteEntry {
  serverName: string
  clientMaxBodySize?: string
  locations: LocationEntry[]
}

interface NginxConfig {
  exportMode: 'standalone' | 'edge-snippet'
  sites: SiteEntry[]
}

function readConfig(): NginxConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>
    const exportMode = (raw.exportMode === 'edge-snippet' ? 'edge-snippet' : 'standalone') as NginxConfig['exportMode']
    const rawSites = Array.isArray(raw.sites) ? raw.sites as Record<string, unknown>[] : []
    // backward-compat: migrate old { serverName, upstream } → locations
    const sites: SiteEntry[] = rawSites.map(s => {
      if (!Array.isArray(s.locations) && typeof s.upstream === 'string') {
        const { upstream, ...rest } = s as Record<string, unknown>
        return { ...rest, locations: [{ path: '/', upstream }] } as SiteEntry
      }
      return s as unknown as SiteEntry
    })
    return { exportMode, sites }
  } catch {
    return { exportMode: 'standalone', sites: [] }
  }
}

function writeConfig(cfg: NginxConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n')
}

function validateLocation(loc: unknown): loc is LocationEntry {
  if (!loc || typeof loc !== 'object') return false
  const l = loc as Record<string, unknown>
  return typeof l.path === 'string' && l.path.trim() !== '' &&
    typeof l.upstream === 'string' && l.upstream.trim() !== ''
}

export async function GET() {
  return NextResponse.json(readConfig())
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<SiteEntry>
    const { serverName, clientMaxBodySize, locations } = body
    if (!serverName?.trim()) {
      return NextResponse.json({ error: 'serverName is required' }, { status: 400 })
    }
    if (!Array.isArray(locations) || locations.length === 0 || !locations.every(validateLocation)) {
      return NextResponse.json({ error: 'locations must be a non-empty array of {path, upstream}' }, { status: 400 })
    }
    const cfg = readConfig()
    const site: SiteEntry = { serverName, locations }
    if (clientMaxBodySize?.trim()) site.clientMaxBodySize = clientMaxBodySize.trim()
    const idx = cfg.sites.findIndex(s => s.serverName === serverName)
    if (idx >= 0) cfg.sites[idx] = site
    else cfg.sites.push(site)
    writeConfig(cfg)
    return NextResponse.json({ ok: true, sites: cfg.sites })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { exportMode } = await req.json() as { exportMode?: string }
    if (exportMode !== 'standalone' && exportMode !== 'edge-snippet') {
      return NextResponse.json({ error: 'exportMode must be standalone or edge-snippet' }, { status: 400 })
    }
    const cfg = readConfig()
    cfg.exportMode = exportMode
    writeConfig(cfg)
    return NextResponse.json({ ok: true, exportMode: cfg.exportMode })
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
