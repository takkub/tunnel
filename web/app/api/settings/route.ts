import { NextResponse } from 'next/server'
import { getCloudflareSettings, setCloudflareSettings, getDesktopSettings, setDesktopSettings, getAdminSettings, setAdminPassword } from '@/lib/settings'
import { getCloudflaredStatus } from '@/lib/cloudflared'
import { isDockerAvailable, getRuntimeMode, getEffectiveMode, setRuntimeMode } from '@/lib/runtime'
import { TUNNEL_DATA_DIR } from '@/lib/paths'
import { getAppVersion } from '@/lib/version'

export const dynamic = 'force-dynamic'

const MIN_ADMIN_PASSWORD_LENGTH = 8

function buildSettings() {
  return {
    cloudflare: getCloudflareSettings(),
    desktop: getDesktopSettings(),
    admin: getAdminSettings(),
    runtime: {
      mode: getRuntimeMode(),
      effectiveMode: getEffectiveMode(),
      dockerAvailable: isDockerAvailable(),
      dataDir: TUNNEL_DATA_DIR,
      desktopMode: Boolean(process.env.DESKTOP_MODE),
    },
    cloudflared: getCloudflaredStatus(),
    appVersion: getAppVersion(),
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
        zoneName: body.cloudflare.zoneName,
      })
    }

    if (body.admin?.password !== undefined) {
      if (typeof body.admin.password !== 'string' || body.admin.password.length < MIN_ADMIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `admin.password must be a string of at least ${MIN_ADMIN_PASSWORD_LENGTH} characters` },
          { status: 400 }
        )
      }
      setAdminPassword(body.admin.password)
    }

    if (body.desktop) {
      if (
        body.desktop.webPort !== undefined &&
        body.desktop.webPort !== null &&
        body.desktop.webPort !== 0 &&
        (!Number.isInteger(body.desktop.webPort) || body.desktop.webPort < 1 || body.desktop.webPort > 65535)
      ) {
        return NextResponse.json({ error: 'desktop.webPort must be an integer between 1 and 65535, or 0/null to clear it' }, { status: 400 })
      }
      setDesktopSettings({
        launchAtLogin: body.desktop.launchAtLogin,
        autostartTunnelsOnLaunch: body.desktop.autostartTunnelsOnLaunch,
        webPort: body.desktop.webPort,
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
