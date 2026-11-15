# Resend DNS records for joinbloom.online

Retrieved November 7, 2026. Resend status: failed. Vercel manages DNS according to the supplied domain-dashboard screenshot.

These records belong to joinbloom.online, not bloomsinvest.co.

| Purpose | Type | Name | Value | Priority | Status |
| --- | --- | --- | --- | --- | --- |
| DKIM | TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBJL0220AIZAMOiKNmONX2WegHsEJs/SyJeZ1CjKPmRIowYERKmPegCsWv/pSebIw7LsUoHdj9RHXhjRsbBuoEA1LHuM4Iy34m1mvzWYTUhNpcNlnISmPAC0cftsSA6B6mcKPx/ulWJ/BsTpI4HfDvmGGhk81QnT29YUxYqyQZvQIDAQAB | — | failed |
| SPF | CNAME | rsend | rsend-euw1.forge.rmta.net | — | failed |
| SPF | CNAME | send | send.forge.rmta.net | — | failed |

In Vercel, use the DNS Records form and add each record separately; leave TTL at 60. If a matching record already exists, update it rather than adding duplicates. Preserve website and mailbox records. Return to Resend and verify joinbloom.online after saving.

After verification, the sender can be Bloom <notifications@joinbloom.online>. The website URL is https://www.joinbloom.online. Support and reply-to must point to a real monitored inbox.

No DNS records or production settings were changed by this read-only check.

## Follow-up verification

Resend reported `partially_verified` after the DNS records were added on November 7, 2026. The `resend._domainkey` TXT and `send` CNAME are verified; `rsend` CNAME is pending. Wait for full verification before the production email release.
