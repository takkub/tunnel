'use client'
import { useEffect, useRef, useState } from 'react'
import Button from './Button'

interface Props { url: string }

export default function LogViewer({ url }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const start = () => {
    if (esRef.current) { esRef.current.close() }
    setLines([])
    setRunning(true)
    setConnected(false)
    const es = new EventSource(url)
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onmessage = e => {
      setLines(prev => [...prev, e.data])
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    es.onerror = () => { setConnected(false); setRunning(false); es.close() }
  }

  const stop = () => {
    esRef.current?.close()
    setRunning(false)
    setConnected(false)
  }

  useEffect(() => () => { esRef.current?.close() }, [])

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <Button onClick={start} disabled={running} variant="primary">เริ่ม Stream</Button>
        <Button onClick={stop} disabled={!running} variant="danger">หยุด</Button>
        <span className={`text-xs ${connected ? 'text-green-400' : 'text-gray-500'}`}>
          {connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
        </span>
      </div>
      <div className="bg-black rounded p-4 h-96 overflow-auto font-mono text-xs text-green-400 space-y-1">
        {lines.length === 0 && <span className="text-gray-600">รอ log...</span>}
        {lines.map((l, i) => <div key={i}>{l}</div>)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
