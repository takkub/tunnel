import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

function badName(name: string) {
  return !name || !NAME_RE.test(name)
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  try {
    const output = await runScript('auth-gate.js', ['status', params.name])
    return NextResponse.json(JSON.parse(output))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }

  let body: { enabled?: boolean; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { enabled, password } = body
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
  }

  try {
    if (!enabled) {
      const output = await runScript('auth-gate.js', ['disable', params.name])
      return NextResponse.json(JSON.parse(output))
    }

    if (password) {
      const output = await runScript('auth-gate.js', ['enable', params.name, password])
      return NextResponse.json(JSON.parse(output))
    }

    // enabled:true with no password — only valid as a no-op re-save of an already-enabled gate
    const current = JSON.parse(await runScript('auth-gate.js', ['status', params.name]))
    if (!current.enabled) {
      return NextResponse.json({ error: 'password required to enable' }, { status: 400 })
    }
    return NextResponse.json(current)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
