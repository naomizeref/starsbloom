# Bloom / Orbitrio feature transfer

Compared Bloom `17aa5c0` with Orbitrio `fda7f13`. Both repositories share the trading, portfolio, investment-plan, copy-trading, referral, airdrop, announcements, support, notification, wallet and administrative feature foundation. This change ports Orbitrio's subsequent functionality into Bloom and adapts it to Supabase Auth. Bloom's branding, public landing pages, parent information, searchable country picker, Chatway, email-code authentication and existing account-management tools remain available.

| Area | Bloom behavior after this change |
| --- | --- |
| Gift cards | Wallet and quick-deposit forms accept Amazon, Apple, Steam, Google Play, Razer Gold and Visa; record card value/currency and requested USD amount; accept 1–4 private images. Admin verification controls credit. No automatic card redemption or currency conversion. |
| Crypto evidence | Both forms upload real files under the authenticated user ID. Invalid/failed uploads stop submission. Failed saves keep form values and reuse uploaded files. |
| Admin deposit review | Search/filter/refresh, card metadata, private images, full-size links, expiring-link refresh and retries. Approval/rejection waits for the database result. Reviewed evidence remains accessible. |
| Identity verification | Front/back ID or passport page uploads, progress, validation, retry reuse, status refresh and resubmission after rejection. Private documents are never cached in localStorage. |
| KYC review | Admin image previews, notes, required rejection reason and revision checks prevent reviewing a superseded submission. Self-review and foreign document references are rejected in SQL. |
| Account controls | Active/suspended/banned status is persisted before notices. Suspension sends an in-app notice and branded email, with delivery failures reported separately from the saved status. |
| Existing positions | Suspension freezes progress, earned profit and maturity countdowns. Reactivation extends maturity by the paused duration and preserves prior progress. Claims, cancellation, top-ups, trading and withdrawals are enforced in SQL. |
| Notifications | Refresh on focus and every 15 seconds while visible; case-insensitive email matching with wildcard escaping; user-ID fallback; failed refreshes preserve existing notices. |
| Countries | All 249 ISO regions plus Kosovo, while preserving Bloom's existing display names and flag/search UI. |
| Existing flows improved | Database-confirmed deposits/withdrawals; withdrawal duplicate-click protection; private admin viewers; larger mobile controls; database-role-only admin access; guards against self-promotion, self-reactivation, fabricated ledger entries and direct position edits; approved KYC required for withdrawal. |

## Database upgrade

The frontend requires the new database columns, functions, policies and private buckets. No remote database has been migrated and no deployment has been made by this change.

For an existing Bloom database with the core schema and `missing_tables_master_migration.sql` already installed:

```sh
npm ci
npm run build
npm run db:features
```

First follow [the investment reliability and existing-user rollout guide](investment-reliability.md) and compare the live schema export. Review `dist/bloom-feature-upgrade.sql`, then apply it in the Supabase SQL Editor on a staging copy first. The generated file contains the 12 migrations listed in `scripts/feature-migrations.mjs`, in order and inside one transaction. It is repeatable in the tested historical schema; existing balances and position history are preserved in the regression fixtures. The supplied Bloom export has been reconstructed and tested; see [the export review](bloom-export-review.md). Live data, storage configuration and hosted staging verification remain required. Previously suspended/banned positions pause from migration time; earlier elapsed time cannot be reconstructed. An existing public `deposit-proofs` bucket, incompatible KYC bucket settings, or duplicate KYC owner records cause a deliberate failure for review rather than silent deletion or insecure access.

For an empty database, install `supabase_schema.sql` and `missing_tables_master_migration.sql` first, then apply the feature bundle. The regression suite executes that exact historical-schema upgrade path. Existing auth-email setup remains separate (`auth_email_codes.sql`).

Assign administrators explicitly through `public.users.role`. Email addresses, local caches and user-editable auth metadata no longer grant access. Existing database admin roles are preserved. Before deployment, verify at least one intended administrator already has the database role. Do not rerun historical financial/schema files after the upgrade without reapplying the bundle: older definitions can replace newer functions and policies.

New private buckets are `gift-card-proofs` and `kyc-documents`; `deposit-proofs` is created if missing. New features use the existing Supabase and Resend configuration. Real email delivery requires a configured Resend sender. The bundle does not create a new Supabase project, change authentication providers or enable live services.

## Verification

```sh
npm test              # service and isolated PostgreSQL regression suites
npm run lint         # TypeScript
npm run build        # production frontend and server
npm run test:browser # local Vite fixture + headless Chrome
npm run db:features  # generate the reviewable SQL bundle after the build
```

Browser tests use `/usr/bin/google-chrome`; set `CHROME_PATH` for another installed Chromium executable. Browser fixtures replace only authentication/database boundaries in a dedicated Vite config. They exercise the real forms, upload services, KYC service, image viewers and admin screens, with external network requests blocked. They do not authenticate against production, send emails, redeem cards or move funds.

Regression coverage includes owner/admin/third-party image isolation, invalid/foreign file paths, upload failures, partial retry caching, pending-only deposit submission, duplicate approval, rejection without credit, stale KYC reviews, suspended financial operations, pause/resume math and the actual Bloom legacy schema upgrade. Browser checks cover both deposit entry points, crypto/gift-card failures and retries, KYC submission/review and mobile/desktop overflow. Generated screenshots and reports stay in ignored `test-results/`.

Before a live release, verify with separate regular/admin accounts on the intended staging Supabase project: registration/login, every payment method, private image access denial, KYC approval/rejection/resubmission, suspension/reactivation of existing positions, pending withdrawal rejection/refund, and actual email delivery. Local fixtures cannot prove the deployed environment's policies, credentials or storage settings match the repository.
