import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const output = await runScript('stop-all.js')
    return NextResponse.json({ message: 'หยุด tunnels ทั้งหมดแล้ว', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
