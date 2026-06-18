'use client'
import { useEffect, useState } from 'react'
import TunnelCard from '@/components/TunnelCard'
import Button from '@/components/Button'
import Toast from '@/components/Toast'
import CreateTunnelModal from '@/components/CreateTunnelModal'

interface Tunnel {
  name: string
  running: boolean
  containerId?: string
}

export default function DashboardPage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [effectiveMode, setEffectiveMode] = useState<string | null>(null)

  const fetchTunnels = async () => {
    const res = await fetch('/api/tunnels')
    const data = await res.json()
    setTunnels(data.tunnels ?? [])
    setLoading(false)
  }

  const fetchRuntime = async () => {
    try {
      const res = await fetch('/api/settings/runtime')
      if (res.ok) {
        const data = await res.json()
        setEffectiveMode(data.effective ?? data.mode ?? null)
      }
    } catch {
      // API not yet available — badge stays hidden
    }
  }

  useEffect(() => {
    fetchTunnels()
    fetchRuntime()
    const interval = setInterval(fetchTunnels, 10000)
    return () => clearInterval(interval)
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

  const isBusy = busy !== null

  return (
    <div className="pb-28">
      {toast && <Toast message={toast.msg} type={toast.type} />}
      {showCreate && (
        <CreateTunnelModal
          onSuccess={() => { setShowCreate(false); fetchTunnels() }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Cloudflare Tunnels</h1>
        {effectiveMode && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700 font-mono">
            {effectiveMode}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Button
          onClick={handleStartAll}
          disabled={isBusy}
          loading={busy === 'start'}
          variant="primary"
          className="w-full justify-center"
        >
          เริ่มทั้งหมด
        </Button>
        <Button
          onClick={handleStopAll}
          disabled={isBusy}
          loading={busy === 'stop'}
          variant="danger"
          className="w-full justify-center"
        >
          หยุดทั้งหมด
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true" aria-label="กำลังโหลด">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-gray-900 rounded-2xl p-5 animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 w-32 bg-gray-700 rounded" />
                <div className="h-5 w-16 bg-gray-700 rounded-full" />
              </div>
              <div className="h-10 w-full bg-gray-800 rounded-xl" />
            </div>
          ))}
        </div>
      ) : tunnels.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">☁️</p>
          <p className="text-base">ยังไม่มี tunnel</p>
          <p className="text-sm mt-1">กด + เพื่อสร้าง tunnel ใหม่</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tunnels.map(t => (
            <TunnelCard key={t.name} tunnel={t} onRefresh={fetchTunnels} onToast={showToast} />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-2xl shadow-xl flex items-center justify-center transition-colors z-40"
        aria-label="สร้าง Tunnel"
      >
        +
      </button>
    </div>
  )
}
