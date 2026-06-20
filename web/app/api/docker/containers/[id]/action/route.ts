import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

const ALLOWED_ACTIONS = new Set(['start', 'stop', 'restart'])

// Names/patterns that identify the web admin container itself
const WEB_SELF_PATTERNS = ['tunnel-web', 'tunnel_tunnel-web']

function isSelfContainer(id: string, name: string): boolean {
  // hostname inside container = short container ID
  const selfId = os.hostname()
  if (id === selfId || id.startsWith(selfId) || selfId.startsWith(id)) return true
  return WEB_SELF_PATTERNS.some(
    (p) => name.includes(p) || id.includes(p),
  )
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!id) {
    return NextResponse.json({ error: 'container id required' }, { status: 400 })
  }

  let action: string
  try {
    const body = await req.json() as { action?: string }
    action = body.action ?? ''
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: 'action must be one of: start, stop, restart' },
      { status: 400 },
    )
  }

  // Resolve container name to check self-guard
  let containerName = ''
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect', '--format', '{{.Name}}', id,
    ])
    containerName = stdout.trim().replace(/^\//, '')
  } catch {
    // container may not exist — let the action fail with proper error below
  }

  if ((action === 'stop' || action === 'restart') && isSelfContainer(id, containerName)) {
    return NextResponse.json(
      { error: 'ไม่สามารถ stop/restart เว็บ admin ตัวเองได้' },
      { status: 400 },
    )
  }

  try {
    const { stdout, stderr } = await execFileAsync('docker', [action, id])
    return NextResponse.json({
      ok: true,
      message: `${action} ${id} สำเร็จ`,
      output: (stdout + stderr).trim(),
    })
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
    return NextResponse.json(
      { error: err.stderr ?? err.stdout ?? err.message ?? String(e) },
      { status: 500 },
    )
  }
}
