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
  [/no such host|dns/i, 'แก้ hostname ไม่ได้ (ปัญหา DNS)'],
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

// Parses a text log (or tail of one) into current connection state.
// Returns activeConnections clamped to [0,4] per cloudflared's max of 4 edge connections.
function parseLogText(text) {
  const connections = new Map(); // connIndex -> {connIndex, location, protocol, since}
  let lastError = null; // {time, message, hint}
  let lastErrorAt = null; // ms epoch, or null if unparseable/absent
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
      lastError = { time: validTs ? tsRaw : null, message, hint: errorHint(message) };
      if (validTs) lastErrorAt = tsMs;
    }
  }

  const activeConnections = Math.min(connections.size, 4);
  return {
    connections: [...connections.values()].sort((a, b) => a.connIndex - b.connIndex),
    activeConnections,
    lastError,
    lastErrorAt,
    lastRegisteredAt,
    lastEventAt,
  };
}

// running: whether the process/container is currently alive.
function deriveHealth({ running, activeConnections, lastErrorAt, lastRegisteredAt }) {
  if (!running) return 'stopped';
  if (lastErrorAt != null && (lastRegisteredAt == null || lastErrorAt > lastRegisteredAt)) {
    return 'error';
  }
  if (activeConnections === 0) return 'connecting';
  if (activeConnections < 4) return 'degraded';
  return 'connected';
}

module.exports = { parseLogText, deriveHealth, errorHint, LINE_RE };
