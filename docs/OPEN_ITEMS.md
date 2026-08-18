# Open Items, Assumptions, and Release Blockers

This file distinguishes facts still needed from temporary pilot assumptions. An assumption allows development to proceed; it does not authorize a production launch.

## P0 — Blocks real payment integration or public launch

### 1. Select the Barbados donation provider

**Owner:** Client  
**Needed:** Provider/bank name, technical contact, public API documentation, sandbox account, and merchant-account status for the pilot church.

Obtain written confirmation that the provider supports:

- Barbados churches as merchants;
- direct settlement into each church's own Barbados bank account;
- credit/debit card payments through hosted fields or another tokenized flow;
- safe saved-payment methods;
- weekly and monthly recurring payments beginning with the first charge;
- donor-initiated pause, resume, amount change, payment-method change, and cancellation, or a documented alternative;
- signed webhooks for success, failure, recurrence, cancellation, refund, and dispute events;
- automatic retries or sufficient APIs to implement an approved retry policy;
- the pilot currency and later required currencies;
- test/sandbox credentials and a production approval process;
- safe display of card brand and last four digits;
- transaction fee and net-settlement data for reporting.

If the provider cannot support a required feature, reduce the pilot scope before building provider-specific work. Do not route donations through the platform's Canadian Stripe account as a workaround.

### 2. Confirm the pilot church

Provide:

- legal and display name;
- primary contact name and email;
- active local merchant account status;
- default donation currency;
- timezone;
- initial funds/categories;
- initial campaign, if campaigns are in the pilot;
- logo, colors, and thank-you message when available.

**Working assumption:** one pilot church, one gateway, and one currency.

### 3. Confirm the Canadian platform Stripe setup

Provide/confirm:

- Canadian legal business name and ownership of the Stripe account;
- account readiness and production verification;
- billing contact and bank account for platform subscription revenue;
- statement descriptor and invoice branding;
- confirmation that the church SaaS price is exactly **USD 99 per month**.

The Canadian Stripe account must be used only for platform subscription billing, not donations.

### 4. Approve legal and financial operations

Before public launch, provide or approve:

- Privacy Policy;
- Terms of Service;
- refund/cancellation and chargeback process, even though refunds are not initiated inside v1;
- prayer-request consent and access wording;
- Barbados accountant/legal confirmation of required receipt, annual-statement, retention, and TAMIS/reporting fields;
- confirmation that the selected provider approves the church-donation use case.

## P1 — Needed to finish the pilot behavior

### 5. Church subscription failure policy

Decide:

- billing start date;
- invoice/receipt delivery;
- retry schedule and grace period;
- when a church becomes suspended;
- what a donor sees on a suspended church's public page;
- whether existing donor recurring plans continue when a church subscription is unpaid, suspended, or canceled;
- church data export and offboarding period.

### 6. Donation currency policy

The original brief listed USD, CAD, BBD, and XCD with a church-level toggle. For the simple pilot, confirm:

- the pilot's one default currency;
- whether donors can ever choose a different currency;
- payout/settlement currency;
- whether church currency can change after donations exist;
- how existing recurring plans behave after a currency change;
- whether multi-currency support moves out of the pilot.

**Recommended pilot rule:** one immutable default currency per church after the first live donation.

### 7. Donor identity and guest-linking rules

Confirm:

- required guest fields (at minimum name and email, if that is the intended policy);
- whether anonymous giving is allowed and what “anonymous” means to staff;
- whether a later account with the same verified email claims prior guest donations;
- email verification requirements;
- donor address, phone, and Barbados TIN requirements;
- account deletion and financial-record retention behavior.

### 8. Recurring-gift rules

Confirm:

- whether edits apply immediately or next cycle;
- pause duration and optional resume date;
- retry count/timing after failure;
- terminal state after retries are exhausted;
- whether both donor and church are notified of failure;
- whether church staff may cancel a donor's recurring plan;
- which operations are omitted if the chosen gateway lacks support.

### 9. Church staff roles and permissions

Approve an explicit permission matrix. Suggested starting roles are:

- Church Owner;
- Finance Admin;
- Staff;
- Read-only/Accountant.

Decide who can manage billing, Stripe/provider setup, staff, branding, funds, campaigns, donor details, prayer requests, reports, statement publication, and any manual donations. Confirm which actions require an audit event.

### 10. Manual cash/cheque donations

Decide whether staff can record offline gifts. Including them makes annual statements and total giving reports complete but requires:

- authorized roles;
- add/edit/void rules;
- optional second-person approval;
- reference/check numbers;
- immutable audit history;
- clear separation from gateway-settled donations.

**Recommendation:** Include a controlled, audited manual-entry flow either in the pilot or immediately after it.

### 11. Campaign behavior

Confirm:

- target amount, image, description, start date, and closing date fields;
- whether giving continues after reaching the target;
- automatic close behavior;
- exact amount versus percentage display;
- restore behavior after archive;
- whether campaign progress includes offline donations if manual entry is enabled.

### 12. Annual statement workflow

“Download after review, no automatic send” is confirmed at a high level. Still decide:

- calendar year versus church fiscal year;
- draft generation trigger;
- reviewing/publishing role;
- correction and reissue/versioning;
- inclusion of digital, cash, and cheque gifts;
- required church/donor/TIN fields;
- portal notification when published;
- TAMIS-compatible export requirements.

### 13. Email details

Select Resend or SendGrid based on verified cost and required deliverability. Provide:

- platform sending domain;
- reply-to address;
- sender/from-name policy;
- final list of donor and church notifications;
- whether churches receive every-donation alerts or summaries;
- retry/failure alert recipients.

**Working minimum:** donation receipt, recurring created, recurring canceled, payment failed, staff invitation, church subscription failure, and statement-available notification.

### 14. Prayer-request privacy

Confirm:

- explicit donor consent;
- staff roles allowed to view requests;
- whether request text is excluded from email and visible only in the dashboard;
- retention and deletion rules;
- handling of requests submitted by guests.

Prayer text must remain separate from receipts, annual statements, and accounting exports.

### 15. Super Admin authority

Confirm whether Super Admin can:

- view donor identities or donation details across churches;
- view provider onboarding, refund, and dispute state;
- export platform-wide data;
- edit platform email templates;
- enter a church dashboard for support;
- perform support access only when an audit event is recorded.

Default to least privilege until approved.

## P2 — Branding and launch coordination

### 16. Final identity and URLs

Pending:

- final platform name and tagline;
- logo and brand palette;
- primary domain;
- church subdomain format and slug ownership;
- desired behavior when a slug changes;
- reference screenshots/designs.

Placeholder branding may be used during development. The QR architecture will use a stable resolver so a slug change does not invalidate printed QR codes.

### 17. Launch definition and acceptance

Confirm:

- whether mid-September 2026 means internal prototype, selected-church pilot, or public launch;
- must-have features for that date;
- client tester/approver for donor, staff, subscription, and reporting flows;
- production support owner during the pilot;
- go/no-go checklist and rollback expectations.

**Working assumption:** mid-September is a selected one-church pilot, not an unrestricted public rollout.

## Confirmed deferrals

No further decision is required for v1 unless scope changes:

- no free trial;
- no ACH/bank transfer;
- no text-to-give;
- no split donations;
- no memorial/honor giving;
- no custom-designed or service-specific QR codes;
- no custom church domains;
- no multilingual interface;
- no automatic annual-statement sending;
- no 2FA in v1;
- no platform support chat/ticket system;
- no in-platform refund button;
- no platform-held donation balances or church withdrawal requests.

## Work that can proceed now

The following work does not depend on the provider selection:

- Next.js application foundation and design tokens;
- Supabase tenant schema, RLS, authentication, roles foundation, and audit log;
- church setup, funds, campaigns, and QR resolver;
- public giving-page UI with mock checkout;
- donor, church, and Super Admin portal shells;
- canonical donation/recurring data models;
- payment adapter contract and webhook event journal;
- reports/CSV foundation and placeholder emails.

Provider-specific checkout, real saved cards, recurring execution, retry behavior, reconciliation, fees/net reporting, and production receipts remain blocked until the selected gateway is validated.

