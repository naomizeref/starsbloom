export const MAX_QUOTE_AGE_MS = 15 * 60 * 1000;

export function isFreshQuote(asset: { price?: unknown; updatedAt?: unknown }, now = Date.now()): boolean {
  const timestamp = typeof asset.updatedAt === 'string' ? Date.parse(asset.updatedAt) : NaN;
  return typeof asset.price === 'number' && Number.isFinite(asset.price) && asset.price > 0
    && Number.isFinite(timestamp) && timestamp <= now && now - timestamp < MAX_QUOTE_AGE_MS;
}
