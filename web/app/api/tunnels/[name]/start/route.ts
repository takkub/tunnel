import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import path from 'path'
import { runScript } from '@/lib/scripts'
import { TUNNEL_DATA_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { name: string } }) {
  const tunnelDir = path.join(TUNNEL_DATA_DIR, 'tunnels', params.name)
  if (!existsSync(tunnelDir)) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  try {
    const output = await runScript('tunnel-ctrl.js', ['start', params.name])
    return NextResponse.json({ message: `เริ่ม ${params.name} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
