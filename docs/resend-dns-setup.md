> The active Bloom website uses `joinbloom.online`. Use [its DNS guide](joinbloom-email-dns.md) for the current email setup. The records below belong to the separate `bloomsinvest.co` domain.

 # Bloom sending-domain DNS records

Retrieved from Resend on November 7, 2026 for `bloomsinvest.co`. Current domain status: **failed**.

Add or correct these exact records at the DNS provider for bloomsinvest.co, then verify the domain in Resend. Preserve existing website and mailbox records. These are public DNS values, not API keys.

| Purpose | Type | Host/name | Value | Priority | Status |
| --- | --- | --- | --- | --- | --- |
| DKIM | TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCsZHfEghDi4rbbqIEjJAK+bkT+vPBMkpYqDetBhXlQ6I/8oA71hXwVFgRAQv8PkoTEHzvVxIsmb8aNQbYEE7y6ZG/HNuVxoMW4DbnbTiJBHbKPEtrw9F/tg3iZ5qGUCoJ4SM6FFI1A0PgBohgJqDFHJ1Wm7oQs1ptqYDvMmFHXOwIDAQAB | — | failed |
| SPF | MX | send | feedback-smtp.eu-west-1.amazonses.com | 10 | failed |
| SPF | TXT | send | v=spf1 include:amazonses.com ~all | — | failed |

Use the host/name exactly as your DNS provider expects; some providers automatically append the domain. Do not append bloomsinvest.co twice. Provider verification has not been triggered by this read-only check.

The API key is saved in the ignored local .env file. Vercel production configuration has not been changed. Follow [email-setup.md](email-setup.md) after DNS verification.
