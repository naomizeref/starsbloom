# Investment reliability and existing-user rollout

The changes are local. No live database, balance, user account or deployment has been changed. Local tests identify repository defects; they do not establish which migrations or policies are installed in production.

The 27 October [copy-trading review](copy-trading-review.md) covers the updated directory, allocation dialog, position controls, admin forms and additional duplicate/capacity/maturity protections.

## Confirmed defects fixed

- The investment page returned before a React hook when its catalog became empty. Loading, empty, disabled and populated catalogs now use the same hook order. Existing positions and payout controls remain accessible when the catalog is empty or unavailable. Investment amount inputs accept cents; projections distinguish daily accrual from payout at maturity.
- Plan reads fell back to sample plans, while trader reads retained sample/cached entries even when the database was empty. Both catalogs now use stored records, show read failures, and support retries. Positions refresh on focus and every 30 seconds while visible; failed reads retain existing information with a warning.
- Admin plan handlers swallowed write errors. Trader handlers announced success before saving and ignored Supabase response errors. Saves now require a returned row, propagate failures and preserve entered form values. A failed post-save refresh is reported separately, without inviting a duplicate financial action.
- A late investment/copy-position response could overwrite a different account's screen. The dashboard now shares the verified auth session, clears prior account state on account changes, and exposes profile-load failures with retry. Reads are scoped to the requesting identity. Profile reads run outside auth callbacks, and late profile/initial-session responses cannot restore a previous account's admin status.
- The admin account drawer displayed frozen stored progress. It now derives progress from saved timestamps, includes position history and distinguishes paid, paused, matured and refunded records.
- Matured but unclaimed investments vanished from overview/portfolio equity. They remain included until a payout marker exists; legacy `payout_completed` flags are respected. Existing purchased ROI, timestamps and amounts remain authoritative.
- Top-ups now show pending/error feedback and validate finite, positive cent amounts on the server before debiting. Matured and cancelled positions cannot accept top-ups. Purchase writes populate both historical `name` and `plan_name` columns.
- Copy allocations with a zero maximum (meaning no maximum in the UI) were rejected by SQL. The server now uses that same rule. Copy status constraints are removed before legacy status normalization within the atomic upgrade.
- Claims have duplicate-click protection and stable notification event IDs. Ambiguous legacy Completed rows lacking payout evidence return a reconciliation message rather than a false success or an inferred second credit.
- Deleting a trader could cascade into users' existing copy positions. The upgrade rejects deletion of plans/traders with position history; disabling them remains available.

## Information needed from the live projects

Update, 26 October 2026: Bloom’s SQL metadata has been received and tested. [The export review](bloom-export-review.md) supersedes the request below for Bloom’s definitions. Run `scripts/preflight-bloom-upgrade.sql` next; no production changes have been made.

The supplied SVGs and confirmed project identities are reviewed in [live-schema-review.md](live-schema-review.md). They are partial table diagrams; the SQL definitions below are still needed.

Run `scripts/export-schema.sql` in Bloom's Supabase SQL editor, export its result, and share it. Run the same script in Orbitrio for comparison if available. Bloom is the priority. The script reads catalog metadata only: tables, columns, constraints, indexes, functions, triggers, policies and grants. It does not read user records or change the database. Check custom function bodies for hard-coded secrets before sharing. Passwords, service-role keys and account records are not needed.

A redacted failing browser network response (HTTP status, Supabase error code and message) would help distinguish missing RPCs, column mismatches, permission failures and authentication issues. Remove tokens and personal data. A table-column list alone is insufficient because the financial behavior lives in RPCs and triggers.

## Release procedure

1. Compare the live export with the local migration bundle. Check auth ID types, function signatures/overloads, balance-protection triggers, admin role policies, position labels/statuses and storage policies. Do not replace the live schema with Orbitrio's schema.
2. Back up the database and rehearse on a staging copy. Record balances, position amounts/terms, ledger counts, pending requests and payout markers before the upgrade; compare after it. Reconcile ambiguous historic payouts against the ledger before enabling claims for those records.
3. Verify regular and admin accounts across purchase, top-up, early-claim denial, maturity payout, cancellation/refund, catalog edits, deposit review and withdrawals. Test already-open sessions as well as new logins. Check that intended admins have `public.users.role='admin'`.
4. Review new access requirements against existing accounts: approved KYC for withdrawal, private evidence storage and suspension behavior can change what existing users are allowed to do. These requirements are part of the feature upgrade and must be agreed before production rollout. They are not proof of backward compatibility merely because the SQL applies successfully.
5. Apply the reviewed additive database update first, then deploy the compatible frontend. Keep the prior frontend artifact for rollback. Do not restore old financial SQL over the new schema or blindly restore a database backup after new transactions have occurred.

The generated bundle is atomic and tested for repeat application against the repository's historical schema. That does not guarantee zero disruption for an uninspected live database. Database access and deployment remain pending until this comparison and staging verification are complete.

## Local checks

`npm test` executes the actual bundled SQL against isolated PostgreSQL, including purchase, top-up, payout, duplicate payout, copy allocation with no maximum, early claim rejection, cancellation/refund, historical payout ambiguity, catalog deletion protection and financial snapshots before/after repeat upgrade. The read-only schema exporter is exercised too.

`npm run test:browser` exercises the real investment page, admin plan form and catalog/position hooks with a simulated Supabase transport at 375px and 1440px. It covers failure/retry, empty/populated transitions, zero-row writes, preserved form inputs and stale account responses. A separate authentication test checks profile/session races. These complement the existing deposit/KYC browser tests; they do not replace staging tests with the live policies.
