import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export async function POST() {
  try {
    const output = await runScript('fix-app-dns.js')
    return NextResponse.json({ message: 'แก้ DNS แล้ว', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
