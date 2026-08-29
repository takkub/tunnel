'use client'
import { useEffect, useState } from 'react'
import RefreshButton from '@/components/RefreshButton'

interface Location {
  path: string
  upstream: string
  websocket?: boolean
  rateLimitAuth?: boolean
}

interface Site {
  serverName: string
  clientMaxBodySize?: string
  locations: Location[]
}

type ExportMode = 'standalone' | 'edge-snippet'

interface ExportResult {
  ok: boolean
  path?: string
  files?: string[]
}

function emptyLocation(): Location {
  return { path: '/', upstream: '', websocket: false, rateLimitAuth: false }
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
}

function SmallSpinner() {
  return <span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin inline-block" />
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${
        value
          ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
          : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  )
}

export default function NginxPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [exportMode, setExportMode] = useState<ExportMode>('standalone')

  // Draft site form
  const [serverName, setServerName] = useState('')
  const [clientMaxBodySize, setClientMaxBodySize] = useState('')
  const [draftLocations, setDraftLocations] = useState<Location[]>([emptyLocation()])

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
        const raw: unknown[] = data.sites ?? []
        // Handle both old shape {serverName, upstream} and new shape with locations
        setSites(raw.map((s: any) => {
          if (Array.isArray(s.locations)) return s as Site
          return { serverName: s.serverName, locations: [{ path: '/', upstream: s.upstream ?? '' }] } as Site
        }))
      }
    } catch { /* backend not ready */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSites() }, [])

  const updateLocation = (i: number, patch: Partial<Location>) =>
    setDraftLocations(prev => prev.map((loc, idx) => idx === i ? { ...loc, ...patch } : loc))

  const addLocation = () => setDraftLocations(prev => [...prev, emptyLocation()])

  const removeLocation = (i: number) => {
    if (draftLocations.length <= 1) return
    setDraftLocations(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverName) return
    const validLocations = draftLocations.filter(l => l.upstream.trim())
    if (validLocations.length === 0) { setError('กรุณาระบุ upstream อย่างน้อย 1 location'); return }
    setAdding(true)
    setError(null)
    try {
      const site: Site = {
        serverName: serverName.trim(),
        ...(clientMaxBodySize.trim() ? { clientMaxBodySize: clientMaxBodySize.trim() } : {}),
        locations: validLocations,
      }
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(site),
      })
      if (res.ok) {
        setServerName('')
        setClientMaxBodySize('')
        setDraftLocations([emptyLocation()])
        fetchSites()
      } else {
        const data = await res.json().catch(() => ({}))
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
    } catch { }
    finally { setDeleting(null) }
  }

  const handleExport = async () => {
    setExporting(true)
    setExportResult(null)
    try {
      const res = await fetch('/api/nginx/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportMode }),
      })
      const data = await res.json()
      setExportResult(data)
    } catch { setExportResult({ ok: false }) }
    finally { setExporting(false) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5">
        <h2 className="font-semibold text-zinc-200 mb-1">Nginx Reverse Proxy</h2>
        <p className="text-sm text-zinc-500">Generate nginx config พร้อม deploy — กำหนด site, location, และ options แล้ว export ตาม mode ที่เลือก</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 items-start">
      <div className="md:col-span-1 space-y-4">
      {/* Export mode */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-zinc-200">Export Mode</h2>
        <div className="flex gap-2">
          {(['standalone', 'edge-snippet'] as ExportMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setExportMode(mode)}
              className={`flex-1 min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium transition-all border ${
                exportMode === mode
                  ? 'bg-orange-500/15 border-orange-500/50 text-orange-400'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {mode === 'standalone' ? 'Standalone' : 'Edge Snippet'}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          {exportMode === 'standalone'
            ? 'สร้าง docker-compose.yml + nginx config ครบชุด — copy ไปวางบน server แล้ว docker compose up -d'
            : 'สร้างเฉพาะ nginx server block — append เข้า nginx ที่มีอยู่บน edge server แล้ว nginx -s reload'}
        </p>
      </section>
      </div>

      {/* Sites list + add form */}
      <section className="md:col-span-2 bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Sites</h2>
          <RefreshButton onClick={fetchSites} disabled={loading} loading={loading} />
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : sites.length === 0 ? (
          <p className="text-sm text-zinc-500">ยังไม่มี site — เพิ่มด้านล่าง</p>
        ) : (
          <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {sites.map(s => (
              <li key={s.serverName} className="rounded-xl bg-zinc-900 border border-zinc-700 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-100 font-mono truncate">{s.serverName}</p>
                    {s.clientMaxBodySize && (
                      <p className="text-xs text-zinc-500 font-mono">max body: {s.clientMaxBodySize}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(s.serverName)}
                    disabled={deleting === s.serverName}
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center text-sm transition-colors disabled:opacity-40"
                    aria-label={`ลบ ${s.serverName}`}
                  >
                    {deleting === s.serverName ? <SmallSpinner /> : '✕'}
                  </button>
                </div>
                <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
                  {s.locations.map((loc, i) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{loc.path}</span>
                      <span className="text-xs text-zinc-400 font-mono flex-1 min-w-0 truncate">→ {loc.upstream}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        {loc.websocket && <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">WS</span>}
                        {loc.rateLimitAuth && <span className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">RL</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add site form */}
        <form onSubmit={handleAdd} className="space-y-3 pt-2 border-t border-zinc-800">
          <p className="text-xs font-medium text-zinc-400">เพิ่ม Site</p>
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="server_name เช่น app.example.com"
              value={serverName}
              onChange={e => setServerName(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors font-mono"
            />
            <input
              type="text"
              placeholder="max body เช่น 10G"
              value={clientMaxBodySize}
              onChange={e => setClientMaxBodySize(e.target.value)}
              className="w-28 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors font-mono"
            />
          </div>

          {/* Locations */}
          <div className="space-y-2">
            {draftLocations.map((loc, i) => (
              <div key={i} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="path"
                    value={loc.path}
                    onChange={e => updateLocation(i, { path: e.target.value })}
                    className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors font-mono"
                  />
                  <input
                    type="text"
                    placeholder="upstream เช่น web:3000"
                    value={loc.upstream}
                    onChange={e => updateLocation(i, { upstream: e.target.value })}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors font-mono"
                  />
                  {draftLocations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLocation(i)}
                      className="w-8 h-9 flex-shrink-0 rounded-lg bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center text-sm transition-colors"
                      aria-label="ลบ location นี้"
                    >✕</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Toggle value={!!loc.websocket} onChange={v => updateLocation(i, { websocket: v })} label="WebSocket" />
                  <Toggle value={!!loc.rateLimitAuth} onChange={v => updateLocation(i, { rateLimitAuth: v })} label="Rate-limit auth" />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addLocation}
              className="w-full min-h-[40px] rounded-xl border border-dashed border-zinc-700 text-zinc-500 text-sm hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              + เพิ่ม location
            </button>
          </div>

          <button
            type="submit"
            disabled={adding || !serverName}
            className="min-h-[44px] w-full rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
          >
            {adding && <Spinner />}
            เพิ่ม Site
          </button>
        </form>
      </section>
      </div>

      {/* Export */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-zinc-200">Export</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Generate nginx config ตาม mode ที่เลือก</p>
        </div>

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
          Export — {exportMode === 'standalone' ? 'Standalone' : 'Edge Snippet'}
        </button>

        {exportResult && (
          <div className={`rounded-xl border p-4 space-y-3 ${exportResult.ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
            {exportResult.ok ? (
              <>
                <p className="text-sm font-medium text-emerald-400">Export สำเร็จ</p>
                {exportResult.path && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">โฟลเดอร์</p>
                    <p className="text-xs font-mono text-zinc-300 break-all">{exportResult.path}</p>
                  </div>
                )}
                {exportResult.files && exportResult.files.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">ไฟล์ที่ generate</p>
                    <ul className="space-y-0.5">
                      {exportResult.files.map(f => (
                        <li key={f} className="text-xs font-mono text-zinc-400">• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-1 border-t border-emerald-500/10 space-y-2">
                  {exportMode === 'standalone' ? (
                    <>
                      <p className="text-xs text-zinc-400">Copy โฟลเดอร์ <code className="bg-zinc-800 px-1 rounded text-zinc-300">nginx/</code> ไปบน server แล้วรัน:</p>
                      <pre className="bg-zinc-900 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300">docker compose up -d</pre>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-zinc-400">Append snippet เข้า nginx ที่มีอยู่:</p>
                      {exportResult.path && (
                        <pre className="bg-zinc-900 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 break-all whitespace-pre-wrap">{`cat ${exportResult.path} >> /etc/nginx/conf.d/sites.conf`}</pre>
                      )}
                      <pre className="bg-zinc-900 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300">nginx -t && nginx -s reload</pre>
                    </>
                  )}
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

