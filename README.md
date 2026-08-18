# Church Digital Tithing Platform

A mobile-first, multi-church SaaS for QR-based one-time and recurring giving. Donors give without installing an app; churches manage funds, campaigns, donors, receipts, recurring plans, and reports from a tenant-scoped dashboard.

The first market is Barbados, with a controlled pilot targeted for mid-September 2026. The product name and branding are provisional.

## Current status

The application foundation can be developed now using seeded data and a mock donation-payment adapter. Live donation checkout is intentionally blocked until the pilot church's Barbados payment provider, API documentation, merchant account, and sandbox credentials are confirmed.

Product and implementation decisions are maintained in:

- [Project brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Open items and blockers](docs/OPEN_ITEMS.md)

## Payment architecture: Option A

There are two separate money flows:

1. **Platform SaaS billing:** A Canadian platform-owned Stripe account charges each church **USD 99 per month**.
2. **Church donations:** Each church uses its own approved local Barbados merchant/payment account. Donations settle directly to that church's bank account.

The platform must never collect, hold, pool, withdraw, or redistribute church donation funds. The Canadian Stripe account must never be used to process donor gifts. Raw card numbers, CVC values, and bank credentials must never reach or be stored by this application.

## Pilot scope

The working pilot assumptions are:

- one church, one local payment provider, and one default currency;
- guest card giving plus church-scoped donor accounts;
- one-time, weekly recurring, and monthly recurring donations when supported by the gateway;
- church-managed funds and campaigns;
- one permanent QR code per church;
- donor, church staff, and platform Super Admin experiences;
- donation receipts, giving history, reports, and CSV export;
- English-only responsive web application;
- manual church onboarding with no free trial.

See `docs/OPEN_ITEMS.md` before treating any working assumption as a production requirement.

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, Storage, and Row Level Security
- Vercel
- Canadian Stripe account for SaaS subscriptions only
- Provider-neutral adapter for church donations
- Resend or SendGrid for transactional email

This repository and its database are independent of PhotoBlocs and Real Estate Signs.

## Local development

### Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project when database/auth work is enabled
- Test credentials only for Stripe and the selected donation/email providers

### Setup

From the repository directory:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The application should remain usable with `DONATION_PROVIDER_DRIVER=mock` until the real Barbados gateway is selected. Leave unavailable integration secrets blank; do not invent or reuse production credentials.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Create and validate a production build |
| `npm run start` | Run the previously built production application |
| `npm run lint` | Run ESLint |

No automated test command has been configured yet. Add one before relying on the pilot for financial workflows.

## Environment configuration

Copy `.env.example` to `.env.local` and populate only the services currently being exercised. Variables prefixed with `NEXT_PUBLIC_` are exposed to browser code; never place a secret in them.

Environment groups are intentionally separated:

- **Supabase:** tenant database, authentication, and storage;
- **Stripe SaaS:** the platform's USD 99 church subscription only;
- **Donation provider:** mock or selected Barbados gateway for church donations only;
- **Email:** one selected transactional-email service;
- **Application security:** server-only encryption and scheduled-job secrets.

Production church merchant credentials must be tenant-scoped and encrypted or connected through provider OAuth. A single pilot merchant ID may be supplied through environment configuration for sandbox development, but this must not become the multi-tenant production credential model.

## Architectural guardrails

- Every tenant-owned record carries `church_id` and is protected by Supabase RLS plus server-side authorization.
- Payment webhooks are the source of truth; browser success redirects are not.
- Webhook handlers verify signatures, deduplicate provider event IDs, and tolerate retries.
- Monetary values use integer minor units and explicit ISO currency codes.
- Historical donations retain their original amount, currency, category, and provider state.
- Prayer requests are isolated from accounting data and excluded from receipts, statements, and financial exports.
- Stable QR resolver URLs protect printed QR codes from future church-slug changes.
- Unsupported gateway capabilities are disabled in the UI rather than simulated.

## Expected high-level structure

```text
src/
  app/          Next.js routes, layouts, and server endpoints
  components/   Shared presentation components
  features/     Giving, church admin, donor portal, and Super Admin modules
  lib/          Auth, Supabase, payments, email, validation, and utilities
  types/        Shared domain and integration types
docs/           Product scope, architecture, and open decisions
```

This is the target organization; the source tree may evolve as modules are implemented.

## Before enabling real payments

Do not enable production donation checkout until all of the following are complete:

- the pilot church and default currency are confirmed;
- the local provider approves the use case and direct church settlement;
- its hosted/tokenized card, recurring-payment, webhook, retry, and reconciliation capabilities are verified;
- sandbox and production merchant accounts are available;
- webhook idempotency and replay tests pass;
- Supabase tenant isolation and authorization tests pass;
- privacy, terms, refund/chargeback, prayer-consent, and Barbados reporting requirements are approved;
- live and sandbox secrets are separated in Vercel and Supabase environments.

## Deployment

Deploy the Next.js application to a dedicated Vercel project and use a dedicated Supabase project. Configure separate Preview and Production variables, register environment-specific webhook endpoints, and verify the wildcard subdomain/DNS plan before issuing production QR codes.

At minimum, run before release:

```powershell
npm run lint
npm run build
```

Never commit `.env.local`, provider credentials, database service-role keys, webhook secrets, or live merchant details.
