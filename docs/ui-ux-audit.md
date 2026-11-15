# Bloom UI, UX and functionality audit

> Update, 27 October 2026: see the [copy-trading review](copy-trading-review.md) for the new user/admin flows and database protections. The live aggregate preflight has also been reviewed in [the preflight report](bloom-preflight-review.md); hosted staging checks remain outstanding.

> Update, 26 October 2026: Bloom’s SQL metadata was received and tested. See [the export review](bloom-export-review.md). The next release checks are live-data preflight and hosted staging verification; the earlier request for Bloom’s full SQL definitions is satisfied.

Reviewed 24 October 2026. Changes are in the local checkout. No production deployment, user-data migration, or live financial transaction was performed.

## Coverage and evidence

`npm run test:pages` renders the actual application routes, route guards, navigation, layouts and page components. Its audit-only context/transport supplies deterministic data and simulated failures; it never uses production credentials. It checks 44 route/tab views at 375px and 1440px (88 captures), mobile empty-account screens, mobile navigation, and selected successful/failed actions. The homepage iframe is checked separately for horizontal overflow. The parents proxy uses a local placeholder, so this does not validate its external content.

Screenshots and JSON measurements are generated under `test-results/audit/`. They are ignored by Git. Passing render checks establish that the covered pages load without uncaught browser errors or document-level horizontal overflow; they do not certify every external service or every control. Wide financial tables scroll within their containers.

| Area | Pages checked |
| --- | --- |
| Public | Home, About, Contact, Markets, Plans, Copy Trading, Auth, Login, Register, Terms, Privacy, Risk, Parents and Parenting alias |
| Signed-in | Overview, Trading, Portfolio, Investment Plans, Wallet deposit/withdrawal/ledger tabs, Support, Transactions, Airdrops, KYC, Wallet Requests, Notifications, Account Settings, Copy Trading |
| Admin | Users/Balances, Plans, Ledger, Content, Settings, Traders, Airdrops, Wallet Gateways, KYC, Deposits, Withdrawals, Announcements, Helpdesk, Wallet Feedback, Security/Activity |

Existing `test:browser` tests additionally exercise authenticated session isolation, investment catalog recovery and writes, investment amount submission, account switching, private deposit evidence, gift-card deposits, KYC uploads and administrative review. `npm test` uses isolated database/service tests, including migration reapplication and financial balance/payout checks.

## Fixed in this audit

- **Wallet secrets:** the wallet feedback page requested seed phrases/private keys and claimed that sharing them could not expose funds. Removed those prompts and the false statement. It now asks for an integration use case, explicitly excludes secrets, and says that submission does not connect a wallet. Navigation now calls it Wallet Requests. Existing production submissions were not accessed; they may contain sensitive material and require restricted incident review before any export or sharing.
- **Support:** ticket creation/replies now await persistence, keep drafts after failure, display errors, and prevent repeated submission while pending. Removed the fabricated delayed support response claiming that staff were investigating. Support reads now expose loading/error/retry states, refresh on focus/interval, and discard late results from previous accounts. Admin replies, resolution and priority changes also wait for confirmation.
- **Trading:** removed the fabricated fallback price and unsupported limit/leverage/short-sale controls. Orders now use the displayed asset’s symbol and classification, accept cents, disable while pending or without a quote, and preserve amounts on failure. The UI accurately describes market buys/sales of existing holdings. The subsequent [preflight review](bloom-preflight-review.md) also removes backend mock quotes, frontend random price movements and fabricated sparklines. Provider/source timestamps and confirmed database sync now gate quotes; deployed provider connectivity and hosted RPCs still need verification.
- **Withdrawals:** admin approve/reject feedback now follows the server result. Failed actions stay failed, with visible errors and pending controls disabled. Missing transactions cannot be reported as successful. The table has a keyboard-focusable scroll region and a horizontal-scroll hint.
- **Settings/content:** writes propagate database errors (including missing tables), require a returned row, and update local state/cache only after confirmation. Failed business-setting saves preserve unsaved edits. Content edits have associated labels and visible failure status.
- **Wallet feedback:** user and admin operations catch failures and preserve form text. Admin updates/deletes require a returned row before changing the displayed list.
- **Airdrops:** admin mutation failures reach the page; create/update/review actions show errors and prevent concurrent submissions. Campaign updates/deletes require confirmed rows. User claim buttons remain disabled while a claim is pending.
- **Admin tab navigation:** removed the exit-wait transition that could leave the previous panel mounted after a different tab was selected. Page tests now assert each selected panel’s heading before measuring its layout.
- **Accessibility:** restored browser zoom in the production viewport metadata.
- **Account settings:** Settings previously opened the deposit page. Added `/dashboard/settings`, with account details and password change using the current Supabase session, matching-password validation, pending state, and confirmed success/error feedback.
- **Navigation:** About and Contact now have routes using the existing components; legacy home-section hashes redirect to them. Guest Earn opens public plans. Verified users can revisit their identity page. Homepage internal CTAs use the app router; dead “Text me the App” CTAs now say Get Started and open registration. Contact uses the app accent color, a callable telephone link, and less duplicated top spacing.
- **Other truthfulness/reliability:** public plan failures are distinguishable from an empty catalog; overview/referral/deposit-dialog clipboard success requires an actual successful copy; the unused referral withdrawal action no longer adds money only in browser state; browser-local activity logs are identified as such and no longer start with fabricated system events. Parents iframe messages must come from the expected window/origin.

## Remaining production and content checks

1. **Database compatibility is not proved by SVG diagrams.** Bloom is `pqbivesimvmzdwbrqprj`; Orbitrio is `mwmrkrvitrvogkffjgmt`. Run the read-only `scripts/export-schema.sql` against the correct project and review its results. RPC bodies, grants, policies, triggers, constraints and complete table definitions are needed before deploying the prepared migration. See `live-schema-review.md` and `investment-reliability.md`.
2. **Do not infer that live investment/admin failures are resolved from fixture tests.** Purchase, top-up, payout, copy trading, balances and withdrawals need authenticated testing against a disposable database matching Bloom's real schema, followed by a controlled release. The current legacy support hook expects JSON messages in `support_tickets`; Orbitrio's diagram also shows a separate message table. The live export must settle that compatibility question.
3. **External integrations remain unverified:** mail delivery and auth-code flows, live market feeds, Chatway, actual payment settlement, parents proxy content, external app-store/learning/social links, and production storage permissions. The fixtures deliberately prevent external network requests.
4. **Homepage/business content needs owner review.** The embedded `public/landing.html` includes external Bloom-branded app links, financial/regulatory statements and a `/blog` link without a local article route. The admin content editor does not control this static homepage. Existing contact defaults and service-hour claims also need confirmation. This audit does not verify those claims or external affiliations.
5. **Unrouted/conditional components:** referral and provider-selection components are not exposed as working financial/wallet-connect features. Maintenance is conditional on deployment configuration. Legacy admin overview/placeholder components are not active tabs. They are excluded from the routed-page screenshot count.
6. **Audit logs:** the current UI is a browser-local activity list, not an authoritative multi-admin server audit system. A durable server audit trail remains separate work.
7. **Performance/accessibility:** production build still warns about a main chunk larger than 500 kB. Labels and navigation were improved, but this is not a complete screen-reader, contrast, cross-browser or slow-network certification.

## Verification results

- 14 full-page, navigation, empty-account and form/persistence audit tests passed.
- 2 additional trading interaction tests passed at mobile and desktop widths after the trading correction.
- 13 existing browser regression tests passed.
- 7 isolated service/database test files passed.
- TypeScript check, production build and whitespace check passed. The existing bundle-size warning remains.
- The generated production assets contain none of the audit-fixture markers; browser zoom is enabled.
- The 12-migration bundle was regenerated locally; no database was contacted.

## Reproduce

```sh
npm test
npm run lint
npm run build
npm run test:browser
npm run test:pages
npm run db:features
```

Both browser suites use separate Vite caches and result directories. Set `CHROME_PATH` if Chrome is installed elsewhere. `db:features` regenerates the reviewable SQL bundle after the build clears `dist`; it does not contact a database.

## Mobile stability follow-up — 2026-11-05

- Routine investment refreshes no longer insert a banner above the page. Existing data stays in place; actual errors retain their visible message and Retry action.
- Replaced the parallax background, floating particles and large blur layers with a static gradient. Disabled app-level Motion transforms/layout animations and decorative CSS pulses/bounces; loading spinners remain available.
- Removed moving card hover effects and mobile navigation backdrop filters. The app uses a stable viewport minimum height and a single document scrolling surface, with a reserved desktop scrollbar gutter.
- Overlay scroll locks now preserve the page's position and original inline styles. Token-based ownership prevents stale cleanup after navigation from releasing a newer overlay's lock. Menus and dialogs retain their own scrolling.
- Validation: TypeScript and production build passed; 15 audit browser checks passed (refresh/scroll stability, mobile inputs, copy trading and Trade), plus four quick-deposit browser checks. These use Chrome and fixtures, not real accounts. iPhone Safari keyboard animation and third-party chart/chat behavior still require a physical-device check.
