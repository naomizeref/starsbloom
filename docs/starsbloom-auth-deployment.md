# Restore Clerk on the starsbloom deployment

The November 13 login-page report shows the legacy `/api/auth-codes` request returning 500. A read-only deployment inspection found the same frontend asset as the screenshot. An empty request (no email or password) returned 400 with `Unknown purpose`, confirming the deployed server still selects the legacy handler. This does not identify the underlying legacy 500 cause; no account creation or email delivery was attempted.

Saving new environment variables does not rebuild the browser bundle or update an existing deployment. Variables from the old Bloom Vercel project are not automatically copied into starsbloom.

## Production configuration

In **Vercel → starsbloom → Settings → Environment Variables**, check the Production scope:

| Name | Value |
| --- | --- |
| `VITE_AUTH_PROVIDER` | `clerk` |
| `AUTH_PROVIDER` | `clerk` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Public production key from the existing Bloom Clerk application |
| `CLERK_SECRET_KEY` | Matching private Clerk key, saved as Secret |
| `CLERK_JWT_ISSUER` | `https://clerk.joinbloom.online` |
| `CLERK_AUTHORIZED_PARTIES` | `https://www.joinbloom.online,https://joinbloom.online` |
| `VITE_SUPABASE_URL` | Existing Bloom Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Existing Bloom public Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing Bloom server key, saved as Secret |

Keep existing database identity mappings and the existing Clerk application. No account re-import or SQL migration is required for this deployment configuration fix. Never prefix secret keys with `VITE_`.

## Deploy and verify

1. Redeploy the latest source as **Production** after saving the variables; disable **Use existing Build Cache** for this recovery.
2. Confirm the Build Logs contain `[Bloom auth build] Frontend=clerk, server=clerk` and the deployment finishes Ready.
3. Check the deployment's Domains include the actual login hostname, `www.joinbloom.online`, and that this deployment is marked Current. Check the apex redirect as well. If the domain is still attached to an older project, correct that assignment before testing.
4. Open a fresh `/login` tab. Registration uses Clerk's email verification and should no longer call `/api/auth-codes`. The existing Bloom form design stays in place.
5. Test an existing user/admin login and one controlled registration. Verify the existing account and balances are preserved.

The build guard rejects missing Production provider flags instead of silently selecting Supabase, and rejects missing Clerk server configuration. It cannot inspect which deployment a custom domain points to, verify secret validity, or replace a hosted sign-in check.

## Verified release state — November 13, 2026

The owner confirmed signup works after configuring Clerk in the new Vercel
project. The support-address SQL was applied in the existing Bloom database; a
follow-up SELECT showed both `supportEmail` and `replyToEmail` equal to
`support@joinbloom.online`.

The source update includes homepage/email support links, default business
settings, safe email delivery diagnostics and production auth configuration checks.
Local validation passed: TypeScript, a Clerk-mode production build, 7 auth build
checks, 16 Clerk browser tests, 20 account/email Node tests and 4 email browser tests.
Provider requests in those tests were mocked. The reported deposit email was
Delivered in Resend; inbox placement has not been verified.

After Vercel deploys the update, check the production homepage support link and
confirm `BLOOM_SUPPORT_EMAIL` and `BLOOM_REPLY_TO_EMAIL` are also set to the new
address. Repository changes do not replace existing Vercel environment values.
