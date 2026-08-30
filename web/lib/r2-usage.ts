// Real adapter around r2-usage-core.js's pure logic: builds the S3 client
// from stored credentials and calls Cloudflare's GraphQL analytics API with
// the platform's global fetch. See r2-usage-core.js for the actual math —
// this file only wires dependencies in and shapes the API response.
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getR2Credentials } from './settings'
import { R2_PRICING } from './r2-pricing'
import {
  GB,
  fetchStorageUsage,
  fetchOperationsUsage,
  computeCost,
  pct,
  getCached,
  setCached,
} from './r2-usage-core'

export interface R2UsageResult {
  configured: boolean
  bucket?: string | null
  storage?: { bytes: number; objectCount: number; truncated: boolean; freeBytes: number; usedPct: number }
  ops?: {
    classA: { count: number; free: number; usedPct: number }
    classB: { count: number; free: number; usedPct: number }
    period: { from: string; to: string }
  } | null
  opsUnavailableReason?: string | null
  cost?: { storageUsd: number; classAUsd: number; classBUsd: number; totalUsd: number; pricing: typeof R2_PRICING }
  fetchedAt?: string
  cached?: boolean
}

export async function getR2Usage({ refresh = false }: { refresh?: boolean } = {}): Promise<R2UsageResult> {
  const creds = getR2Credentials()
  if (!creds.accountId || !creds.accessKeyId || !creds.secretAccessKey || !creds.bucket) {
    return { configured: false }
  }
  const bucket = creds.bucket

  if (!refresh) {
    const cached = getCached(bucket)
    if (cached) return { ...cached, cached: true }
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  })
  const send = (params: { Bucket: string; ContinuationToken?: string }) => client.send(new ListObjectsV2Command(params))

  const storageUsage = await fetchStorageUsage(send, bucket)
  const { ops, reason } = await fetchOperationsUsage(fetch, {
    accountId: creds.accountId,
    bucket,
    analyticsToken: creds.analyticsToken,
  })

  const cost = computeCost(
    { storageBytes: storageUsage.bytes, classACount: ops ? ops.classA : 0, classBCount: ops ? ops.classB : 0 },
    R2_PRICING
  )
  const freeBytes = R2_PRICING.storageFreeGb * GB

  const result: R2UsageResult = {
    configured: true,
    bucket,
    storage: {
      bytes: storageUsage.bytes,
      objectCount: storageUsage.objectCount,
      truncated: storageUsage.truncated,
      freeBytes,
      usedPct: pct(storageUsage.bytes, freeBytes),
    },
    ops: ops
      ? {
          classA: { count: ops.classA, free: R2_PRICING.classAFreePerMonth, usedPct: pct(ops.classA, R2_PRICING.classAFreePerMonth) },
          classB: { count: ops.classB, free: R2_PRICING.classBFreePerMonth, usedPct: pct(ops.classB, R2_PRICING.classBFreePerMonth) },
          period: ops.period,
        }
      : null,
    opsUnavailableReason: reason,
    cost: { ...cost, pricing: R2_PRICING },
    fetchedAt: new Date().toISOString(),
    cached: false,
  }

  setCached(bucket, result)
  return result
}
