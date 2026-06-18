import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

function check(cmd: string): boolean {
  try { execSync(cmd, { stdio: 'ignore' }); return true } catch { return false }
}

export async function GET() {
  const requirements = {
    'cloudflared': check('cloudflared --version'),
    'docker': check('docker --version'),
    'node': check('node --version'),
  }
  return NextResponse.json({ requirements })
}
