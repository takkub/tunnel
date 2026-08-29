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
  const hostname = host.split(':')[0]
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function resolveOrigin(headers, internalHost, internalProtocol) {
  const host = headers.get('x-forwarded-host') || headers.get('host') || internalHost
  const proto = isLoopbackHost(host) ? internalProtocol.replace(':', '') : 'https'
  return `${proto}://${host}`
}

module.exports = { resolveOrigin }
