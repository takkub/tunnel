'use client'
import { useState } from 'react'

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
  const [copied, setCopied] = useState(false)

  const busy = busyAction !== null
  const hasHostname = !!(tunnel.hostname && tunnel.hostname !== 'cfd')

  const action = async (type: 'start' | 'stop' | 'delete') => {
    setBusyAction(type)
    const method = type === 'delete' ? 'DELETE' : 'POST'
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

  const copyHostname = () => {
    if (!tunnel.hostname) return
    navigator.clipboard.writeText(tunnel.hostname)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`rounded-xl overflow-hidden transition-all duration-200 ${
      tunnel.running
        ? 'bg-[#18181b] border border-zinc-800 border-l-[3px] border-l-emerald-500'
        : 'bg-[#18181b] border border-zinc-800'
    }`}>
      <div className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-zinc-100 text-sm truncate">{tunnel.name}</p>
            {hasHostname && (
              <div className="flex items-center gap-1 mt-0.5">
                <p className="text-xs text-zinc-500 truncate">{tunnel.hostname}</p>
                <button
                  onClick={copyHostname}
                  aria-label="คัดลอก hostname"
                  className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  {copied ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-emerald-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
            tunnel.running
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              tunnel.running ? 'bg-emerald-400 animate-pulse-dot' : 'bg-zinc-600'
            }`} />
            {tunnel.running ? 'Running' : 'Stopped'}
          </div>
        </div>

        {/* Actions row */}
        <div className="flex gap-1.5">
          {tunnel.running ? (
            <button
              onClick={() => action('stop')}
              disabled={busy}
              className="flex-1 min-h-[44px] rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-1.5"
            >
              {busyAction === 'stop' && <span className="w-3 h-3 border-2 border-zinc-400/30 border-t-zinc-300 rounded-full animate-spin" />}
              หยุด
            </button>
          ) : (
            <button
              onClick={() => action('start')}
              disabled={busy}
              className="flex-1 min-h-[44px] rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500 hover:text-white hover:border-emerald-500 active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-1.5"
            >
              {busyAction === 'start' && <span className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-300 rounded-full animate-spin" />}
              เริ่ม
            </button>
          )}

          {/* DNS button */}
          <button
            onClick={() => { setShowDns(v => !v); setDnsHost('') }}
            disabled={busy}
            aria-label="Route DNS"
            title="Route DNS"
            className={`min-h-[44px] w-11 rounded-lg border text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center ${
              showDns
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </button>

          {/* Delete button */}
          {confirmDelete ? (
            <>
              <button
                onClick={() => action('delete')}
                disabled={busy}
                className="min-h-[44px] px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-40 transition-all duration-150 flex items-center gap-1"
              >
                {busyAction === 'delete'
                  ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : 'ยืนยัน'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="min-h-[44px] w-11 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 disabled:opacity-40 transition-all duration-150 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              aria-label="ลบ tunnel"
              className="min-h-[44px] w-11 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-500 hover:border-red-800 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
            </button>
          )}
        </div>

        {/* DNS expand */}
        {showDns && (
          <div className="flex gap-1.5 items-center animate-slide-up">
            <input
              type="text"
              value={dnsHost}
              onChange={e => setDnsHost(e.target.value)}
              placeholder="sub.example.com"
              aria-label="Hostname สำหรับ DNS route"
              className="flex-1 bg-zinc-900 text-zinc-100 text-xs rounded-lg px-3 outline-none border border-zinc-700 focus:border-blue-500 min-h-[44px] placeholder:text-zinc-500 transition-colors"
              onKeyDown={e => e.key === 'Enter' && routeDns()}
              autoFocus
            />
            <button
              onClick={routeDns}
              disabled={dnsLoading || !dnsHost.trim()}
              className="px-3 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-40 transition-all duration-150"
            >
              {dnsLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin block" /> : 'Set'}
            </button>
            <button
              onClick={() => { setShowDns(false); setDnsHost('') }}
              className="px-2.5 min-h-[44px] rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs hover:text-zinc-300 transition-all duration-150"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
