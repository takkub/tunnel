'use client'
import { useEffect, useRef, useState } from 'react'

interface Props { url: string }

type LevelFilter = 'all' | 'error' | 'warn' | 'info'

function getLevel(line: string): 'error' | 'warn' | 'info' {
  const l = line.toLowerCase()
  if (/\b(err|error|fatal|crit)\b/.test(l)) return 'error'
  if (/\b(warn|warning)\b/.test(l)) return 'warn'
  return 'info'
}

const levelColors: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-emerald-400/90 hover:text-emerald-300',
}

export default function LogViewer({ url }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const start = () => {
    if (esRef.current) { esRef.current.close() }
    setLines([])
    setRunning(true)
    setConnected(false)
    const es = new EventSource(url)
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onmessage = e => {
      setLines(prev => [...prev, e.data])
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    es.onerror = () => { setConnected(false); setRunning(false); es.close() }
  }

  const stop = () => {
    esRef.current?.close()
    setRunning(false)
    setConnected(false)
  }

  const clear = () => setLines([])

  useEffect(() => () => { esRef.current?.close() }, [])

  const filteredLines = levelFilter === 'all' ? lines : lines.filter(l => getLevel(l) === levelFilter)

  const levelChips: { key: LevelFilter; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: 'text-zinc-400 border-zinc-700 bg-zinc-800 hover:border-zinc-600' },
    { key: 'error', label: 'Error', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
    { key: 'warn', label: 'Warn', color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
    { key: 'info', label: 'Info', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  ]

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={start}
          disabled={running}
          className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center gap-2"
        >
          {running && connected && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
          {running ? 'Streaming...' : 'เริ่ม Stream'}
        </button>
        <button
          onClick={stop}
          disabled={!running}
          className="min-h-[40px] px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          หยุด
        </button>
        <button
          onClick={clear}
          disabled={lines.length === 0}
          className="min-h-[40px] px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 hover:text-zinc-200"
        >
          ล้าง
        </button>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Level filter chips */}
      <div className="flex gap-1.5">
        {levelChips.map(c => (
          <button
            key={c.key}
            onClick={() => setLevelFilter(c.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all duration-150 ${
              levelFilter === c.key
                ? c.color
                : 'text-zinc-500 border-zinc-800 bg-zinc-900 hover:text-zinc-400'
            }`}
          >
            {c.label}
          </button>
        ))}
        {levelFilter !== 'all' && (
          <span className="ml-auto text-xs text-zinc-500 self-center">
            {filteredLines.length} / {lines.length}
          </span>
        )}
      </div>

      {/* Terminal */}
      <div
        className="flex-1 rounded-2xl overflow-auto font-mono text-xs leading-relaxed p-4"
        style={{ background: '#0a0a0a', border: '1px solid #27272a', minHeight: '200px' }}
      >
        {filteredLines.length === 0 ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="text-zinc-700">❯</span>
            <span>{running ? 'รอข้อมูล...' : 'กด "เริ่ม Stream" เพื่อดู logs'}</span>
          </div>
        ) : (
          <>
            {filteredLines.map((l, i) => (
              <div key={i} className={`py-px transition-colors ${levelColors[getLevel(l)]}`}>{l}</div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
