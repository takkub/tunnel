import { NextResponse } from 'next/server'
import { getR2Usage } from '@/lib/r2-usage'

export const dynamic = 'force-dynamic'

// Storage/ops summary for the settings page's R2 usage & cost card. Cached
// in-memory for 5 minutes (see r2-usage-core.js) since it lists the whole
// bucket; pass ?refresh=1 to bypass that cache.
export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  try {
    return NextResponse.json(await getR2Usage({ refresh }))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
