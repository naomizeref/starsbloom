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
