// Cloudflare R2 Standard storage class pricing. Update these six numbers if
// Cloudflare changes pricing — nothing else in the usage/cost calculation
// needs editing. https://developers.cloudflare.com/r2/pricing/
export const R2_PRICING = {
  storageUsdPerGbMonth: 0.015,
  storageFreeGb: 10,
  classAUsdPerMillion: 4.5,
  classAFreePerMonth: 1_000_000,
  classBUsdPerMillion: 0.36,
  classBFreePerMonth: 10_000_000,
} as const

export type R2Pricing = typeof R2_PRICING
