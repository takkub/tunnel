'use client'
import { useState } from 'react'
import Button from './Button'

interface Tunnel { name: string; running: boolean; hostname?: string }

interface Props {
  tunnel: Tunnel
  onRefresh: () => void
  onToast: (msg: string, type: 'success' | 'error') => void
}

export default function TunnelCard({ tunnel, onRefresh, onToast }: Props) {
  const [busyAction, setBusyAction] = useState<'start' | 'stop' | 'delete' | null>(null)
  const [showDns, setShowDns] = useState(false)
  const [dnsHost, setDnsHost] = useState('')
  const [dnsLoading, setDnsLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const busy = busyAction !== null

  const action = async (type: 'start' | 'stop' | 'delete') => {
    setBusyAction(type)
    const method = type === 'start' || type === 'stop' ? 'POST' : 'DELETE'
    const url = type === 'delete'
      ? `/api/tunnels/${tunnel.name}`
      : `/api/tunnels/${tunnel.name}/${type}`
    const res = await fetch(url, { method })
    const data = await res.json()
    onToast(data.message ?? data.error ?? 'เสร็จแล้ว', res.ok ? 'success' : 'error')
    await onRefresh()
    setBusyAction(null)
    setConfirmDelete(false)
  }

  const routeDns = async () => {
    if (!dnsHost.trim()) return
    setDnsLoading(true)
    const res = await fetch(`/api/tunnels/${tunnel.name}/route-dns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname: dnsHost.trim() }),
    })
    const data = await res.json()
    onToast(data.message ?? data.error ?? 'เสร็จแล้ว', res.ok ? 'success' : 'error')
    setDnsLoading(false)
    setShowDns(false)
    setDnsHost('')
    await onRefresh()
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-5 shadow-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold text-lg text-gray-100">{tunnel.name}</span>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${tunnel.running ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
          {tunnel.running ? 'กำลังทำงาน' : 'หยุด'}
        </span>
      </div>

      {tunnel.hostname && (
        <p className="text-sm text-gray-400 truncate">{tunnel.hostname}</p>
      )}

      <div className="flex gap-2">
        {tunnel.running
          ? (
            <Button
              onClick={() => action('stop')}
              disabled={busy}
              loading={busyAction === 'stop'}
              variant="secondary"
              className="flex-1"
            >
              {busyAction === 'stop' ? 'กำลังหยุด...' : 'หยุด'}
            </Button>
          ) : (
            <Button
              onClick={() => action('start')}
              disabled={busy}
              loading={busyAction === 'start'}
              variant="primary"
              className="flex-1 !bg-green-600 hover:!bg-green-700"
            >
              {busyAction === 'start' ? 'กำลังเริ่ม...' : 'เริ่ม'}
            </Button>
          )
        }
        <button
          onClick={() => { setShowDns(v => !v); setDnsHost('') }}
          disabled={busy}
          aria-label="Route DNS"
          title="Route DNS"
          className="min-h-[48px] w-12 rounded-xl bg-gray-800 hover:bg-blue-900 text-blue-400 text-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          🌐
        </button>
        {confirmDelete ? (
          <>
            <button
              onClick={() => action('delete')}
              disabled={busy}
              aria-label="ยืนยันลบ tunnel"
              className="min-h-[48px] px-3 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm disabled:opacity-50 transition-colors"
            >
              {busyAction === 'delete' ? '...' : 'ยืนยัน'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              aria-label="ยกเลิกการลบ"
              className="min-h-[48px] w-12 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm disabled:opacity-50 transition-colors"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            aria-label="ลบ tunnel"
            className="min-h-[48px] w-12 rounded-xl bg-gray-800 hover:bg-red-900 text-red-400 text-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🗑️
          </button>
        )}
      </div>

      {showDns && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={dnsHost}
            onChange={e => setDnsHost(e.target.value)}
            placeholder="sub.sabuytube.xyz"
            aria-label="Hostname สำหรับ DNS route"
            className="flex-1 bg-gray-800 text-gray-100 text-sm rounded-xl px-3 py-2 outline-none border border-gray-700 focus:border-blue-500 min-h-[40px]"
            onKeyDown={e => e.key === 'Enter' && routeDns()}
          />
          <button
            onClick={routeDns}
            disabled={dnsLoading || !dnsHost.trim()}
            className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-sm min-h-[40px] disabled:opacity-50"
          >
            {dnsLoading ? '...' : 'ยืนยัน'}
          </button>
          <button
            onClick={() => { setShowDns(false); setDnsHost('') }}
            className="px-3 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm min-h-[40px]"
          >
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  )
}
