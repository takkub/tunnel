'use client'
import { useState, useEffect } from 'react'

interface DomainEntry { domain: string; zoneId: string }

interface Props {
  onSuccess: () => void
  onClose: () => void
}

export default function CreateTunnelModal({ onSuccess, onClose }: Props) {
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [port, setPort] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [domains, setDomains] = useState<DomainEntry[]>([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [domainsLoading, setDomainsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings/domains')
      .then(r => r.json())
      .then(data => {
        const list: DomainEntry[] = data.domains ?? []
        setDomains(list)
        if (list.length > 0) setSelectedDomain(list[0].domain)
      })
      .catch(() => {})
      .finally(() => setDomainsLoading(false))
  }, [])

  useEffect(() => {
    if (!subdomain) {
      const base = name.replace(/-tunnel$/, '')
      if (base) setSubdomain(base)
    }
  }, [name])

  const hostname = subdomain && selectedDomain ? `${subdomain}.${selectedDomain}` : ''
  const noDomains = !domainsLoading && domains.length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hostname) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hostname, port: Number(port) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'เกิดข้อผิดพลาด')
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3.5 text-base text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl max-h-[92vh] overflow-y-auto p-6 animate-slide-up
                   md:relative md:rounded-2xl md:max-h-none md:max-w-md md:shadow-2xl"
        style={{ background: '#18181b', border: '1px solid #27272a' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-5 w-10 h-1 rounded-full bg-zinc-700 md:hidden" />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-100">สร้าง Tunnel ใหม่</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center text-sm transition-colors">
            ✕
          </button>
        </div>

        {noDomains ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-zinc-400 text-sm">ยังไม่มี domain — ไปเพิ่มที่ Settings</p>
            <button onClick={onClose} className="min-h-[44px] px-6 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-base hover:bg-zinc-700 transition-all duration-150">
              ปิด
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">ชื่อ Tunnel</label>
              <input
                type="text"
                required
                placeholder="myapp-tunnel"
                value={name}
                onChange={e => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Domain</label>
              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value)}
                disabled={domainsLoading}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3.5 text-base text-zinc-100 focus:outline-none focus:border-orange-500/60 transition-colors disabled:opacity-50"
              >
                {domains.map(d => (
                  <option key={d.domain} value={d.domain}>{d.domain}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Subdomain</label>
              <div className="flex items-center bg-zinc-950 border border-zinc-700 rounded-xl overflow-hidden focus-within:border-orange-500/60 transition-colors">
                <input
                  type="text"
                  required
                  placeholder="myapp"
                  value={subdomain}
                  onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1 min-w-0 bg-transparent px-4 py-3.5 text-base text-zinc-100 placeholder-zinc-600 focus:outline-none"
                />
                <span className="pr-4 text-zinc-500 text-sm whitespace-nowrap flex-shrink-0">.{selectedDomain || '…'}</span>
              </div>
              {hostname && (
                <p className="mt-1.5 text-xs text-orange-400/80 flex items-center gap-1">
                  <span>→</span>
                  <span className="font-mono">{hostname}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Local Port</label>
              <input
                type="number"
                required
                placeholder="3000"
                value={port}
                onChange={e => setPort(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <span className="text-red-500">✗</span>
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-1">
              <button
                type="submit"
                disabled={loading || !hostname || noDomains}
                className="min-h-[48px] w-full rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-base font-semibold disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
              >
                {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? 'กำลังสร้าง...' : 'สร้าง Tunnel'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="min-h-[44px] w-full rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-base hover:bg-zinc-700 disabled:opacity-40 transition-all duration-150"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
