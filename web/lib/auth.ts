// HMAC-signed cookie helpers — works in both Edge Runtime and Node.js 18+

const SECRET_PLACEHOLDERS = new Set(['dev-secret-change-me', 'change-me-to-a-long-random-secret'])

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || !s.trim() || SECRET_PLACEHOLDERS.has(s)) {
    throw new Error(
      'SESSION_SECRET must be set to a strong random secret (not a placeholder). ' +
      'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return s
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  const pairs = hex.match(/../g)
  if (!pairs || pairs.length * 2 !== hex.length) return null
  return new Uint8Array(pairs.map(h => parseInt(h, 16))) as Uint8Array<ArrayBuffer>
}

export async function signSession(): Promise<string> {
  const ts = Date.now().toString()
  const key = await importKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts))
  return `${ts}.${toHex(sig)}`
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode('eq'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(b))
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(a))
}

export async function verifySession(value: string): Promise<boolean> {
  const dot = value.lastIndexOf('.')
  if (dot === -1) return false
  const ts = value.slice(0, dot)
  const sigHex = value.slice(dot + 1)
  const age = Date.now() - parseInt(ts, 10)
  if (isNaN(age) || age < 0 || age > 7 * 86_400_000) return false
  try {
    const key = await importKey()
    const sigBuf = fromHex(sigHex)
    if (!sigBuf) return false
    return await crypto.subtle.verify('HMAC', key, sigBuf, new TextEncoder().encode(ts))
  } catch {
    return false
  }
}
