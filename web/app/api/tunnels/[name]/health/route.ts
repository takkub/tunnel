import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import path from 'path'
import { runScript } from '@/lib/scripts'
import { TUNNELS_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (!params.name || !NAME_RE.test(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  if (!existsSync(path.join(TUNNELS_DIR, params.name))) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  try {
    const output = await runScript('tunnel-health.js', [params.name, '--json'])
    return NextResponse.json(JSON.parse(output))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
