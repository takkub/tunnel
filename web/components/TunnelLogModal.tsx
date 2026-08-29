'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  tunnelName: string
  onClose: () => void
}

export default function TunnelLogModal({ tunnelName, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [copied, setCopied] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/tunnels/${tunnelName}/logs?lines=200`)
      if (res.status === 404) {
        setError('ยังไม่รองรับการดู log สำหรับ tunnel นี้')
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'โหลด log ไม่สำเร็จ')
      setLines(data.lines ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลด log ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tunnelName, autoRefresh])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  const copyLogs = () => {
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const lineClass = (line: string) => {
    if (/\bERR(OR)?\b/i.test(line)) return 'text-red-400'
    if (/\bWRN|WARN(ING)?\b/i.test(line)) return 'text-yellow-400'
    return 'text-zinc-300'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl max-h-[85vh] flex flex-col p-5 animate-slide-up
                   md:relative md:rounded-2xl md:max-h-[80vh] md:max-w-2xl md:w-full md:shadow-2xl"
        style={{ background: '#18181b', border: '1px solid #27272a' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 w-10 h-1 rounded-full bg-zinc-700 md:hidden" />

        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-lg font-semibold text-zinc-100 truncate">Log — {tunnelName}</h2>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setAutoRefresh(v => !v)}
              aria-pressed={autoRefresh}
              title="Auto-refresh ทุก 5 วินาที"
              className={`px-2.5 h-9 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                autoRefresh
                  ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-orange-400 animate-pulse-dot' : 'bg-zinc-600'}`} />
              Auto
            </button>
            <button
              type="button"
              onClick={fetchLogs}
              aria-label="Refresh"
              className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
            <button
              type="button"
              onClick={copyLogs}
              disabled={lines.length === 0}
              aria-label="Copy log"
              className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 flex items-center justify-center transition-colors"
            >
              {copied ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center text-sm transition-colors">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[240px] overflow-y-auto rounded-xl bg-zinc-950 border border-zinc-800 p-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <span className="w-6 h-6 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-zinc-500 py-6 text-center">{error}</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-zinc-600 py-6 text-center">ยังไม่มี log</p>
          ) : (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
              {lines.map((line, i) => (
                <div key={i} className={lineClass(line)}>{line}</div>
              ))}
              <div ref={bottomRef} />
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
