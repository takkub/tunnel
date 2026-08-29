import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface CfZone {
  id: string
  name: string
  status: string
}

interface VerifyResult {
  valid: boolean
  zones?: CfZone[]
  error?: string
}

// Lets the setup wizard confirm a Cloudflare API token works, and lists the
// zones it can see, so the user picks a zone by name instead of having to
// find its Zone ID by hand. Cloudflare's token-verify endpoint can't
// introspect a token's exact permission scopes, so an active token that
// returns zero zones is treated as the practical signal that it's missing
// Zone.DNS.Edit on the intended domain.
async function verifyToken(apiToken: string): Promise<VerifyResult> {
  const headers = { Authorization: `Bearer ${apiToken}` }

  const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers })
  const verifyBody: any = await verifyRes.json().catch(() => null)
  if (!verifyRes.ok || !verifyBody?.success || verifyBody?.result?.status !== 'active') {
    return { valid: false, error: 'Invalid or inactive Cloudflare API token' }
  }

  const zonesRes = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', { headers })
  const zonesBody: any = await zonesRes.json().catch(() => null)
  if (!zonesRes.ok || !zonesBody?.success) {
    return { valid: false, error: 'Token is valid but could not list zones' }
  }

  const zones: CfZone[] = (zonesBody.result || []).map((z: any) => ({ id: z.id, name: z.name, status: z.status }))
  if (zones.length === 0) {
    return { valid: false, error: 'Token is active but has no zone access — grant it Zone.DNS.Edit on the target domain' }
  }

  return { valid: true, zones }
}

// Never logs apiToken — only ever forwarded as a Bearer header to Cloudflare.
export async function POST(req: Request) {
  const { apiToken } = (await req.json().catch(() => ({}))) as { apiToken?: string }
  if (!apiToken || typeof apiToken !== 'string') {
    return NextResponse.json({ valid: false, error: 'apiToken is required' } satisfies VerifyResult)
  }

  try {
    return NextResponse.json(await verifyToken(apiToken))
  } catch (e) {
    return NextResponse.json({ valid: false, error: e instanceof Error ? e.message : String(e) } satisfies VerifyResult)
  }
}
