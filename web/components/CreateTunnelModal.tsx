'use client'
import { useState, useEffect } from 'react'

const DOMAIN = 'sabuytube.xyz'

interface Props {
  onSuccess: () => void
  onClose: () => void
}

export default function CreateTunnelModal({ onSuccess, onClose }: Props) {
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [port, setPort] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // auto-fill subdomain from tunnel name (strip -tunnel suffix)
  useEffect(() => {
    if (!subdomain) {
      const base = name.replace(/-tunnel$/, '')
      if (base) setSubdomain(base)
    }
  }, [name])

  const hostname = subdomain ? `${subdomain}.${DOMAIN}` : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hostname) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hostname, port: Number(port) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'เกิดข้อผิดพลาด')
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-base text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="fixed inset-x-0 bottom-0 rounded-t-3xl max-h-[90vh] overflow-y-auto bg-gray-900 p-6
                   md:relative md:inset-auto md:rounded-2xl md:max-h-none md:w-full md:max-w-md md:shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 w-10 h-1 rounded-full bg-gray-700 md:hidden" />
        <h2 className="text-xl font-bold text-gray-100 mb-5">สร้าง Tunnel ใหม่</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div>
            <label className="block text-sm text-gray-400 mb-1">ชื่อ Tunnel</label>
            <input
              type="text"
              required
              placeholder="myapp-tunnel"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Subdomain</label>
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded-xl overflow-hidden focus-within:border-blue-500">
              <input
                type="text"
                required
                placeholder="myapp"
                value={subdomain}
                onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 bg-transparent px-4 py-4 text-base text-gray-100 placeholder-gray-500 focus:outline-none"
              />
              <span className="pr-4 text-gray-400 text-base whitespace-nowrap">.{DOMAIN}</span>
            </div>
            {hostname && (
              <p className="mt-1 text-xs text-blue-400">→ {hostname}</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Port (local)</label>
            <input
              type="number"
              required
              placeholder="3000"
              value={port}
              onChange={e => setPort(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex flex-col gap-2 mt-2">
            <button
              type="submit"
              disabled={loading || !hostname}
              className="min-h-[48px] w-full rounded-xl bg-blue-600 text-white text-base font-medium hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {loading ? 'กำลังสร้าง...' : 'สร้าง'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-[48px] w-full rounded-xl bg-gray-800 text-gray-300 text-base hover:bg-gray-700 disabled:opacity-50 transition"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
