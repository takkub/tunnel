'use client'
import { useEffect, useState } from 'react'
import AuthGateModal from './AuthGateModal'
import TunnelLogModal from './TunnelLogModal'

interface Tunnel {
  name: string
  running: boolean
  hostname?: string
  port?: number | null
  authGate?: { enabled: boolean }
  autostart?: boolean
}

export type HealthState = 'connected' | 'connecting' | 'degraded' | 'error' | 'origin-down' | 'stopped'

export interface TunnelHealth {
  name: string
  running: boolean
  health: HealthState
  activeConnections: number
  connections: { connIndex: number; location: string; protocol: string; since: string }[]
  lastError: { time: string; message: string; hint?: string } | null
  originError: { time: string; message: string; hint?: string; ageSec: number } | null
  lastEventAt: string
  uptimeSec: number
}

interface Props {
  tunnel: Tunnel
  health?: TunnelHealth
  onRefresh: () => void
  onToast: (msg: string, type: 'success' | 'error') => void
}

function formatUptime(sec: number): string {
  if (!sec || sec <= 0) return '0 น.'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m} น.`
  return `${h} ชม. ${m} น.`
}

const HEALTH_LABEL: Record<HealthState, string> = {
  connected: 'เชื่อมต่อ',
  connecting: 'กำลังเชื่อมต่อ',
  degraded: 'ไม่สมบูรณ์',
  error: 'ผิดพลาด',
  'origin-down': 'ปลายทางไม่ตอบ',
  stopped: 'หยุด',
}

const HEALTH_STYLE: Record<HealthState, string> = {
  connected: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  degraded: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  connecting: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  error: 'bg-red-500/10 text-red-400 border border-red-500/20',
  'origin-down': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  stopped: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
}

function formatAgeSec(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} วินาที`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} นาที`
  const h = Math.round(m / 60)
  return `${h} ชั่วโมง`
}

export default function TunnelCard({ tunnel, health, onRefresh, onToast }: Props) {
  const [busyAction, setBusyAction] = useState<'start' | 'stop' | 'delete' | null>(null)
  const [showDns, setShowDns] = useState(false)
  const [dnsHost, setDnsHost] = useState('')
  const [dnsLoading, setDnsLoading] = useState(false)
  const [dnsSuccess, setDnsSuccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAuthGate, setShowAuthGate] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [autostart, setAutostart] = useState(tunnel.autostart ?? false)
  const [savingAutostart, setSavingAutostart] = useState(false)

  const busy = busyAction !== null
  const hasHostname = !!(tunnel.hostname && tunnel.hostname !== 'cfd')
  const healthState: HealthState = health?.health ?? (tunnel.running ? 'connected' : 'stopped')
  const activeConnections = health?.activeConnections ?? (tunnel.running ? undefined : 0)
  const locations = health?.connections?.map(c => c.location).filter(Boolean).join(', ')
  const badgeTitle = locations
    ? `เชื่อมต่อ ${activeConnections ?? '?'}/4 · ${locations}`
    : undefined

  useEffect(() => {
    setAutostart(tunnel.autostart ?? false)
  }, [tunnel.autostart])

  const toggleAutostart = async () => {
    const next = !autostart
    setSavingAutostart(true)
    setAutostart(next)
    try {
      const res = await fetch(`/api/tunnels/${tunnel.name}/autostart`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autostart: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAutostart(!next)
        onToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
      } else {
        onToast(next ? 'เปิด autostart แล้ว' : 'ปิด autostart แล้ว', 'success')
      }
    } catch {
      setAutostart(!next)
      onToast('ไม่สามารถบันทึกได้', 'error')
    } finally {
      setSavingAutostart(false)
      await onRefresh()
    }
  }

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

  const routeDns = async (hostname: string) => {
    if (!hostname.trim()) return
    setDnsLoading(true)
    const res = await fetch(`/api/tunnels/${tunnel.name}/route-dns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname: hostname.trim() }),
    })
    const data = await res.json()
    onToast(data.message ?? data.error ?? 'เสร็จแล้ว', res.ok ? 'success' : 'error')
    if (res.ok) { setDnsSuccess(true); setTimeout(() => setDnsSuccess(false), 2000) }
    setDnsLoading(false)
    setShowDns(false)
    setDnsHost('')
    await onRefresh()
  }

  const handleGlobeClick = () => {
    if (showDns) {
      setShowDns(false)
      setDnsHost('')
    } else if (hasHostname) {
      routeDns(tunnel.hostname!)
    } else {
      setShowDns(true)
    }
  }

  const openChangeHostname = () => {
    setShowDns(true)
    setDnsHost(tunnel.hostname ?? '')
  }

  const copyHostname = () => {
    if (!tunnel.hostname) return
    navigator.clipboard.writeText(tunnel.hostname)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`rounded-xl overflow-hidden transition-all duration-200 bg-[#18181b] border border-zinc-800 ${
      healthState === 'connected' ? 'border-l-[3px] border-l-emerald-500'
        : healthState === 'degraded' ? 'border-l-[3px] border-l-amber-500'
        : healthState === 'connecting' ? 'border-l-[3px] border-l-blue-500'
        : healthState === 'error' ? 'border-l-[3px] border-l-red-500'
        : healthState === 'origin-down' ? 'border-l-[3px] border-l-orange-500'
        : ''
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
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
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
                {tunnel.port != null && (
                  <span className="flex-shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400">
                    :{tunnel.port}
                  </span>
                )}
                {tunnel.authGate?.enabled && (
                  <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    🔒 Password
                  </span>
                )}
              </div>
            )}
            {!hasHostname && (tunnel.port != null || tunnel.authGate?.enabled) && (
              <div className="flex items-center gap-1 mt-0.5">
                {tunnel.port != null && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 inline-block">
                    :{tunnel.port}
                  </span>
                )}
                {tunnel.authGate?.enabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    🔒 Password
                  </span>
                )}
              </div>
            )}
          </div>
          <div
            title={badgeTitle}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${HEALTH_STYLE[healthState]}`}
          >
            {healthState === 'connecting' ? (
              <span className="w-2.5 h-2.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${
                healthState === 'connected' ? 'bg-emerald-400 animate-pulse-dot'
                  : healthState === 'degraded' ? 'bg-amber-400 animate-pulse-dot'
                  : healthState === 'error' ? 'bg-red-400'
                  : healthState === 'origin-down' ? 'bg-orange-400'
                  : 'bg-zinc-600'
              }`} />
            )}
            {healthState === 'connected' || healthState === 'degraded'
              ? `${HEALTH_LABEL[healthState]} ${activeConnections ?? '?'}/4`
              : HEALTH_LABEL[healthState]}
          </div>
        </div>

        {health && (health.uptimeSec > 0) && healthState !== 'stopped' && (
          <p className="text-[11px] text-zinc-600 -mt-1.5">Uptime: {formatUptime(health.uptimeSec)}</p>
        )}

        {healthState === 'error' && health?.lastError && (
          <p className="text-xs text-red-400 truncate" title={health.lastError.message}>
            ⚠ {health.lastError.hint ?? health.lastError.message}
          </p>
        )}

        {healthState === 'origin-down' && health?.originError && (
          <p className="text-xs text-orange-400 truncate" title={health.originError.message}>
            ⚠ {health.originError.hint ?? health.originError.message}
          </p>
        )}

        {healthState === 'connected' && health?.originError && (
          <p className="text-[11px] text-zinc-600 truncate" title={health.originError.message}>
            origin error ล่าสุด {formatAgeSec(health.originError.ageSec)}ที่แล้ว
          </p>
        )}

        {/* Actions row */}
        <div className="flex gap-1.5">
          {tunnel.running ? (
            <button
              onClick={() => action('stop')}
              disabled={busy}
              className="flex-1 min-h-[44px] rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-red-400 border border-zinc-700 hover:border-red-800 text-zinc-200 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-1.5"
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
            onClick={handleGlobeClick}
            disabled={busy || dnsLoading}
            aria-label="Route DNS"
            title={hasHostname && !showDns ? `Route DNS: ${tunnel.hostname}` : 'Route DNS'}
            className={`min-h-[44px] w-11 rounded-lg border text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center ${
              showDns
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : dnsSuccess
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            {dnsLoading ? (
              <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-300 rounded-full animate-spin" />
            ) : dnsSuccess ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
            )}
          </button>

          {/* Password gate button */}
          <button
            onClick={() => setShowAuthGate(true)}
            disabled={busy}
            aria-label="Password protection"
            title="Password protection"
            className={`min-h-[44px] w-11 rounded-lg border text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center ${
              tunnel.authGate?.enabled
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </button>

          {/* Log button */}
          <button
            onClick={() => setShowLog(true)}
            disabled={busy}
            aria-label="ดู log"
            title="ดู log"
            className="min-h-[44px] w-11 rounded-lg border bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
            </svg>
          </button>

          {/* Autostart toggle */}
          <button
            onClick={toggleAutostart}
            disabled={busy || savingAutostart}
            aria-label="Autostart"
            aria-pressed={autostart}
            title="เปิด tunnel นี้อัตโนมัติเมื่อแอปเริ่ม"
            className={`min-h-[44px] w-11 rounded-lg border text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center ${
              autostart
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            {savingAutostart ? (
              <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-300 rounded-full animate-spin" />
            ) : autostart ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
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

        {/* DNS expand — change hostname */}
        {showDns && (
          <div className="flex gap-1.5 items-center animate-slide-up">
            <input
              type="text"
              value={dnsHost}
              onChange={e => setDnsHost(e.target.value)}
              placeholder="sub.example.com"
              aria-label="Hostname สำหรับ DNS route"
              className="flex-1 bg-zinc-900 text-zinc-100 text-xs rounded-lg px-3 outline-none border border-zinc-700 focus:border-blue-500 min-h-[44px] placeholder:text-zinc-500 transition-colors"
              onKeyDown={e => e.key === 'Enter' && routeDns(dnsHost)}
              autoFocus
            />
            <button
              onClick={() => routeDns(dnsHost)}
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

        {/* Secondary affordance: change hostname (only when hostname already set) */}
        {hasHostname && !showDns && (
          <button
            onClick={openChangeHostname}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors leading-none"
          >
            เปลี่ยน hostname
          </button>
        )}
      </div>

      {showAuthGate && (
        <AuthGateModal
          tunnelName={tunnel.name}
          onSuccess={async msg => {
            setShowAuthGate(false)
            onToast(msg, 'success')
            await onRefresh()
          }}
          onError={msg => onToast(msg, 'error')}
          onClose={() => setShowAuthGate(false)}
        />
      )}

      {showLog && (
        <TunnelLogModal tunnelName={tunnel.name} onClose={() => setShowLog(false)} />
      )}
    </div>
  )
}
