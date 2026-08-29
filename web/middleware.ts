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
  // A relative Location, not NextResponse.redirect(loginUrl) — that would
  // resolve against Next's own view of this request's origin (this server's
  // internal host:port), not the public hostname a client actually reached
  // us through (e.g. via a cloudflared tunnel or reverse proxy). Same class
  // of bug as auth-gate.js's nginx `absolute_redirect off;` fix; browsers
  // resolve a relative Location against whatever origin they're looking at.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: loginUrl.pathname + loginUrl.search },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
