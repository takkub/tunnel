// Resolves the absolute origin a client actually reached this server through,
// so a redirect Location doesn't leak the internal bind address (e.g.
// http://localhost:8888) when the request came in via a reverse proxy or a
// cloudflared tunnel that preserves the public Host header.
//
// Deliberately ignores x-forwarded-proto: Next's own standalone server (see
// web-serve.js) fills that header in from the *raw local connection's*
// protocol whenever a request arrives without one already set — confirmed
// empirically — and since cloudflared always proxies to this origin over
// plain HTTP (TLS is terminated at Cloudflare's edge, not here), that default
// is 'http' for tunneled traffic too, defeating the whole point. host is the
// only signal that survives intact end-to-end (also confirmed empirically).
//
// req.nextUrl.host is *not* a reliable "did this come through a proxy" signal
// either — in a real request it's rewritten to this server's own bind
// address regardless of the incoming Host header, so it's useless for
// detecting a proxy; loopback-ness of the *resolved* host is what we use
// instead (this app only ever binds to localhost/127.0.0.1 for direct use —
// anything else reached us through the tunnel, which is always TLS).
function isLoopbackHost(host) {
  // Strip a port suffix without mangling a bare/bracketed IPv6 address:
  // '[::1]:8888' -> '::1' (bracketed form always carries a port here),
  // 'localhost:8888' -> 'localhost' (exactly one colon = host:port), but
  // a bare '::1' (no brackets, no port) has 2+ colons and must pass through
  // untouched, or naively splitting on ':' would take '' and never match.
  let hostname = host
  if (host.startsWith('[')) {
    hostname = host.slice(1, host.indexOf(']'))
  } else if (host.split(':').length === 2) {
    hostname = host.split(':')[0]
  }
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

// The public-facing host a client actually reached this server through —
// same signal resolveOrigin() and middleware.ts's DESKTOP_MODE gate both key
// off of, kept in one place so they can't drift apart.
function resolveHost(headers, internalHost) {
  return headers.get('x-forwarded-host') || headers.get('host') || internalHost
}

function resolveOrigin(headers, internalHost, internalProtocol) {
  const host = resolveHost(headers, internalHost)
  const proto = isLoopbackHost(host) ? internalProtocol.replace(':', '') : 'https'
  return `${proto}://${host}`
}

module.exports = { resolveOrigin, resolveHost, isLoopbackHost }
