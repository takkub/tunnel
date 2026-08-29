'use client'
import { useEffect, useState } from 'react'
import TunnelCard from '@/components/TunnelCard'
import Button from '@/components/Button'
import Toast from '@/components/Toast'
import CreateTunnelModal from '@/components/CreateTunnelModal'
import type { TunnelHealth, TunnelHealthResponse } from '@/lib/health'

interface Tunnel {
  name: string
  running: boolean
  containerId?: string
  hostname?: string
  port?: number | null
  authGate?: { enabled: boolean }
  autostart?: boolean
}

type FilterType = 'all' | 'running' | 'stopped'

export default function DashboardPage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [effectiveMode, setEffectiveMode] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [healthMap, setHealthMap] = useState<Record<string, TunnelHealth>>({})

  const fetchTunnels = async () => {
    const res = await fetch('/api/tunnels')
    const data = await res.json()
    setTunnels(data.tunnels ?? [])
    setLoading(false)
  }

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/tunnels/health')
      if (!res.ok) return
      const data: TunnelHealthResponse = await res.json()
      const map: Record<string, TunnelHealth> = {}
      for (const t of data.tunnels ?? []) map[t.name] = t
      setHealthMap(map)
    } catch { /* API not yet available */ }
  }

  const fetchRuntime = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setEffectiveMode(data.runtime?.effectiveMode ?? null)
      }
    } catch { /* API not yet available */ }
  }

  useEffect(() => {
    fetchTunnels()
    fetchRuntime()
    fetchHealth()
    if (new URLSearchParams(window.location.search).get('create') === '1') {
      setShowCreate(true)
      window.history.replaceState(null, '', '/')
    }
    const interval = setInterval(fetchTunnels, 30000)
    const healthInterval = setInterval(fetchHealth, 10000)
    return () => { clearInterval(interval); clearInterval(healthInterval) }
  }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleStartAll = async () => {
    setBusy('start')
    const res = await fetch('/api/tunnels/start-all', { method: 'POST' })
    const data = await res.json()
    showToast(data.message ?? 'เริ่ม tunnels ทั้งหมด', res.ok ? 'success' : 'error')
    await fetchTunnels()
    setBusy(null)
  }

  const handleStopAll = async () => {
    setBusy('stop')
    const res = await fetch('/api/tunnels/stop-all', { method: 'POST' })
    const data = await res.json()
    showToast(data.message ?? 'หยุด tunnels ทั้งหมด', res.ok ? 'success' : 'error')
    await fetchTunnels()
    setBusy(null)
  }

  const runningCount = tunnels.filter(t => t.running).length
  const isBusy = busy !== null

  const filteredTunnels = tunnels.filter(t => {
    const q = search.toLowerCase()
    const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.hostname?.toLowerCase().includes(q)
    const matchesFilter =
      filter === 'all' || (filter === 'running' && t.running) || (filter === 'stopped' && !t.running)
    return matchesSearch && matchesFilter
  })

  const chips: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', count: tunnels.length },
    { key: 'running', label: 'Running', count: runningCount },
    { key: 'stopped', label: 'Stopped', count: tunnels.length - runningCount },
  ]

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      {showCreate && (
        <CreateTunnelModal
          onSuccess={() => { setShowCreate(false); fetchTunnels() }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Global busy overlay */}
      {isBusy && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl px-6 py-5 flex items-center gap-3 shadow-2xl">
            <span className="w-5 h-5 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
            <span className="text-zinc-200 text-sm font-medium">
              {busy === 'start' ? 'กำลังเริ่ม tunnels...' : 'กำลังหยุด tunnels...'}
            </span>
          </div>
        </div>
      )}

      {/* Page header — R8 (badge inline) + R13 (subtitle) */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-200 mb-1">Tunnels</h2>
          <p className="text-sm text-zinc-500">จัดการ Cloudflare tunnels ทั้งหมด</p>
        </div>
        {effectiveMode && (
          <span
            title={`Runtime: ${effectiveMode}`}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono flex-shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <rect x="2" y="7" width="5" height="4" rx="1" /><rect x="8" y="7" width="5" height="4" rx="1" />
              <rect x="14" y="7" width="5" height="4" rx="1" /><rect x="8" y="2" width="5" height="4" rx="1" />
              <path d="M2 15c0 2.2 1.8 4 4 4h12a4 4 0 004-4v-2H2v2z" />
            </svg>
            Runtime: {effectiveMode}
          </span>
        )}
      </div>

      {/* Toolbar — R7 (outline bulk, icon, divider) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold shadow-glow-orange transition-all duration-150"
        >
          <span className="text-lg leading-none font-light">+</span>
          New Tunnel
        </button>
        <div className="w-px h-6 bg-zinc-700 mx-1 flex-shrink-0" />
        <Button
          onClick={handleStartAll}
          disabled={isBusy || tunnels.length === 0}
          loading={busy === 'start'}
          variant="success-outline"
          className="text-sm"
        >
          {!busy && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          เริ่มทั้งหมด
        </Button>
        <Button
          onClick={handleStopAll}
          disabled={isBusy || runningCount === 0}
          loading={busy === 'stop'}
          variant="danger-outline"
          className="text-sm"
        >
          {!busy && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
          )}
          หยุดทั้งหมด
        </Button>
      </div>

      {/* Stat cards */}
      {!loading && (
        <div className="grid grid-cols-3 sm:flex sm:gap-3 gap-3">
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3 text-center sm:w-32">
            <p className="text-xl font-bold text-zinc-100">{tunnels.length}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Total</p>
          </div>
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3 text-center sm:w-32">
            <p className="text-xl font-bold text-emerald-400">{runningCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Running</p>
          </div>
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3 text-center sm:w-32">
            <p className="text-xl font-bold text-zinc-400">{tunnels.length - runningCount}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Stopped</p>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="sticky top-0 z-30 py-2" style={{ background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(8px)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา tunnel..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          <div className="flex gap-2 sm:flex-shrink-0">
            {chips.map(c => (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`flex-1 sm:flex-none sm:w-28 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
                  filter === c.key
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {c.label} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tunnel list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3" aria-busy="true">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#18181b] border border-zinc-800 rounded-2xl p-4 animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 bg-zinc-800 rounded" />
                <div className="h-5 w-16 bg-zinc-800 rounded-full" />
              </div>
              <div className="h-3 w-24 bg-zinc-900 rounded" />
              <div className="h-10 w-full bg-zinc-900 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredTunnels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-zinc-600">
              <circle cx="12" cy="12" r="9" />
              <path d="M3.6 9h16.8M3.6 15h16.8" />
              <path d="M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z" />
            </svg>
          </div>
          {tunnels.length === 0 ? (
            <>
              <p className="text-zinc-300 font-medium">ยังไม่มี Tunnel</p>
              <p className="text-zinc-400 text-sm mt-1">กด &quot;+ New Tunnel&quot; เพื่อสร้าง tunnel แรก</p>
            </>
          ) : search ? (
            <>
              <p className="text-zinc-300 font-medium">ไม่พบ tunnel ที่ตรงกับคำค้นหา</p>
              <p className="text-zinc-400 text-sm mt-1">&ldquo;{search}&rdquo; — ลองคำค้นหาอื่น</p>
            </>
          ) : (
            <>
              <p className="text-zinc-300 font-medium">ไม่มี tunnel ในหมวดนี้</p>
              <p className="text-zinc-400 text-sm mt-1">ลองเปลี่ยน filter</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filteredTunnels.map(t => (
            <TunnelCard key={t.name} tunnel={t} health={healthMap[t.name]} onRefresh={fetchTunnels} onToast={showToast} />
          ))}
        </div>
      )}
    </div>
  )
}
