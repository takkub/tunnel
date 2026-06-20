import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

interface DockerContainer {
  id: string
  name: string
  image: string
  state: string
  status: string
}

export async function GET() {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '-a',
      '--format', '{{json .}}',
    ])
    const containers: DockerContainer[] = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const obj = JSON.parse(line) as Record<string, string>
        return {
          id: obj.ID ?? obj.Id ?? '',
          name: (obj.Names ?? '').replace(/^\//, ''),
          image: obj.Image ?? '',
          state: obj.State ?? '',
          status: obj.Status ?? '',
        }
      })
    return NextResponse.json({ containers })
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string }
    return NextResponse.json(
      { error: err.stderr ?? err.message ?? String(e) },
      { status: 500 },
    )
  }
}
