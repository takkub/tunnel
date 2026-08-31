// Canonical shape of a single tunnel's health, shared between the API route
// (web/app/api/tunnels/health/route.ts, which just JSON.parses
// scripts/tunnel-health.js's stdout) and the UI that consumes it
// (TunnelCard.tsx). Keeping one type here — instead of each side re-declaring
// its own — means a field renamed on one side breaks the TS build on the
// other, instead of silently reading `undefined` at runtime (the failure
// mode that produced the "เชื่อมต่อ ?/4" badge: the UI's optional-chained
// field read never threw, it just always came back empty).
export type HealthState = 'connected' | 'connecting' | 'degraded' | 'error' | 'origin-down' | 'stopped' | 'foreign'

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
  // Set only when health is 'foreign': the pid of a live cloudflared process for
  // this tunnel that the app never recorded a .pid for (started outside it —
  // e.g. the generated start.bat/start.sh launcher, or a manual invocation).
  // The app can't stop/restart it via its usual pid-file path; the restart
  // action kills this pid first, then starts an app-managed process instead.
  foreignPid?: number | null
}

export interface TunnelHealthResponse {
  tunnels: TunnelHealth[]
}
