'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
}

function SmallSpinner() {
  return <span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin inline-block" />
}

function StateBadge({ state }: { state: string }) {
  const running = state === 'running'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${running ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700/60 text-zinc-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
      {state}
    </span>
  )
}

function LogPanel({ container, onClose }: { container: Container; onClose: () => void }) {
  const preRef = useRef<HTMLPreElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    const es = new EventSource(`/api/docker/containers/${container.id}/logs`)
    esRef.current = es
    es.onmessage = (e) => {
      setLines(prev => [...prev, e.data])
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [container.id])

  useEffect(() => {
    const pre = preRef.current
    if (pre) pre.scrollTop = pre.scrollHeight
  }, [lines])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-zinc-200">{container.name}</p>
            <p className="text-xs text-zinc-500 font-mono">{container.id.slice(0, 12)}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="ปิด log panel"
          >
            ✕
          </button>
        </div>
        <pre
          ref={preRef}
          className="flex-1 overflow-y-auto p-4 text-xs font-mono text-zinc-300 leading-5 whitespace-pre-wrap break-words"
          style={{ background: '#0a0a0c', minHeight: 200 }}
        >
          {lines.length === 0
            ? <span className="text-zinc-600">กำลังรับ log...</span>
            : lines.join('\n')}
        </pre>
      </div>
    </div>
  )
}

export default function DockerPage() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)
  const [logTarget, setLogTarget] = useState<Container | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchContainers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/docker/containers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setContainers(data.containers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลล้มเหลว')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
    intervalRef.current = setInterval(() => fetchContainers(true), 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchContainers])

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setActioning(`${id}:${action}`)
    try {
      await fetch(`/api/docker/containers/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      await fetchContainers(true)
    } catch { /* backend may not be ready */ }
    finally { setActioning(null) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {logTarget && <LogPanel container={logTarget} onClose={() => setLogTarget(null)} />}

      {/* Header */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-200 mb-1">Docker Containers</h2>
            <p className="text-sm text-zinc-500">จัดการ container — start/stop/restart และดู realtime log</p>
          </div>
          <button
            onClick={() => fetchContainers()}
            disabled={loading}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
          >
            {loading ? 'โหลด...' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {/* Container list */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-3">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-red-400 py-2">{error}</div>
        ) : containers.length === 0 ? (
          <p className="text-sm text-zinc-500">ไม่พบ container</p>
        ) : (
          <ul className="space-y-2">
            {containers.map(c => {
              const running = c.state === 'running'
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm text-zinc-100 font-medium truncate">{c.name}</p>
                      <StateBadge state={c.state} />
                    </div>
                    <p className="text-xs text-zinc-500 font-mono truncate">{c.image}</p>
                    <p className="text-xs text-zinc-600 truncate">{c.status}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!running && (
                      <button
                        onClick={() => handleAction(c.id, 'start')}
                        disabled={actioning !== null}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
                      >
                        {actioning === `${c.id}:start` ? <SmallSpinner /> : null}
                        Start
                      </button>
                    )}
                    {running && (
                      <>
                        <button
                          onClick={() => handleAction(c.id, 'restart')}
                          disabled={actioning !== null}
                          className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
                        >
                          {actioning === `${c.id}:restart` ? <SmallSpinner /> : null}
                          Restart
                        </button>
                        <button
                          onClick={() => handleAction(c.id, 'stop')}
                          disabled={actioning !== null}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1"
                        >
                          {actioning === `${c.id}:stop` ? <SmallSpinner /> : null}
                          Stop
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setLogTarget(c)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 text-xs font-medium transition-colors"
                    >
                      Logs
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
