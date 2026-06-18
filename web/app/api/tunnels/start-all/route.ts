import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const output = await runScript('start-all.js')
    return NextResponse.json({ message: 'เริ่ม tunnels ทั้งหมดแล้ว', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
