'use client'

import { useEffect, useRef, useState } from 'react'

interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  version: string | null
  percent: number | null
}

// Only polls when running inside the desktop app (`/api/desktop/update` is a
// no-op elsewhere) — polls at 2s while a download is in progress, 60s otherwise.
export function useUpdateStatus(enabled: boolean): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const stateRef = useRef<UpdateStatus['state'] | null>(null)
  stateRef.current = status?.state ?? null

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const res = await fetch('/api/desktop/update')
        if (res.ok && !cancelled) setStatus(await res.json())
        else if (!cancelled) setStatus(null)
      } catch {
        if (!cancelled) setStatus(null)
      }
      if (!cancelled) {
        timer = setTimeout(tick, stateRef.current === 'downloading' ? 2000 : 60000)
      }
    }
    tick()

    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [enabled])

  return status
}

export function UpdateDot({ status }: { status: UpdateStatus | null }) {
  if (status?.state !== 'downloaded') return null
  return (
    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-[#0c0c0e] animate-pulse" />
  )
}

export default function SidebarUpdateBadge({ status }: { status: UpdateStatus | null }) {
  const [installing, setInstalling] = useState(false)

  if (!status) return null

  if (status.state === 'downloaded') {
    return (
      <button
        type="button"
        disabled={installing}
        onClick={async () => {
          setInstalling(true)
          try {
            await fetch('/api/desktop/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'install' }),
            })
          } catch {
            setInstalling(false)
          }
        }}
        className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex-shrink-0"
      >
        {installing ? 'กำลังรีสตาร์ท…' : `อัปเดต v${status.version ?? ''}`}
      </button>
    )
  }

  if (status.state === 'available' || status.state === 'downloading') {
    return (
      <span className="text-[10px] text-zinc-400 flex-shrink-0">
        กำลังโหลด v{status.version ?? ''}{status.percent != null ? ` ${status.percent}%` : ''}
      </span>
    )
  }

  return null
}
