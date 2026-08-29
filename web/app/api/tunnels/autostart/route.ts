import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const output = await runScript('autostart.js', ['--json'])
    const data = JSON.parse(output)
    return NextResponse.json({ started: data.started, skipped: data.skipped, failed: data.failed })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
