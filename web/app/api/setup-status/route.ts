import { NextResponse } from 'next/server'
import { getCloudflaredStatus } from '@/lib/cloudflared'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { installed, loggedIn } = getCloudflaredStatus()
  return NextResponse.json({ needsOnboarding: !installed || !loggedIn })
}
