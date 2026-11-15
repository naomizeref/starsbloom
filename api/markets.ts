import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadTrustedMarkets } from './_marketFeed.js';

export const config = { maxDuration: 30 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const markets = await loadTrustedMarkets();
    // Share this public snapshot across visitors to reduce provider rate limiting.
    // Source timestamps are preserved, and only successfully synced quotes are cached.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
    return res.status(200).json(markets);
  } catch (error) {
    // Log only diagnostic codes; never credentials or raw upstream responses.
    const code = error instanceof Error && /^MARKET_[A-Z_]+$/.test(error.message) ? error.message : 'MARKET_FEED_FAILED';
    console.error(code);
    return res.status(503).json({ crypto: [], stocks: [], tradingReady: false, code,
      error: 'Market quotes are temporarily unavailable. Orders are paused; please retry shortly.' });
  }
}
