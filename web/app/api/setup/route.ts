import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export async function POST(req: Request) {
  try {
    const { name } = await req.json()
    if (!name) return NextResponse.json({ error: 'ต้องการชื่อ tunnel' }, { status: 400 })
    const output = await runScript('setup-tunnel.js', [name])
    return NextResponse.json({ message: `สร้าง ${name} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
