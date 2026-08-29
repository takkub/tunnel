// Pure cloudflared log-tail parser — no fs/child_process, so it's testable
// with plain text fixtures. Consumed by tunnel-health.js for both native
// (file tail) and docker (`docker logs --tail`) modes, which share the same
// text log format.
'use strict';

// e.g. "2024-05-01T12:00:02Z INF Registered tunnel connection connIndex=0 ... location=bkk09 protocol=quic"
const LINE_RE = /^(\S+)\s+(INF|WRN|ERR|FTL|DBG)\s+(.*)$/;

const ERROR_HINTS = [
  [/unable to reach the origin service/i, 'service ปลายทาง (localhost) ไม่ตอบ'],
  [/tunnel credentials|provided tunnel credentials|401|unauthorized/i, 'credentials ผิด/ถูกลบใน Cloudflare'],
  [/connection refused/i, 'ปลายทางปฏิเสธการเชื่อมต่อ (service ยังไม่ start หรือ port ผิด)'],
  [/context canceled/i, 'การเชื่อมต่อถูกยกเลิก (มักเกิดตอนปิด/รีสตาร์ททันเนล)'],
  // "no such host" only — a bare "dns" match also caught the benign
  // "Failed to refresh DNS local resolver" edge retry noise (see BENIGN_ERR_RE).
  [/no such host/i, 'แก้ hostname ไม่ได้ (ปัญหา DNS)'],
  [/timeout|timed out/i, 'เชื่อมต่อ/รอ response นานเกินไป (timeout)'],
  [/i\/o timeout|EOF/i, 'การเชื่อมต่อกับ Cloudflare หลุดกลางทาง'],
];

function errorHint(message) {
  if (!message) return null;
  for (const [re, hint] of ERROR_HINTS) {
    if (re.test(message)) return hint;
  }
  return null;
}

// Origin-level errors (the local service behind the tunnel not responding)
// are not tunnel health problems — cloudflared itself is still connected to
// the edge with all 4 connections. e.g. 'Request failed error="Unable to
// reach the origin service: dial tcp 127.0.0.1:3000: ..."'.
const ORIGIN_ERROR_RE = /unable to reach the origin service/i;

// cloudflared's edge connections retry-and-recover on their own — these ERR
// lines are noise from that churn, not a tunnel-level problem. Only
// credentials/registration/config errors below stay tunnel-level (lastError).
const BENIGN_ERR_RE = /failed to refresh dns local resolver|failed to refresh feature selector|failed to run the datagram handler|failed to accept incoming stream requests|failed to serve tunnel connection|serve tunnel error|connection terminated|failed to dial a quic connection/i;

// Parses a text log (or tail of one) into current connection state.
// Returns activeConnections clamped to [0,4] per cloudflared's max of 4 edge connections.
function parseLogText(text) {
  const connections = new Map(); // connIndex -> {connIndex, location, protocol, since}
  let lastError = null; // {time, message, hint} — tunnel-level only (register/credentials/edge connection)
  let lastErrorAt = null; // ms epoch, or null if unparseable/absent
  let lastOriginError = null; // {time, message, hint} — origin service unreachable
  let lastOriginErrorAt = null;
  let lastWarning = null; // {time, message, hint} — benign edge-retry noise, doesn't affect health
  let lastWarningAt = null;
  let lastRegisteredAt = null;
  let lastEventAt = null;

  const lines = (text || '').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const [, tsRaw, level, message] = m;
    const tsMs = Date.parse(tsRaw);
    const validTs = Number.isFinite(tsMs);
    if (validTs) lastEventAt = tsRaw;

    if (/^Registered tunnel connection\b/.test(message)) {
      const idxM = message.match(/connIndex=(\d+)/);
      const locM = message.match(/location=(\S+)/);
      const protoM = message.match(/protocol=(\S+)/);
      if (idxM) {
        connections.set(idxM[1], {
          connIndex: Number(idxM[1]),
          location: locM ? locM[1] : null,
          protocol: protoM ? protoM[1] : null,
          since: validTs ? tsRaw : null,
        });
      }
      if (validTs) lastRegisteredAt = tsMs;
      continue;
    }

    if (/Unregistered tunnel connection|Connection terminated|Lost connection/.test(message)) {
      const idxM = message.match(/connIndex=(\d+)/);
      if (idxM) connections.delete(idxM[1]);
      continue;
    }

    if (level === 'ERR' || level === 'FTL') {
      if (ORIGIN_ERROR_RE.test(message)) {
        lastOriginError = { time: validTs ? tsRaw : null, message, hint: errorHint(message) };
        if (validTs) lastOriginErrorAt = tsMs;
      } else if (BENIGN_ERR_RE.test(message)) {
        lastWarning = { time: validTs ? tsRaw : null, message, hint: errorHint(message) };
        if (validTs) lastWarningAt = tsMs;
      } else {
        lastError = { time: validTs ? tsRaw : null, message, hint: errorHint(message) };
        if (validTs) lastErrorAt = tsMs;
      }
    }
  }

  const activeConnections = Math.min(connections.size, 4);
  return {
    connections: [...connections.values()].sort((a, b) => a.connIndex - b.connIndex),
    activeConnections,
    lastError,
    lastErrorAt,
    lastOriginError,
    lastOriginErrorAt,
    lastWarning,
    lastWarningAt,
    lastRegisteredAt,
    lastEventAt,
  };
}

// running: whether the process/container is currently alive.
// uptimeSec: how long the process has been running, used to detect a tunnel
// stuck never reaching its first Registered event.
// now: injectable clock (ms epoch) so origin-error recency is testable.
function deriveHealth({ running, activeConnections, lastErrorAt, lastRegisteredAt, lastOriginErrorAt, uptimeSec }, now = Date.now()) {
  if (!running) return 'stopped';
  if (lastErrorAt != null && (lastRegisteredAt == null || lastErrorAt > lastRegisteredAt)) {
    return 'error';
  }
  if (activeConnections === 0) {
    if (lastRegisteredAt == null && uptimeSec != null && uptimeSec > 90) return 'error';
    return 'connecting';
  }
  if (lastOriginErrorAt != null && (now - lastOriginErrorAt) / 1000 < 120) {
    return 'origin-down';
  }
  if (activeConnections < 4) return 'degraded';
  return 'connected';
}

module.exports = { parseLogText, deriveHealth, errorHint, LINE_RE, ORIGIN_ERROR_RE, BENIGN_ERR_RE };
