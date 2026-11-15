import { createClient } from '@supabase/supabase-js';
import { isFreshQuote } from '../src/lib/marketQuotes.js';

const catalog = [
  ['bitcoin', 'BTC/USD', 'Bitcoin'], ['ethereum', 'ETH/USD', 'Ethereum'],
  ['solana', 'SOL/USD', 'Solana'], ['ripple', 'XRP/USD', 'Ripple'],
  ['cardano', 'ADA/USD', 'Cardano'], ['binancecoin', 'BNB/USD', 'BNB'],
  ['polkadot', 'DOT/USD', 'Polkadot'], ['dogecoin', 'DOGE/USD', 'Dogecoin'],
  ['shiba-inu', 'SHIB/USD', 'Shiba Inu'], ['litecoin', 'LTC/USD', 'Litecoin'],
];
type PriceRow = { symbol: string; price: number; updated_at: string };
type Dependencies = {
  fetcher?: typeof fetch;
  persist?: (rows: PriceRow[]) => Promise<void>;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
};

// USD prices, source timestamps and historical sparklines:
// https://docs.coingecko.com/reference/coins-markets
// A partial response never fills missing assets with invented prices.
export async function loadTrustedMarkets(deps: Dependencies = {}) {
  const env = deps.env ?? process.env;
  let persist = deps.persist;
  if (!persist) {
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('MARKET_SYNC_NOT_CONFIGURED');
    const client = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    persist = async rows => {
      const { error } = await client.from('market_prices').upsert(rows, { onConflict: 'symbol' }).abortSignal(AbortSignal.timeout(2500));
      if (error) throw new Error('MARKET_SYNC_FAILED');
    };
  }
  const headers: Record<string, string> = {};
  if (env.COINGECKO_DEMO_API_KEY) headers['x-cg-demo-api-key'] = env.COINGECKO_DEMO_API_KEY;
  const params = new URLSearchParams({ vs_currency: 'usd', ids: catalog.map(c => c[0]).join(','), sparkline: 'true' });
  const response = await (deps.fetcher ?? fetch)(`https://api.coingecko.com/api/v3/coins/markets?${params}`, {
    signal: AbortSignal.timeout(12000), headers,
  });
  if (!response.ok) throw new Error('MARKET_PROVIDER_UNAVAILABLE');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('MARKET_PROVIDER_INVALID');
  const now = (deps.now ?? Date.now)();
  const crypto = catalog.flatMap(([id, symbol, name]) => {
    const item = data.find(row => row?.id === id);
    if (!item || !isFreshQuote({ price: item.current_price, updatedAt: item.last_updated }, now)) return [];
    if (![item.high_24h, item.low_24h, item.price_change_percentage_24h, item.total_volume].every(v => typeof v === 'number' && Number.isFinite(v))) return [];
    return [{ symbol, name, price: item.current_price as number, updatedAt: item.last_updated as string,
      change: item.price_change_percentage_24h as number, high: item.high_24h as number, low: item.low_24h as number,
      volume: `${(item.total_volume / 1000000).toFixed(1)}M`,
      sparkline: Array.isArray(item.sparkline_in_7d?.price)
        ? item.sparkline_in_7d.price.filter((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0) : [],
    }];
  });
  if (!crypto.length) throw new Error('MARKET_QUOTES_UNAVAILABLE');
  await persist(crypto.map(a => ({ symbol: a.symbol, price: a.price, updated_at: a.updatedAt })));
  return { crypto, stocks: [], tradingReady: true, stockQuotesAvailable: false };
}
