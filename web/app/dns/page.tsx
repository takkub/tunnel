'use client'
import { useState } from 'react'
import Button from '@/components/Button'
import Toast from '@/components/Toast'

export default function DnsPage() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const call = async (url: string, method = 'GET') => {
    setLoading(true)
    setOutput('')
    const res = await fetch(url, { method })
    const data = await res.json()
    setOutput(JSON.stringify(data, null, 2))
    showToast(data.message ?? 'เสร็จแล้ว', res.ok ? 'success' : 'error')
    setLoading(false)
  }

  return (
    <div className="max-w-2xl">
      {toast && <Toast message={toast.msg} type={toast.type} />}
      <div className="bg-gray-900 rounded-2xl p-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => call('/api/dns/check')} disabled={loading} variant="secondary" className="w-full min-h-[56px] rounded-xl text-base">ตรวจสอบ DNS</Button>
          <Button onClick={() => call('/api/dns/cnames')} disabled={loading} variant="secondary" className="w-full min-h-[56px] rounded-xl text-base">แสดง CNAMEs</Button>
          <Button onClick={() => call('/api/dns/cleanup-cnames', 'POST')} disabled={loading} variant="danger" className="w-full min-h-[56px] rounded-xl text-base">ล้าง CNAMEs</Button>
          <Button onClick={() => call('/api/dns/fix', 'POST')} disabled={loading} variant="primary" className="w-full min-h-[56px] rounded-xl text-base">แก้ DNS</Button>
        </div>
        {output && (
          <pre className="bg-black rounded p-3 text-sm text-green-400 whitespace-pre-wrap mt-4 max-h-64 overflow-auto font-mono">{output}</pre>
        )}
      </div>
    </div>
  )
}
