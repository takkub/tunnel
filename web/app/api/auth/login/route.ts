import { NextRequest, NextResponse } from 'next/server'
import { signSession, timingSafeEqual } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  const expected = process.env.ADMIN_PASSWORD
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
