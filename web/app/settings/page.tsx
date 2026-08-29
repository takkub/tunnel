'use client'
import { useEffect, useRef, useState } from 'react'
import Button from '@/components/Button'
import Toast from '@/components/Toast'
import RefreshButton from '@/components/RefreshButton'
import CopyButton from '@/components/CopyButton'

type RuntimeMode = 'auto' | 'docker' | 'native'
interface DomainEntry { domain: string; zoneId: string }

interface SettingsResponse {
  cloudflare: { apiTokenSet: boolean; apiTokenMasked: string | null; zoneId: string | null; zoneName?: string | null; accountEmail?: string }
  desktop: { launchAtLogin: boolean; autostartTunnelsOnLaunch: boolean }
  runtime: { mode: RuntimeMode; effectiveMode: 'docker' | 'native'; dockerAvailable: boolean; dataDir: string; desktopMode: boolean }
  cloudflared: { installed: boolean; version: string | null; path: string | null; loggedIn: boolean }
  admin?: { passwordSet: boolean }
  appVersion: string
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
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ---- Unified settings (Cloudflare / Runtime / cloudflared) ----
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsUnavailable, setSettingsUnavailable] = useState(false)
  const [selectedMode, setSelectedMode] = useState<RuntimeMode>('auto')
  const [savingRuntime, setSavingRuntime] = useState(false)

  const [tokenInput, setTokenInput] = useState('')
  const [editingToken, setEditingToken] = useState(false)
  const [zoneIdInput, setZoneIdInput] = useState('')
  const [savingCloudflare, setSavingCloudflare] = useState(false)

  const [savingDesktop, setSavingDesktop] = useState<'launchAtLogin' | 'autostartTunnelsOnLaunch' | null>(null)

  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [savingAdmin, setSavingAdmin] = useState(false)

  const [installing, setInstalling] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSettings = async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data: SettingsResponse = await res.json()
        setSettings(data)
        setSelectedMode(data.runtime.mode)
        setZoneIdInput(data.cloudflare.zoneId ?? '')
        setSettingsUnavailable(false)
      } else {
        setSettingsUnavailable(true)
      }
    } catch {
      setSettingsUnavailable(true)
    } finally {
      setSettingsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    return () => { if (loginPollRef.current) clearInterval(loginPollRef.current) }
  }, [])

  const handleSaveRuntime = async () => {
    setSavingRuntime(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runtime: { mode: selectedMode } }),
      })
      const data = await res.json()
      if (res.ok) { setSettings(data); showToast('บันทึก runtime mode แล้ว', 'success') }
      else showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingRuntime(false) }
  }

  const handleToggleDesktop = async (key: 'launchAtLogin' | 'autostartTunnelsOnLaunch') => {
    if (!settings) return
    const next = !settings.desktop[key]
    setSavingDesktop(key)
    setSettings({ ...settings, desktop: { ...settings.desktop, [key]: next } })
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desktop: { [key]: next } }),
      })
      const data = await res.json()
      if (res.ok) { setSettings(data); showToast('บันทึกแล้ว', 'success') }
      else {
        setSettings(prev => prev && { ...prev, desktop: { ...prev.desktop, [key]: !next } })
        showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
      }
    } catch {
      setSettings(prev => prev && { ...prev, desktop: { ...prev.desktop, [key]: !next } })
      showToast('ไม่สามารถบันทึกได้', 'error')
    } finally {
      setSavingDesktop(null)
    }
  }

  const handleSaveCloudflare = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCloudflare(true)
    try {
      const body: { cloudflare: { apiToken?: string; zoneId?: string } } = { cloudflare: { zoneId: zoneIdInput.trim() } }
      if (editingToken && tokenInput.trim()) body.cloudflare.apiToken = tokenInput.trim()
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setSettings(data)
        setTokenInput('')
        setEditingToken(false)
        showToast('บันทึก Cloudflare settings แล้ว', 'success')
      } else showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingCloudflare(false) }
  }

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) { showToast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error'); return }
    if (newPassword !== confirmNewPassword) { showToast('รหัสผ่านไม่ตรงกัน', 'error'); return }
    setSavingAdmin(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin: { password: newPassword } }),
      })
      const data = await res.json()
      if (res.ok) {
        setSettings(data)
        setChangingPassword(false)
        setNewPassword('')
        setConfirmNewPassword('')
        showToast('เปลี่ยนรหัสผ่านแอดมินแล้ว', 'success')
      } else showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingAdmin(false) }
  }

  const handleInstallCloudflared = async () => {
    setInstalling(true)
    try {
      const res = await fetch('/api/settings/cloudflared/install', { method: 'POST' })
      const data = await res.json()
      if (res.ok) { showToast(`ติดตั้ง cloudflared ${data.version ?? ''} แล้ว`, 'success'); await fetchSettings() }
      else showToast(data.error ?? 'ติดตั้งไม่สำเร็จ', 'error')
    } catch { showToast('ไม่สามารถติดตั้งได้', 'error') }
    finally { setInstalling(false) }
  }

  const handleLoginCloudflared = async () => {
    setLoggingIn(true)
    try {
      const res = await fetch('/api/settings/cloudflared/login', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        showToast(data.error ?? 'เริ่ม login ไม่สำเร็จ', 'error')
        setLoggingIn(false)
        return
      }
      window.open(data.url, '_blank', 'noopener,noreferrer')
      const startedAt = Date.now()
      loginPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/settings/cloudflared/login')
          const pollData = await pollRes.json()
          if (pollData.loggedIn) {
            if (loginPollRef.current) clearInterval(loginPollRef.current)
            setLoggingIn(false)
            showToast('เข้าสู่ระบบ Cloudflare แล้ว', 'success')
            await fetchSettings()
          } else if (Date.now() - startedAt > 5 * 60 * 1000) {
            if (loginPollRef.current) clearInterval(loginPollRef.current)
            setLoggingIn(false)
            showToast('หมดเวลารอ login', 'error')
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch { showToast('ไม่สามารถเริ่ม login ได้', 'error'); setLoggingIn(false) }
  }

  // ---- Domains ----
  const [domains, setDomains] = useState<DomainEntry[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [domainInput, setDomainInput] = useState('')
  const [domainZoneInput, setDomainZoneInput] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null)

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
    if (!domainInput || !domainZoneInput) return
    setAddingDomain(true)
    try {
      const res = await fetch('/api/settings/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim(), zoneId: domainZoneInput.trim() }),
      })
      if (res.ok) {
        setDomainInput('')
        setDomainZoneInput('')
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

  // ---- Requirements ----
  type ReqValue = boolean | { ok: boolean; optional: boolean }
  const [reqs, setReqs] = useState<Record<string, ReqValue>>({})
  const [reqsLoading, setReqsLoading] = useState(false)
  const fetchReqs = async () => {
    setReqsLoading(true)
    const res = await fetch('/api/requirements')
    const data = await res.json()
    setReqs(data.requirements ?? {})
    setReqsLoading(false)
  }

  useEffect(() => {
    fetchReqs()
    fetchDomains()
  }, [])

  return (
    <div className="max-w-xl space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      {/* Header */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5">
        <h2 className="font-semibold text-zinc-200 mb-1">Settings</h2>
        <p className="text-sm text-zinc-500">จัดการ Cloudflare, runtime mode และ cloudflared</p>
      </div>

      {settingsUnavailable && !settingsLoading && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300">
          Settings API ยังไม่พร้อมใช้งาน
        </div>
      )}

      {/* Cloudflare */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-zinc-200">Cloudflare</h2>
        {settingsLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-12 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : settings === null ? (
          <p className="text-sm text-zinc-500">API ยังไม่พร้อม</p>
        ) : (
          <form onSubmit={handleSaveCloudflare} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">API Token</label>
              {!editingToken ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-mono text-zinc-300 truncate">
                    {settings.cloudflare.apiTokenSet ? (settings.cloudflare.apiTokenMasked ?? '••••••••') : 'ยังไม่ได้ตั้งค่า'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingToken(true)}
                    className="flex-shrink-0 px-3.5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
                  >
                    เปลี่ยน
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    autoFocus
                    placeholder="วาง API Token ใหม่"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => { setEditingToken(false); setTokenInput('') }}
                    className="flex-shrink-0 px-3.5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium transition-colors"
                  >
                    ยกเลิก
                  </button>
                </div>
              )}
              {settings.cloudflare.accountEmail && (
                <p className="text-xs text-zinc-500 mt-1.5">บัญชี: {settings.cloudflare.accountEmail}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Zone ID</label>
              <input
                type="text"
                placeholder="Zone ID จาก Cloudflare"
                value={zoneIdInput}
                onChange={e => setZoneIdInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
              />
              {settings.cloudflare.zoneName && (
                <p className="text-xs text-zinc-500 mt-1.5">โดเมน: {settings.cloudflare.zoneName}</p>
              )}
            </div>
            <Button onClick={() => {}} disabled={savingCloudflare} loading={savingCloudflare} variant="primary" className="w-full">
              บันทึก
            </Button>
          </form>
        )}
      </section>

      {/* Admin */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-zinc-200">แอดมิน</h2>
        {settingsLoading ? (
          <div className="h-12 bg-zinc-800 rounded-xl animate-pulse" />
        ) : settings === null ? (
          <p className="text-sm text-zinc-500">API ยังไม่พร้อม</p>
        ) : !changingPassword ? (
          <div className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${settings.admin?.passwordSet ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-sm text-zinc-200 font-medium">
                {settings.admin?.passwordSet ? 'ตั้งรหัสผ่านแล้ว' : 'ยังไม่ได้ตั้งรหัสผ่าน'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setChangingPassword(true)}
              className="flex-shrink-0 px-3.5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
            >
              เปลี่ยนรหัสแอดมิน
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveAdmin} className="space-y-3">
            <input
              type="password"
              autoFocus
              required
              minLength={8}
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
            />
            <input
              type="password"
              required
              placeholder="ยืนยันรหัสผ่านใหม่"
              value={confirmNewPassword}
              onChange={e => setConfirmNewPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
            />
            <div className="flex gap-2">
              <Button onClick={() => {}} disabled={savingAdmin} loading={savingAdmin} variant="primary" className="flex-1">
                บันทึก
              </Button>
              <button
                type="button"
                onClick={() => { setChangingPassword(false); setNewPassword(''); setConfirmNewPassword('') }}
                className="px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Runtime Mode */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Runtime Mode</h2>
          {settings && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
              {settings.runtime.effectiveMode}
            </span>
          )}
        </div>

        {settingsLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : settings === null ? (
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
                          settings.runtime.dockerAvailable
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                        }`}>
                          {settings.runtime.dockerAvailable ? 'พร้อมใช้' : 'ไม่พบ'}
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
              disabled={savingRuntime || selectedMode === settings.runtime.mode}
              loading={savingRuntime}
              variant="primary"
              className="w-full"
            >
              บันทึก
            </Button>

            <div className="pt-1 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">Data Directory</p>
                  <p className="text-sm text-zinc-300 font-mono truncate">{settings.runtime.dataDir}</p>
                </div>
                <CopyButton value={settings.runtime.dataDir} />
              </div>
              {settings.runtime.desktopMode && (
                <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 font-medium">
                  Desktop App Mode
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* Desktop */}
      {settings?.runtime.desktopMode && (
        <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-zinc-200">Desktop</h2>

          <label className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700 cursor-pointer">
            <div className="min-w-0">
              <p className="text-sm text-zinc-200 font-medium">เปิดแอปอัตโนมัติเมื่อเข้าเครื่อง</p>
              <p className="text-xs text-zinc-500 mt-0.5">แอปจะเปิดเองแบบซ่อนใน tray ตอนเปิดเครื่อง</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.desktop.launchAtLogin}
              onClick={() => handleToggleDesktop('launchAtLogin')}
              disabled={savingDesktop !== null}
              className={`flex-shrink-0 relative w-11 h-6 rounded-full transition-colors duration-150 disabled:opacity-40 ${
                settings.desktop.launchAtLogin ? 'bg-orange-500' : 'bg-zinc-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-150 ${
                settings.desktop.launchAtLogin ? 'translate-x-5' : ''
              }`} />
            </button>
          </label>

          <label className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700 cursor-pointer">
            <div className="min-w-0">
              <p className="text-sm text-zinc-200 font-medium">เริ่ม tunnels ที่ตั้ง autostart ไว้เมื่อเปิดแอป</p>
              <p className="text-xs text-zinc-500 mt-0.5">ใช้ร่วมกับปุ่ม ⚡ Autostart บนการ์ดแต่ละ tunnel</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.desktop.autostartTunnelsOnLaunch}
              onClick={() => handleToggleDesktop('autostartTunnelsOnLaunch')}
              disabled={savingDesktop !== null}
              className={`flex-shrink-0 relative w-11 h-6 rounded-full transition-colors duration-150 disabled:opacity-40 ${
                settings.desktop.autostartTunnelsOnLaunch ? 'bg-orange-500' : 'bg-zinc-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-150 ${
                settings.desktop.autostartTunnelsOnLaunch ? 'translate-x-5' : ''
              }`} />
            </button>
          </label>
        </section>
      )}

      {/* cloudflared */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-zinc-200">cloudflared</h2>
        {settingsLoading ? (
          <div className="h-16 bg-zinc-800 rounded-xl animate-pulse" />
        ) : settings === null ? (
          <p className="text-sm text-zinc-500">API ยังไม่พร้อม</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${settings.cloudflared.installed ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span className="text-sm text-zinc-200 font-medium">
                    {settings.cloudflared.installed ? `ติดตั้งแล้ว (${settings.cloudflared.version ?? '?'})` : 'ยังไม่ได้ติดตั้ง'}
                  </span>
                </div>
                {settings.cloudflared.path && (
                  <p className="text-xs text-zinc-500 font-mono truncate mt-0.5">{settings.cloudflared.path}</p>
                )}
              </div>
              <Button onClick={handleInstallCloudflared} disabled={installing} loading={installing} variant="secondary" className="text-xs px-3 py-2 min-h-0 flex-shrink-0">
                {settings.cloudflared.installed ? 'ติดตั้งใหม่' : 'ติดตั้ง'}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 px-3 py-3 rounded-xl bg-zinc-900 border border-zinc-700">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${settings.cloudflared.loggedIn ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-sm text-zinc-200 font-medium">
                  {settings.cloudflared.loggedIn ? 'เข้าสู่ระบบ Cloudflare แล้ว' : 'ยังไม่ได้เข้าสู่ระบบ'}
                </span>
              </div>
              <Button
                onClick={handleLoginCloudflared}
                disabled={loggingIn || !settings.cloudflared.installed}
                loading={loggingIn}
                variant="secondary"
                className="text-xs px-3 py-2 min-h-0 flex-shrink-0"
              >
                {settings.cloudflared.loggedIn ? 'เข้าสู่ระบบใหม่' : 'เข้าสู่ระบบ'}
              </Button>
            </div>
          </>
        )}
      </section>

      {/* Domains */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Domains</h2>
          <RefreshButton onClick={fetchDomains} disabled={domainsLoading} loading={domainsLoading} />
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
            value={domainZoneInput}
            onChange={e => setDomainZoneInput(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
          />
          <button
            type="submit"
            disabled={addingDomain || !domainInput || !domainZoneInput}
            className="min-h-[48px] w-full rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white text-sm font-semibold disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
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
          <RefreshButton onClick={fetchReqs} disabled={reqsLoading} loading={reqsLoading} />
        </div>

        {reqsLoading ? (
          <div className="space-y-1 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-zinc-800 rounded-xl" />)}
          </div>
        ) : Object.keys(reqs).length === 0 ? (
          <p className="text-sm text-zinc-500">ไม่พบข้อมูล</p>
        ) : (
          <ul className="space-y-1">
            {Object.entries(reqs).map(([k, raw]) => {
              const ok = typeof raw === 'boolean' ? raw : raw.ok
              const optional = typeof raw === 'boolean' ? false : raw.optional
              const missingButOptional = !ok && optional
              return (
                <li key={k} className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm ${
                  ok ? 'bg-emerald-500/5 border border-emerald-500/10'
                    : missingButOptional ? 'bg-zinc-800/40 border border-zinc-700/50'
                    : 'bg-red-500/5 border border-red-500/10'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    ok ? 'bg-emerald-500/20 text-emerald-400'
                      : missingButOptional ? 'bg-zinc-700 text-zinc-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {ok ? '✓' : missingButOptional ? '–' : '✗'}
                  </span>
                  <span className={ok ? 'text-zinc-200' : 'text-zinc-400'}>
                    {k}{missingButOptional ? ' (ไม่จำเป็นสำหรับ native mode)' : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* App info */}
      <section className="bg-[#18181b] border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">App</h2>
          <span className="text-xs text-zinc-500 font-mono">v{settings?.appVersion ?? '?'}</span>
        </div>
      </section>
    </div>
  )
}
