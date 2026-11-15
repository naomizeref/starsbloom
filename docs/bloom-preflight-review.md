# Bloom preflight review — 27 October 2026

Scope: user-supplied aggregate results for Bloom `pqbivesimvmzdwbrqprj`. No production database writes or deployment were performed.

| Check | Result and implication |
| --- | --- |
| Accounts | One active database admin and eight active users. The admin-role prerequisite passes. |
| Holdings | One current holding, no legacy holdings, no overlap or duplicate groups. No legacy transfer is needed for this snapshot. |
| Reconciliation | No duplicate KYC/claims, ambiguous completed investment/copy payouts, or orphan pending claims found by these queries. These are targeted checks, not a full ledger audit. |
| Trader limits | 28 traders have different values in the two limit-column pairs. The prepared UI and copy RPC use `min_copy_amount`/`max_copy_amount`; zero maximum means no cap. Existing values are preserved. Future explicit admin limit edits write both aliases. Review the catalog query before choosing to reconcile historical differences. |
| Market prices | All 17 rows are invalid, missing timestamps or stale. The aggregate cannot distinguish these causes. Trading cannot be certified from this result. |
| Storage | Only `deposit-proofs` exists among the three proof buckets. It is private but has no size/type limits. The upgrade fills missing limits with 5 MiB and JPEG/PNG/WebP, preserves existing objects and non-null custom limits, and creates the missing KYC/gift-card buckets. |

## Price-feed correction

The old Vercel and Express endpoints refreshed hardcoded stock prices and fallback crypto prices into the trusted order-price table. The frontend also fabricated fallback prices, sparkline histories and random price movements. Those behaviors are removed.

Both backends now share the same implementation. It requests actual USD quotes from CoinGecko, validates finite positive prices and source timestamps younger than 15 minutes, preserves source timestamps and real supplied history, and waits for a successful database sync before returning usable quotes. Missing assets are omitted. Outages return HTTP 503 with empty quotes, and the UI offers retry. The frontend discards expired quotes and rechecks freshness before an order. Portfolio totals retain every holding at its stored price when a live quote is absent; both exact pair symbols and legacy base symbols are matched. Valuation runs when holdings arrive as well as when quotes change.

Provider contract: [CoinGecko coins/markets](https://docs.coingecko.com/reference/coins-markets). No stock provider is configured in the repository, so stock orders remain unavailable. Existing stock holdings are retained. Do not substitute constants or merely refresh old timestamps to make checks pass.

Required host configuration: `VITE_SUPABASE_URL` must identify Bloom, and `SUPABASE_SERVICE_ROLE_KEY` must be the corresponding **server-only** key. `COINGECKO_DEMO_API_KEY` is supported for the Demo endpoint. Keep secrets in the hosting environment; do not paste them into chat or prefix server keys with `VITE_`. Provider access, quotas and deployed connectivity still need verification.

## Remaining release steps

1. Run `scripts/review-bloom-market-limits.sql` to inspect only catalog limits and quote timestamps/status. It makes no changes. Confirm the intended limits in the 28 affected catalog entries; do not bulk overwrite them from an assumed authoritative alias.
2. Rehearse the generated 12-file migration bundle on a backed-up staging copy. Verify existing-account login, admin access, investments/top-ups/payouts, copy trading, deposits/withdrawals, KYC and actual file uploads through hosted Supabase/PostgREST. Offline tests use synthetic accounts and storage stubs.
3. Verify `/api/markets` in the staged deployment with the host's server configuration: successful responses must contain source-dated crypto quotes and corresponding fresh database rows; missing configuration or upstream failure must pause orders. Test a market buy/sale with a designated test account. Stock execution needs a real provider before enabling it.
4. Before production cutover, back up the database and coordinate the SQL and application release. Stop all old market writers and keep trading paused until their fabricated quotes have expired (at least 15 minutes after the last old writer stops); then verify the new source. A frontend maintenance screen alone does not block direct RPC clients. Re-run preflight and use a controlled release window with monitoring and a tested rollback procedure.

These results remove several data-reconciliation blockers. They do **not** yet establish that the live site is ready or guarantee zero disruption.

## Local verification

- `npm test`: all nine test files passed, including the reconstructed export, quote validation/failure cases, partial-feed portfolio valuations and preservation of existing proof objects when filling bucket limits.
- `npm run test:browser`: all 13 regressions passed, including saving both trader-limit aliases together.
- `npm run test:pages`: all 16 audit tests passed on the final run, including 88 public/user/admin page captures, empty accounts, quote expiry and disabled order submission. Disabled audit-server hot reload after an earlier run lost its in-memory test login during reload.
- Type check, production build and whitespace checks passed. The existing large frontend-chunk warning remains.
- Regenerated `dist/bloom-feature-upgrade.sql` after the build: 12 ordered migrations, no database connection.

The browser audits use synthetic fixtures. They do not replace the hosted staging and provider checks above.
