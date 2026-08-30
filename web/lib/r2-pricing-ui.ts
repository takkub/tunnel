// USD -> THB conversion for display only (not exact, edit as needed).
export const USD_TO_THB = 36

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let val = bytes / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`
}

export function formatOps(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 1_000_000) return `${(count / 1000).toFixed(count % 1000 === 0 ? 0 : 1)}K`
  return `${(count / 1_000_000).toFixed(1)}M`
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

export function usdToThb(usd: number): number {
  return usd * USD_TO_THB
}

export function barColor(pct: number): string {
  if (pct > 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-orange-500'
}
