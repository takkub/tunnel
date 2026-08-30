'use client'
import { useEffect, useState } from 'react'
import RefreshButton from '@/components/RefreshButton'
import { formatBytes, formatOps, formatUsd, usdToThb, barColor } from '@/lib/r2-pricing-ui'

interface UsageBucket { count: number; free: number; usedPct: number }
interface R2UsageResponse {
  configured: boolean
  bucket: string | null
  storage: { bytes: number; objectCount: number; truncated: boolean; freeBytes: number; usedPct: number }
  ops: { classA: UsageBucket; classB: UsageBucket; period: { from: string; to: string } } | null
  opsUnavailableReason: string | null
  cost: { storageUsd: number; classAUsd: number; classBUsd: number; totalUsd: number }
  fetchedAt: number | string
  cached: boolean
}

interface Props {
  analyticsTokenSet: boolean
  analyticsTokenMasked: string | null
  onSaveAnalyticsToken: (token: string) => Promise<void>
}

function UsageBar({ label, usedText, pct, dimmed }: { label: string; usedText: string; pct: number; dimmed?: boolean }) {
  return (
    <div className={dimmed ? 'opacity-40' : ''}>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-500 font-mono">{usedText}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
          style={{ width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct))}%` }}
        />
      </div>
    </div>
  )
}

function formatAgo(ts: number | string): string {
  const parsed = typeof ts === 'string' ? new Date(ts).getTime() : ts
  if (!Number.isFinite(parsed)) return 'อัปเดตเมื่อสักครู่'
  const mins = Math.max(0, Math.floor((Date.now() - parsed) / 60000))
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  return `${hrs} ชม.ที่แล้ว`
}

export default function R2UsageCard({ analyticsTokenSet, analyticsTokenMasked, onSaveAnalyticsToken }: Props) {
  const [data, setData] = useState<R2UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [editingToken, setEditingToken] = useState(false)
  const [savingToken, setSavingToken] = useState(false)

  const fetchUsage = async (refresh = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/r2/usage${refresh ? '?refresh=1' : ''}`)
      if (res.ok) {
        setData(await res.json())
        setUnavailable(false)
      } else {
        setUnavailable(true)
      }
    } catch {
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsage()
  }, [])

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return
    setSavingToken(true)
    try {
      await onSaveAnalyticsToken(tokenInput.trim())
      setTokenInput('')
      setEditingToken(false)
      fetchUsage(true)
    } finally {
      setSavingToken(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="pt-1 border-t border-zinc-800 space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-8 bg-zinc-800 rounded-lg" />)}
      </div>
    )
  }

  if (unavailable || !data) {
    return (
      <div className="pt-1 border-t border-zinc-800">
        <p className="text-xs text-zinc-500">R2 Usage API ยังไม่พร้อมใช้งาน</p>
      </div>
    )
  }

  if (!data.configured) {
    return (
      <div className="pt-1 border-t border-zinc-800">
        <p className="text-sm text-zinc-500">ตั้งค่า R2 ด้านบนก่อนเพื่อดูปริมาณการใช้งาน</p>
      </div>
    )
  }

  const ops = data.ops
  const opsBars = [
    { key: 'classA', label: 'Class A ops', bucket: ops?.classA },
    { key: 'classB', label: 'Class B ops', bucket: ops?.classB },
  ] as const

  return (
    <div className="pt-1 border-t border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-200">R2 Usage</h3>
          <p className="text-xs text-zinc-500 truncate">อัปเดต{data.cached ? '' : 'ล่าสุด'} {formatAgo(data.fetchedAt)}</p>
        </div>
        <RefreshButton onClick={() => fetchUsage(true)} loading={loading} />
      </div>

      <div className="space-y-3">
        <div>
          <UsageBar
            label="Storage"
            usedText={`${formatBytes(data.storage.bytes)} / ${formatBytes(data.storage.freeBytes)} (${data.storage.usedPct.toFixed(1)}%)`}
            pct={data.storage.usedPct}
          />
          {data.storage.truncated && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">
              (นับถึง 50k ไฟล์)
            </span>
          )}
        </div>

        {opsBars.map(({ key, label, bucket }) => (
          <UsageBar
            key={key}
            label={label}
            usedText={bucket ? `${formatOps(bucket.count)} / ${formatOps(bucket.free)} (${bucket.usedPct.toFixed(1)}%)` : '—'}
            pct={bucket?.usedPct ?? 0}
            dimmed={!bucket}
          />
        ))}

        {!ops && (
          <div className="text-xs text-zinc-500 space-y-1.5">
            <p>{data.opsUnavailableReason ?? 'ไม่สามารถดึงข้อมูล ops ได้'}</p>
            {!editingToken ? (
              <button
                type="button"
                onClick={() => setEditingToken(true)}
                className="text-orange-400 hover:underline"
              >
                {analyticsTokenSet ? 'เปลี่ยน Analytics token' : '+ เพิ่ม Analytics token'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  autoFocus
                  placeholder={analyticsTokenSet ? (analyticsTokenMasked ?? '••••••••') : 'วาง Analytics token'}
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSaveToken}
                  disabled={savingToken || !tokenInput.trim()}
                  className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                >
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingToken(false); setTokenInput('') }}
                  className="flex-shrink-0 px-2.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-zinc-400">
        {data.cost.totalUsd <= 0 ? (
          <span className="text-emerald-400">อยู่ใน free tier 🎉</span>
        ) : (
          <span>
            ประมาณ {formatUsd(data.cost.totalUsd)} / เดือน{' '}
            <span className="text-zinc-500">(≈ ฿{usdToThb(data.cost.totalUsd).toFixed(0)})</span>
          </span>
        )}
      </div>
    </div>
  )
}
