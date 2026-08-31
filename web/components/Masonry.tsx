'use client'
import { Children, isValidElement, useCallback, useLayoutEffect, useRef, useState } from 'react'

interface MasonryProps {
  gap?: number
  children: React.ReactNode
}

function getColumns(width: number): number {
  if (width >= 1920) return 4
  if (width >= 1280) return 3
  if (width >= 768) return 2
  return 1
}

interface Pos { x: number; y: number; w: number }

export default function Masonry({ gap = 20, children }: MasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [height, setHeight] = useState(0)
  const [positions, setPositions] = useState<Pos[] | null>(null)
  const items = Children.toArray(children)
  itemRefs.current.length = items.length

  const layout = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const width = container.offsetWidth
    if (width === 0) return
    const cols = getColumns(window.innerWidth)
    const colWidth = (width - gap * (cols - 1)) / cols
    const colHeights = new Array(cols).fill(0)
    const next: Pos[] = []
    itemRefs.current.forEach(el => {
      let col = 0
      for (let i = 1; i < cols; i++) if (colHeights[i] < colHeights[col]) col = i
      const x = col * (colWidth + gap)
      const y = colHeights[col]
      next.push({ x, y, w: colWidth })
      colHeights[col] = y + (el?.offsetHeight ?? 0) + gap
    })
    setPositions(next)
    setHeight(Math.max(0, ...colHeights) - gap)
  }, [gap])

  useLayoutEffect(() => {
    layout()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => layout())
    ro.observe(container)
    itemRefs.current.forEach(el => el && ro.observe(el))
    window.addEventListener('resize', layout)
    return () => { ro.disconnect(); window.removeEventListener('resize', layout) }
  }, [layout, items.length])

  const ready = positions !== null && positions.length === items.length

  return (
    <div ref={containerRef} className="relative w-full" style={ready ? { height } : undefined}>
      {items.map((child, i) => {
        const pos = ready ? positions![i] : null
        return (
          <div
            key={isValidElement(child) && child.key != null ? child.key : i}
            ref={el => { itemRefs.current[i] = el }}
            style={pos ? { position: 'absolute', top: pos.y, left: pos.x, width: pos.w, transition: 'top 150ms ease, left 150ms ease' } : { marginBottom: gap }}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}
