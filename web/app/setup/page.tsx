'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Toast from '@/components/Toast'

interface SettingsResponse {
  cloudflare: { apiTokenSet: boolean; apiTokenMasked: string | null; zoneId: string | null; accountEmail?: string }
  runtime: { mode: string; effectiveMode: string; dockerAvailable: boolean; dataDir: string; desktopMode: boolean }
  cloudflared: { installed: boolean; version: string | null; path: string | null; loggedIn: boolean }
}

type Step = 1 | 2 | 3

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
  const [cloudflared, setCloudflared] = useState<SettingsResponse['cloudflared'] | null>(null)

  const [installing, setInstalling] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [tokenInput, setTokenInput] = useState('')
  const [zoneIdInput, setZoneIdInput] = useState('')
  const [savingCloudflare, setSavingCloudflare] = useState(false)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data: SettingsResponse = await res.json()
        setCloudflared(data.cloudflared)
        if (data.cloudflared.installed && data.cloudflared.loggedIn) setStep(3)
        else if (data.cloudflared.installed) setStep(2)
        else setStep(1)
      }
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
        setStep(2)
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
            setStep(3)
          } else if (Date.now() - startedAt > 5 * 60 * 1000) {
            if (loginPollRef.current) clearInterval(loginPollRef.current)
            setLoggingIn(false)
            showToast('หมดเวลารอ login', 'error')
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch { showToast('ไม่สามารถเริ่ม login ได้', 'error'); setLoggingIn(false) }
  }

  const handleSaveCloudflare = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCloudflare(true)
    try {
      const body: { cloudflare: { apiToken?: string; zoneId?: string } } = { cloudflare: {} }
      if (tokenInput.trim()) body.cloudflare.apiToken = tokenInput.trim()
      if (zoneIdInput.trim()) body.cloudflare.zoneId = zoneIdInput.trim()
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) showToast('บันทึกแล้ว', 'success')
      else { const data = await res.json(); showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error') }
    } catch { showToast('ไม่สามารถบันทึกได้', 'error') }
    finally { setSavingCloudflare(false); router.push('/') }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      {toast && <Toast message={toast.msg} type={toast.type} />}
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-500 flex items-center justify-center shadow-glow-orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <circle cx="12" cy="12" r="9" />
              <path d="M3.6 9h16.8M3.6 15h16.8" />
              <path d="M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-100">ตั้งค่า Tunnel Manager</h1>
          <p className="text-sm text-zinc-500">เริ่มต้นใช้งานใน 3 ขั้นตอน</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <StepDot step={1} active={step === 1} done={step > 1} />
          <div className={`w-8 h-px ${step > 1 ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
          <StepDot step={2} active={step === 2} done={step > 2} />
          <div className={`w-8 h-px ${step > 2 ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
          <StepDot step={3} active={step === 3} done={false} />
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
                  {cloudflared?.installed
                    ? `ติดตั้งแล้ว (${cloudflared.version ?? '?'})`
                    : 'จำเป็นสำหรับสร้างและรัน tunnel'}
                </p>
              </div>
              <Button onClick={handleInstall} disabled={installing} loading={installing} variant="primary" className="w-full">
                {cloudflared?.installed ? 'ถัดไป' : 'ติดตั้ง cloudflared'}
              </Button>
              {cloudflared?.installed && (
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
                  {cloudflared?.loggedIn ? 'เข้าสู่ระบบแล้ว' : 'จะเปิดแท็บใหม่ไปยัง Cloudflare เพื่อยืนยันตัวตน'}
                </p>
              </div>
              <Button onClick={handleLogin} disabled={loggingIn} loading={loggingIn} variant="primary" className="w-full">
                {loggingIn ? 'กำลังรอการยืนยัน...' : cloudflared?.loggedIn ? 'ถัดไป' : 'เข้าสู่ระบบ Cloudflare'}
              </Button>
              {cloudflared?.loggedIn && (
                <button onClick={() => setStep(3)} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  ถัดไป
                </button>
              )}
            </>
          ) : (
            <>
              <div>
                <h2 className="font-semibold text-zinc-200 mb-1">3. ตั้งค่าเพิ่มเติม (ไม่บังคับ)</h2>
                <p className="text-sm text-zinc-500">API Token และ Zone ID สำหรับจัดการ DNS อัตโนมัติ</p>
              </div>
              <form onSubmit={handleSaveCloudflare} className="space-y-3">
                <input
                  type="password"
                  placeholder="Cloudflare API Token (ไม่บังคับ)"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                <input
                  type="text"
                  placeholder="Zone ID (ไม่บังคับ)"
                  value={zoneIdInput}
                  onChange={e => setZoneIdInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                <Button onClick={() => {}} disabled={savingCloudflare} loading={savingCloudflare} variant="primary" className="w-full">
                  เสร็จสิ้น
                </Button>
              </form>
              <button onClick={() => router.push('/')} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                ข้าม ไปที่ dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
