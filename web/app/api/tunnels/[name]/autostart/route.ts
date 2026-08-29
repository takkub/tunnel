import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import path from 'path'
import { getAutostart, setAutostart } from '@/lib/tunnelMeta'
import { TUNNELS_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

function badName(name: string) {
  return !name || !NAME_RE.test(name)
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  if (!existsSync(path.join(TUNNELS_DIR, params.name))) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  return NextResponse.json({ autostart: getAutostart(params.name) })
}

export async function PUT(req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  if (!existsSync(path.join(TUNNELS_DIR, params.name))) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }

  let body: { autostart?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.autostart !== 'boolean') {
    return NextResponse.json({ error: 'autostart (boolean) required' }, { status: 400 })
  }

  return NextResponse.json({ autostart: setAutostart(params.name, body.autostart) })
}
