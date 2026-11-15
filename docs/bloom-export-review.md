# Bloom SQL export review — 26 October 2026

The user confirmed this export belongs to **Bloom, `pqbivesimvmzdwbrqprj`**. It contains 24 public tables, 281 columns, 29 public functions, 106 public/storage policies, 41 constraints, 46 indexes, one ordinary trigger, and table grants. It contains definitions, not production account rows.

## Confirmed findings and local fixes

| Finding in the supplied export | Result |
| --- | --- |
| `is_admin()` trusted editable user metadata and a hardcoded email, in addition to database roles. Own-profile UPDATE allowed changing privileged fields; the balance trigger only rejected some negative balances. | The existing prepared helper/profile guard closes these paths. Added an early stop if an occupied database has no database-backed admin, preventing an accidental admin lockout. No role is automatically promoted. |
| Both old and current investment/copy RPC signatures exist. The old versions accepted caller-supplied ROI and duration. | Added compatibility wrappers for the existing old signatures, delegating to the validated current functions and authoritative catalog terms. Existing position terms are not rewritten. |
| Both `portfolio_positions` and `portfolio_assets` exist. Old buy/sell functions use the former with caller-supplied prices; current buy/sell functions use the latter with server-maintained `market_prices`. | Hardened the old signatures to require fresh trusted prices, positive finite quantities/values and an active own account. Each API retains its original holdings table. No holdings are merged, moved or deleted by the upgrade. Direct client edits of legacy holdings are blocked. |
| Notification policies allowed every authenticated account to read/change/delete other accounts' notifications. Client filtering was not sufficient protection. | Added restrictive ownership/admin policies, recipient-change protection and bounded insert permissions. Self notifications and requests addressed to an actual database admin remain supported. |
| Airdrop owners could reopen reviewed claims through an old UPDATE policy. New claims could omit an authoritative campaign or repeat claims. Approval could fall back to user-submitted rewards. | Restricted review/history changes to admins. New submissions lock and validate the campaign, derive reward/token/title, enforce availability and limits, and reject duplicate claims. Approval of historical claims without a valid campaign reward requires reconciliation. |
| Bloom support tickets contain a `messages` JSON column and the expected reply/close/priority functions. | Resolves the support-table ambiguity from the SVGs. The current support data model matches Bloom's export. |
| The expected investment, copy-trade, withdrawal and current portfolio function signatures exist. | Tested their successful paths with synthetic accounts. Their presence alone does not establish the cause of every reported live failure. |
| KYC review/revision columns, private-bucket configuration and new suspension metadata are not all represented as installed features. | Prepared feature migrations supply these. Real bucket settings and duplicate KYC records remain data-dependent release checks. |

Changes are in `bloom_export_compatibility.sql`, appended to the **12-file** atomic bundle. No production migration or deployment was performed.

## Verification

- Reconstructed the supplied public tables, constraints, indexes, functions, policies, grants and ordinary trigger in disposable PGlite.
- Ran the generated bundle twice successfully.
- Passed **17 functional/security scenarios** after the update: role/balance protection, notification access and writes, airdrop review/rewards, current and legacy investment/copy/portfolio actions, duplicate payouts/refunds, and support replies.
- Preserved synthetic existing user balances/roles, historical ledger fields, holdings in both portfolio tables and investment terms across the upgrade. New additive metadata columns are deliberately excluded from the old-ledger-field comparison.
- Added a regression fixture containing schema metadata only. The hardcoded admin email is replaced with a non-deliverable placeholder; no production user rows or credentials are included.
- All **8 service/database test files** pass, including the reconstructed-export regression and the deliberate no-admin abort. The read-only preflight query is exercised in a read-only transaction.

Reproduce with `npm test`, or use the original export directly:

```sh
node scripts/check-schema-export.mjs /path/to/export.json /tmp/schema-report.json
```

The offline checker exits with code 2 if scenario checks fail. It does not connect to Supabase. It accepts the SQL-editor JSON result or the decoded metadata object.

## Remaining release requirements

The supplied preflight clears the database-admin prerequisite and the targeted holdings/duplicate/payout checks. It identifies 28 trader-limit alias mismatches, 17 unusable or stale quote rows, and missing proof-bucket settings. See [the preflight review](bloom-preflight-review.md) for the local corrections and remaining catalog, staging and live-feed checks.

The offline restoration models Supabase Auth/storage helpers and uses a privileged function owner; it is not a hosted Supabase/PostgREST test. It does not reconstruct storage-engine internal tables, extension behavior, event triggers, function ownership variations, auth configuration, live market updates, actual user records, or concurrent production traffic. These limits prevent a zero-disruption production guarantee from schema-only tests.

The broader homepage/integration limitations in `ui-ux-audit.md` also remain. The SQL-export requirement is now satisfied; the preflight has also been supplied. Catalog-limit review, staged hosted-service checks and live-feed verification remain.
