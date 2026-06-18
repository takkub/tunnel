import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { tunnelId, domain, oldTunnelId } = body as Record<string, string>
    if (!tunnelId || !domain) {
      return NextResponse.json(
        { error: 'ต้องระบุ Tunnel ID และ Domain' },
        { status: 400 }
      )
    }
    const args = [tunnelId, domain, ...(oldTunnelId ? [oldTunnelId] : [])]
    const output = await runScript('fix-app-dns.js', args)
    return NextResponse.json({ message: 'แก้ DNS แล้ว', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
