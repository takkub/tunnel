import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import path from 'path'
import { runScript } from '@/lib/scripts'
import { TUNNELS_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

function badName(name: string) {
  return !name || !NAME_RE.test(name)
}

export async function GET(req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  if (!existsSync(path.join(TUNNELS_DIR, params.name))) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  const linesParam = new URL(req.url).searchParams.get('lines')
  const lines = Math.min(Math.max(parseInt(linesParam || '200', 10) || 200, 1), 5000)
  try {
    const output = await runScript('tunnel-health.js', [params.name, '--logs', `--lines=${lines}`, '--json'])
    return NextResponse.json(JSON.parse(output))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  if (!existsSync(path.join(TUNNELS_DIR, params.name))) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  try {
    const output = await runScript('tunnel-health.js', [params.name, '--clear-log', '--json'])
    return NextResponse.json(JSON.parse(output))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
