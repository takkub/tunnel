import { NextResponse } from 'next/server'
import { getCloudflareSettings, setCloudflareSettings } from '@/lib/settings'
import { getCloudflaredStatus } from '@/lib/cloudflared'
import { isDockerAvailable, getRuntimeMode, getEffectiveMode, setRuntimeMode } from '@/lib/runtime'
import { TUNNEL_DATA_DIR } from '@/lib/paths'

export const dynamic = 'force-dynamic'

function buildSettings() {
  return {
    cloudflare: getCloudflareSettings(),
    runtime: {
      mode: getRuntimeMode(),
      effectiveMode: getEffectiveMode(),
      dockerAvailable: isDockerAvailable(),
      dataDir: TUNNEL_DATA_DIR,
      desktopMode: Boolean(process.env.DESKTOP_MODE),
    },
    cloudflared: getCloudflaredStatus(),
  }
}

export async function GET() {
  return NextResponse.json(buildSettings())
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()

    if (body.cloudflare) {
      setCloudflareSettings({
        apiToken: body.cloudflare.apiToken,
        zoneId: body.cloudflare.zoneId,
      })
    }

    if (body.runtime?.mode !== undefined) {
      if (!['auto', 'docker', 'native'].includes(body.runtime.mode)) {
        return NextResponse.json({ error: 'runtime.mode must be auto, docker, or native' }, { status: 400 })
      }
      setRuntimeMode(body.runtime.mode)
    }

    return NextResponse.json(buildSettings())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
