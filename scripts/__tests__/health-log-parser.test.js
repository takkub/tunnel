const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLogText, deriveHealth, errorHint } = require('../health-log-parser');

function line(ts, level, msg) {
  return `${ts} ${level} ${msg}`;
}

test('parseLogText: 4 registered connections -> full connections list, no error', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'INF', 'Starting tunnel tunnelID=abc'),
    line('2024-05-01T12:00:01Z', 'INF', 'Registered tunnel connection connIndex=0 connection=c0 event=0 ip=1.1.1.1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:02Z', 'INF', 'Registered tunnel connection connIndex=1 connection=c1 event=0 ip=1.1.1.2 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:03Z', 'INF', 'Registered tunnel connection connIndex=2 connection=c2 event=0 ip=1.1.1.3 location=sin06 protocol=quic'),
    line('2024-05-01T12:00:04Z', 'INF', 'Registered tunnel connection connIndex=3 connection=c3 event=0 ip=1.1.1.4 location=sin06 protocol=quic'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.equal(parsed.activeConnections, 4);
  assert.equal(parsed.connections.length, 4);
  assert.deepEqual(parsed.connections.map(c => c.connIndex), [0, 1, 2, 3]);
  assert.equal(parsed.connections[0].location, 'bkk09');
  assert.equal(parsed.connections[0].protocol, 'quic');
  assert.equal(parsed.lastError, null);

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'connected');
});

test('parseLogText: reconnect drops then re-adds a connIndex', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:01Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:05:00Z', 'INF', 'Unregistered tunnel connection connIndex=1'),
    line('2024-05-01T12:05:05Z', 'INF', 'Registered tunnel connection connIndex=1 location=sin06 protocol=quic'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.equal(parsed.activeConnections, 2);
  const conn1 = parsed.connections.find(c => c.connIndex === 1);
  assert.equal(conn1.location, 'sin06'); // reflects the latest registration, not the dropped one

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'degraded'); // only 2 of 4 connections up
});

test('parseLogText: "unable to reach the origin service" ERR is origin-level, not tunnel-level', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:01Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:02Z', 'INF', 'Registered tunnel connection connIndex=2 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:03Z', 'INF', 'Registered tunnel connection connIndex=3 location=bkk09 protocol=quic'),
    line('2024-05-01T12:10:00Z', 'ERR', 'Request failed error="Unable to reach the origin service: dial tcp 127.0.0.1:3000: connect: connection refused"'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.equal(parsed.lastError, null); // not a tunnel-level error
  assert.ok(parsed.lastOriginError);
  assert.match(parsed.lastOriginError.message, /Unable to reach the origin service/);
  assert.equal(parsed.lastOriginError.hint, 'service ปลายทาง (localhost) ไม่ตอบ');

  // recent origin error while conns are up -> origin-down
  const recentNow = Date.parse('2024-05-01T12:10:30Z');
  assert.equal(deriveHealth({ running: true, ...parsed }, recentNow), 'origin-down');

  // same log, but "now" is far past the 120s window -> tunnel itself is fine
  const laterNow = Date.parse('2024-05-01T13:00:00Z');
  assert.equal(deriveHealth({ running: true, ...parsed }, laterNow), 'connected');
});

test('parseLogText: tunnel-level ERR (edge connection) after last Registered -> error state with a Thai hint', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:01Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:02Z', 'INF', 'Registered tunnel connection connIndex=2 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:03Z', 'INF', 'Registered tunnel connection connIndex=3 location=bkk09 protocol=quic'),
    line('2024-05-01T12:10:00Z', 'ERR', 'Couldn\'t start tunnel error="Provided Tunnel Credentials are invalid"'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.ok(parsed.lastError);
  assert.match(parsed.lastError.message, /Tunnel Credentials/);
  assert.equal(parsed.lastError.hint, 'credentials ผิด/ถูกลบใน Cloudflare');
  assert.equal(parsed.lastOriginError, null);

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'error'); // ERR is newer than the last Registered event
});

test('parseLogText: an old tunnel-level error before reconnection does not mask a healthy state', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'ERR', 'context canceled'),
    line('2024-05-01T12:00:05Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:06Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:07Z', 'INF', 'Registered tunnel connection connIndex=2 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:08Z', 'INF', 'Registered tunnel connection connIndex=3 location=bkk09 protocol=quic'),
  ].join('\n');

  const parsed = parseLogText(log);
  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'connected');
});

test('deriveHealth: never Registered and running past the 90s grace period -> error', () => {
  const parsed = parseLogText('');
  assert.equal(deriveHealth({ running: true, ...parsed, uptimeSec: 95 }), 'error');
  assert.equal(deriveHealth({ running: true, ...parsed, uptimeSec: 30 }), 'connecting');
});

test('parseLogText: empty log -> no connections, no error, connecting when running', () => {
  const parsed = parseLogText('');
  assert.deepEqual(parsed.connections, []);
  assert.equal(parsed.activeConnections, 0);
  assert.equal(parsed.lastError, null);
  assert.equal(parsed.lastEventAt, null);

  assert.equal(deriveHealth({ running: true, ...parsed }), 'connecting');
  assert.equal(deriveHealth({ running: false, ...parsed }), 'stopped');
});

test('parseLogText: benign resolver-refresh ERR after 4 registered connections stays connected (real-world false-positive)', () => {
  const log = [
    line('2026-08-29T13:23:10Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2026-08-29T13:23:11Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2026-08-29T13:23:12Z', 'INF', 'Registered tunnel connection connIndex=2 location=sin06 protocol=quic'),
    line('2026-08-29T13:23:13Z', 'INF', 'Registered tunnel connection connIndex=3 location=sin06 protocol=quic'),
    line('2026-08-29T15:37:42Z', 'ERR', 'Failed to refresh DNS local resolver error="lookup region1.v2.argotunnel.com: i/o timeout"'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.equal(parsed.activeConnections, 4);
  assert.equal(parsed.lastError, null); // benign edge-retry noise, not a tunnel-level error
  assert.equal(parsed.lastErrorAt, null);
  assert.ok(parsed.lastWarning);
  assert.match(parsed.lastWarning.message, /Failed to refresh DNS local resolver/);
  assert.notEqual(parsed.lastWarning.hint, 'แก้ hostname ไม่ได้ (ปัญหา DNS)'); // narrowed dns hint must not fire here

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'connected');
});

test('parseLogText: a real fatal auth error after start -> error state', () => {
  const log = [
    line('2026-08-29T13:00:00Z', 'INF', 'Starting tunnel tunnelID=abc'),
    line('2026-08-29T13:00:01Z', 'ERR', 'Unauthorized: Failed to get tunnel'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.ok(parsed.lastError);
  assert.match(parsed.lastError.message, /Unauthorized/);
  assert.equal(parsed.lastWarning, null);

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'error');
});

test('parseLogText: reconnect storm of benign errors then 4 registered -> connected', () => {
  const log = [
    line('2026-08-29T10:00:00Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2026-08-29T10:00:01Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2026-08-29T10:00:10Z', 'ERR', 'Failed to dial a quic connection error="timeout: no recent network activity"'),
    line('2026-08-29T10:00:11Z', 'INF', 'Unregistered tunnel connection connIndex=1'),
    line('2026-08-29T10:00:12Z', 'ERR', 'Failed to serve tunnel connection error="context canceled"'),
    line('2026-08-29T10:00:20Z', 'ERR', 'Serve tunnel error error="failed to accept incoming stream requests"'),
    line('2026-08-29T10:00:21Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2026-08-29T10:00:22Z', 'INF', 'Registered tunnel connection connIndex=2 location=sin06 protocol=quic'),
    line('2026-08-29T10:00:23Z', 'INF', 'Registered tunnel connection connIndex=3 location=sin06 protocol=quic'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.equal(parsed.activeConnections, 4);
  assert.equal(parsed.lastError, null);
  assert.ok(parsed.lastWarning); // storm noise still visible as a warning

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'connected');
});

test('errorHint: recognizes common cloudflared errors, null for unknown text', () => {
  assert.equal(errorHint('Couldn\'t start tunnel error="Provided Tunnel Credentials are invalid"'), 'credentials ผิด/ถูกลบใน Cloudflare');
  assert.equal(errorHint('context canceled'), 'การเชื่อมต่อถูกยกเลิก (มักเกิดตอนปิด/รีสตาร์ททันเนล)');
  assert.equal(errorHint('some totally unrelated message'), null);
  assert.equal(errorHint(null), null);
});
