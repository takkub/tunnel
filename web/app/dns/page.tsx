'use client'
import { useState } from 'react'
import Toast from '@/components/Toast'

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mb-1 opacity-70">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mb-1 opacity-70">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function IconWrench() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mb-1 opacity-70">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mb-1 opacity-70">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

interface DnsAction {
  label: string
  desc: string
  url: string
  method?: string
  color: 'blue' | 'red' | 'orange' | 'emerald'
  Icon: () => React.ReactElement
}

const ACTIONS: DnsAction[] = [
  { label: 'ตรวจสอบ DNS', desc: 'Check current DNS records', url: '/api/dns/check', color: 'blue', Icon: IconSearch },
  { label: 'แสดง CNAMEs', desc: 'List all CNAME records', url: '/api/dns/cnames', color: 'emerald', Icon: IconList },
  { label: 'แก้ไข DNS', desc: 'Auto-fix DNS misconfigs', url: '/api/dns/fix', method: 'POST', color: 'orange', Icon: IconWrench },
  { label: 'ล้าง CNAMEs', desc: 'Remove all CNAME records', url: '/api/dns/cleanup-cnames', method: 'POST', color: 'red', Icon: IconTrash },
]

const colorMap = {
  blue:    'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/15',
  emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15',
  orange:  'bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/15',
  red:     'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15',
}

export default function DnsPage() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [output, setOutput] = useState('')
  const [activeAction, setActiveAction] = useState<string | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const call = async (action: DnsAction) => {
    setActiveAction(action.label)
    setOutput('')
    const res = await fetch(action.url, { method: action.method ?? 'GET' })
    const data = await res.json()
    setOutput(JSON.stringify(data, null, 2))
    showToast(data.message ?? 'เสร็จแล้ว', res.ok ? 'success' : 'error')
    setActiveAction(null)
  }

  return (
    <div className="max-w-2xl space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map(action => (
          <button
            key={action.label}
            onClick={() => call(action)}
            disabled={activeAction !== null}
            className={`relative flex flex-col items-start gap-1 p-4 rounded-2xl border text-left transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed min-h-[80px] ${colorMap[action.color]}`}
          >
            {activeAction === action.label && (
              <span className="absolute top-3 right-3 w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
            )}
            <action.Icon />
            <span className="font-semibold text-sm">{action.label}</span>
            <span className="text-xs opacity-60">{action.desc}</span>
          </button>
        ))}
      </div>

      {output && (
        <div className="rounded-2xl overflow-hidden border border-zinc-800">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
            <span className="text-xs text-zinc-400 font-mono">output</span>
            <button
              onClick={() => setOutput('')}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              ✕
            </button>
          </div>
          <pre className="bg-[#0a0a0a] px-4 py-4 text-xs text-emerald-400 whitespace-pre-wrap max-h-72 overflow-auto font-mono leading-relaxed">{output}</pre>
        </div>
      )}
    </div>
  )
}
