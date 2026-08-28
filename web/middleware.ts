import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from './lib/auth'

// _next/static, _next/image, favicon.ico are excluded by the matcher config below
const PUBLIC_PATTERNS = [
  /^\/login$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/logout$/,
]

export async function middleware(req: NextRequest) {
  // Desktop app, no ADMIN_PASSWORD configured: the OS login already gates
  // access to this machine, so the extra password gate is skipped. If the
  // user explicitly sets ADMIN_PASSWORD it still applies, even in the app.
  if (process.env.DESKTOP_MODE === '1' && !process.env.ADMIN_PASSWORD) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (PUBLIC_PATTERNS.some(p => p.test(pathname))) return NextResponse.next()

  const cookieVal = req.cookies.get('tunnel_session')?.value
  if (cookieVal && await verifySession(cookieVal)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
