import { NextResponse } from 'next/server'
import { getUpdateStatus, requestUpdateAction } from '@/lib/update'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getUpdateStatus())
}

export async function POST(req: Request) {
  try {
    const { action } = await req.json()
    if (action !== 'check' && action !== 'install') {
      return NextResponse.json({ error: 'action must be check or install' }, { status: 400 })
    }
    requestUpdateAction(action)
    return NextResponse.json(getUpdateStatus())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
