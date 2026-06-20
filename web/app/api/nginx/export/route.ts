import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const stdout = await runScript('nginx-gen.js')
    const result = JSON.parse(stdout.trim()) as { ok: boolean; path: string; files: string[] }
    return NextResponse.json({ ok: true, path: result.path, files: result.files })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
