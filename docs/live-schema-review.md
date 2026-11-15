> Update, 26 October 2026: Bloom's complete public SQL metadata export has now been received, confirmed and tested locally. See [the SQL export review](bloom-export-review.md) for the current findings. The diagram notes below remain historical context; the export is no longer outstanding. The next step is the read-only preflight and staging rehearsal.

# Supplied Supabase diagrams — 23 October 2026

The user confirmed these project identities:

| App | Supabase project | Supplied file |
| --- | --- | --- |
| Bloom | `pqbivesimvmzdwbrqprj` | `supabase-schema-pqbivesimvmzdwbrqprj.svg` |
| Orbitrio | `mwmrkrvitrvogkffjgmt` | `supabase-schema-mwmrkrvitrvogkffjgmt.svg` |

The extracted table/column/type inventory is in `schema-diagrams.json`. It contains diagram metadata only, no account records. Bloom's SVG embeds five table nodes; Orbitrio's embeds seven. Both also reference relationship endpoints whose table nodes are not embedded. These files are partial views: a table not shown here must not be assumed absent from the database.

## Findings

| Observation | Effect on the prepared update |
| --- | --- |
| Both visible `users` tables have the same 21 column names/types, including text IDs and numeric balances. | Preserve existing IDs and balances. Text IDs alone do not identify the auth provider or verify policies. |
| Bloom's `active_investments` includes both `plan_name` and `name`, ROI/profit/return snapshots, and both payout flags and transaction references. | Compatible with the local dual-label purchase fix and historical payout display handling. Defaults, nullability, checks and deployed RPC definitions remain unknown. |
| Bloom's traders include both `minimum_copy_amount`/`maximum_copy_amount` and `min_copy_amount`/`max_copy_amount`. | Confirms the duplicated limit columns exist. The local client prefers the canonical columns, including zero as an unlimited maximum. Stored values and actual RPC rules still need verification. |
| Bloom's investment/copy-trade nodes do not list `paused_at`/`paused_seconds`. | The prepared migration adds these columns; the new suspension feature cannot be assumed installed. |
| Bloom shows `portfolio_positions` with `asset_type`. Orbitrio shows `portfolio_assets` with `type`, `id` and `current_price`. Bloom's current frontend reads `portfolio_assets`. | Potential trading/portfolio mismatch. Check both tables and the live buy/sell functions before selecting the authoritative holdings source. Do not copy, merge, drop or rename holdings automatically. The local frontend now reports read failures instead of silently treating a missing table as an empty portfolio. |
| Orbitrio's visible KYC table includes review/revision columns and a `date` DOB. Bloom's KYC table is outside its supplied view. | Cannot verify Bloom's KYC compatibility from these files. Do not assume Bloom has Orbitrio's policies, storage buckets, types or review function. |
| Investment plans and transactions are outside the embedded table nodes in both diagrams. | Their existence, definitions and financial constraints remain unverified. |

## Still needed

Run `scripts/export-schema.sql` in Bloom's Supabase SQL editor and export the query result. The result includes all public table definitions represented as metadata, full function bodies/signatures, triggers, policies, grants, indexes and constraints. The same export from Orbitrio is useful for comparison. Review custom function bodies for hard-coded secrets before sharing; account data and service credentials are not required.

The diagram review does not establish the cause of every production failure and does not approve the migration for production. No live SQL was executed and no holdings or balances were changed. Continue with the compatibility comparison and staging procedure in `investment-reliability.md` after receiving the SQL results.
