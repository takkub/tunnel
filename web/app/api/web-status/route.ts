import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const output = await runScript('web-status.js')
    const { port, publicTunnel } = JSON.parse(output)
    return NextResponse.json({
      port,
      localUrl: `http://localhost:${port}`,
      desktopMode: Boolean(process.env.DESKTOP_MODE),
      publicTunnel,
      // uptime of THIS process (the running web server), not the short-lived
      // web-status.js child that answered the port/tunnel lookup above.
      uptimeSec: Math.round(process.uptime()),
      mode: publicTunnel?.running ? 'online' : 'local-only',
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
