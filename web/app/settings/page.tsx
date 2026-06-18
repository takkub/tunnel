'use client'
import { useEffect, useState } from 'react'
import Button from '@/components/Button'
import Toast from '@/components/Toast'

type RuntimeMode = 'auto' | 'docker' | 'native'

interface RuntimeInfo {
  mode: RuntimeMode
  dockerAvailable: boolean
  effective: string
}

export default function SettingsPage() {
  const [reqs, setReqs] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [selectedMode, setSelectedMode] = useState<RuntimeMode>('auto')
  const [savingRuntime, setSavingRuntime] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchReqs = async () => {
    setLoading(true)
    const res = await fetch('/api/requirements')
    const data = await res.json()
    setReqs(data.requirements ?? {})
    setLoading(false)
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
    } catch {
      // API not yet available — section stays hidden
    } finally {
      setRuntimeLoading(false)
    }
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
      if (res.ok) {
        setRuntime(data)
        showToast('บันทึก runtime mode แล้ว', 'success')
      } else {
        showToast(data.error ?? 'เกิดข้อผิดพลาด', 'error')
      }
    } catch {
      showToast('ไม่สามารถบันทึกได้', 'error')
    } finally {
      setSavingRuntime(false)
    }
  }

  useEffect(() => {
    fetchReqs()
    fetchRuntime()
  }, [])

  const modeOptions: { value: RuntimeMode; label: string; desc: string }[] = [
    { value: 'auto', label: 'Auto', desc: 'ใช้ Docker ถ้ามี, fallback native' },
    { value: 'docker', label: 'Docker', desc: 'บังคับใช้ Docker เสมอ' },
    { value: 'native', label: 'Native', desc: 'ใช้ cloudflared โดยตรง' },
  ]

  return (
    <div className="max-w-xl space-y-4">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      {/* Runtime Mode */}
      <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-200">Runtime Mode</h2>
          {runtime && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300 font-mono">
              ใช้งาน: {runtime.effective}
            </span>
          )}
        </div>

        {runtimeLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-800 rounded-xl" />)}
          </div>
        ) : runtime === null ? (
          <p className="text-sm text-gray-500">API ยังไม่พร้อม</p>
        ) : (
          <>
            <div className="space-y-2">
              {modeOptions.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    selectedMode === opt.value
                      ? 'border-blue-500 bg-blue-950/30'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="runtimeMode"
                    value={opt.value}
                    checked={selectedMode === opt.value}
                    onChange={() => setSelectedMode(opt.value)}
                    className="accent-blue-500 w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-100">{opt.label}</span>
                      {opt.value === 'docker' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          runtime.dockerAvailable
                            ? 'bg-green-900 text-green-300'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {runtime.dockerAvailable ? 'พร้อมใช้' : 'ไม่พบ'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
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
      </div>

      {/* Requirements */}
      <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-200">Requirements</h2>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-800 rounded" />)}
          </div>
        ) : Object.keys(reqs).length === 0 ? (
          <p className="text-sm text-gray-500">ไม่พบข้อมูล</p>
        ) : (
          <ul>
            {Object.entries(reqs).map(([k, v]) => (
              <li key={k} className="flex items-center gap-3 text-base py-3 border-b border-gray-800 last:border-0">
                <span className={`text-xl leading-none ${v ? 'text-green-400' : 'text-red-400'}`} aria-label={v ? 'ผ่าน' : 'ล้มเหลว'}>
                  {v ? '✓' : '✗'}
                </span>
                <span className="text-gray-200">{k}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="pt-2 border-t border-gray-800">
          <Button onClick={handleLogin} variant="primary" className="w-full min-h-[52px] rounded-xl text-base">
            Login Cloudflare
          </Button>
        </div>
      </div>
    </div>
  )
}
