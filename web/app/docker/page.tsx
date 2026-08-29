'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import RefreshButton from '@/components/RefreshButton'

interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
}

type StatusFilter = 'all' | 'running' | 'exited'

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
  const [lines, setLines] = useState<string[]>([])
  const [esError, setEsError] = useState(false)

  useEffect(() => {
    const es = new EventSource(`/api/docker/containers/${container.id}/logs`)
    es.onmessage = (e) => setLines(prev => [...prev, e.data])
    es.onerror = () => { es.close(); setEsError(true) }
    return () => es.close()
  }, [container.id])

  useEffect(() => {
    const pre = preRef.current
    if (pre) pre.scrollTop = pre.scrollHeight
  }, [lines])

  const handleCopy = () => navigator.clipboard.writeText(lines.join('\n'))
  const handleClear = () => setLines([])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-[95vw] bg-zinc-950 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-zinc-200">{container.name}</p>
            <p className="text-xs text-zinc-500 font-mono">{container.id.slice(0, 12)}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              disabled={lines.length === 0}
              title="Copy all"
              aria-label="คัดลอก log ทั้งหมด"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40 text-xs font-mono"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <button
              onClick={handleClear}
              disabled={lines.length === 0}
              title="Clear"
              aria-label="ล้าง log"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              aria-label="ปิด log panel"
            >
              ✕
            </button>
          </div>
        </div>
        <pre
          ref={preRef}
          className="flex-1 overflow-y-auto p-4 text-xs font-mono text-zinc-300 leading-6 whitespace-pre-wrap break-words"
          style={{ background: '#0a0a0c', minHeight: '60vh' }}
        >
          {lines.length === 0
            ? <span className={esError ? 'text-red-400' : 'text-zinc-600'}>
                {esError ? 'เชื่อมต่อ log ไม่สำเร็จ' : 'ยังไม่มี log'}
              </span>
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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

  const filteredContainers = containers.filter(c => {
    const q = search.toLowerCase()
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'running' && c.state === 'running') ||
      (statusFilter === 'exited' && c.state !== 'running')
    return matchesSearch && matchesStatus
  })

  const statusChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: containers.length },
    { key: 'running', label: 'Running', count: containers.filter(c => c.state === 'running').length },
    { key: 'exited', label: 'Exited', count: containers.filter(c => c.state !== 'running').length },
  ]

  return (
    <div className="space-y-4">
      {logTarget && <LogPanel container={logTarget} onClose={() => setLogTarget(null)} />}

      {/* Header */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-zinc-200 mb-1">Docker Containers</h2>
            <p className="text-sm text-zinc-500">จัดการ container — start/stop/restart และดู realtime log</p>
          </div>
          <RefreshButton onClick={() => fetchContainers()} disabled={loading} loading={loading} />
        </div>
      </div>

      {/* Container list */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-3">
        {/* Search + filter */}
        <div className="space-y-2">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา container..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            {statusChips.map(c => (
              <button
                key={c.key}
                onClick={() => setStatusFilter(c.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
                  statusFilter === c.key
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {c.label} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-red-400 py-2">{error}</div>
        ) : filteredContainers.length === 0 ? (
          <p className="text-sm text-zinc-500 py-2">
            {containers.length === 0 ? 'ไม่พบ container' : search ? `ไม่พบ container ที่ตรงกับ "${search}"` : 'ไม่มี container ในหมวดนี้'}
          </p>
        ) : (
          <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {filteredContainers.map(c => {
              const running = c.state === 'running'
              return (
                <li key={c.id} className="flex flex-col items-stretch gap-2 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2 mb-0.5">
                      <p className="text-sm text-zinc-100 font-medium break-all">{c.name}</p>
                      <StateBadge state={c.state} />
                    </div>
                    <p className="text-xs text-zinc-500 font-mono truncate">{c.image}</p>
                    <p className="text-xs text-zinc-600 truncate">{c.status}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
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
