// Pure logic for GET /api/r2/usage, kept as plain CJS (like
// desktop/src/port-resolver.js) so `node --test` can cover it directly with
// no build step. Deliberately has no @aws-sdk/client-s3 or Cloudflare
// dependency of its own — `send`/`fetchFn` are injected so tests can pass
// plain mocks; web/lib/r2-usage.ts is the real adapter that wires the actual
// S3 client and global fetch in.
'use strict';

const GB = 1024 ** 3;
const OBJECT_LIST_CAP = 50000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// https://developers.cloudflare.com/r2/pricing/#free-tier — actions that
// mutate state (Class A) vs. read existing state (Class B). Delete* / Abort*
// are free and intentionally absent from both sets.
const CLASS_A_ACTIONS = new Set([
  'ListBuckets', 'PutBucket', 'ListObjects', 'PutObject', 'CopyObject',
  'CompleteMultipartUpload', 'CreateMultipartUpload', 'LifecycleStorageTierTransition',
  'ListMultipartUploads', 'UploadPart', 'UploadPartCopy', 'ListParts',
  'PutBucketEncryption', 'PutBucketCors', 'PutBucketLifecycleConfiguration',
]);
const CLASS_B_ACTIONS = new Set([
  'HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary',
  'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration',
]);

const cache = new Map();

function getCached(bucket) {
  const entry = cache.get(bucket);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.data;
}

function setCached(bucket, data) {
  cache.set(bucket, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function clearCache() {
  cache.clear();
}

// send(params) mirrors an S3Client.send(new ListObjectsV2Command(params))
// call. Paginates until exhausted or `cap` objects have been counted,
// whichever comes first — at 50k objects a bucket's page count could
// otherwise make this endpoint take minutes.
async function fetchStorageUsage(send, bucket, opts = {}) {
  const cap = opts.cap || OBJECT_LIST_CAP;
  let bytes = 0;
  let objectCount = 0;
  let truncated = false;
  let token;
  for (;;) {
    const page = await send({ Bucket: bucket, ContinuationToken: token });
    const contents = page.Contents || [];
    for (const obj of contents) {
      if (objectCount >= cap) { truncated = true; break; }
      bytes += obj.Size || 0;
      objectCount++;
    }
    if (truncated) break;
    if (!page.IsTruncated || !page.NextContinuationToken) break;
    if (objectCount >= cap) { truncated = true; break; }
    token = page.NextContinuationToken;
  }
  return { bytes, objectCount, truncated };
}

function monthRangeUtc(now) {
  const d = now || new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

// Query shape per https://developers.cloudflare.com/r2/platform/metrics-analytics/
const OPERATIONS_QUERY = `
query R2Operations($accountTag: string!, $bucketName: string!, $startDate: Time, $endDate: Time) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2OperationsAdaptiveGroups(
        limit: 10000
        filter: { datetime_geq: $startDate, datetime_leq: $endDate, bucketName: $bucketName }
      ) {
        sum { requests }
        dimensions { actionType }
      }
    }
  }
}`;

// Best-effort — this must never throw. Returns { ops: null, reason } for any
// missing token, network failure, or GraphQL error, so the rest of the usage
// response can still be served.
async function fetchOperationsUsage(fetchFn, { accountId, bucket, analyticsToken, now } = {}) {
  if (!analyticsToken) return { ops: null, reason: 'no analytics token configured' };

  const { from, to } = monthRangeUtc(now);
  let res;
  try {
    res = await fetchFn('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${analyticsToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: OPERATIONS_QUERY,
        variables: { accountTag: accountId, bucketName: bucket, startDate: from, endDate: to },
      }),
    });
  } catch (e) {
    return { ops: null, reason: `analytics request failed: ${e && e.message ? e.message : e}` };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ops: null, reason: 'analytics response was not valid JSON' };
  }
  if (!res.ok || body.errors) {
    const msg = (body && body.errors && body.errors[0] && body.errors[0].message) || `HTTP ${res.status}`;
    return { ops: null, reason: `analytics query failed: ${msg}` };
  }

  const groups = (body.data && body.data.viewer && body.data.viewer.accounts && body.data.viewer.accounts[0] &&
    body.data.viewer.accounts[0].r2OperationsAdaptiveGroups) || [];
  let classA = 0;
  let classB = 0;
  for (const g of groups) {
    const requests = (g.sum && g.sum.requests) || 0;
    const action = g.dimensions && g.dimensions.actionType;
    if (CLASS_A_ACTIONS.has(action)) classA += requests;
    else if (CLASS_B_ACTIONS.has(action)) classB += requests;
  }

  return { ops: { classA, classB, period: { from, to } }, reason: null };
}

// Percentage of a free-tier allowance used; not capped at 100 so overage is
// visible (e.g. 150 means 1.5x the free tier).
function pct(count, free) {
  if (!free) return 0;
  return Math.round((count / free) * 10000) / 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Charges only the portion of usage above each free-tier allowance.
function computeCost({ storageBytes, classACount, classBCount }, pricing) {
  const storageGb = storageBytes / GB;
  const storageUsd = Math.max(0, storageGb - pricing.storageFreeGb) * pricing.storageUsdPerGbMonth;
  const classAUsd = (Math.max(0, classACount - pricing.classAFreePerMonth) / 1_000_000) * pricing.classAUsdPerMillion;
  const classBUsd = (Math.max(0, classBCount - pricing.classBFreePerMonth) / 1_000_000) * pricing.classBUsdPerMillion;
  return {
    storageUsd: round2(storageUsd),
    classAUsd: round2(classAUsd),
    classBUsd: round2(classBUsd),
    totalUsd: round2(storageUsd + classAUsd + classBUsd),
  };
}

module.exports = {
  GB,
  OBJECT_LIST_CAP,
  CACHE_TTL_MS,
  CLASS_A_ACTIONS,
  CLASS_B_ACTIONS,
  getCached,
  setCached,
  clearCache,
  fetchStorageUsage,
  fetchOperationsUsage,
  monthRangeUtc,
  computeCost,
  pct,
};
