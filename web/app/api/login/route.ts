import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export async function POST() {
  try {
    const output = await runScript('login.js')
    return NextResponse.json({ message: 'Login แล้ว', output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
