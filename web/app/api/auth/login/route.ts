import { NextRequest, NextResponse } from 'next/server'
import { signSession, timingSafeEqual } from '@/lib/auth'
import { getEnvValue } from '@/lib/env-file'
import { TUNNEL_DATA_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  // Lazy .env read (not process.env directly) so a password set moments ago
  // via PUT /api/settings — this same server process, no restart — applies
  // right away. See web/lib/settings.ts's setAdminPassword() comment.
  const expected = getEnvValue(TUNNEL_DATA_DIR, 'ADMIN_PASSWORD')
  if (!expected || typeof password !== 'string' || !await timingSafeEqual(password, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const value = await signSession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set('tunnel_session', value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 86_400,
    path: '/',
  })
  return res
}
