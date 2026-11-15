# Bloom email setup and release

The November 6, 2026 update is prepared locally. No production emails have been sent during testing, and no database migration is needed for this update. Bloom already uses `public.auth_email_codes` from the earlier upgrade.

## Set up delivery before deploying

1. In **Resend → API Keys**, revoke the key previously embedded in the repository. Removing it from the current files does not remove it from Git history. Create a new sending-only key scoped to Bloom's sending domain. Store it directly in Vercel, never in Git or chat. [Resend key management](https://resend.com/docs/dashboard/api-keys/introduction).
2. In **Resend → Domains**, add a domain you own. The current Bloom site uses `joinbloom.online`. Its exact records are in [joinbloom-email-dns.md](joinbloom-email-dns.md). Add the exact DNS records Resend supplies at the domain's DNS provider and wait for verification. Preserve existing website and mailbox records. Do not use `onboarding@resend.dev` as the production sender. [Domain verification](https://resend.com/docs/dashboard/domains/introduction).
3. In **Vercel → Bloom → Settings → Environment Variables**, configure the following for Production. Add them separately to Preview if testing a preview deployment. Never use a `VITE_` prefix for secrets.

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | The newly created Resend key |
| `RESEND_FROM_EMAIL` | `Bloom <notifications@joinbloom.online>` after Resend verifies `joinbloom.online` |
| `BLOOM_COMPANY_NAME` | `Bloom` |
| `BLOOM_SUPPORT_EMAIL` | A real monitored support inbox; also receives support-ticket reply notifications |
| `BLOOM_REPLY_TO_EMAIL` | The monitored inbox to receive replies; defaults to `BLOOM_SUPPORT_EMAIL` |
| `BLOOM_SITE_URL` | The actual HTTPS app origin, `https://www.joinbloom.online` |
| `SUPABASE_URL` | `https://pqbivesimvmzdwbrqprj.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Bloom's existing server-only service-role key |

A verified sending domain does not create a monitored support mailbox. Use an inbox you can actually read for support and replies. Website Company Information remains editable in Business Settings; email branding and routing come from the server environment. The former browser-provided sender/reply fields no longer control delivery.

4. Deploy the frontend and API together after configuring those values. Environment changes apply to new deployments. The previous Vercel Git deployment was blocked; resolve the reason shown in the deployment dashboard before publishing. [Vercel environment variables](https://vercel.com/docs/environment-variables).
5. Using your own test account, request a signup code, resend after 45 seconds, verify, and request/reset its password. Check Inbox and Spam, then inspect Resend's Emails view for the provider status. Confirm the code works only once and that the reply address reaches your support inbox. Exercise financial notification events on a disposable/staging account, not by changing existing users' money to test email.

## What changed

- One shared template renderer produces mobile-readable HTML and plain text. Verification codes appear in the message body, not the subject. Templates escape inserted data and only link to the configured HTTPS site.
- Corrected investment/payout metadata, zero-value profits, copy-trading totals, investment top-up labels, support reply previews and market buy/sell labels. Missing monetary values no longer become invented `$0.00` amounts. Claim rewards retain their token unit; approved cash credits use USD.
- Both Vercel entry points use explicit ESM imports. Provider access has bounded timeouts, one retry for transient failures, and a stable idempotency key with identical payload on retry. Permanent failures do not fall back to a test sender. [Resend idempotency behavior](https://resend.com/docs/dashboard/emails/idempotency-keys).
- `/api/send-email` requires a verified Supabase session and active account. Regular users can notify their own address. Admins can notify other registered accounts. A support-reply exception only sends a saved message from a ticket owned by the caller to the configured support inbox. The general email endpoint cannot issue authentication codes.
- Resend and Supabase details, passwords, codes and recipient addresses are excluded from API error logs. Success means **accepted by Resend**, not delivered to the inbox.
- Verification resends update the cooldown timestamp and use conditional writes to avoid overlapping code replacement. Verification attempts and consumption also use conditional writes. Short reset passwords do not consume codes. Account lookup now searches beyond the first auth directory page.
- A payout claim and its subsequent refresh share an email event ID. Failed maturity emails can be retried on a later data refresh without repeating the in-app notification.

## Operational limits

Transactional notifications are still initiated by the browser after a saved action. The provider retries temporary failures within the request; there is no durable outbox or background worker guaranteeing delivery after the browser closes. Browser event history and Resend's 24-hour idempotency window reduce duplicates, but do not provide permanent server-side exactly-once delivery. Financial writes do not depend on email success.

Verification codes are consumed before the final Auth change to prevent replay. If the subsequent Auth request fails or times out, request a fresh code before retrying. Public signup/reset endpoints still need platform-level abuse controls for traffic across many email addresses; the database cooldown is per email and purpose.

No bounce/delivery webhook is installed. Use Resend's dashboard for acceptance, delivery, bounce and suppression information. Live inbox placement and Gmail/Outlook/Apple Mail rendering need provider setup and real-device checks; local browser previews do not prove either.

## Local verification

```sh
npm run lint
npm run build
node --import tsx --test tests/email-system.test.ts tests/email-runtime.test.ts tests/account-status.test.ts
npm run test:pages -- email.spec.ts
```

Tests mock Resend and Supabase. They cover notification authorization, trusted routing, all template types, retry payloads, cooldown concurrency, one-time verification, attempt limits, expiry, pagination, deployed ESM loading, browser authentication and mobile email layouts. They send no live email and modify no live accounts.
