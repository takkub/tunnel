// Canonical shape of a single tunnel's health, shared between the API route
// (web/app/api/tunnels/health/route.ts, which just JSON.parses
// scripts/tunnel-health.js's stdout) and the UI that consumes it
// (TunnelCard.tsx). Keeping one type here — instead of each side re-declaring
// its own — means a field renamed on one side breaks the TS build on the
// other, instead of silently reading `undefined` at runtime (the failure
// mode that produced the "เชื่อมต่อ ?/4" badge: the UI's optional-chained
// field read never threw, it just always came back empty).
export type HealthState = 'connected' | 'connecting' | 'degraded' | 'error' | 'origin-down' | 'stopped'

export interface TunnelHealth {
  name: string
  running: boolean
  health: HealthState
  activeConnections: number
  connections: { connIndex: number; location: string; protocol: string; since: string }[]
  lastError: { time: string; message: string; hint?: string } | null
  originError: { time: string; message: string; hint?: string; ageSec: number } | null
  lastWarning?: { time: string; message: string; hint?: string } | null
  lastEventAt: string
  uptimeSec: number
}

export interface TunnelHealthResponse {
  tunnels: TunnelHealth[]
}
