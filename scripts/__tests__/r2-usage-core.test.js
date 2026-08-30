// Tests web/lib/r2-usage-core.js's pure logic directly — no @aws-sdk
// dependency is needed here since `send`/`fetchFn` are plain mocks. See
// web/lib/r2-usage.ts for the real S3/fetch adapter.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GB,
  CACHE_TTL_MS,
  getCached,
  setCached,
  clearCache,
  fetchStorageUsage,
  fetchOperationsUsage,
  monthRangeUtc,
  computeCost,
  pct,
} = require('../../web/lib/r2-usage-core');

test('fetchStorageUsage sums a single page', async () => {
  const send = async () => ({ Contents: [{ Size: 100 }, { Size: 200 }], IsTruncated: false });
  const result = await fetchStorageUsage(send, 'bucket');
  assert.deepEqual(result, { bytes: 300, objectCount: 2, truncated: false });
});

test('fetchStorageUsage paginates across multiple pages using the continuation token', async () => {
  let call = 0;
  const send = async (params) => {
    call++;
    if (call === 1) {
      assert.equal(params.ContinuationToken, undefined);
      return { Contents: [{ Size: 10 }], IsTruncated: true, NextContinuationToken: 'tok1' };
    }
    assert.equal(params.ContinuationToken, 'tok1');
    return { Contents: [{ Size: 20 }], IsTruncated: false };
  };
  const result = await fetchStorageUsage(send, 'bucket');
  assert.deepEqual(result, { bytes: 30, objectCount: 2, truncated: false });
  assert.equal(call, 2);
});

test('fetchStorageUsage stops and marks truncated once the object cap is reached', async () => {
  const send = async () => ({
    Contents: Array.from({ length: 10 }, () => ({ Size: 1 })),
    IsTruncated: true,
    NextContinuationToken: 'more',
  });
  const result = await fetchStorageUsage(send, 'bucket', { cap: 25 });
  assert.equal(result.objectCount, 25);
  assert.equal(result.bytes, 25);
  assert.equal(result.truncated, true);
});

test('fetchStorageUsage does not mark truncated when the cap exactly matches the total', async () => {
  const send = async () => ({ Contents: Array.from({ length: 5 }, () => ({ Size: 1 })), IsTruncated: false });
  const result = await fetchStorageUsage(send, 'bucket', { cap: 5 });
  assert.deepEqual(result, { bytes: 5, objectCount: 5, truncated: false });
});

test('pct() computes percentage of a free-tier allowance used, uncapped above 100', () => {
  assert.equal(pct(5, 10), 50);
  assert.equal(pct(0, 10), 0);
  assert.equal(pct(15, 10), 150);
  assert.equal(pct(1, 0), 0);
});

const PRICING = {
  storageUsdPerGbMonth: 0.015,
  storageFreeGb: 10,
  classAUsdPerMillion: 4.5,
  classAFreePerMonth: 1_000_000,
  classBUsdPerMillion: 0.36,
  classBFreePerMonth: 10_000_000,
};

test('computeCost charges nothing while under every free tier', () => {
  const result = computeCost({ storageBytes: 5 * GB, classACount: 100, classBCount: 100 }, PRICING);
  assert.deepEqual(result, { storageUsd: 0, classAUsd: 0, classBUsd: 0, totalUsd: 0 });
});

test('computeCost charges only the amount over each free tier', () => {
  const result = computeCost({ storageBytes: 20 * GB, classACount: 2_000_000, classBCount: 20_000_000 }, PRICING);
  assert.equal(result.storageUsd, 0.15); // 10 GB over * 0.015
  assert.equal(result.classAUsd, 4.5); // 1M over / 1M * 4.50
  assert.equal(result.classBUsd, 3.6); // 10M over / 1M * 0.36
  assert.equal(result.totalUsd, 8.25);
});

test('fetchOperationsUsage returns ops:null with a reason when no token is configured', async () => {
  const result = await fetchOperationsUsage(async () => { throw new Error('should not be called'); }, {
    accountId: 'acct', bucket: 'bucket', analyticsToken: null,
  });
  assert.equal(result.ops, null);
  assert.match(result.reason, /token/);
});

test('fetchOperationsUsage classifies actionType into class A / class B and sums requests', async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        viewer: {
          accounts: [{
            r2OperationsAdaptiveGroups: [
              { sum: { requests: 100 }, dimensions: { actionType: 'PutObject' } },
              { sum: { requests: 50 }, dimensions: { actionType: 'ListObjects' } },
              { sum: { requests: 300 }, dimensions: { actionType: 'GetObject' } },
              { sum: { requests: 10 }, dimensions: { actionType: 'DeleteObject' } }, // free op, ignored
            ],
          }],
        },
      },
    }),
  });
  const result = await fetchOperationsUsage(fetchFn, { accountId: 'acct', bucket: 'bucket', analyticsToken: 'tok' });
  assert.equal(result.reason, null);
  assert.equal(result.ops.classA, 150);
  assert.equal(result.ops.classB, 300);
  assert.ok(result.ops.period.from);
  assert.ok(result.ops.period.to);
});

test('fetchOperationsUsage returns ops:null with a reason when the GraphQL call errors', async () => {
  const fetchFn = async () => ({ ok: false, status: 403, json: async () => ({ errors: [{ message: 'bad token' }] }) });
  const result = await fetchOperationsUsage(fetchFn, { accountId: 'acct', bucket: 'bucket', analyticsToken: 'tok' });
  assert.equal(result.ops, null);
  assert.match(result.reason, /bad token/);
});

test('fetchOperationsUsage returns ops:null with a reason when the request itself throws', async () => {
  const fetchFn = async () => { throw new Error('network down'); };
  const result = await fetchOperationsUsage(fetchFn, { accountId: 'acct', bucket: 'bucket', analyticsToken: 'tok' });
  assert.equal(result.ops, null);
  assert.match(result.reason, /network down/);
});

test('monthRangeUtc returns the current calendar month in UTC', () => {
  const { from, to } = monthRangeUtc(new Date(Date.UTC(2026, 6, 15, 12, 30)));
  assert.equal(from, '2026-07-01T00:00:00.000Z');
  assert.equal(to, '2026-08-01T00:00:00.000Z');
});

test('cache: setCached/getCached round-trip and clearCache empties it', () => {
  clearCache();
  assert.equal(getCached('b'), null);
  setCached('b', { hello: 'world' });
  assert.deepEqual(getCached('b'), { hello: 'world' });
  clearCache();
  assert.equal(getCached('b'), null);
});

test('cache entries expire after CACHE_TTL_MS', (t) => {
  clearCache();
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  t.after(() => { Date.now = realNow; clearCache(); });

  setCached('exp', { v: 1 });
  now += CACHE_TTL_MS - 1;
  assert.deepEqual(getCached('exp'), { v: 1 });
  now += 2;
  assert.equal(getCached('exp'), null);
});
