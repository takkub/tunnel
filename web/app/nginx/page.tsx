'use client'
import { useEffect, useState } from 'react'
import RefreshButton from '@/components/RefreshButton'

interface NginxSite {
  serverName: string
  upstream: string
}

interface ExportResult {
  ok: boolean
  path: string
  files: string[]
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
}

function SmallSpinner() {
  return <span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin inline-block" />
}

export default function NginxPage() {
  const [sites, setSites] = useState<NginxSite[]>([])
  const [loading, setLoading] = useState(true)
  const [serverName, setServerName] = useState('')
  const [upstream, setUpstream] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchSites = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/nginx/sites')
      if (res.ok) {
        const data = await res.json()
        setSites(data.sites ?? [])
      }
    } catch { /* backend not ready yet */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSites() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverName || !upstream) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverName: serverName.trim(), upstream: upstream.trim() }),
      })
      if (res.ok) {
        setServerName('')
        setUpstream('')
        fetchSites()
      } else {
        const data = await res.json()
        setError(data.error ?? 'เกิดข้อผิดพลาด')
      }
    } catch { setError('ไม่สามารถเพิ่มได้') }
    finally { setAdding(false) }
  }

  const handleDelete = async (name: string) => {
    setDeleting(name)
    try {
      await fetch(`/api/nginx/sites?serverName=${encodeURIComponent(name)}`, { method: 'DELETE' })
      fetchSites()
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  const handleExport = async () => {
    setExporting(true)
    setExportResult(null)
    try {
      const res = await fetch('/api/nginx/export', { method: 'POST' })
      const data = await res.json()
      setExportResult(data)
    } catch { setExportResult({ ok: false, path: '', files: [] }) }
    finally { setExporting(false) }
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* Header */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5">
        <h2 className="font-semibold text-zinc-200 mb-1">Nginx Reverse Proxy</h2>
        <p className="text-sm text-zinc-500">สร้าง reverse proxy config สำหรับ deploy บน server จริง — กำหนด domain และ upstream แล้ว export เป็น docker compose bundle</p>
      </div>

      {/* Sites list */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Sites</h2>
          <RefreshButton onClick={fetchSites} disabled={loading} loading={loading} />
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-12 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : sites.length === 0 ? (
          <p className="text-sm text-zinc-500">ยังไม่มี site — เพิ่มด้านล่าง</p>
        ) : (
          <ul className="space-y-2">
            {sites.map(s => (
              <li key={s.serverName} className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100 font-mono truncate">{s.serverName}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate">→ {s.upstream}</p>
                </div>
                <button
                  onClick={() => handleDelete(s.serverName)}
                  disabled={deleting === s.serverName}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center text-sm transition-colors disabled:opacity-40"
                  aria-label={`ลบ ${s.serverName}`}
                >
                  {deleting === s.serverName ? <SmallSpinner /> : '✕'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add form */}
        <form onSubmit={handleAdd} className="space-y-2 pt-1">
          {error && <p className="text-xs text-red-400 px-1">{error}</p>}
          <input
            type="text"
            required
            placeholder="server_name เช่น app.example.com"
            value={serverName}
            onChange={e => setServerName(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors font-mono"
          />
          <input
            type="text"
            required
            placeholder="upstream เช่น host.docker.internal:3000"
            value={upstream}
            onChange={e => setUpstream(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors font-mono"
          />
          <button
            type="submit"
            disabled={adding || !serverName || !upstream}
            className="min-h-[44px] w-full rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
          >
            {adding && <Spinner />}
            เพิ่ม Site
          </button>
        </form>
      </section>

      {/* Export */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-zinc-200">Export Bundle</h2>
        <p className="text-sm text-zinc-500">Generate nginx config + docker-compose.yml พร้อม deploy</p>

        <button
          onClick={handleExport}
          disabled={exporting || sites.length === 0}
          className="min-h-[44px] w-full rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
        >
          {exporting ? <Spinner /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
          Export bundle
        </button>

        {exportResult && (
          <div className={`rounded-xl border p-4 space-y-3 ${exportResult.ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
            {exportResult.ok ? (
              <>
                <p className="text-sm font-medium text-emerald-400">Export สำเร็จ</p>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">โฟลเดอร์</p>
                  <p className="text-xs font-mono text-zinc-300 break-all">{exportResult.path}</p>
                </div>
                {exportResult.files.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">ไฟล์ที่ generate</p>
                    <ul className="space-y-0.5">
                      {exportResult.files.map(f => (
                        <li key={f} className="text-xs font-mono text-zinc-400">• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-1 border-t border-emerald-500/10">
                  <p className="text-xs text-zinc-400">คัดลอกโฟลเดอร์ <code className="bg-zinc-800 px-1 rounded text-zinc-300">nginx/</code> ไปวางบน server แล้วรัน:</p>
                  <pre className="mt-2 bg-zinc-900 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300">docker compose up -d</pre>
                </div>
              </>
            ) : (
              <p className="text-sm text-red-400">Export ล้มเหลว — ตรวจสอบ backend log</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
