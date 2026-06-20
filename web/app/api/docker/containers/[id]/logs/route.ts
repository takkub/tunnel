import { spawn } from 'child_process'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!id) {
    return new Response('container id required', { status: 400 })
  }

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn('docker', ['logs', '-f', '--tail', '200', id], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      function pushLine(chunk: Buffer) {
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          if (line) {
            controller.enqueue(`data: ${line}\n\n`)
          }
        }
      }

      child.stdout.on('data', pushLine)
      child.stderr.on('data', pushLine)

      child.on('error', (err) => {
        controller.enqueue(`data: [error] ${err.message}\n\n`)
        controller.close()
      })

      child.on('close', () => {
        try { controller.close() } catch { /* already closed */ }
      })

      req.signal.addEventListener('abort', () => {
        child.kill()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
