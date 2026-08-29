import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const output = await runScript('tunnel-health.js', ['--all', '--json'])
    return NextResponse.json(JSON.parse(output))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
