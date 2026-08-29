import { NextResponse } from 'next/server'
import { getCloudflaredStatus } from '@/lib/cloudflared'
import { getCloudflareSettings, getAdminSettings } from '@/lib/settings'
import { computeNeedsOnboarding } from '@/lib/setup-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { installed, loggedIn } = getCloudflaredStatus()
  const cloudflare = getCloudflareSettings()
  const admin = getAdminSettings()
  const desktopMode = Boolean(process.env.DESKTOP_MODE)

  const steps = {
    cloudflaredInstalled: installed,
    loggedIn,
    tokenSet: cloudflare.apiTokenSet,
    zoneSet: Boolean(cloudflare.zoneId),
    adminPasswordSet: admin.passwordSet,
  }

  const needsOnboarding = computeNeedsOnboarding({
    installed,
    loggedIn,
    zoneSet: steps.zoneSet,
    adminPasswordSet: steps.adminPasswordSet,
    desktopMode,
  })

  return NextResponse.json({ needsOnboarding, steps })
}
