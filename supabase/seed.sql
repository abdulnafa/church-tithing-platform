-- DEVELOPMENT-ONLY synthetic data for the Church Digital Tithing Platform.
--
-- This file contains no production credentials, provider secrets, real bank data,
-- real payment data, or real personal information. Every identity uses the
-- reserved example.test domain. Do not run this seed against production.
--
-- The church provisioning trigger owns the default Tithes fund and permanent QR
-- record. Their generated identifiers are intentionally resolved by church_id;
-- this seed never disables or weakens the production integrity triggers.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local timezone = 'UTC';

-- -----------------------------------------------------------------------------
-- Tenants. These fixed UUIDs also make accidental collisions fail validation.
-- -----------------------------------------------------------------------------

insert into public.churches (
  id,
  name,
  legal_name,
  slug,
  status,
  default_currency,
  timezone,
  primary_color,
  secondary_color,
  thank_you_message,
  support_email,
  activated_at,
  created_at,
  updated_at
) values
  (
    '10000000-0000-4000-8000-000000000001',
    'Harbour Grace Church',
    'Harbour Grace Community Church',
    'harbour-grace',
    'active',
    'BBD',
    'America/Barbados',
    '#173F3A',
    '#D9A441',
    'Thank you for giving generously. Your gift helps us serve our church and community.',
    'hello@harbour-grace.example.test',
    '2026-07-18T13:00:00Z',
    '2026-07-18T13:00:00Z',
    '2026-07-18T13:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    'New Hope Fellowship',
    'New Hope Fellowship Development Church',
    'new-hope-development',
    'active',
    'USD',
    'America/Barbados',
    '#274C77',
    '#E7B24A',
    'Thank you for supporting our development church community.',
    'hello@new-hope.example.test',
    '2026-07-21T14:00:00Z',
    '2026-07-21T14:00:00Z',
    '2026-07-21T14:00:00Z'
  )
on conflict do nothing;

-- The trigger above has already created one default Tithes fund and one QR link
-- per church. Additional funds use fixed IDs; the generated defaults are always
-- referenced by their tenant-scoped is_default flag below.
insert into public.funds (
  id,
  church_id,
  name,
  slug,
  description,
  status,
  is_default,
  sort_order,
  created_at,
  updated_at
) values
  (
    '10000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000001',
    'General Offering',
    'general-offering',
    'Support the church''s day-to-day ministry and community work.',
    'active',
    false,
    2,
    '2026-07-18T13:05:00Z',
    '2026-07-18T13:05:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000001',
    'Missions',
    'missions',
    'Help our local and regional mission partners reach more people.',
    'active',
    false,
    3,
    '2026-07-18T13:06:00Z',
    '2026-07-18T13:06:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000001',
    'Building Fund',
    'building-fund',
    'Contribute to improvements to our worship and community spaces.',
    'active',
    false,
    4,
    '2026-07-18T13:07:00Z',
    '2026-07-18T13:07:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000001',
    'Youth Ministry',
    'youth-ministry',
    'Create safe, meaningful programmes for children and young people.',
    'active',
    false,
    5,
    '2026-07-18T13:08:00Z',
    '2026-07-18T13:08:00Z'
  )
on conflict do nothing;

insert into public.campaigns (
  id,
  church_id,
  fund_id,
  name,
  slug,
  description,
  status,
  goal_amount_minor,
  currency,
  starts_at,
  ends_at,
  created_at,
  updated_at
) select
  seeded.id::uuid,
  seeded.church_id::uuid,
  seeded.fund_id::uuid,
  seeded.name,
  seeded.slug,
  seeded.description,
  seeded.status::public.campaign_status,
  seeded.goal_amount_minor::bigint,
  seeded.currency,
  seeded.starts_at::timestamptz,
  seeded.ends_at::timestamptz,
  seeded.created_at::timestamptz,
  seeded.updated_at::timestamptz
from (values
  (
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000103',
    'Community Care Centre',
    'community-care-centre',
    'Help us renovate a welcoming space for community programmes and food support.',
    'active',
    5000000,
    'BBD',
    '2026-06-01T04:00:00Z',
    '2026-12-31T03:59:59Z',
    '2026-06-01T04:00:00Z',
    '2026-06-01T04:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000202',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000104',
    'Back-to-School Drive',
    'back-to-school-drive',
    'Provide school supplies and uniforms to children in our community.',
    'active',
    1200000,
    'BBD',
    '2026-07-05T04:00:00Z',
    '2026-10-01T03:59:59Z',
    '2026-07-05T04:00:00Z',
    '2026-07-05T04:00:00Z'
  )
) as seeded (
  id,
  church_id,
  fund_id,
  name,
  slug,
  description,
  status,
  goal_amount_minor,
  currency,
  starts_at,
  ends_at,
  created_at,
  updated_at
)
where not exists (
  select 1 from public.campaigns existing where existing.id = seeded.id::uuid
)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Synthetic donors. These are database-only donor records, not Auth accounts.
-- -----------------------------------------------------------------------------

insert into public.donors (
  id,
  church_id,
  display_name,
  email,
  phone,
  is_anonymous,
  last_gave_at,
  created_at,
  updated_at
) values
  (
    '10000000-0000-4000-8000-000000000301',
    '10000000-0000-4000-8000-000000000001',
    'Alicia Clarke',
    'alicia.clarke@example.test',
    '+1 246 555 0101',
    false,
    '2026-08-16T13:04:00Z',
    '2026-06-08T15:24:00Z',
    '2026-08-16T13:04:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000302',
    '10000000-0000-4000-8000-000000000001',
    'Daniel Browne',
    'daniel.browne@example.test',
    null,
    false,
    '2026-08-14T21:12:00Z',
    '2026-06-19T21:10:00Z',
    '2026-08-14T21:12:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000303',
    '10000000-0000-4000-8000-000000000001',
    'Naomi King',
    'naomi.king@example.test',
    '+1 246 555 0103',
    false,
    '2026-08-15T19:32:00Z',
    '2026-07-03T12:45:00Z',
    '2026-08-15T19:32:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000304',
    '10000000-0000-4000-8000-000000000001',
    'Marcus Forde',
    'marcus.forde@example.test',
    null,
    false,
    '2026-08-13T16:48:00Z',
    '2026-07-27T14:11:00Z',
    '2026-08-13T16:48:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000305',
    '10000000-0000-4000-8000-000000000001',
    'Janelle Moore',
    'janelle.moore@example.test',
    null,
    false,
    '2026-08-16T12:18:00Z',
    '2026-08-16T12:18:00Z',
    '2026-08-16T12:18:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000306',
    '10000000-0000-4000-8000-000000000001',
    'Samuel Hinds',
    'samuel.hinds@example.test',
    null,
    false,
    '2026-08-11T22:06:00Z',
    '2026-08-11T22:06:00Z',
    '2026-08-11T22:06:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000301',
    '20000000-0000-4000-8000-000000000001',
    'Jordan Test',
    'jordan@new-hope.example.test',
    null,
    false,
    '2026-08-20T15:00:00Z',
    '2026-08-01T15:00:00Z',
    '2026-08-20T15:00:00Z'
  )
on conflict do nothing;

-- Provider references below are deliberately fake, non-secret identifiers.
insert into public.payment_provider_connections (
  id,
  church_id,
  provider,
  external_account_reference,
  status,
  is_primary,
  charges_enabled,
  recurring_enabled,
  payouts_enabled,
  supported_currencies,
  capabilities,
  last_synced_at,
  created_at,
  updated_at
) values
  (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000001',
    'mock-development-gateway',
    'dev-only-harbour-grace-account',
    'active',
    true,
    true,
    true,
    true,
    array['BBD', 'USD'],
    '{"environment":"development","settlement_mode":"direct_to_church"}'::jsonb,
    '2026-08-01T12:00:00Z',
    '2026-08-01T12:00:00Z',
    '2026-08-01T12:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000401',
    '20000000-0000-4000-8000-000000000001',
    'mock-development-gateway',
    'dev-only-new-hope-account',
    'active',
    true,
    true,
    false,
    true,
    array['USD'],
    '{"environment":"development","settlement_mode":"direct_to_church"}'::jsonb,
    '2026-08-01T12:05:00Z',
    '2026-08-01T12:05:00Z',
    '2026-08-01T12:05:00Z'
  )
on conflict do nothing;

insert into public.recurring_gifts (
  id,
  church_id,
  donor_id,
  fund_id,
  payment_connection_id,
  amount_minor,
  currency,
  frequency,
  status,
  provider_subscription_reference,
  provider_payment_method_reference,
  payment_method_brand,
  payment_method_last4,
  started_at,
  next_charge_at,
  created_at,
  updated_at
) values
  (
    '10000000-0000-4000-8000-000000000501',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000301',
    (
      select id from public.funds
      where church_id = '10000000-0000-4000-8000-000000000001'
        and is_default and status = 'active'
    ),
    '10000000-0000-4000-8000-000000000401',
    25000,
    'BBD',
    'weekly',
    'active',
    'dev-mock-subscription-alicia',
    'dev-mock-payment-method-4242',
    'Visa',
    '4242',
    '2026-06-14T13:00:00Z',
    '2026-09-06T13:00:00Z',
    '2026-06-14T13:00:00Z',
    '2026-06-14T13:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000502',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000302',
    (
      select id from public.funds
      where church_id = '10000000-0000-4000-8000-000000000001'
        and is_default and status = 'active'
    ),
    '10000000-0000-4000-8000-000000000401',
    10000,
    'BBD',
    'monthly',
    'active',
    'dev-mock-subscription-daniel',
    'dev-mock-payment-method-4444',
    'Mastercard',
    '4444',
    '2026-06-19T21:12:00Z',
    '2026-09-19T21:12:00Z',
    '2026-06-19T21:12:00Z',
    '2026-06-19T21:12:00Z'
  )
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Donation ledger. Six Harbour Grace rows reproduce the UI's BBD 1,275 total.
-- -----------------------------------------------------------------------------

insert into public.donations (
  id,
  church_id,
  donor_id,
  fund_id,
  campaign_id,
  recurring_gift_id,
  payment_connection_id,
  source,
  status,
  amount_minor,
  currency,
  processing_fee_minor,
  refunded_amount_minor,
  provider_payment_reference,
  provider_charge_reference,
  payment_method_brand,
  payment_method_last4,
  donor_display_name,
  donor_email,
  donor_message,
  external_idempotency_key,
  donated_at,
  settled_at,
  created_at,
  updated_at
) values
  (
    '10000000-0000-4000-8000-000000001006',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000301',
    (select id from public.funds where church_id = '10000000-0000-4000-8000-000000000001' and is_default and status = 'active'),
    null,
    '10000000-0000-4000-8000-000000000501',
    '10000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 25000, 'BBD', 775, 0,
    'dev-mock-payment-1006', 'dev-mock-charge-1006', 'Visa', '4242',
    'Alicia Clarke', 'alicia.clarke@example.test', 'With gratitude.',
    'dev-seed-hgc-donation-1006',
    '2026-08-16T13:04:00Z', '2026-08-17T18:00:00Z',
    '2026-08-16T13:04:00Z', '2026-08-17T18:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000001005',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000305',
    (select id from public.funds where church_id = '10000000-0000-4000-8000-000000000001' and is_default and status = 'active'),
    null, null,
    '10000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 20000, 'BBD', 630, 0,
    'dev-mock-payment-1005', 'dev-mock-charge-1005', null, null,
    'Janelle Moore', 'janelle.moore@example.test', null,
    'dev-seed-hgc-donation-1005',
    '2026-08-16T12:18:00Z', '2026-08-17T18:00:00Z',
    '2026-08-16T12:18:00Z', '2026-08-17T18:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000001004',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000303',
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000201',
    null,
    '10000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 50000, 'BBD', 1525, 0,
    'dev-mock-payment-1004', 'dev-mock-charge-1004', 'Visa', '4242',
    'Naomi King', 'naomi.king@example.test', 'For the new community space.',
    'dev-seed-hgc-donation-1004',
    '2026-08-15T19:32:00Z', '2026-08-17T18:00:00Z',
    '2026-08-15T19:32:00Z', '2026-08-17T18:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000001003',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000302',
    (select id from public.funds where church_id = '10000000-0000-4000-8000-000000000001' and is_default and status = 'active'),
    null,
    '10000000-0000-4000-8000-000000000502',
    '10000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 10000, 'BBD', 340, 0,
    'dev-mock-payment-1003', 'dev-mock-charge-1003', 'Mastercard', '4444',
    'Daniel Browne', 'daniel.browne@example.test', null,
    'dev-seed-hgc-donation-1003',
    '2026-08-14T21:12:00Z', '2026-08-15T18:00:00Z',
    '2026-08-14T21:12:00Z', '2026-08-15T18:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000001002',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000304',
    '10000000-0000-4000-8000-000000000102',
    null, null,
    '10000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 7500, 'BBD', 265, 0,
    'dev-mock-payment-1002', 'dev-mock-charge-1002', null, null,
    'Marcus Forde', 'marcus.forde@example.test', null,
    'dev-seed-hgc-donation-1002',
    '2026-08-13T16:48:00Z', '2026-08-14T18:00:00Z',
    '2026-08-13T16:48:00Z', '2026-08-14T18:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000001001',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000306',
    '10000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000201',
    null,
    '10000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 15000, 'BBD', 485, 0,
    'dev-mock-payment-1001', 'dev-mock-charge-1001', null, null,
    'Samuel Hinds', 'samuel.hinds@example.test', 'God bless this work.',
    'dev-seed-hgc-donation-1001',
    '2026-08-11T22:06:00Z', '2026-08-12T18:00:00Z',
    '2026-08-11T22:06:00Z', '2026-08-12T18:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000001001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000301',
    (select id from public.funds where church_id = '20000000-0000-4000-8000-000000000001' and is_default and status = 'active'),
    null, null,
    '20000000-0000-4000-8000-000000000401',
    'online', 'succeeded', 5000, 'USD', 175, 0,
    'dev-mock-payment-2001', 'dev-mock-charge-2001', 'Visa', '4242',
    'Jordan Test', 'jordan@new-hope.example.test', null,
    'dev-seed-new-hope-donation-2001',
    '2026-08-20T15:00:00Z', '2026-08-21T18:00:00Z',
    '2026-08-20T15:00:00Z', '2026-08-21T18:00:00Z'
  )
on conflict do nothing;

insert into public.receipts (
  id,
  church_id,
  donation_id,
  donor_id,
  receipt_number,
  version,
  status,
  amount_minor,
  currency,
  recipient_email,
  issued_at,
  created_at,
  updated_at
) values
  ('10000000-0000-4000-8000-000000002006', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000001006', '10000000-0000-4000-8000-000000000301', 'DEV-HGC-2026-001006', 1, 'issued', 25000, 'BBD', 'alicia.clarke@example.test', '2026-08-16T13:05:00Z', '2026-08-16T13:05:00Z', '2026-08-16T13:05:00Z'),
  ('10000000-0000-4000-8000-000000002005', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000001005', '10000000-0000-4000-8000-000000000305', 'DEV-HGC-2026-001005', 1, 'issued', 20000, 'BBD', 'janelle.moore@example.test', '2026-08-16T12:19:00Z', '2026-08-16T12:19:00Z', '2026-08-16T12:19:00Z'),
  ('10000000-0000-4000-8000-000000002004', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000001004', '10000000-0000-4000-8000-000000000303', 'DEV-HGC-2026-001004', 1, 'issued', 50000, 'BBD', 'naomi.king@example.test', '2026-08-15T19:33:00Z', '2026-08-15T19:33:00Z', '2026-08-15T19:33:00Z'),
  ('10000000-0000-4000-8000-000000002003', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000001003', '10000000-0000-4000-8000-000000000302', 'DEV-HGC-2026-001003', 1, 'issued', 10000, 'BBD', 'daniel.browne@example.test', '2026-08-14T21:13:00Z', '2026-08-14T21:13:00Z', '2026-08-14T21:13:00Z'),
  ('10000000-0000-4000-8000-000000002002', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000001002', '10000000-0000-4000-8000-000000000304', 'DEV-HGC-2026-001002', 1, 'issued', 7500, 'BBD', 'marcus.forde@example.test', '2026-08-13T16:49:00Z', '2026-08-13T16:49:00Z', '2026-08-13T16:49:00Z'),
  ('10000000-0000-4000-8000-000000002001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000001001', '10000000-0000-4000-8000-000000000306', 'DEV-HGC-2026-001001', 1, 'issued', 15000, 'BBD', 'samuel.hinds@example.test', '2026-08-11T22:07:00Z', '2026-08-11T22:07:00Z', '2026-08-11T22:07:00Z'),
  ('20000000-0000-4000-8000-000000002001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000001001', '20000000-0000-4000-8000-000000000301', 'DEV-NHF-2026-002001', 1, 'issued', 5000, 'USD', 'jordan@new-hope.example.test', '2026-08-20T15:01:00Z', '2026-08-20T15:01:00Z', '2026-08-20T15:01:00Z')
on conflict do nothing;

insert into public.platform_subscriptions (
  id,
  church_id,
  provider,
  status,
  plan_code,
  amount_minor,
  currency,
  created_at,
  updated_at
) values
  ('10000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000001', 'stripe-development', 'incomplete', 'church-essentials-monthly', 9900, 'USD', '2026-07-18T13:10:00Z', '2026-07-18T13:10:00Z'),
  ('20000000-0000-4000-8000-000000000701', '20000000-0000-4000-8000-000000000001', 'stripe-development', 'incomplete', 'church-essentials-monthly', 9900, 'USD', '2026-07-21T14:10:00Z', '2026-07-21T14:10:00Z')
on conflict do nothing;

-- Validate conflicts instead of silently accepting a different immutable ledger
-- row under one of the reserved seed IDs. Operational fields such as status may
-- evolve during development; identity and giving snapshots may not.
do $seed_validation$
declare
  mismatched_donations integer;
  mismatched_seed_records integer;
begin
  if (
    select count(*)
    from public.churches
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )
  ) <> 2 then
    raise exception 'development seed church IDs conflict with existing data';
  end if;

  if exists (
    select 1
    from public.churches
    where (id = '10000000-0000-4000-8000-000000000001' and (slug <> 'harbour-grace' or default_currency <> 'BBD'))
       or (id = '20000000-0000-4000-8000-000000000001' and (slug <> 'new-hope-development' or default_currency <> 'USD'))
  ) then
    raise exception 'development seed church snapshots do not match';
  end if;

  if exists (
    select 1
    from public.churches c
    where c.id in (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )
      and (
        (select count(*) from public.funds f where f.church_id = c.id and f.is_default and f.status = 'active') <> 1
        or (select count(*) from public.qr_links q where q.church_id = c.id) <> 1
      )
  ) then
    raise exception 'development seed requires one default fund and one permanent QR per church';
  end if;

  -- P10 owns fund names, lifecycle, default choice, and ordering. A rerunnable
  -- development seed therefore pins only fixture identity, tenant, and the
  -- immutable internal slug; the invariant above still requires one default.
  with expected (id, church_id, slug) as (
    values
      ('10000000-0000-4000-8000-000000000101'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, 'general-offering'::text),
      ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', 'missions'),
      ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001', 'building-fund'),
      ('10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000001', 'youth-ministry')
  )
  select count(*)
  into mismatched_seed_records
  from expected e
  left join public.funds f on f.id = e.id
  where f.id is null
     or f.church_id is distinct from e.church_id
     or f.slug is distinct from e.slug;

  if mismatched_seed_records <> 0 then
    raise exception 'development seed fund snapshots do not match';
  end if;

  -- P11 owns campaign copy, goal, and lifecycle. A rerunnable development
  -- seed pins only immutable identity and route fields.
  with expected (id, church_id, fund_id, slug, currency) as (
    values
      ('10000000-0000-4000-8000-000000000201'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000103'::uuid, 'community-care-centre'::text, 'BBD'::text),
      ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000104', 'back-to-school-drive', 'BBD')
  )
  select count(*)
  into mismatched_seed_records
  from expected e
  left join public.campaigns c on c.id = e.id
  where c.id is null
     or c.church_id is distinct from e.church_id
     or c.fund_id is distinct from e.fund_id
     or c.slug is distinct from e.slug
     or c.currency is distinct from e.currency;

  if mismatched_seed_records <> 0 then
    raise exception 'development seed campaign snapshots do not match';
  end if;

  with expected (id, church_id, display_name, email) as (
    values
      ('10000000-0000-4000-8000-000000000301'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, 'Alicia Clarke'::text, 'alicia.clarke@example.test'::text),
      ('10000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000001', 'Daniel Browne', 'daniel.browne@example.test'),
      ('10000000-0000-4000-8000-000000000303', '10000000-0000-4000-8000-000000000001', 'Naomi King', 'naomi.king@example.test'),
      ('10000000-0000-4000-8000-000000000304', '10000000-0000-4000-8000-000000000001', 'Marcus Forde', 'marcus.forde@example.test'),
      ('10000000-0000-4000-8000-000000000305', '10000000-0000-4000-8000-000000000001', 'Janelle Moore', 'janelle.moore@example.test'),
      ('10000000-0000-4000-8000-000000000306', '10000000-0000-4000-8000-000000000001', 'Samuel Hinds', 'samuel.hinds@example.test'),
      ('20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000001', 'Jordan Test', 'jordan@new-hope.example.test')
  )
  select count(*)
  into mismatched_seed_records
  from expected e
  left join public.donors d on d.id = e.id
  where d.id is null
     or d.church_id is distinct from e.church_id
     or d.display_name is distinct from e.display_name
     or d.email is distinct from e.email
     or d.auth_user_id is not null;

  if mismatched_seed_records <> 0 then
    raise exception 'development seed donor snapshots do not match';
  end if;

  with expected (id, church_id, external_account_reference, recurring_enabled, currencies) as (
    values
      ('10000000-0000-4000-8000-000000000401'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, 'dev-only-harbour-grace-account'::text, true, array['BBD', 'USD']::text[]),
      ('20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000001', 'dev-only-new-hope-account', false, array['USD']::text[])
  )
  select count(*)
  into mismatched_seed_records
  from expected e
  left join public.payment_provider_connections p on p.id = e.id
  where p.id is null
     or p.church_id is distinct from e.church_id
     or p.provider <> 'mock-development-gateway'
     or p.external_account_reference is distinct from e.external_account_reference
     or p.status <> 'active'
     or not p.is_primary
     or not p.charges_enabled
     or p.recurring_enabled is distinct from e.recurring_enabled
     or not p.payouts_enabled
     or p.supported_currencies is distinct from e.currencies
     or p.capabilities ->> 'environment' <> 'development'
     or p.capabilities ->> 'settlement_mode' <> 'direct_to_church';

  if mismatched_seed_records <> 0 then
    raise exception 'development seed provider snapshots do not match';
  end if;

  with expected (id, church_id, donor_id, amount_minor, frequency, provider_reference) as (
    values
      ('10000000-0000-4000-8000-000000000501'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000301'::uuid, 25000::bigint, 'weekly'::public.recurring_frequency, 'dev-mock-subscription-alicia'::text),
      ('10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000302', 10000, 'monthly', 'dev-mock-subscription-daniel')
  )
  select count(*)
  into mismatched_seed_records
  from expected e
  left join public.recurring_gifts r on r.id = e.id
  where r.id is null
     or r.church_id is distinct from e.church_id
     or r.donor_id is distinct from e.donor_id
     or r.payment_connection_id <> '10000000-0000-4000-8000-000000000401'::uuid
     or r.amount_minor is distinct from e.amount_minor
     or r.currency <> 'BBD'
     or r.frequency is distinct from e.frequency
     or r.status <> 'active'
     or r.provider_subscription_reference is distinct from e.provider_reference;

  if mismatched_seed_records <> 0 then
    raise exception 'development seed recurring-gift snapshots do not match';
  end if;

  if (
    select count(*)
    from public.platform_subscriptions s
    where s.id in (
      '10000000-0000-4000-8000-000000000701',
      '20000000-0000-4000-8000-000000000701'
    )
      and s.provider = 'stripe-development'
      and s.status = 'incomplete'
      and s.plan_code = 'church-essentials-monthly'
      and s.amount_minor = 9900
      and s.currency = 'USD'
  ) <> 2 then
    raise exception 'development seed subscription snapshots do not match';
  end if;

  with expected (
    id,
    church_id,
    donor_id,
    fund_slug,
    campaign_slug,
    recurring_gift_id,
    payment_connection_id,
    amount_minor,
    currency,
    donor_display_name,
    donor_email,
    donor_message,
    external_idempotency_key
  ) as (
    values
      ('10000000-0000-4000-8000-000000001006'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000301'::uuid, 'tithes'::text, null::text, '10000000-0000-4000-8000-000000000501'::uuid, '10000000-0000-4000-8000-000000000401'::uuid, 25000::bigint, 'BBD'::text, 'Alicia Clarke'::text, 'alicia.clarke@example.test'::text, 'With gratitude.'::text, 'dev-seed-hgc-donation-1006'::text),
      ('10000000-0000-4000-8000-000000001005', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000305', 'tithes', null, null, '10000000-0000-4000-8000-000000000401', 20000, 'BBD', 'Janelle Moore', 'janelle.moore@example.test', null, 'dev-seed-hgc-donation-1005'),
      ('10000000-0000-4000-8000-000000001004', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000303', 'building-fund', 'community-care-centre', null, '10000000-0000-4000-8000-000000000401', 50000, 'BBD', 'Naomi King', 'naomi.king@example.test', 'For the new community space.', 'dev-seed-hgc-donation-1004'),
      ('10000000-0000-4000-8000-000000001003', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000302', 'tithes', null, '10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000401', 10000, 'BBD', 'Daniel Browne', 'daniel.browne@example.test', null, 'dev-seed-hgc-donation-1003'),
      ('10000000-0000-4000-8000-000000001002', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000304', 'missions', null, null, '10000000-0000-4000-8000-000000000401', 7500, 'BBD', 'Marcus Forde', 'marcus.forde@example.test', null, 'dev-seed-hgc-donation-1002'),
      ('10000000-0000-4000-8000-000000001001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000306', 'building-fund', 'community-care-centre', null, '10000000-0000-4000-8000-000000000401', 15000, 'BBD', 'Samuel Hinds', 'samuel.hinds@example.test', 'God bless this work.', 'dev-seed-hgc-donation-1001'),
      ('20000000-0000-4000-8000-000000001001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000301', 'tithes', null, null, '20000000-0000-4000-8000-000000000401', 5000, 'USD', 'Jordan Test', 'jordan@new-hope.example.test', null, 'dev-seed-new-hope-donation-2001')
  )
  select count(*)
  into mismatched_donations
  from expected e
  left join public.donations d on d.id = e.id
  left join public.funds f on f.id = d.fund_id and f.church_id = d.church_id
  left join public.campaigns c on c.id = d.campaign_id and c.church_id = d.church_id
  where d.id is null
     or d.church_id is distinct from e.church_id
     or d.donor_id is distinct from e.donor_id
     or f.slug is distinct from e.fund_slug
     or c.slug is distinct from e.campaign_slug
     or d.recurring_gift_id is distinct from e.recurring_gift_id
     or d.payment_connection_id is distinct from e.payment_connection_id
     or d.source <> 'online'
     or d.amount_minor is distinct from e.amount_minor
     or d.currency is distinct from e.currency
     or d.donor_display_name is distinct from e.donor_display_name
     or d.donor_email is distinct from e.donor_email
     or d.donor_message is distinct from e.donor_message
     or d.external_idempotency_key is distinct from e.external_idempotency_key;

  if mismatched_donations <> 0 then
    raise exception 'development seed donation snapshots do not match';
  end if;

  if (
    select count(*)
    from public.receipts r
    join public.donations d
      on d.id = r.donation_id and d.church_id = r.church_id
    where r.id in (
      '10000000-0000-4000-8000-000000002001',
      '10000000-0000-4000-8000-000000002002',
      '10000000-0000-4000-8000-000000002003',
      '10000000-0000-4000-8000-000000002004',
      '10000000-0000-4000-8000-000000002005',
      '10000000-0000-4000-8000-000000002006',
      '20000000-0000-4000-8000-000000002001'
    )
      and r.amount_minor = d.amount_minor
      and r.currency = d.currency
      and r.donor_id = d.donor_id
  ) <> 7 then
    raise exception 'development seed receipt snapshots do not match';
  end if;
end;
$seed_validation$;

commit;
