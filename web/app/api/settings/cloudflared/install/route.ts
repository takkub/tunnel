import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const output = await runScript('settings.js', ['cloudflared-install'])
    const result = JSON.parse(output.trim())
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'install failed' }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
