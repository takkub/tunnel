import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { name: string } }) {
  let body: { hostname?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { hostname } = body
  if (!hostname) return NextResponse.json({ error: 'hostname required' }, { status: 400 })
  try {
    const output = await runScript('route-dns.js', [params.name, hostname])
    return NextResponse.json({ message: `Route DNS ${hostname} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
