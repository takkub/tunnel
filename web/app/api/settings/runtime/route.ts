import { NextResponse } from 'next/server'
import { isDockerAvailable, getRuntimeMode, getEffectiveMode, setRuntimeMode } from '@/lib/runtime'

export const dynamic = 'force-dynamic'

export async function GET() {
  const mode = getRuntimeMode()
  const dockerAvailable = isDockerAvailable()
  const effective = getEffectiveMode()
  return NextResponse.json({ mode, dockerAvailable, effective })
}

export async function POST(req: Request) {
  try {
    const { mode } = await req.json()
    if (!['auto', 'docker', 'native'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be auto, docker, or native' }, { status: 400 })
    }
    setRuntimeMode(mode)
    const dockerAvailable = isDockerAvailable()
    const effective = getEffectiveMode()
    return NextResponse.json({ mode, dockerAvailable, effective })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
