const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const mod = require('../cloudflare-api');

// upsertTunnelCname's own logic (find-existing vs create vs update vs
// conflict) is pure aside from the two Cloudflare API calls it makes, so
// mock https.request directly rather than going through a temp
// TUNNEL_ROOT/TUNNEL_DATA_DIR (this file never touches domains.js/
// settings-store.js state).
function mockCf(t, responder) {
  const calls = [];
  t.mock.method(https, 'request', (options, callback) => {
    let body = '';
    return {
      write(chunk) { body += chunk; },
      end() {
        const call = { method: options.method, path: options.path, body: body ? JSON.parse(body) : undefined };
        calls.push(call);
        const { statusCode = 200, json } = responder(call, calls.length - 1);
        const dataHandlers = [];
        const res = {
          statusCode,
          on(event, handler) {
            if (event === 'data') dataHandlers.push(handler);
            if (event === 'end') setImmediate(() => { dataHandlers.forEach(h => h(JSON.stringify(json))); handler(); });
          }
        };
        callback(res);
      },
      on() {}
    };
  });
  return calls;
}

test('upsertTunnelCname(): no existing record -> POSTs a new proxied CNAME', async (t) => {
  const calls = mockCf(t, (call) => {
    if (call.method === 'GET') return { json: { success: true, result: [] } };
    return { json: { success: true, result: { id: 'rec1' } } };
  });

  const result = await mod.upsertTunnelCname('zone-1', 'app.example.com', 'tunnel-id-1', 'tok');

  assert.deepEqual(result, { ok: true, action: 'created' });
  const post = calls.find(c => c.method === 'POST');
  assert.deepEqual(post.body, { type: 'CNAME', name: 'app.example.com', content: 'tunnel-id-1.cfargotunnel.com', proxied: true });
});

test('upsertTunnelCname(): existing tunnel CNAME pointing elsewhere -> PATCHes it', async (t) => {
  const calls = mockCf(t, (call) => {
    if (call.method === 'GET') {
      return { json: { success: true, result: [{ id: 'rec1', type: 'CNAME', name: 'app.example.com', content: 'old-tunnel.cfargotunnel.com' }] } };
    }
    return { json: { success: true, result: { id: 'rec1' } } };
  });

  const result = await mod.upsertTunnelCname('zone-1', 'app.example.com', 'new-tunnel', 'tok');

  assert.deepEqual(result, { ok: true, action: 'updated' });
  const patch = calls.find(c => c.method === 'PATCH');
  assert.equal(patch.path, '/client/v4/zones/zone-1/dns_records/rec1');
  assert.equal(patch.body.content, 'new-tunnel.cfargotunnel.com');
});

test('upsertTunnelCname(): existing CNAME already correct -> unchanged, no write call', async (t) => {
  const calls = mockCf(t, () => ({ json: { success: true, result: [{ id: 'rec1', type: 'CNAME', name: 'app.example.com', content: 'tunnel-id-1.cfargotunnel.com' }] } }));

  const result = await mod.upsertTunnelCname('zone-1', 'app.example.com', 'tunnel-id-1', 'tok');

  assert.deepEqual(result, { ok: true, action: 'unchanged' });
  assert.equal(calls.length, 1); // only the GET lookup, no PATCH/POST
});

test('upsertTunnelCname(): existing non-CNAME record with the same name is reported as a conflict', async (t) => {
  mockCf(t, () => ({ json: { success: true, result: [{ id: 'rec1', type: 'A', name: 'app.example.com', content: '1.2.3.4' }] } }));

  const result = await mod.upsertTunnelCname('zone-1', 'app.example.com', 'tunnel-id-1', 'tok');

  assert.equal(result.ok, false);
  assert.match(result.error, /already exists/);
});

test('upsertTunnelCname(): overwrite:false reports a conflict instead of patching', async (t) => {
  mockCf(t, () => ({ json: { success: true, result: [{ id: 'rec1', type: 'CNAME', name: 'app.example.com', content: 'old-tunnel.cfargotunnel.com' }] } }));

  const result = await mod.upsertTunnelCname('zone-1', 'app.example.com', 'new-tunnel', 'tok', { overwrite: false });

  assert.equal(result.ok, false);
  assert.match(result.error, /already points elsewhere/);
});

test('upsertTunnelCname(): a permission error (code 9109) is translated into an actionable message', async (t) => {
  mockCf(t, (call) => {
    if (call.method === 'GET') return { json: { success: true, result: [] } };
    return { json: { success: false, errors: [{ code: 9109, message: 'Insufficient permissions' }] } };
  });

  const result = await mod.upsertTunnelCname('zone-1', 'app.example.com', 'tunnel-id-1', 'tok');

  assert.equal(result.ok, false);
  assert.match(result.error, /Zone > DNS > Edit/);
});
