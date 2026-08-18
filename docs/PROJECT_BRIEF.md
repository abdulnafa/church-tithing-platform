# Church Digital Tithing Platform — Project Brief

**Status:** In development / coming soon  
**Target:** Controlled pilot by mid-September 2026  
**First market:** Barbados  
**Product type:** Multi-church SaaS  
**Working tagline:** Scan. Give. Track. All in 10 seconds.  
**Document status:** Baseline scope; unresolved decisions are tracked in `OPEN_ITEMS.md`.

## 1. Product goal

Build a mobile-first web platform that lets a donor scan a church QR code, select a fund or campaign, and give by card without downloading an app. Churches receive their donations through their own approved local merchant/payment accounts and use a secure dashboard to manage giving activity, donors, funds, campaigns, reports, branding, and staff.

The product is a multi-tenant SaaS. The platform charges each church **USD 99 per month** for access. It does **not** receive, hold, pool, withdraw, or manually distribute donation funds.

## 2. Users

- **Guest donor:** Gives without creating an account and receives a receipt by email.
- **Registered donor/member:** Views giving history, receipts, annual statements, saved payment methods, and recurring gifts for one church.
- **Church staff:** Manages the church profile, funds, campaigns, donations, members, reports, QR code, and permitted settings.
- **Church owner/admin:** Manages staff access, church billing, and payment-provider onboarding in addition to church operations.
- **Platform Super Admin:** Manually provisions churches and manages church access, SaaS subscriptions, billing state, and platform settings.

## 3. Confirmed donor journey

1. The donor scans the church's single permanent QR code.
2. The donor lands on that church's mobile giving home page; no app is required.
3. The donor selects a church-managed fund or active campaign. `Tithes` is the default fund.
4. The donor enters any amount and may add a message and prayer request.
5. The donor chooses either:
   - one-time giving;
   - weekly recurring giving; or
   - monthly recurring giving.
6. A recurring gift starts with the first payment on the day it is created.
7. The donor pays by credit/debit card through the church's local payment provider.
8. The donor receives a basic branded donation receipt by email and sees a confirmation in the web experience.

Guest checkout is allowed. Split donations and “in memory of / in honor of” giving are not included in v1.

## 4. Donor portal

Authentication is by email and password. A member identity is scoped to one church; there is no shared cross-church donor account in v1.

Members can:

- view their giving history;
- download individual receipts;
- access an annual giving statement after church review/publication;
- save and manage tokenized payment methods when supported by the selected gateway;
- pause, resume, change the amount, change the category, change the payment method, or cancel recurring giving;
- update personal details.

The confirmed minimum donor emails are donation receipts, recurring-gift creation/join confirmation, recurring cancellation confirmation, and failed-payment alerts. Automatic retry behavior depends on the selected local gateway.

## 5. Church dashboard

Churches are onboarded manually after a demo; there is no public self-service church signup or free trial in v1.

The dashboard includes:

- basic church information, logo, colors, and thank-you message;
- a church subdomain and public giving home page;
- creation, editing, archiving, and reporting of giving funds/categories;
- `Tithes` as the initial default category;
- campaigns with a target and progress bar, with archive support;
- one permanent, downloadable QR code per church;
- staff invitations, removal, roles, and permissions;
- transactions with filters such as date, donor, amount, category, recurrence, card last four digits when supplied by the gateway, and payment status;
- weekly, monthly, and yearly giving reports;
- full giving history and CSV export;
- visibility into recurring donors and recurring-plan status;
- review and publication of annual giving statements.

There is no in-platform refund action in v1. Refunds, disputes, and chargebacks still require an external operational process through the connected payment provider.

## 6. Super Admin dashboard

The platform-owner dashboard includes the minimum controls needed to:

- create and manage church tenants;
- activate, suspend, or restore church access;
- manage the USD 99 monthly SaaS subscription and billing state;
- see onboarding status;
- manage platform-wide settings.

Expanded platform-wide financial reports, support impersonation, email-template management, dispute visibility, and other support operations remain subject to final confirmation.

## 7. Payment and money-flow decision — Option A

Two legally and operationally separate payment flows must be maintained:

### Platform subscription

- A Canadian platform-owned Stripe account charges each church **USD 99 monthly** for use of the software.
- This Stripe account is for SaaS subscription revenue only.

### Church donations

- Each church owns or connects its own account with an approved local Barbados payment provider.
- Card donations are processed for that church and settle directly to that church's bank account.
- The platform provides the giving UI, provider integration, donor portal, receipts, records, reports, and recurring-gift controls.
- The platform never takes custody of church donations and never exposes a church withdrawal/payout feature.
- No full card number, CVC, bank credentials, or raw card data is stored by the platform.

The Barbados gateway has not yet been selected. Real checkout and recurring-payment completion are blocked until its API documentation and sandbox access are available. The rest of the platform can be built against a provider-neutral test adapter in the meantime.

## 8. Branding, URLs, and QR behavior

- Each church has its own logo, colors, and thank-you message.
- Each church uses a platform subdomain; custom domains are not in v1.
- Each church has one permanent downloadable QR code.
- The QR resolves to that church's giving home page, where donors choose a fund or campaign.
- The QR is not custom-designed in v1.
- Final platform name, logo, colors, primary domain, and reference screenshots are pending. Placeholder branding is permitted during development.

## 9. Technology decisions

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth, and Storage
- Vercel hosting
- Provider-neutral donation-payment adapter
- Stripe for the platform's USD 99 SaaS subscriptions only
- Resend or SendGrid for transactional email; final provider is pending
- Separate application, database, and tenant data from PhotoBlocs and the paused Real Estate Signs project

## 10. Pilot assumptions

To keep the first release simple and achievable, work proceeds with these assumptions until the client changes them:

- one selected pilot church;
- one local Barbados payment provider;
- one default donation currency for the pilot church;
- card payments only;
- one permanent QR code;
- manually provisioned church account;
- English only;
- responsive web only, with no native mobile app;
- placeholder platform branding until final assets arrive;
- payment screens use a mock/test adapter until the real provider is approved and accessible.

These are implementation assumptions, not permission to launch real payments without provider validation.

## 11. Deferred / out of scope for v1

- free trials;
- ACH, bank-transfer giving, and text-to-give;
- platform custody of donations or church withdrawal requests;
- multiple gateways per church;
- split donations;
- memorial or honorary giving;
- custom-designed or service/event-specific QR codes;
- custom church domains;
- multilingual support;
- native mobile applications;
- automatic sending of annual statements;
- two-factor authentication;
- platform support chat/ticketing;
- in-platform refund processing;
- advanced accounting integrations such as QuickBooks or Xero unless separately approved.

## 12. MVP completion criteria

The pilot is ready only when:

- church data is isolated and authorization tests pass;
- a church can be provisioned, branded, billed, and activated;
- its stable QR opens the correct mobile giving page;
- one-time and supported recurring card donations succeed through an approved provider sandbox and production account;
- signed webhooks update donation state exactly once;
- receipts and failure alerts are delivered;
- donors can view history and manage supported recurring gifts;
- church staff can manage funds/campaigns and export accurate reports;
- Super Admin can manage tenant access and SaaS billing state;
- privacy, terms, refund/chargeback operations, and Barbados reporting requirements are approved before public launch.

