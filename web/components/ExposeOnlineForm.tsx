'use client'
import { useState } from 'react'
import Link from 'next/link'
import Button from '@/components/Button'

// Inline "expose this dashboard to the internet" flow, shared by the sidebar
// web-status block, the Settings "Web Server" card, and the setup wizard's
// summary step. Reuses the existing create-tunnel + start APIs — no new
// cloudflared spawning path.
export default function ExposeOnlineForm({
  webPort,
  zoneName,
  adminPasswordSet,
  onExposed,
  compact = false,
}: {
  webPort: number
  zoneName: string | null
  adminPasswordSet: boolean
  onExposed: () => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hostname, setHostname] = useState(zoneName ? `tunnels.${zoneName}` : '')
  const [step, setStep] = useState<'idle' | 'creating' | 'starting' | 'error'>('idle')
  const [error, setError] = useState('')

  if (!adminPasswordSet) {
    return (
      <p className="text-xs text-amber-300/90">
        ต้อง<Link href="/settings" className="underline underline-offset-2 hover:text-amber-200">ตั้งรหัสผ่านแอดมิน</Link>ก่อนเปิดให้เข้าจากอินเทอร์เน็ต
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setHostname(zoneName ? `tunnels.${zoneName}` : '')
          setOpen(true)
        }}
        className={`text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors ${compact ? '' : 'underline underline-offset-2'}`}
      >
        เปิดให้เข้าจากอินเทอร์เน็ต
      </button>
    )
  }

  async function deriveAvailableName(base: string): Promise<string> {
    let existingNames = new Set<string>()
    try {
      const res = await fetch('/api/tunnels')
      if (res.ok) {
        const data = await res.json()
        existingNames = new Set((data.tunnels ?? []).map((t: { name: string }) => t.name))
      }
    } catch { /* fall through — create-tunnel.js will reject a real collision */ }
    if (!existingNames.has(base)) return base
    return `${base}-${Date.now().toString(36).slice(-4)}`
  }

  async function handleConfirm() {
    setError('')
    const trimmed = hostname.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('.')) {
      setError('กรอกโดเมนให้ครบ เช่น tunnels.example.com')
      setStep('error')
      return
    }
    const baseName = trimmed.split('.')[0].replace(/[^a-z0-9-]/g, '') || 'tunnels'
    try {
      setStep('creating')
      const name = await deriveAvailableName(baseName)
      const createRes = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hostname: trimmed, port: webPort }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error || 'สร้าง tunnel ไม่สำเร็จ')

      setStep('starting')
      const startRes = await fetch(`/api/tunnels/${name}/start`, { method: 'POST' })
      const startData = await startRes.json()
      if (!startRes.ok) throw new Error(startData.error || 'เริ่ม tunnel ไม่สำเร็จ')

      setStep('idle')
      setOpen(false)
      onExposed()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    }
  }

  const busy = step === 'creating' || step === 'starting'

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2 mt-2'}>
      <input
        type="text"
        value={hostname}
        onChange={e => setHostname(e.target.value)}
        placeholder="tunnels.example.com"
        disabled={busy}
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors disabled:opacity-50"
      />
      {step === 'error' && <p className="text-xs text-red-400">{error}</p>}
      {step === 'creating' && <p className="text-xs text-zinc-500">กำลังสร้าง tunnel...</p>}
      {step === 'starting' && <p className="text-xs text-zinc-500">กำลังเริ่มเชื่อมต่อ...</p>}
      <div className="flex gap-1.5">
        <Button onClick={handleConfirm} disabled={busy} loading={busy} variant="primary" className="!min-h-0 !py-1.5 text-xs flex-1">
          ยืนยัน
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy} variant="secondary" className="!min-h-0 !py-1.5 text-xs">
          ยกเลิก
        </Button>
      </div>
    </div>
  )
}
