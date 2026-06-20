import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = path.resolve(process.cwd(), '..', 'domains.config.json')

interface DomainEntry { domain: string; zoneId: string }
interface DomainsConfig { domains: DomainEntry[] }

function readConfig(): DomainsConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as DomainsConfig
  } catch {
    return { domains: [] }
  }
}

function writeConfig(cfg: DomainsConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n')
}

export async function GET() {
  return NextResponse.json(readConfig())
}

export async function POST(req: Request) {
  try {
    const { domain, zoneId } = await req.json() as Partial<DomainEntry>
    if (!domain || !zoneId) {
      return NextResponse.json({ error: 'domain and zoneId are required' }, { status: 400 })
    }
    const cfg = readConfig()
    const idx = cfg.domains.findIndex(d => d.domain === domain)
    if (idx >= 0) {
      cfg.domains[idx].zoneId = zoneId
    } else {
      cfg.domains.push({ domain, zoneId })
    }
    writeConfig(cfg)
    return NextResponse.json({ ok: true, domains: cfg.domains })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const domain = searchParams.get('domain')
    if (!domain) {
      return NextResponse.json({ error: 'domain query param required' }, { status: 400 })
    }
    const cfg = readConfig()
    cfg.domains = cfg.domains.filter(d => d.domain !== domain)
    writeConfig(cfg)
    return NextResponse.json({ ok: true, domains: cfg.domains })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
