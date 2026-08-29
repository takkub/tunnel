import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { getCloudflaredStatus } from '@/lib/cloudflared'
import { getEffectiveMode } from '@/lib/runtime'

export const dynamic = 'force-dynamic'

function check(cmd: string): boolean {
  try { execSync(cmd, { stdio: 'ignore' }); return true } catch { return false }
}

export async function GET() {
  // docker is optional in native mode — cloudflared runs the tunnel directly
  // and never shells out to docker, so a missing docker install isn't a real
  // requirement there.
  const requirements = {
    'cloudflared': getCloudflaredStatus().installed,
    'docker': { ok: check('docker --version'), optional: getEffectiveMode() === 'native' },
    'node': check('node --version'),
  }
  return NextResponse.json({ requirements })
}
