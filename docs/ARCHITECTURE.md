# Architecture

## 1. Architectural goals

- Keep the first pilot small without creating a single-church dead end.
- Enforce strict church-level data isolation.
- Keep platform subscription billing separate from church donations.
- Never store raw card data or custody donation funds.
- Isolate payment-provider specifics behind an adapter so development can continue before the Barbados gateway is selected.
- Treat provider webhooks—not browser redirects—as the source of truth for payment status.

## 2. System context

```text
Donor / Member            Church Staff             Platform Admin
       \                       |                         /
        +---------------- Next.js web application -----+
                              |
                 Supabase Auth / Postgres / Storage
                      |                    |
             Transactional email     Audit/report jobs
                      |
      +---------------+-------------------------------+
      |                                               |
Local Barbados gateway                         Canadian Stripe
(donations for a church)                   (USD 99 SaaS billing)
      |                                               |
Church merchant account                         Platform account
      |
Church bank settlement
```

Donation funds never enter the platform Stripe account, application bank account, or an internal withdrawable balance.

## 3. Runtime and deployment

- **Application:** Next.js App Router with TypeScript and Tailwind CSS.
- **Hosting:** Vercel, with separate preview and production environments.
- **Database/Auth/Storage:** A dedicated Supabase project using PostgreSQL, Supabase Auth, and private Storage buckets.
- **Server-side work:** Next.js route handlers/server actions for trusted mutations, checkout orchestration, webhooks, exports, and statement generation.
- **Email:** A small provider interface implemented by Resend or SendGrid after selection.
- **Observability:** Structured server logs with request/event IDs; production errors must not contain secrets, prayer text, or payment data.
- **Repository isolation:** This application and its data remain separate from PhotoBlocs and Real Estate Signs.

Each environment must use different Supabase, payment-provider, Stripe, email, and webhook credentials. Secrets are server-only and never committed.

## 4. Tenancy and routing

Every tenant-owned row carries a non-null `church_id`. Access is enforced in both application authorization and Supabase Row Level Security (RLS).

Target public routes after the final domain and wildcard DNS are approved:

- `https://{church-slug}.{platform-domain}/` — church giving home
- `https://{church-slug}.{platform-domain}/give/{fund-or-campaign-slug}` — selected giving destination
- `https://{platform-domain}/q/{public-qr-id}` — stable QR resolver that redirects to the current church subdomain

The QR should encode the stable resolver URL, not a mutable subdomain. This preserves already printed QR codes if a church slug or platform domain mapping changes.

P17 uses a conservative pre-domain routing boundary:

- `/q/{public-qr-id}` resolves the active QR and active church at request time and issues a temporary same-origin redirect to `/give/{current-church-slug}`;
- `/give/{church-slug}` remains the supported public giving route on local, preview, and production hosts;
- request `Host` and `X-Forwarded-Host` values are not used as tenant identity, and `PLATFORM_ROOT_DOMAIN` does not enable a wildcard rewrite;
- missing, malformed, inactive, suspended, and otherwise unavailable QR targets share a neutral not-found result, while infrastructure failures use a separate generic retry surface;
- the infrastructure retry surface is an intentionally rendered App Router page and is not represented as an HTTP 503 contract; and
- subdomain activation remains blocked until the client supplies the final platform domain and its exact root/wildcard DNS configuration is allow-listed and verified. The path route must remain available as a safe fallback when that later mapping is introduced.

Suggested authenticated route groups:

- member portal scoped to the current church;
- church dashboard scoped to staff membership and role;
- platform Super Admin dashboard isolated from church routes.

## 5. Core domain model

The initial schema should separate business concepts rather than duplicating gateway objects.

| Entity | Purpose |
|---|---|
| `churches` | Tenant profile, status, default currency, branding, slug, timezone |
| `church_staff_memberships` | User-to-church role and membership status |
| `donor_profiles` | Church-scoped donor identity and preferences |
| `funds` | Permanent giving categories; includes default `Tithes` |
| `campaigns` | Time/goal-oriented giving destinations with progress settings |
| `donations` | Canonical one-time or recurring charge record and monetary snapshot |
| `recurring_plans` | Local representation of a provider-managed recurring mandate/plan |
| `payment_customers` | Provider customer identifiers; never card details |
| `payment_methods` | Safe display metadata/token reference supplied by provider, if supported |
| `payment_events` | Verified, deduplicated provider webhook/event journal |
| `receipts` | Immutable receipt number and rendered receipt metadata |
| `annual_statements` | Church-reviewed annual statement versions and publication state |
| `prayer_requests` | Sensitive donor text with restricted access and explicit lifecycle |
| `qr_codes` | One stable public QR identifier per church |
| `saas_subscriptions` | Church's USD 99 Stripe subscription and billing state |
| `email_deliveries` | Transactional email type, recipient, status, and provider ID |
| `audit_events` | Append-only record of sensitive administrative actions |

Money is stored as integer minor units plus an ISO currency code. Donation rows preserve the original amount, currency, fund/campaign attribution, provider identifiers, and provider status; historical records are not recalculated when settings change.

## 6. Authentication and authorization

- Donor/member login: email and password, scoped to a church.
- Church staff: authenticated users with a membership and explicit role for the tenant.
- Platform admins: separate elevated role; platform-admin checks never rely on client-provided claims alone.
- Email verification and secure password reset should be baseline controls even though 2FA is deferred.
- RLS denies cross-tenant access by default.
- Server-side service credentials are used only in trusted code paths and never exposed to the browser.
- Rate limiting applies to login, password reset, guest checkout creation, QR resolution abuse, and webhook endpoints as appropriate.

Exact church staff permissions are an open product decision. Until confirmed, implementation should use named permissions rather than hard-coding broad “admin/staff” checks.

## 7. Donation payment architecture

### Provider boundary

All donation operations go through a `DonationPaymentProvider` boundary. Its conceptual capabilities are:

- create a provider customer, if required;
- create a one-time checkout/payment;
- create a weekly or monthly recurring plan;
- list safe payment-method display metadata;
- update recurring amount/category metadata when the provider permits it;
- replace a recurring payment method;
- pause, resume, and cancel recurrence when supported;
- retrieve a payment/plan status for reconciliation;
- verify and normalize signed webhook events.

The adapter must expose capability flags. Unsupported operations must be disabled clearly in the UI rather than simulated.

### One-time donation sequence

1. Validate the active church, fund/campaign, amount, currency, and donor input.
2. Create a local pending donation with an idempotency key.
3. Ask the local provider adapter to create a hosted or tokenized card payment for that church's merchant account.
4. Complete card entry in provider-controlled UI; raw card data never touches the application server.
5. Receive and verify the provider webhook.
6. Deduplicate the event, transition the donation state, and record safe provider metadata.
7. Generate the receipt and send email only after confirmed success.

### Recurring donation sequence

1. Perform the first charge and create the provider-managed weekly or monthly recurring plan.
2. Store only provider customer, payment-method token/reference, and recurring-plan identifiers.
3. Process renewals through signed webhooks.
4. Synchronize pause, resume, edit, and cancellation commands with the provider, then update local state from the provider response/webhook.
5. Use provider-supported retry rules; record each attempt and notify according to the approved email matrix.

The selected gateway must support these flows or the affected features must be reduced before integration.

### Donation status model

Use normalized states such as `pending`, `processing`, `succeeded`, `failed`, `refunded`, `partially_refunded`, and `disputed`, while preserving the raw provider status separately. A canceled recurring plan is not a canceled historical donation.

## 8. Platform SaaS subscription architecture

The Canadian Stripe integration is completely separate from the donation provider:

1. Super Admin provisions a church.
2. A Stripe Customer and USD 99 monthly Subscription are created for that church.
3. Stripe-hosted payment collection is preferred to minimize PCI scope.
4. Signed Stripe webhooks update `saas_subscriptions` and church access/billing state.
5. Subscription invoices and receipts come from Stripe or the platform email layer.

No donation object, donor payment method, church donation balance, or donation payout is created in the platform Stripe account.

The grace-period and suspension behavior for failed church subscriptions remains open. It must be implemented as policy, not inferred from Stripe status alone.

## 9. Webhooks and data integrity

- Preserve the raw event ID, provider, event type, tenant resolution data, received time, processing status, and safe payload hash.
- Verify signatures before any mutation.
- Use a unique constraint on provider plus event ID for idempotency.
- Make handlers retry-safe and process state transitions transactionally.
- Resolve the church from trusted merchant/account mapping, never solely from untrusted request metadata.
- Queue or retry receipt/report side effects separately from the financial state transition.
- Provide reconciliation tooling for events that fail processing.

## 10. QR, funds, and campaigns

- Create exactly one stable QR identity for each church in v1.
- The QR opens the church home page; the donor then selects an active fund or campaign.
- A fund may be archived but must remain referenced by historical donations.
- Campaign progress is calculated only from successful eligible donations, in the campaign's configured currency.
- Archived/closed campaigns remain available in historical reporting but are not selectable for new gifts.

Final rules for campaign dates, target completion, and amount/percentage visibility remain open.

## 11. Receipts, statements, email, and reports

- Generate a receipt from the immutable succeeded-donation snapshot, not live church/fund settings.
- Render annual statements as draft versions; publication to member portals is a separate church action.
- Never include prayer-request text in receipts, statements, or financial CSV exports.
- Reports use successful transaction facts, separate gross/fee/net values when supplied by the gateway, and retain original currency.
- CSV generation is server-side and permission checked.
- Transactional email is tenant branded but sent through an approved platform sending domain unless a later requirement changes it.

Barbados receipt/statement/TAMIS fields and manual cash/cheque inclusion must be confirmed before the statement module is considered complete.

## 12. Security and privacy baseline

- HTTPS everywhere and encryption at rest through managed services.
- Strict RLS plus server-side authorization for every sensitive mutation/export.
- No raw card data, CVC, online-banking credentials, or provider secrets in the database or logs.
- Prayer requests are stored separately from financial data and are accessible only to approved roles.
- Audit staff invitations, role changes, manual donation changes if enabled, statement publication, tenant suspension, and support access.
- Validate uploads by type and size; store private assets behind signed access.
- Backups and a tested recovery procedure are required before production.
- Privacy Policy, Terms of Service, operational refund/dispute policy, consent text, and retention rules are release gates.

## 13. Delivery sequence

1. **Foundation:** application shell, tenant model, authentication, RLS, roles/permissions foundation, audit events.
2. **Giving content:** church setup, funds, campaigns, mobile giving page, stable QR resolver.
3. **Portal and dashboards:** donor, church, and Super Admin experiences using seeded/mock data.
4. **Provider-neutral payments:** adapter contract, mock checkout, canonical states, webhook journal, receipt pipeline.
5. **Real integrations:** selected Barbados gateway, Canadian Stripe subscription, transactional email.
6. **Reporting:** filters, CSV, receipt downloads, draft/reviewed annual statements.
7. **Hardening and pilot:** authorization tests, webhook replay tests, reconciliation, accessibility, performance, policies, sandbox and live smoke tests.

The selected local gateway is on the critical path for steps 5–7, but it does not block foundation and product UI work.
