import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { name: string } }) {
  try {
    const { hostname } = await req.json()
    if (!hostname) return NextResponse.json({ error: 'hostname required' }, { status: 400 })
    const output = await runScript('route-dns.js', [params.name, hostname])
    return NextResponse.json({ message: `Route DNS ${hostname} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
