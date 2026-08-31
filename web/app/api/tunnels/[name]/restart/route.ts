import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import path from 'path'
import { runScript } from '@/lib/scripts'
import { TUNNELS_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

// Unlike /start (idempotent no-op if already running), this always stops
// then starts — including a "foreign" native process the app never recorded
// a .pid for (see runtime.js's nativeRunningDetail / health 'foreign' state).
// That's how a stuck-foreign tunnel gets handed back under app management.
export async function POST(_req: Request, { params }: { params: { name: string } }) {
  const tunnelDir = path.join(TUNNELS_DIR, params.name)
  if (!existsSync(tunnelDir)) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  try {
    const output = await runScript('tunnel-ctrl.js', ['restart', params.name])
    return NextResponse.json({ message: `รีสตาร์ท ${params.name} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
