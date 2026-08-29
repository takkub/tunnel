import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'
import type { TunnelHealthResponse } from '@/lib/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const output = await runScript('tunnel-health.js', ['--all', '--json'])
    const parsed: TunnelHealthResponse = JSON.parse(output)
    return NextResponse.json(parsed)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
