import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTrustedMarkets } from '../api/_marketFeed';
import { isFreshQuote, MAX_QUOTE_AGE_MS } from '../src/lib/marketQuotes';
import { markPortfolio } from '../src/lib/portfolioMarks';

const now = Date.parse('2026-10-27T12:00:00Z');
const quote = { id: 'bitcoin', current_price: 100, last_updated: new Date(now - 60000).toISOString(),
  high_24h: 105, low_24h: 95, price_change_percentage_24h: 2, total_volume: 1000000,
  sparkline_in_7d: { price: [95, 97, 100] } };
const response = (data: unknown, status = 200) => (async () => new Response(JSON.stringify(data), { status })) as typeof fetch;

test('only genuine USD quotes are synced, preserving source timestamps and history', async () => {
  let saved: unknown;
  const result = await loadTrustedMarkets({ now: () => now, env: {}, fetcher: response([quote]), persist: async rows => { saved = rows; } });
  assert.deepEqual(saved, [{ symbol: 'BTC/USD', price: 100, updated_at: quote.last_updated }]);
  assert.deepEqual(result.crypto[0].sparkline, [95, 97, 100]);
  assert.equal(result.crypto.length, 1); // Missing assets are not filled from mock data.
  assert.deepEqual(result.stocks, []);
  assert.equal(result.tradingReady, true);
});

test('invalid, absent, stale and future quotes never reach the price table', async () => {
  for (const patch of [{ current_price: 0 }, { current_price: -10 }, { current_price: '100' },
    { current_price: null }, { last_updated: null }, { last_updated: 'invalid' },
    { last_updated: new Date(now - MAX_QUOTE_AGE_MS).toISOString() },
    { last_updated: new Date(now + 60000).toISOString() }]) {
    await assert.rejects(loadTrustedMarkets({ now: () => now, env: {}, fetcher: response([{ ...quote, ...patch }]),
      persist: async () => { assert.fail('An invalid quote was persisted'); } }), /MARKET_QUOTES_UNAVAILABLE/);
  }
  assert.equal(isFreshQuote({ price: Infinity, updatedAt: quote.last_updated }, now), false);
});

test('provider and persistence failures do not return actionable quotes', async () => {
  await assert.rejects(loadTrustedMarkets({ env: {} }), /MARKET_SYNC_NOT_CONFIGURED/);
  await assert.rejects(loadTrustedMarkets({ env: {}, fetcher: response({}, 429), persist: async () => assert.fail() }), /MARKET_PROVIDER_UNAVAILABLE/);
  await assert.rejects(loadTrustedMarkets({ env: {}, fetcher: response({}), persist: async () => assert.fail() }), /MARKET_PROVIDER_INVALID/);
  await assert.rejects(loadTrustedMarkets({ env: {}, now: () => now, fetcher: response([quote]), persist: async () => { throw new Error('write failed'); } }), /write failed/);
  await assert.rejects(loadTrustedMarkets({ env: {}, fetcher: (async () => { throw new Error('timeout'); }) as typeof fetch, persist: async () => assert.fail() }), /timeout/);
});

test('a partial feed or outage preserves all holdings and their stored valuations', async () => {
  const holdings = [
    { symbol: 'BTC/USD', name: 'Bitcoin', amount: 2, currentPrice: 90, avgBuyPrice: 80, type: 'crypto' as const },
    { symbol: 'AAPL', name: 'Apple', amount: 3, currentPrice: 50, avgBuyPrice: 40, type: 'stock' as const },
  ];
  const result = await loadTrustedMarkets({ env: {}, now: () => now, fetcher: response([quote]), persist: async () => {} });
  assert.equal(markPortfolio(holdings, result.crypto, now).portfolioValue, 350);
  assert.equal(markPortfolio(holdings, [], now).portfolioValue, 330);
  assert.deepEqual(markPortfolio(holdings, [], now).portfolio, holdings);
  assert.equal(markPortfolio(holdings, result.crypto, now + MAX_QUOTE_AGE_MS).portfolioValue, 330);
  assert.equal(markPortfolio([{ ...holdings[0], symbol: 'BTC' }], result.crypto, now).portfolioValue, 200);
});
