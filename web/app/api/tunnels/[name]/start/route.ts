import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { name: string } }) {
  try {
    const output = await runScript('tunnel-ctrl.js', ['start', params.name])
    return NextResponse.json({ message: `เริ่ม ${params.name} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
