# Bloom → Clerk

The code supports Clerk, but **production is not switched yet**. The production settings and server credentials are saved in ignored, owner-readable `.env.local`. All 17 current accounts now exist in Clerk and their Bloom identity links have been verified. Deployment and final cutover have not been performed.

Status on 7 November 2026: the owner confirmed that the native Clerk provider is enabled in Supabase and both `clerk_auth_migration.sql` and `scripts/configure-clerk-issuer.sql` ran successfully. The deployed identity lookup RPC is reachable. The missing-profile repair is complete: live checks now find **16 Supabase Auth accounts and 16 matching Bloom profiles**, including one active admin. At the owner's explicit request, the three previously unverified accounts were manually email-confirmed through the Supabase admin API and checked afterward; this was an administrative override, not proof of inbox ownership. The refreshed 16-account export passes offline validation and matches live IDs/emails.

Update on 8 November 2026: the production Clerk settings now make username, first name, and last name optional. All 16 exported users were found in Clerk with matching external IDs, verified primary emails, and passwords enabled. The idempotent mapping RPC returned the original Bloom ID for every account, including the active admin. A before/after comparison of all Bloom profiles confirmed unchanged IDs, emails, roles, statuses, balances, portfolio values, points, and referral counts during this verification. Real hosted user/admin sign-in is still untested.

The refreshed export included a seventeenth account whose email was unverified. With the owner's explicit approval, that account was manually confirmed through Supabase's admin API and read back before import. Only its confirmation flag was refreshed in memory from the live response; the attached export and password hashes were not edited. The resumed import created one Clerk account, reused the existing 16 without resetting their passwords, and verified all 17 identity links. All 17 Clerk accounts have matching external IDs, verified primary emails, passwords enabled, and no ban/lock flags. One active Bloom admin is included. The final profile comparison again confirmed unchanged IDs, emails, roles, statuses, balances, portfolio values, points, and referral counts.

The owner supplied a passing database preflight on 8 November 2026: 17 Auth accounts, 17 Bloom profiles, 17 mapped Clerk accounts, one mapped active admin, one configured Clerk issuer, and zero unmapped accounts, unverified legacy accounts, missing profiles/Auth records, duplicate account emails, or remaining `auth.uid()` application functions. The owner subsequently confirmed that the four Clerk Production environment variables in section 4 were saved in Vercel. Their deployed values have not been inspected here. Retain the existing Supabase provider flags until the new code is published and the coordinated deployment is ready.

Before final cutover, pause legacy registrations/password changes for the maintenance window and reconcile any further accounts or password changes since the import. Deploy Clerk mode and complete the hosted checks before removing legacy issuer access. The latest attached export still records the seventeenth account's old unverified state; any future import should use a new private export rather than editing that file to bypass validation.

Administrator credentials and a password-hash export were shared in chat. Replace the shared credentials privately before the production rollout and restrict access to the export. Coordinate replacement/revocation of the legacy Supabase service-role credential with the deployed server configuration; do not blindly rotate the project JWT secret, which can affect other keys and clients.

Clerk handles sign-in, registration, verification, password recovery, sessions, and account security. Supabase continues to hold profiles, roles, balances, investments, transactions, documents, and the database functions that authorize financial actions. Resend remains the sender for Bloom's transactional notifications; Clerk handles its own authentication emails.

## Why the database migration is needed

Existing Bloom IDs are stored as text and often contain Supabase UUIDs. Clerk IDs look like `user_...`. Replacing IDs would disconnect financial history and storage paths.

`clerk_auth_migration.sql` adds a private `(issuer, Clerk subject) → existing Bloom ID` mapping. It adapts public application functions and public/storage policies to `bloom_current_user_id()`, preserving their owners, execution grants, signatures, and policy settings. It leaves Supabase's `auth.uid()` unchanged. Original definitions are saved in `bloom_auth.definition_backup`; unsupported remaining identity expressions abort the transaction. Run it after the existing 12-file feature upgrade. If that older upgrade is reapplied later, rerun the Clerk migration before serving Clerk traffic.

The server verifies the Clerk signature, exact issuer, allowed website origin, active session, and verified primary email. It reads imported `externalId` from Clerk's backend API, never browser metadata. Existing email matches without a trusted account link are rejected. New accounts get a new Bloom ID, zero balance, and the ordinary user role. Admin roles remain controlled by the database.

## 1. Prepare Clerk and a staging database

1. In the **production** Clerk application, finish DNS/HTTPS setup for `clerk.joinbloom.online` and the account portal. Use the exact DNS records Clerk displays; keep the existing Resend records.
2. Enable email/password sign-in, verified email registration, recovery, and any desired MFA options. Make usernames optional or disabled: Bloom's legacy export does not include usernames. First/last names must also be optional because some legacy profiles have no names. For local testing, use a separate development Clerk instance and a staging Supabase copy. Production Clerk keys are intended for the configured production domain.
3. Disable self-service account deletion in Clerk until Bloom has an account-closure process that reconciles financial records. Keep public signups disabled during the import/cutover window.
4. Activate **Clerk → Integrations → Supabase**. Add the displayed Clerk domain under **Supabase → Authentication → Sign In / Providers → Add provider → Clerk**. Native integration supplies the `authenticated` role claim. Do not use the deprecated shared-secret JWT template; no custom identity claims are needed.
5. Back up the production database. Test the following migration against staging first, with its own issuer and Supabase issuer entry. The SQL files default to Bloom production; update the issuer entries for staging.

References: [Clerk/Supabase integration](https://clerk.com/docs/guides/development/integrations/databases/supabase), [Supabase third-party auth](https://supabase.com/docs/guides/auth/third-party/clerk), [Clerk user migrations](https://clerk.com/docs/guides/development/migrating/overview).

## 2. Apply the additive SQL

In Bloom's SQL editor (`pqbivesimvmzdwbrqprj`), after the backup and staging check:

1. Run the entire [clerk_auth_migration.sql](../clerk_auth_migration.sql).
2. Run [configure-clerk-issuer.sql](../scripts/configure-clerk-issuer.sql).

Keep the frontend and server provider flags on `supabase` for now. The migration allows the existing Supabase issuer during the transition, so the current app can continue to work. No balances, roles, position terms, or IDs are rewritten.

## 3. Import existing accounts

First run [preflight-clerk-auth.sql](../scripts/preflight-clerk-auth.sql). If `auth_accounts_without_profile` is nonzero, review those accounts and run [reconcile-clerk-profiles.sql](../scripts/reconcile-clerk-profiles.sql) in the SQL editor after a backup. It creates only missing profiles under their existing Auth IDs with zero balances and ordinary user permissions. Existing profiles, roles, financial records, and email verification states remain unchanged. It briefly locks account/profile writes and rolls back on an invalid email, a banned missing-profile account, or conflicting emails; it never merges by email. Its result contains only counts. For the current snapshot, expect four profiles created and zero Auth accounts without profiles, unless registrations have changed the totals.

Use [export-clerk-users.sql](../scripts/export-clerk-users.sql) to export existing users from Supabase. **The result contains password hashes. Download its JSON to a private location outside the repository; do not paste it into chat or share it.** The script only reads data. Restrict the downloaded file's permissions.

The export refuses to omit Auth accounts without profiles. The importer accepts a raw array or the SQL editor's JSON wrapper. It stops for duplicate emails/IDs, unverified or banned Auth accounts, mismatched Auth/profile emails, missing Auth records, or unsupported password hashes. Resolve those exceptions before proceeding; do not discard the accounts or their balances. For future unverified accounts, use existing email verification or implement and test a separate migration flow that preserves their unverified state. OAuth-only and passwordless legacy accounts need a separately reviewed import/recovery plan.

Validate offline first:

```sh
node scripts/import-clerk-users.mjs /private/bloom-users.json
```

Set `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in your private environment or ignored `.env.local`. Then explicitly import:

```sh
node scripts/import-clerk-users.mjs /private/bloom-users.json --apply --production
```

This creates Clerk users with their old Bloom ID as `externalId`, imports bcrypt digests so existing passwords remain usable, and saves the database identity links. It does not copy database admin roles into editable Clerk metadata. It checks destination conflicts before writing and resumes partially completed imports without resetting existing Clerk passwords. Existing Clerk accounts with the same email but a different/missing `externalId` require trusted manual reconciliation; the importer does not claim them automatically.

Run [preflight-clerk-auth.sql](../scripts/preflight-clerk-auth.sql). Require zero Auth accounts without profiles, zero unmapped accounts, zero duplicate emails, zero remaining `auth.uid()` application functions, and at least one mapped active admin for the production issuer. Compare totals with the export. `profiles_without_legacy_auth` needs review before import; after cutover, new Clerk-only accounts can legitimately increase that count. Delete the sensitive export when migration/recovery needs are complete.

## 4. Vercel environment variables

Bloom project → Settings → Environment Variables → **Production**:

| Variable | Value / source |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production `pk_live_...` key already supplied |
| `CLERK_SECRET_KEY` | Matching production `sk_live_...` key; choose **Secret** |
| `CLERK_JWT_ISSUER` | `https://clerk.joinbloom.online` |
| `CLERK_AUTHORIZED_PARTIES` | `https://www.joinbloom.online,https://joinbloom.online` |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing Bloom server key; choose **Secret** |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Keep the current Bloom values |
| `VITE_AUTH_PROVIDER` | `clerk` only when migration/import are complete |
| `AUTH_PROVIDER` | `clerk` at the same time |

Never prefix the Clerk secret or Supabase service-role key with `VITE_`. Do not paste them into chat. For a configured local development instance, add the exact localhost origin to the server allowlist. Do not add wildcard origins or reuse live keys/data for arbitrary previews.

Redeploy after updating variables; `VITE_` values are compiled into the browser bundle. Use the custom production domain for Clerk login. The old `vercel.app` hostname is not an approved origin; redirect it to the production domain or deliberately configure it with Clerk before allowing login there.

### Diagnosing the old registration form after cutover

`POST /api/auth-codes` returning 410 means the server has disabled legacy authentication. If the three-step registration form still calls that endpoint, the frontend was built in Supabase mode or an older frontend is still being served. Do not re-enable the legacy endpoint to hide the mismatch.

The Vite build now checks both provider flags and the public Clerk key before generating assets. Both flags must be exactly `clerk` or `supabase`; quotes, whitespace, empty values and mismatches stop the build. Unset flags retain the legacy Supabase default. Build logs print only the selected providers, never keys. A Clerk build must show `[Bloom auth build] Frontend=clerk, server=clerk`.

In Vercel, inspect the **Production / Current** deployment's Build Logs for that line. If it is missing, confirm the deployment contains `scripts/validate-auth-build.ts` and runs the repository's Vite configuration. If the check fails, correct the named variable in the Production environment and redeploy without the existing Build Cache. If the check passes but the domain still serves the old form, compare the deployment URL with the custom domain and check which deployment is marked Current. Test existing-user and admin login before final database activation.

## 5. Finish the cutover

Bloom's original login, three-step registration, email verification and password-reset pages now use a Clerk adapter. Clerk sends and checks the codes and manages passwords and sessions; these forms do not call `/api/auth-codes` in Clerk mode. The original layout is shared with the Supabase flow. Sign-in continues the same Clerk attempt inside Bloom for authenticator and backup codes, email/SMS device verification, passkeys and mandatory password replacement. It no longer mounts a second full Clerk login form after the password step. Unhandled verification methods block access with an inline support message; they are never skipped. Additional registration requirements still use Clerk's signup component inside the Bloom panel. Pending session tasks redirect through Clerk before any Bloom provisioning or dashboard access.

Registration keeps the personal details and account preferences in Clerk signup metadata, excluding passwords. The verified backend copies only an explicit allowlist into a new, ordinary Bloom profile with no existing username or first/last name. Imported accounts are excluded; repeated logins do not overwrite initialized profiles. Metadata never sets account identity, email, role, status, KYC or financial values. This restoration requires no SQL migration. Browser tests use a simulated Clerk SDK; hosted verification email delivery and real security challenges still need a live smoke test.

Auth loading: the login/registration form downloads alongside Clerk and can render while its SDK connects. Submission stays disabled until Clerk is ready; known sessions still wait for identity mapping and role checks. Input stays mounted when a guest's SDK finishes loading. Market quotes, trader and investment catalogs wait until leaving auth routes; dashboard layout and financial modals load only where needed. Fonts no longer block the initial render, and the single live-chat widget defers its startup on auth pages. Run `npm run test:auth-loading` to verify slow SDK startup, input preservation, catalog resumption, blocked private routes and stalled fonts against the full app with a simulated Clerk SDK.

Homepage loading uses the same public-entry exception: it can render while Clerk connects and does not request trading catalogs. Private routes offer reload/home recovery after 15 seconds if Clerk never initializes. Account mapping has a 20-second deadline covering token acquisition as well as the API request; late results cannot open an account after timeout. The static landing page defers ordered navigation scripts and fonts, keeps content visible without animation JavaScript, prioritizes hero images and loads background videos only near the viewport. Homepage navigation and lazy media are included in `test:auth-loading`; token timeout/retry is covered by `test:clerk`.

Schedule a short authentication maintenance window. Pause legacy registration/password changes before the final export, import close to cutover, and reconcile accounts/password changes made since any earlier dry run. Do not import a stale snapshot over live password changes.

After deploying Clerk mode, verify on the hosted site with controlled accounts:

- Existing user logs in with the existing password; ID, balance, investments, holdings, notifications, and document access match.
- Existing admin lands in `/admin` and can review the intended accounts.
- Sign-out, password recovery, MFA, reload, account switching, and mobile input work.
- Another user cannot read those records or private documents.
- A controlled new signup creates exactly one zero-balance ordinary account; duplicate tabs do not duplicate profiles.
- Transactional notifications still authenticate successfully with Clerk. Only send test messages to an explicitly approved address.

Then run [activate-clerk-auth.sql](../scripts/activate-clerk-auth.sql). It refuses to proceed while Auth accounts lack profiles or until all existing profiles and an active admin are linked to the production issuer. It removes legacy Supabase issuer access so old password sessions cannot bypass Clerk security. Disable legacy Supabase email signup and unused social providers, then reopen Clerk signup.

**Users must sign in again.** Existing Supabase sessions cannot become Clerk sessions. This migration preserves account data; it does not promise uninterrupted sessions.

## Recovery

Before final activation, set both provider flags back to `supabase` and redeploy to restore the existing login flow. After activation, also restore the legacy issuer entries using the insert near the start of `clerk_auth_migration.sql`. Keep the identity mapping and financial records; do not delete/recreate users or roll back balances.

Clerk-only new users and passwords changed in Clerk are not synchronized back to Supabase Auth. A rollback after admitting those accounts therefore needs an explicit recovery plan; a flag change alone is not a complete rollback for them. Prefer fixing Clerk configuration once new accounts are admitted.

## Local verification

Release checks rerun on 8 November 2026: TypeScript, the Clerk-enabled production build, all 57 Node tests, and all three Clerk browser tests passed. Earlier checks also passed for the Supabase build and the broader browser suite. `npm run lint`, `npm run build`, `npm run test:clerk`, and the Node regression suite cover SDK integration, signed token validation, import conflicts, session races, mapped RLS/RPC access, private schema restrictions, and preservation of existing financial data. Browser Clerk tests use a simulated SDK session; database tests use the exported schema in disposable PGlite. Live Clerk account creation and Bloom identity linking have now been checked as recorded above. Real hosted user/admin sign-in, email delivery, and Supabase Storage/Realtime checks remain required before activation. The production build still reports the existing large-chunk warning.
