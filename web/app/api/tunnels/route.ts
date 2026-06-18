import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export async function GET() {
  try {
    // tunnel-status.js handles both docker (exact container name match) and native (.pid) modes
    const output = await runScript('tunnel-status.js')
    const data = JSON.parse(output)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { name, hostname, port } = await req.json()
    if (!name || !hostname || !port) {
      return NextResponse.json({ error: 'name, hostname, port required' }, { status: 400 })
    }
    const safeName = name.trim().toLowerCase()
    const output = await runScript('create-tunnel.js', [safeName, hostname.trim(), String(port)])
    return NextResponse.json({ message: `สร้าง ${safeName} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
