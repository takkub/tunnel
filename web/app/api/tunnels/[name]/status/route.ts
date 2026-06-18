import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  try {
    const output = await runScript('tunnel-status.js', [params.name])
    const data = JSON.parse(output)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
