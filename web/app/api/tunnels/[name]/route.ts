import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: { name: string } }) {
  try {
    const output = await runScript('delete-tunnel.js', [params.name])
    return NextResponse.json({ message: `ลบ ${params.name} แล้ว`, output })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
