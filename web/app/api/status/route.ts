import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export async function GET() {
  try {
    const output = await runScript('status.js')
    return NextResponse.json({ message: 'สถานะ tunnels', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
