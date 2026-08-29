'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Toast from '@/components/Toast'

interface Zone { id: string; name: string; status: string }

interface SettingsResponse {
  cloudflare: { apiTokenSet: boolean; apiTokenMasked: string | null; zoneId: string | null; zoneName?: string | null; accountEmail?: string }
  runtime: { mode: string; effectiveMode: string; dockerAvailable: boolean; dataDir: string; desktopMode: boolean }
  cloudflared: { installed: boolean; version: string | null; path: string | null; loggedIn: boolean }
  admin?: { passwordSet: boolean }
}

interface SetupSteps {
  cloudflaredInstalled: boolean
  loggedIn: boolean
  tokenSet: boolean
  zoneSet: boolean
  adminPasswordSet: boolean
}

type Step = 1 | 2 | 3 | 4 | 5

const CHECKLIST: [keyof SetupSteps, string][] = [
  ['cloudflaredInstalled', 'ติดตั้ง cloudflared'],
  ['loggedIn', 'เข้าสู่ระบบ Cloudflare'],
  ['tokenSet', 'ตั้งค่า API Token'],
  ['zoneSet', 'เลือกโดเมน'],
  ['adminPasswordSet', 'ตั้งรหัสผ่านแอดมิน'],
]

function StepDot({ step, active, done }: { step: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
      done ? 'bg-emerald-500 border-emerald-500 text-white'
        : active ? 'border-orange-500 text-orange-400 bg-orange-500/10'
        : 'border-zinc-700 text-zinc-500'
    }`}>
      {done ? '✓' : step}
    </div>
  )
}

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const [checking, setChecking] = useState(true)
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [setupSteps, setSetupSteps] = useState<SetupSteps | null>(null)

  const [installing, setInstalling] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // step 3: token + zone
  const [tokenInput, setTokenInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [savingCloudflare, setSavingCloudflare] = useState(false)

  // step 4: admin password
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingAdmin, setSavingAdmin] = useState(false)

  const desktopMode = settings?.runtime.desktopMode ?? false

  const fetchStatus = async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/setup-status'),
      ])
      let settingsData: SettingsResponse | null = null
      if (settingsRes.ok) {
        settingsData = await settingsRes.json()
        setSettings(settingsData)
      }
      let steps: SetupSteps | null = null
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        steps = statusData.steps ?? null
      }
      if (!steps) {
        steps = {
          cloudflaredInstalled: settingsData?.cloudflared.installed ?? false,
          loggedIn: settingsData?.cloudflared.loggedIn ?? false,
          tokenSet: settingsData?.cloudflare.apiTokenSet ?? false,
          zoneSet: Boolean(settingsData?.cloudflare.zoneId),
          adminPasswordSet: settingsData?.admin?.passwordSet ?? false,
        }
      }
      setSetupSteps(steps)
      if (!steps.cloudflaredInstalled) setStep(1)
      else if (!steps.loggedIn) setStep(2)
      else if (!steps.tokenSet || !steps.zoneSet) setStep(3)
      else if (!steps.adminPasswordSet) setStep(4)
      else setStep(5)
    } catch { /* settings API not ready */ }
    finally { setChecking(false) }
  }

  useEffect(() => {
    fetchStatus()
    return () => { if (loginPollRef.current) clearInterval(loginPollRef.current) }
  }, [])

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const res = await fetch('/api/settings/cloudflared/install', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        showToast('ติดตั้ง cloudflared สำเร็จ', 'success')
        await fetchStatus()
      } else showToast(data.error ?? 'ติดตั้งไม่สำเร็จ', 'error')
    } catch { showToast('ไม่สามารถติดตั้งได้', 'error') }
    finally { setInstalling(false) }
  }

  const handleLogin = async () => {
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
            await fetchStatus()
          } else if (Date.now() - startedAt > 5 * 60 * 1000) {
            if (loginPollRef.current) clearInterval(loginPollRef.current)
            setLoggingIn(false)
            showToast('หมดเวลารอ login', 'error')
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch { showToast('ไม่สามารถเริ่ม login ได้', 'error'); setLoggingIn(false) }
  }

  const handleVerifyToken = async () => {
    if (!tokenInput.trim()) return
    setVerifying(true)
    setVerifyError(null)
    setVerified(false)
    setZones([])
    try {
      const res = await fetch('/api/settings/cloudflare/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: tokenInput.trim() }),
      })
      if (res.status === 404) {
        setVerifyError('ระบบตรวจสอบ token ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง')
        return
      }
      const data = await res.json()
      if (res.ok && data.valid) {
        setZones(data.zones ?? [])
        setSelectedZoneId(data.zones?.[0]?.id ?? '')
        setVerified(true)
        showToast('Token ถูกต้อง', 'success')
      } else {
        setVerifyError(data.error ?? 'Token ไม่ถูกต้อง')
      }
    } catch { setVerifyError('ไม่สามารถตรวจสอบได้') }
    finally { setVerifying(false) }
  }

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verified || !selectedZoneId) return
    setSavingCloudflare(true)
    try {
      const zone = zones.find(z => z.id === selectedZoneId)
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudflare: { apiToken: tokenInput.trim(), zoneId: selectedZoneId, zoneName: zone?.name } }),
      })
      if (res.ok) { showToast('บันทึกแล้ว', 'success'); await fetchStatus() }
      else { const data = await res.json(); showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error') }
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingCloudflare(false) }
  }

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    const hasInput = Boolean(password || confirmPassword)
    if (!hasInput && !desktopMode) {
      showToast('กรุณาตั้งรหัสผ่านแอดมิน', 'error')
      return
    }
    if (hasInput) {
      if (password.length < 8) { showToast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error'); return }
      if (password !== confirmPassword) { showToast('รหัสผ่านไม่ตรงกัน', 'error'); return }
    }
    setSavingAdmin(true)
    try {
      if (hasInput) {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin: { password } }),
        })
        if (!res.ok) {
          const data = await res.json()
          showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
          return
        }
        showToast('บันทึกแล้ว', 'success')
        await fetchStatus()
      } else {
        setStep(5)
      }
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingAdmin(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      {toast && <Toast message={toast.msg} type={toast.type} />}
      <div className="w-full max-w-md lg:max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-500 flex items-center justify-center shadow-glow-orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <circle cx="12" cy="12" r="9" />
              <path d="M3.6 9h16.8M3.6 15h16.8" />
              <path d="M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-100">ตั้งค่า Tunnel Manager</h1>
          <p className="text-sm text-zinc-500">เริ่มต้นใช้งานใน 5 ขั้นตอน</p>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className="flex items-center gap-1.5">
              <StepDot step={n} active={step === n} done={step > n} />
              {n < 5 && <div className={`w-6 h-px ${step > n ? 'bg-emerald-500' : 'bg-zinc-700'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-6 space-y-4">
          {checking ? (
            <div className="h-32 flex items-center justify-center">
              <span className="w-6 h-6 border-2 border-zinc-700 border-t-orange-400 rounded-full animate-spin" />
            </div>
          ) : step === 1 ? (
            <>
              <div>
                <h2 className="font-semibold text-zinc-200 mb-1">1. ติดตั้ง cloudflared</h2>
                <p className="text-sm text-zinc-500">
                  {settings?.cloudflared.installed
                    ? `ติดตั้งแล้ว (${settings.cloudflared.version ?? '?'})`
                    : 'จำเป็นสำหรับสร้างและรัน tunnel'}
                </p>
              </div>
              <Button onClick={handleInstall} disabled={installing} loading={installing} variant="primary" className="w-full">
                {settings?.cloudflared.installed ? 'ถัดไป' : 'ติดตั้ง cloudflared'}
              </Button>
              {settings?.cloudflared.installed && (
                <button onClick={() => setStep(2)} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  ข้ามไปขั้นตอนถัดไป
                </button>
              )}
            </>
          ) : step === 2 ? (
            <>
              <div>
                <h2 className="font-semibold text-zinc-200 mb-1">2. เข้าสู่ระบบ Cloudflare</h2>
                <p className="text-sm text-zinc-500">
                  {settings?.cloudflared.loggedIn ? 'เข้าสู่ระบบแล้ว' : 'จะเปิดแท็บใหม่ไปยัง Cloudflare เพื่อยืนยันตัวตน'}
                </p>
              </div>
              <Button onClick={handleLogin} disabled={loggingIn} loading={loggingIn} variant="primary" className="w-full">
                {loggingIn ? 'กำลังรอการยืนยัน...' : settings?.cloudflared.loggedIn ? 'ถัดไป' : 'เข้าสู่ระบบ Cloudflare'}
              </Button>
              {settings?.cloudflared.loggedIn && (
                <button onClick={() => setStep(3)} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  ถัดไป
                </button>
              )}
            </>
          ) : step === 3 ? (
            <>
              <div>
                <h2 className="font-semibold text-zinc-200 mb-1">3. เชื่อมต่อโดเมน Cloudflare</h2>
                <p className="text-sm text-zinc-500">ต้องใช้ API Token เพื่อจัดการ DNS อัตโนมัติ</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 space-y-2">
                <p className="text-xs text-zinc-500">
                  สร้าง token ที่มีสิทธิ์ <span className="font-mono text-zinc-400">Zone.DNS.Edit</span> สำหรับโดเมนที่ต้องการ
                </p>
                <button
                  type="button"
                  onClick={() => window.open('https://dash.cloudflare.com/profile/api-tokens', '_blank', 'noopener,noreferrer')}
                  className="text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
                >
                  เปิดหน้าสร้าง API Token ↗
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="วาง Cloudflare API Token"
                    value={tokenInput}
                    onChange={e => { setTokenInput(e.target.value); setVerified(false); setVerifyError(null) }}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyToken}
                    disabled={verifying || !tokenInput.trim()}
                    className="flex-shrink-0 px-3.5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {verifying && <span className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />}
                    ตรวจสอบ
                  </button>
                </div>
                {verifyError && <p className="text-xs text-red-400">{verifyError}</p>}
                {verified && <p className="text-xs text-emerald-400">Token ถูกต้อง — เลือกโดเมนด้านล่าง</p>}
              </div>
              {verified && (
                <form onSubmit={handleSaveZone} className="space-y-3">
                  <select
                    value={selectedZoneId}
                    onChange={e => setSelectedZoneId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/60 transition-colors"
                  >
                    {zones.length === 0 && <option value="">ไม่พบโดเมนในบัญชีนี้</option>}
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}{z.status !== 'active' ? ` (${z.status})` : ''}</option>
                    ))}
                  </select>
                  <Button onClick={() => {}} disabled={savingCloudflare || !selectedZoneId} loading={savingCloudflare} variant="primary" className="w-full">
                    ถัดไป
                  </Button>
                </form>
              )}
            </>
          ) : step === 4 ? (
            <>
              <div>
                <h2 className="font-semibold text-zinc-200 mb-1">4. รหัสผ่านแอดมิน</h2>
                <p className="text-sm text-zinc-500">
                  {desktopMode
                    ? 'จำเป็นถ้าจะเปิดหน้านี้ผ่าน tunnel (ไม่บังคับสำหรับใช้งานบนเครื่องนี้)'
                    : 'ใช้เข้าสู่ระบบเพื่อจัดการ tunnel'}
                </p>
              </div>
              <form onSubmit={handleSaveAdmin} className="space-y-3">
                <input
                  type="password"
                  placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                <input
                  type="password"
                  placeholder="ยืนยันรหัสผ่าน"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                <Button onClick={() => {}} disabled={savingAdmin} loading={savingAdmin} variant="primary" className="w-full">
                  ถัดไป
                </Button>
              </form>
              {desktopMode && (
                <button onClick={() => setStep(5)} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  ข้ามไปก่อน
                </button>
              )}
            </>
          ) : (
            <>
              <div className="text-center space-y-1">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg">✓</div>
                <h2 className="font-semibold text-zinc-200">พร้อมใช้งาน</h2>
                <p className="text-sm text-zinc-500">ตั้งค่าเสร็จเรียบร้อยแล้ว</p>
              </div>
              <ul className="space-y-1.5">
                {CHECKLIST.map(([key, label]) => {
                  const ok = setupSteps?.[key] ?? false
                  return (
                    <li key={key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${ok ? 'bg-emerald-500/5 text-zinc-200' : 'bg-zinc-900 text-zinc-500'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-600'}`}>
                        {ok ? '✓' : '–'}
                      </span>
                      {label}
                    </li>
                  )
                })}
              </ul>
              <Button onClick={() => router.push('/?create=1')} variant="primary" className="w-full">
                สร้าง tunnel แรก
              </Button>
              <button onClick={() => router.push('/')} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                ไปที่ dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
