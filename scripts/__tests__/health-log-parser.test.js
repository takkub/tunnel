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

test('parseLogText: ERR after last Registered -> error state with a Thai hint', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:01Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:02Z', 'INF', 'Registered tunnel connection connIndex=2 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:03Z', 'INF', 'Registered tunnel connection connIndex=3 location=bkk09 protocol=quic'),
    line('2024-05-01T12:10:00Z', 'ERR', 'Unable to reach the origin service. dial tcp 127.0.0.1:3000: connect: connection refused'),
  ].join('\n');

  const parsed = parseLogText(log);
  assert.ok(parsed.lastError);
  assert.match(parsed.lastError.message, /Unable to reach the origin service/);
  assert.equal(parsed.lastError.hint, 'service ปลายทาง (localhost) ไม่ตอบ');

  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'error'); // ERR is newer than the last Registered event
});

test('parseLogText: an old error before reconnection does not mask a healthy state', () => {
  const log = [
    line('2024-05-01T12:00:00Z', 'ERR', 'Unable to reach the origin service'),
    line('2024-05-01T12:00:05Z', 'INF', 'Registered tunnel connection connIndex=0 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:06Z', 'INF', 'Registered tunnel connection connIndex=1 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:07Z', 'INF', 'Registered tunnel connection connIndex=2 location=bkk09 protocol=quic'),
    line('2024-05-01T12:00:08Z', 'INF', 'Registered tunnel connection connIndex=3 location=bkk09 protocol=quic'),
  ].join('\n');

  const parsed = parseLogText(log);
  const health = deriveHealth({ running: true, ...parsed });
  assert.equal(health, 'connected');
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

test('errorHint: recognizes common cloudflared errors, null for unknown text', () => {
  assert.equal(errorHint('Couldn\'t start tunnel error="Provided Tunnel Credentials are invalid"'), 'credentials ผิด/ถูกลบใน Cloudflare');
  assert.equal(errorHint('context canceled'), 'การเชื่อมต่อถูกยกเลิก (มักเกิดตอนปิด/รีสตาร์ททันเนล)');
  assert.equal(errorHint('some totally unrelated message'), null);
  assert.equal(errorHint(null), null);
});
