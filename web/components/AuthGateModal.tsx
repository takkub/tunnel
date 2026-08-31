'use client'
import { useState, useEffect } from 'react'

interface Props {
  tunnelName: string
  tunnelRunning?: boolean
  onSuccess: (msg: string, type?: 'success' | 'warning') => void
  onError: (msg: string) => void
  onClose: () => void
}

export default function AuthGateModal({ tunnelName, tunnelRunning, onSuccess, onError, onClose }: Props) {
  const [loadingState, setLoadingState] = useState(true)
  const [initialEnabled, setInitialEnabled] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tunnels/${tunnelName}/auth-gate`)
      .then(r => r.json())
      .then(data => {
        setInitialEnabled(!!data.enabled)
        setEnabled(!!data.enabled)
      })
      .catch(() => {})
      .finally(() => setLoadingState(false))
  }, [tunnelName])

  const needsPassword = enabled && (!initialEnabled || changingPassword)
  const passwordValid = !needsPassword || (password.length > 0 && password === confirmPassword)
  const disabling = !enabled && initialEnabled

  const handleSave = async () => {
    if (disabling && !confirmDisable) {
      setConfirmDisable(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: { enabled: boolean; password?: string } = { enabled }
      if (needsPassword) body.password = password
      const res = await fetch(`/api/tunnels/${tunnelName}/auth-gate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data: { error?: string; restartError?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'เกิดข้อผิดพลาด')
      if (data.restartError) {
        onSuccess(
          `ตั้งค่า gate แล้วแต่ restart tunnel ไม่สำเร็จ: ${data.restartError} — traffic ยังใช้ config เก่า กด "รีสตาร์ท" ที่การ์ด`,
          'warning'
        )
        return
      }
      const base = enabled ? 'เปิดใช้งาน password login page แล้ว' : 'ปิดใช้งาน password login page แล้ว'
      onSuccess(tunnelRunning ? `${base} restart tunnel ให้แล้ว` : base)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด'
      setError(msg)
      onError(msg)
      setSaving(false)
      setConfirmDisable(false)
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
        <div className="mx-auto mb-5 w-10 h-1 rounded-full bg-zinc-700 md:hidden" />

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-100">Password Protection</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center text-sm transition-colors">
            ✕
          </button>
        </div>

        {loadingState ? (
          <div className="flex items-center justify-center py-10">
            <span className="w-6 h-6 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium text-zinc-200">Password login page</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => { setEnabled(!enabled); setConfirmDisable(false) }}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-orange-500' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {enabled && initialEnabled && !changingPassword && (
              <button
                type="button"
                onClick={() => setChangingPassword(true)}
                className="text-sm text-orange-400 hover:text-orange-300 text-left transition-colors"
              >
                เปลี่ยนรหัสผ่าน
              </button>
            )}

            {needsPassword && (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="รหัสผ่าน"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? 'ซ่อน' : 'แสดง'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="ยืนยันรหัสผ่าน"
                    className={inputClass}
                  />
                  {password && confirmPassword && password !== confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-400">รหัสผ่านไม่ตรงกัน</p>
                  )}
                </div>
              </>
            )}

            <p className="text-xs text-zinc-500">
              การเปลี่ยนแปลงจะ restart tunnel นี้โดยอัตโนมัติ
            </p>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <span className="text-red-500">✗</span>
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-1">
              {confirmDisable ? (
                <>
                  <p className="text-sm text-red-400 text-center">ยืนยันการปิด password protection?</p>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="min-h-[48px] w-full rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-base font-semibold disabled:opacity-40 transition-all duration-150 flex items-center justify-center gap-2"
                  >
                    {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    ยืนยันปิด
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisable(false)}
                    disabled={saving}
                    className="min-h-[44px] w-full rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-base hover:bg-zinc-700 disabled:opacity-40 transition-all duration-150"
                  >
                    ยกเลิก
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={saving || !passwordValid}
                    className={`min-h-[48px] w-full rounded-xl text-white text-base font-semibold disabled:!bg-zinc-800 disabled:!text-zinc-600 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2 ${
                      disabling ? 'bg-red-600 hover:bg-red-500 active:bg-red-700' : 'bg-orange-500 hover:bg-orange-400 active:bg-orange-600'
                    }`}
                  >
                    {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {disabling ? 'Disable' : saving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="min-h-[44px] w-full rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-base hover:bg-zinc-700 disabled:opacity-40 transition-all duration-150"
                  >
                    ยกเลิก
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
