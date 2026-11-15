# Bloom

React/TypeScript investment platform with portfolio trading, investment plans and maturity payouts, copy trading, crypto and gift-card deposits, withdrawals, private KYC review, account suspension, airdrops, referrals, support, notifications and an admin console.

Bloom uses **Supabase Auth**, Supabase Postgres/Storage, React Router, Vite/Tailwind, and Resend. It serves API routes through Express locally or Vercel serverless handlers. `MIGRATION_NOTES.md` contains historical context, including the earlier Clerk migration; it does not describe the current authentication provider.

## Setup

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env
npm run dev
```

Fill in the Supabase URL/public anon key and server-side email configuration in `.env` before running. Keep service-role and Resend keys server-side; never prefix them with `VITE_`. Configure the Supabase project and SQL schema separately. The application normally runs at `http://localhost:5173`.

See [the feature and database upgrade guide](docs/feature-parity.md) for the Orbitrio feature transfer, required migration order and verification limits. **Apply the feature database upgrade before deploying this frontend.**

## Checks and build

```sh
npm test
npm run lint
npm run build
npm run test:browser
npm run test:pages
npm run db:features
```

`db:features` writes an ordered, atomic SQL upgrade to `dist/bloom-feature-upgrade.sql` for review. It does not connect to a database. Browser tests use isolated local fixtures and an installed Chrome/Chromium browser (`CHROME_PATH` can override the default).

## Source layout

- `src/context/OrbitContext.tsx`: application data/actions, backed by `src/hooks/data/`.
- `src/lib/supabase.ts`: Supabase Auth client and profile helpers.
- `src/services/`: validation, uploads, private-image links, calculations and account controls.
- `src/pages/`, `src/components/admin/`: user and administrative screens.
- `api/`, `server.ts`: email, auth-code and market endpoints.
- `tests/`: service, database and browser regression checks.
- Root SQL files: historical schema and incremental feature migrations.

For the investment/admin reliability audit and preserving existing users during rollout, see [the release guide](docs/investment-reliability.md). The read-only [schema export](scripts/export-schema.sql) collects the definitions needed for live compatibility review.

For the page-by-page UI and functionality review, see [the UI audit](docs/ui-ux-audit.md).

Bloom’s supplied SQL export has been tested locally: see [the export review](docs/bloom-export-review.md) and the [read-only production preflight](scripts/preflight-bloom-upgrade.sql).
