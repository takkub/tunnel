import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tunnel = searchParams.get('tunnel')
  try {
    const args = tunnel ? [tunnel] : []
    const output = await runScript('check-dns.js', args)
    return NextResponse.json({ message: 'ตรวจสอบ DNS แล้ว', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
