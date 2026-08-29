import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import path from 'path'
import { runScript } from '@/lib/scripts'
import { TUNNELS_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

// Generous but finite — delete-tunnel.js's own steps are individually bounded
// (docker: 20s, cloudflared: 30s x2, DNS: 10s per record) and add up to well
// under this; it exists as a last-resort net, not the primary bound.
const DELETE_TIMEOUT_MS = 90000

export async function DELETE(_req: Request, { params }: { params: { name: string } }) {
  const tunnelDir = path.join(TUNNELS_DIR, params.name)
  if (!existsSync(tunnelDir)) {
    return NextResponse.json({ error: `Tunnel '${params.name}' not found` }, { status: 404 })
  }
  try {
    const output = await runScript('delete-tunnel.js', [params.name], { timeoutMs: DELETE_TIMEOUT_MS })
    const hadWarnings = /step\(s\) that did not fully succeed/.test(output)
    return NextResponse.json({
      message: hadWarnings ? `ลบ ${params.name} แล้ว (มีบางขั้นตอนไม่สำเร็จ ดู log)` : `ลบ ${params.name} แล้ว`,
      output,
    })
  } catch (e) {
    console.error(e)
    const message = e instanceof Error ? e.message : String(e)
    const isTimeout = /timed out after/.test(message)
    return NextResponse.json({ error: message }, { status: isTimeout ? 504 : 500 })
  }
}
