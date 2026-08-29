import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from './lib/auth'
import { resolveOrigin, resolveHost, isLoopbackHost } from './lib/redirect-origin'

// _next/static, _next/image, favicon.ico are excluded by the matcher config below
const PUBLIC_PATTERNS = [
  /^\/login$/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/logout$/,
]

export async function middleware(req: NextRequest) {
  // Desktop app, no ADMIN_PASSWORD configured: the OS login already gates
  // access to this machine, so the extra password gate is skipped — but only
  // for requests that actually reached us over loopback. A request arriving
  // via a cloudflared tunnel (Host is the public domain, not
  // localhost/127.0.0.1/::1) must never fall through this bypass just
  // because the desktop app forgot to configure ADMIN_PASSWORD, or anyone
  // who finds the tunnel URL gets in with no auth at all.
  if (process.env.DESKTOP_MODE === '1' && !process.env.ADMIN_PASSWORD) {
    const host = resolveHost(req.headers, req.nextUrl.host)
    if (isLoopbackHost(host)) return NextResponse.next()
    return new NextResponse('Forbidden: set ADMIN_PASSWORD before exposing this app via a tunnel', { status: 403 })
  }

  const { pathname } = req.nextUrl
  if (PUBLIC_PATTERNS.some(p => p.test(pathname))) return NextResponse.next()

  const cookieVal = req.cookies.get('tunnel_session')?.value
  if (cookieVal && await verifySession(cookieVal)) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  // NextResponse.redirect() requires an absolute URL (a relative Location
  // header crashes Next 14's middleware runtime with ERR_INVALID_URL), so we
  // build one from the request's forwarded/Host headers rather than Next's
  // own view of this request's origin (this server's internal host:port) —
  // that's not the public hostname a client actually reached us through
  // (e.g. via a cloudflared tunnel or reverse proxy). Same class of bug as
  // auth-gate.js's nginx `absolute_redirect off;` fix.
  const origin = resolveOrigin(req.headers, req.nextUrl.host, req.nextUrl.protocol)
  return NextResponse.redirect(new URL(loginUrl.pathname + loginUrl.search, origin))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
