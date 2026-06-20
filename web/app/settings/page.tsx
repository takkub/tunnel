'use client'
import { useEffect, useState } from 'react'
import Button from '@/components/Button'
import Toast from '@/components/Toast'

type RuntimeMode = 'auto' | 'docker' | 'native'

interface DomainEntry { domain: string; zoneId: string }

interface RuntimeInfo {
  mode: RuntimeMode
  dockerAvailable: boolean
  effective: string
}

function IconZap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0 text-zinc-400">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}
function IconBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0 text-zinc-400">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}
function IconTerminalSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0 text-zinc-400">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

type ModeOption = { value: RuntimeMode; label: string; desc: string; Icon: () => React.ReactElement }
const modeOptions: ModeOption[] = [
  { value: 'auto',   label: 'Auto',   desc: 'ใช้ Docker ถ้ามี, fallback native', Icon: IconZap },
  { value: 'docker', label: 'Docker', desc: 'บังคับใช้ Docker เสมอ',             Icon: IconBox },
  { value: 'native', label: 'Native', desc: 'ใช้ cloudflared โดยตรง',            Icon: IconTerminalSmall },
]

export default function SettingsPage() {
  const [reqs, setReqs] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [reqsLoading, setReqsLoading] = useState(false)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [selectedMode, setSelectedMode] = useState<RuntimeMode>('auto')
  const [savingRuntime, setSavingRuntime] = useState(false)

  // Domains
  const [domains, setDomains] = useState<DomainEntry[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [domainInput, setDomainInput] = useState('')
  const [zoneIdInput, setZoneIdInput] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchDomains = async () => {
    setDomainsLoading(true)
    try {
      const res = await fetch('/api/settings/domains')
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains ?? [])
      }
    } catch { /* API not ready */ }
    finally { setDomainsLoading(false) }
  }

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!domainInput || !zoneIdInput) return
    setAddingDomain(true)
    try {
      const res = await fetch('/api/settings/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim(), zoneId: zoneIdInput.trim() }),
      })
      if (res.ok) {
        setDomainInput('')
        setZoneIdInput('')
        showToast('เพิ่ม domain แล้ว', 'success')
        fetchDomains()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
      }
    } catch { showToast('ไม่สามารถเพิ่มได้', 'error') }
    finally { setAddingDomain(false) }
  }

  const handleDeleteDomain = async (domain: string) => {
    setDeletingDomain(domain)
    try {
      const res = await fetch(`/api/settings/domains?domain=${encodeURIComponent(domain)}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('ลบ domain แล้ว', 'success')
        fetchDomains()
      } else {
        const data = await res.json()
        showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
      }
    } catch { showToast('ไม่สามารถลบได้', 'error') }
    finally { setDeletingDomain(null) }
  }

  const fetchReqs = async () => {
    setReqsLoading(true)
    const res = await fetch('/api/requirements')
    const data = await res.json()
    setReqs(data.requirements ?? {})
    setReqsLoading(false)
  }

  const fetchRuntime = async () => {
    setRuntimeLoading(true)
    try {
      const res = await fetch('/api/settings/runtime')
      if (res.ok) {
        const data: RuntimeInfo = await res.json()
        setRuntime(data)
        setSelectedMode(data.mode)
      }
    } catch { /* API not ready */ }
    finally { setRuntimeLoading(false) }
  }

  const handleLogin = async () => {
    const res = await fetch('/api/login', { method: 'POST' })
    const data = await res.json()
    showToast(data.message ?? 'login แล้ว', res.ok ? 'success' : 'error')
  }

  const handleSaveRuntime = async () => {
    setSavingRuntime(true)
    try {
      const res = await fetch('/api/settings/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode }),
      })
      const data = await res.json()
      if (res.ok) { setRuntime(data); showToast('บันทึก runtime mode แล้ว', 'success') }
      else showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingRuntime(false) }
  }

  useEffect(() => {
    fetchReqs()
    fetchRuntime()
    fetchDomains()
  }, [])

  return (
    <div className="max-w-xl space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      {/* Runtime Mode */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Runtime Mode</h2>
          {runtime && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
              {runtime.effective}
            </span>
          )}
        </div>

        {runtimeLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : runtime === null ? (
          <p className="text-sm text-zinc-500">API ยังไม่พร้อม</p>
        ) : (
          <>
            <div className="space-y-2">
              {modeOptions.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                    selectedMode === opt.value
                      ? 'border-orange-500/40 bg-orange-500/5'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="runtimeMode"
                    value={opt.value}
                    checked={selectedMode === opt.value}
                    onChange={() => setSelectedMode(opt.value)}
                    className="accent-orange-500 w-4 h-4 flex-shrink-0"
                  />
                  <opt.Icon />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-zinc-100 text-sm">{opt.label}</span>
                      {opt.value === 'docker' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          runtime.dockerAvailable
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                        }`}>
                          {runtime.dockerAvailable ? 'พร้อมใช้' : 'ไม่พบ'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <Button
              onClick={handleSaveRuntime}
              disabled={savingRuntime || selectedMode === runtime.mode}
              loading={savingRuntime}
              variant="primary"
              className="w-full"
            >
              บันทึก
            </Button>
          </>
        )}
      </section>

      {/* Domains */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Domains</h2>
          <button onClick={fetchDomains} disabled={domainsLoading} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">
            {domainsLoading ? 'โหลด...' : 'รีเฟรช'}
          </button>
        </div>

        {domainsLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-12 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : domains.length === 0 ? (
          <p className="text-sm text-zinc-500">ยังไม่มี domain</p>
        ) : (
          <ul className="space-y-2">
            {domains.map(d => (
              <li key={d.domain} className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100 font-mono truncate">{d.domain}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate">{d.zoneId}</p>
                </div>
                <button
                  onClick={() => handleDeleteDomain(d.domain)}
                  disabled={deletingDomain === d.domain}
                  className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center text-sm transition-colors disabled:opacity-40"
                  aria-label={`ลบ ${d.domain}`}
                >
                  {deletingDomain === d.domain ? <span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" /> : '✕'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddDomain} className="space-y-2 pt-1">
          <input
            type="text"
            required
            placeholder="example.com"
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
          />
          <input
            type="text"
            required
            placeholder="Zone ID (จาก Cloudflare)"
            value={zoneIdInput}
            onChange={e => setZoneIdInput(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
          />
          <button
            type="submit"
            disabled={addingDomain || !domainInput || !zoneIdInput}
            className="min-h-[48px] w-full rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold disabled:opacity-40 transition-all duration-150 flex items-center justify-center gap-2"
          >
            {addingDomain && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            เพิ่ม Domain
          </button>
        </form>
      </section>

      {/* Requirements */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Requirements</h2>
          <button onClick={fetchReqs} disabled={reqsLoading} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">
            {reqsLoading ? 'โหลด...' : 'รีเฟรช'}
          </button>
        </div>

        {reqsLoading ? (
          <div className="space-y-1 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : Object.keys(reqs).length === 0 ? (
          <p className="text-sm text-zinc-500">ไม่พบข้อมูล</p>
        ) : (
          <ul className="space-y-1">
            {Object.entries(reqs).map(([k, v]) => (
              <li key={k} className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm ${
                v ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-red-500/5 border border-red-500/10'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  v ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {v ? '✓' : '✗'}
                </span>
                <span className={v ? 'text-zinc-200' : 'text-zinc-400'}>{k}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="pt-1">
          <Button onClick={handleLogin} variant="secondary" className="w-full">
            Login Cloudflare
          </Button>
        </div>
      </section>
    </div>
  )
}
