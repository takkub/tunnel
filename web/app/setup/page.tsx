'use client'
import { useState } from 'react'
import Button from '@/components/Button'
import Toast from '@/components/Toast'

export default function SetupPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [output, setOutput] = useState('')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleSetup = async () => {
    if (!name.trim()) { showToast('กรุณาใส่ชื่อ tunnel', 'error'); return }
    setLoading(true)
    setOutput('')
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    setOutput(data.output ?? '')
    showToast(data.message ?? 'สร้าง tunnel แล้ว', res.ok ? 'success' : 'error')
    setLoading(false)
  }

  return (
    <div className="max-w-xl">
      {toast && <Toast message={toast.msg} type={toast.type} />}
      <h1 className="text-2xl font-bold mb-6">ตั้งค่า Tunnel ใหม่</h1>
      <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">ชื่อ Tunnel</label>
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-4 text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="เช่น my-app"
          />
        </div>
        <Button onClick={handleSetup} disabled={loading} loading={loading} variant="primary" className="w-full">
          สร้าง Tunnel
        </Button>
        {output && (
          <pre className="bg-black rounded p-3 text-xs text-green-400 whitespace-pre-wrap mt-4">{output}</pre>
        )}
      </div>
    </div>
  )
}
