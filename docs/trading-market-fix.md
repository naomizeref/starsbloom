# Trade prices and chart repair — 2026-11-03

The deployed `/api/markets` returned HTTP 500 with `FUNCTION_INVOCATION_FAILED`.
Compiling its modules and importing them in plain Node reproduced
`ERR_MODULE_NOT_FOUND`: the ESM imports omitted their `.js` extensions.
Both imports in the market function's dependency chain now use runtime-compatible
paths. The regression test exercises the compiled handler without the development
loader, including a successful provider response and database sync using test transports.

Successful public quote responses are cached at the CDN for 30 seconds to reduce
provider rate limiting. Errors are not cached. Provider and browser timeouts now
allow for slower responses. Quotes still require a fresh source timestamp and a
successful server-side write to `market_prices` before orders can use them.

The chart uses TradingView's official advanced-chart embed with a valid 60-minute
interval, all ten supported crypto symbol mappings, and a fixed responsive height.
The chart follows the order's selected asset. Loading failures provide a retry
button, an external chart link, and genuine seven-day USD history when available.
Binance reference charts are labeled as USDT; they do not supply USD execution prices.
On mobile, the chart appears before the compact watchlist. An empty watchlist
shows a message instead of a large blank area. A missing selected quote no longer
silently switches the order to another asset.

## Production verification

No SQL changes are required for this repair. Deploy the application changes, then
inspect `/api/markets`. A healthy response has HTTP 200, `tradingReady: true`, and
nonempty `crypto` quotes. A successful upstream-only check retrieved ten assets
and 168 Bitcoin history points; it did not write to the live database.

If the endpoint returns HTTP 503, its safe diagnostic `code` and Vercel runtime
logs distinguish these conditions:

- `MARKET_SYNC_NOT_CONFIGURED`: in Vercel's Production environment, configure
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (or `VITE_SUPABASE_URL`) for Bloom
  project `pqbivesimvmzdwbrqprj`, then redeploy. Keep the service key server-only.
- `MARKET_SYNC_FAILED`: check the server key's access and the `market_prices` table.
- `MARKET_PROVIDER_UNAVAILABLE`: check CoinGecko availability/rate limits and the
  optional server-side `COINGECKO_DEMO_API_KEY`.
- `MARKET_QUOTES_UNAVAILABLE`: source quotes failed freshness/validity checks;
  do not replace them with fabricated prices or retimestamp old prices.

Stock execution remains unavailable because no trusted stock-price feed is
configured. Existing holdings are preserved. Production server credentials and
authenticated order execution were not accessible during these local checks.

References: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js),
[TradingView chart embed](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/),
[CoinGecko market data](https://docs.coingecko.com/reference/coins-markets).
