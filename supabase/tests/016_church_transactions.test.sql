begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(47);

-- Schema, deterministic keyset, and least-privilege boundary (1-12).
select extensions.has_type(
  'public', 'church_transaction_record',
  'minimum transaction record type exists'
);
select extensions.has_type(
  'public', 'church_transaction_fund_option',
  'minimum fund-option type exists'
);
select extensions.has_type(
  'public', 'church_transaction_page',
  'transaction page type exists'
);
select extensions.has_index(
  'public', 'donations', 'donations_church_created_cursor_idx',
  'immutable created-at and UUID keyset is indexed'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)',
    'EXECUTE'
  ),
  true,
  'authenticated callers may execute the guarded page boundary'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot execute the page boundary'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)',
    'EXECUTE'
  ),
  false,
  'service role cannot bypass the authenticated finance boundary'
);
select extensions.is(
  (select prosecdef from pg_catalog.pg_proc
   where oid = 'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)'::regprocedure),
  true,
  'transaction page is security definer'
);
select extensions.is(
  (select provolatile::text from pg_catalog.pg_proc
   where oid = 'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)'::regprocedure),
  's',
  'transaction page is stable'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_transaction_record'::regclass
     and attribute.attnum > 0 and not attribute.attisdropped),
  '{transaction_id,church_id,donor_name,fund_id,fund_name,campaign_id,campaign_name,recorded_at,frequency,recurring_status,amount_minor,currency,processing_fee_minor,refunded_amount_minor,net_amount_minor,payment_method_brand,payment_method_last4,payment_status,cancellation_state}',
  'transaction record contains only approved fields in order'
);
select extensions.is(
  (select count(*)
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_transaction_record'::regclass
     and attribute.attname in (
       'donor_id', 'donor_email', 'donor_message', 'provider_payment_reference',
       'provider_charge_reference', 'failure_message', 'prayer_request_id'
     )),
  0::bigint,
  'transaction record excludes identity, messages, provider IDs, and prayer linkage'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_transaction_page'::regclass
     and attribute.attnum > 0 and not attribute.attisdropped),
  '{church_id,church_timezone,transactions,fund_options,next_cursor_created_at,next_cursor_transaction_id,has_more}',
  'page contains only tenant context, rows, options, and keyset state'
);

-- Rollback-only two-tenant fixture.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('f2010000-0000-4000-8000-000000000001', 'owner-p20-hosted@example.test', now(),
    '{"display_name":"P20 Hosted Owner"}'),
  ('f2010000-0000-4000-8000-000000000002', 'finance-p20-hosted@example.test', now(),
    '{"display_name":"P20 Hosted Finance"}'),
  ('f2010000-0000-4000-8000-000000000003', 'accountant-p20-hosted@example.test', now(),
    '{"display_name":"P20 Hosted Accountant"}'),
  ('f2010000-0000-4000-8000-000000000004', 'staff-p20-hosted@example.test', now(),
    '{"display_name":"P20 Hosted Staff"}'),
  ('f2010000-0000-4000-8000-000000000005', 'inactive-p20-hosted@example.test', now(),
    '{"display_name":"P20 Hosted Inactive"}'),
  ('f2010000-0000-4000-8000-000000000006', 'other-p20-hosted@example.test', now(),
    '{"display_name":"P20 Hosted Other"}');

update public.profiles set is_active = false
where id = 'f2010000-0000-4000-8000-000000000005';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at
) values
  ('f2020000-0000-4000-8000-000000000001', 'P20 Hosted Primary',
    'P20 Hosted Primary Inc.', 'p20-hosted-primary', 'active', 'BBD',
    'America/Barbados', 'primary-p20-hosted@example.test',
    statement_timestamp()),
  ('f2020000-0000-4000-8000-000000000002', 'P20 Hosted Other',
    'P20 Hosted Other Inc.', 'p20-hosted-other', 'active', 'USD', 'UTC',
    'other-p20-hosted@example.test', statement_timestamp());

insert into public.church_memberships (church_id, user_id, role, status)
values
  ('f2020000-0000-4000-8000-000000000001',
    'f2010000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('f2020000-0000-4000-8000-000000000001',
    'f2010000-0000-4000-8000-000000000002', 'finance_admin', 'active'),
  ('f2020000-0000-4000-8000-000000000001',
    'f2010000-0000-4000-8000-000000000003', 'accountant', 'active'),
  ('f2020000-0000-4000-8000-000000000001',
    'f2010000-0000-4000-8000-000000000004', 'staff', 'active'),
  ('f2020000-0000-4000-8000-000000000001',
    'f2010000-0000-4000-8000-000000000005', 'owner', 'active'),
  ('f2020000-0000-4000-8000-000000000002',
    'f2010000-0000-4000-8000-000000000006', 'owner', 'active');

insert into public.funds (
  id, church_id, name, slug, status, is_default, sort_order
) values
  ('f2040000-0000-4000-8000-000000000001',
    'f2020000-0000-4000-8000-000000000001', 'Missions', 'missions',
    'active', false, 1),
  ('f2040000-0000-4000-8000-000000000002',
    'f2020000-0000-4000-8000-000000000002', 'Other Fund', 'other-fund',
    'active', false, 1);

insert into public.campaigns (
  id, church_id, fund_id, name, slug, status, currency
) values (
  'f2050000-0000-4000-8000-000000000001',
  'f2020000-0000-4000-8000-000000000001',
  'f2040000-0000-4000-8000-000000000001',
  'Community Care', 'community-care', 'active', 'BBD'
);

insert into public.donors (id, church_id, display_name, email, is_anonymous)
values
  ('f2060000-0000-4000-8000-000000000001',
    'f2020000-0000-4000-8000-000000000001', 'Alpha Donor',
    'hidden-alpha-p20@example.test', false),
  ('f2060000-0000-4000-8000-000000000002',
    'f2020000-0000-4000-8000-000000000001', 'Beta Donor',
    'hidden-beta-p20@example.test', false),
  ('f2060000-0000-4000-8000-000000000003',
    'f2020000-0000-4000-8000-000000000002', 'Other Tenant Secret',
    'other-secret-p20@example.test', false);

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status, is_primary,
  charges_enabled, recurring_enabled, payouts_enabled, supported_currencies,
  capabilities
) values (
  'f2030000-0000-4000-8000-000000000001',
  'f2020000-0000-4000-8000-000000000001',
  'mock-development-gateway', 'p20-hosted-primary', 'active', true, true,
  true, true, array['BBD'],
  '{"environment":"development","settlement_mode":"direct_to_church"}'
);

insert into public.recurring_gifts (
  id, church_id, donor_id, fund_id, payment_connection_id, amount_minor,
  currency, frequency, status, provider_subscription_reference,
  payment_method_brand, payment_method_last4, started_at, next_charge_at,
  canceled_at
) values
  ('f2070000-0000-4000-8000-000000000001',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000001',
    'f2040000-0000-4000-8000-000000000001',
    'f2030000-0000-4000-8000-000000000001', 3000, 'BBD', 'monthly',
    'active', 'p20-hosted-active-plan', 'Visa', '1111',
    '2026-01-01T00:00:00Z', '2026-10-01T00:00:00Z', null),
  ('f2070000-0000-4000-8000-000000000002',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000002',
    'f2040000-0000-4000-8000-000000000001',
    'f2030000-0000-4000-8000-000000000001', 4000, 'BBD', 'weekly',
    'canceled', 'p20-hosted-canceled-plan', 'Mastercard', '2222',
    '2026-01-01T00:00:00Z', null, '2026-09-16T00:00:00Z');

insert into public.donations (
  id, church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
  payment_connection_id, source, status, amount_minor, currency,
  processing_fee_minor, refunded_amount_minor, payment_method_brand,
  payment_method_last4, donor_display_name, donor_email, donor_message,
  external_idempotency_key, donated_at, failed_at, created_at, updated_at
) values
  ('f2080000-0000-4000-8000-000000000009',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000001',
    (select id from public.funds
      where church_id='f2020000-0000-4000-8000-000000000001' and is_default),
    null, null, 'f2030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 9000, 'BBD', 300, 0, 'Visa', '4242', 'Alpha Donor',
    'hidden-alpha-p20@example.test', 'never expose this message',
    'p20-hosted-newest-high', '2026-09-18T04:30:00Z', null,
    '2026-09-18T04:30:00Z', '2026-09-18T04:30:00Z'),
  ('f2080000-0000-4000-8000-000000000008',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000002',
    (select id from public.funds
      where church_id='f2020000-0000-4000-8000-000000000001' and is_default),
    null, null, 'f2030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 2000, 'BBD', 80, 0, ' Visa ', null, 'Beta Donor',
    'hidden-beta-p20@example.test', null, 'p20-hosted-newest-low',
    '2026-09-18T04:30:00Z', null,
    '2026-09-18T04:30:00Z', '2026-09-18T04:30:00Z'),
  ('f2080000-0000-4000-8000-000000000007',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000001',
    'f2040000-0000-4000-8000-000000000001',
    'f2050000-0000-4000-8000-000000000001',
    'f2070000-0000-4000-8000-000000000001',
    'f2030000-0000-4000-8000-000000000001', 'online', 'succeeded',
    3000, 'BBD', 100, 0, 'Visa', '1111', 'Alpha Donor',
    'hidden-alpha-p20@example.test', null, 'p20-hosted-active-recurring',
    '2026-09-17T15:00:00Z', null,
    '2026-09-17T15:00:00Z', '2026-09-17T15:00:00Z'),
  ('f2080000-0000-4000-8000-000000000006',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000002',
    'f2040000-0000-4000-8000-000000000001', null,
    'f2070000-0000-4000-8000-000000000002',
    'f2030000-0000-4000-8000-000000000001', 'online', 'succeeded',
    4000, 'BBD', 130, 0, 'Mastercard', '2222', 'Beta Donor',
    'hidden-beta-p20@example.test', null, 'p20-hosted-recurring-canceled',
    '2026-09-16T12:00:00Z', null,
    '2026-09-16T12:00:00Z', '2026-09-16T12:00:00Z'),
  ('f2080000-0000-4000-8000-000000000005',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000002',
    'f2040000-0000-4000-8000-000000000001', null,
    'f2070000-0000-4000-8000-000000000002',
    'f2030000-0000-4000-8000-000000000001', 'online', 'canceled',
    4000, 'BBD', 0, 0, 'Mastercard', '2222', 'Beta Donor',
    'hidden-beta-p20@example.test', null, 'p20-hosted-both-canceled',
    null, null, '2026-09-15T12:00:00Z', '2026-09-15T12:00:00Z'),
  ('f2080000-0000-4000-8000-000000000004',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000001',
    (select id from public.funds
      where church_id='f2020000-0000-4000-8000-000000000001' and is_default),
    null, null, 'f2030000-0000-4000-8000-000000000001', 'online',
    'canceled', 2500, 'BBD', 0, 0, null, null, 'Alpha Donor',
    'hidden-alpha-p20@example.test', null, 'p20-hosted-payment-canceled',
    null, null, '2026-09-14T12:00:00Z', '2026-09-14T12:00:00Z'),
  ('f2080000-0000-4000-8000-000000000003',
    'f2020000-0000-4000-8000-000000000001',
    'f2060000-0000-4000-8000-000000000002',
    'f2040000-0000-4000-8000-000000000001',
    'f2050000-0000-4000-8000-000000000001', null,
    'f2030000-0000-4000-8000-000000000001', 'online', 'failed',
    1500, 'BBD', 0, 0, 'Visa', '9999', 'Beta Donor',
    'hidden-beta-p20@example.test', null, 'p20-hosted-failed-mission',
    null, '2026-09-13T12:00:00Z',
    '2026-09-13T12:00:00Z', '2026-09-13T12:00:00Z'),
  ('f2080000-0000-4000-8000-000000000002',
    'f2020000-0000-4000-8000-000000000002',
    'f2060000-0000-4000-8000-000000000003',
    (select id from public.funds
      where church_id='f2020000-0000-4000-8000-000000000002' and is_default),
    null, null, null, 'cash', 'succeeded', 999999, 'USD', 0, 0, null,
    null, 'Other Tenant Secret', 'other-secret-p20@example.test',
    'cross tenant secret', null, '2026-09-19T12:00:00Z', null,
    '2026-09-19T12:00:00Z', '2026-09-19T12:00:00Z');

-- Authorized minimum projection, keyset, filters, and cancellation states (13-37).
set local "request.jwt.claim.sub" = 'f2010000-0000-4000-8000-000000000001';
set local role authenticated;

select extensions.is(
  cardinality((public.get_church_transaction_page(
    'f2020000-0000-4000-8000-000000000001')).transactions),
  7,
  'owner receives only the seven primary-tenant transactions'
);
select extensions.is(
  (select count(*)
   from unnest((public.get_church_transaction_page(
     'f2020000-0000-4000-8000-000000000001')).transactions) record
   where record.church_id <> 'f2020000-0000-4000-8000-000000000001'),
  0::bigint,
  'every projected transaction repeats the selected tenant'
);
select extensions.is(
  (select pg_catalog.array_agg(record.transaction_id order by ordinality)
   from unnest((public.get_church_transaction_page(
     target_church_id => 'f2020000-0000-4000-8000-000000000001',
     transaction_page_size => 2
   )).transactions) with ordinality record(
     transaction_id, church_id, donor_name, fund_id, fund_name, campaign_id,
     campaign_name, recorded_at, frequency, recurring_status, amount_minor,
     currency, processing_fee_minor, refunded_amount_minor, net_amount_minor,
     payment_method_brand, payment_method_last4, payment_status,
     cancellation_state, ordinality
   )),
  array[
    'f2080000-0000-4000-8000-000000000009',
    'f2080000-0000-4000-8000-000000000008'
  ]::uuid[],
  'same-time records use descending UUID tie-break order'
);
select extensions.ok(
  (public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_page_size => 2
  )).has_more,
  'limit plus one detects a following page'
);
select extensions.is(
  (public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_page_size => 2
  )).next_cursor_transaction_id,
  'f2080000-0000-4000-8000-000000000008'::uuid,
  'next cursor is the last visible transaction'
);
select extensions.is(
  (select pg_catalog.array_agg(record.transaction_id order by ordinality)
   from unnest((public.get_church_transaction_page(
     target_church_id => 'f2020000-0000-4000-8000-000000000001',
     transaction_page_size => 2,
     transaction_cursor_created_at => '2026-09-18T04:30:00Z',
     transaction_cursor_id => 'f2080000-0000-4000-8000-000000000008'
   )).transactions) with ordinality record(
     transaction_id, church_id, donor_name, fund_id, fund_name, campaign_id,
     campaign_name, recorded_at, frequency, recurring_status, amount_minor,
     currency, processing_fee_minor, refunded_amount_minor, net_amount_minor,
     payment_method_brand, payment_method_last4, payment_status,
     cancellation_state, ordinality
   )),
  array[
    'f2080000-0000-4000-8000-000000000007',
    'f2080000-0000-4000-8000-000000000006'
  ]::uuid[],
  'second keyset page has no overlap'
);
select extensions.is(
  (select pg_catalog.array_agg(option.fund_name order by ordinality)
   from unnest((public.get_church_transaction_page(
     'f2020000-0000-4000-8000-000000000001')).fund_options)
   with ordinality option(fund_id, fund_name, fund_status, ordinality)),
  array['Tithes', 'Missions']::text[],
  'page includes active and historical tenant fund options in stable order'
);
select extensions.is(
  (select record.payment_method_brand
   from unnest((public.get_church_transaction_page(
     'f2020000-0000-4000-8000-000000000001')).transactions) record
   where record.transaction_id = 'f2080000-0000-4000-8000-000000000008'),
  null::text,
  'noncanonical provider card brand degrades to null'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_date_from => '2026-09-18',
    transaction_date_to => '2026-09-18'
  )).transactions),
  2,
  'date filter uses the church local inclusive day'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_donor_query => ' alpha donor '
  )).transactions),
  3,
  'donor filter canonicalizes and matches snapshot display name'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_donor_query => 'hidden-alpha-p20@example.test'
  )).transactions),
  0,
  'donor filter cannot probe hidden snapshot email'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_min_amount_minor => 3000,
    transaction_max_amount_minor => 4000
  )).transactions),
  3,
  'inclusive amount range is applied server-side'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_fund_id => 'f2040000-0000-4000-8000-000000000001'
  )).transactions),
  4,
  'category filter is tenant-scoped by fund UUID'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_last4 => '9999'
  )).transactions),
  1,
  'last-four filter requires an exact display-safe match'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_payment_status => 'failed'
  )).transactions),
  1,
  'payment status filter uses the canonical donation state'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_recurring_state => 'one_time'
  )).transactions),
  4,
  'one-time filter excludes all recurring-plan rows'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_recurring_state => 'recurring'
  )).transactions),
  3,
  'recurring filter includes every recurring-plan row'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_recurring_state => 'canceled'
  )).transactions),
  2,
  'exact recurring status filter finds canceled plans'
);
select extensions.is(
  (select pg_catalog.jsonb_object_agg(
     record.transaction_id::text, record.cancellation_state
   )
   from unnest((public.get_church_transaction_page(
     'f2020000-0000-4000-8000-000000000001')).transactions) record
   where record.transaction_id in (
     'f2080000-0000-4000-8000-000000000009',
     'f2080000-0000-4000-8000-000000000006',
     'f2080000-0000-4000-8000-000000000005',
     'f2080000-0000-4000-8000-000000000004'
   )),
  '{"f2080000-0000-4000-8000-000000000009":"not_canceled","f2080000-0000-4000-8000-000000000006":"recurring_canceled","f2080000-0000-4000-8000-000000000005":"payment_and_recurring_canceled","f2080000-0000-4000-8000-000000000004":"payment_canceled"}'::jsonb,
  'projection preserves all four payment/plan cancellation combinations'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_cancellation_state => 'not_canceled'
  )).transactions),
  4,
  'not-canceled filter excludes either cancellation dimension'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_cancellation_state => 'payment_canceled'
  )).transactions),
  2,
  'payment-canceled filter includes payment-only and combined rows'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_cancellation_state => 'recurring_canceled'
  )).transactions),
  2,
  'recurring-canceled filter includes plan-only and combined rows'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_cancellation_state => 'any_canceled'
  )).transactions),
  3,
  'any-canceled filter includes either cancellation dimension'
);
select extensions.is(
  cardinality((public.get_church_transaction_page(
    target_church_id => 'f2020000-0000-4000-8000-000000000001',
    transaction_min_amount_minor => 1000,
    transaction_max_amount_minor => 2000,
    transaction_fund_id => 'f2040000-0000-4000-8000-000000000001',
    transaction_last4 => '9999',
    transaction_payment_status => 'failed'
  )).transactions),
  1,
  'full filters compose without leaving the server boundary'
);
select extensions.is(
  (select record.campaign_name
   from unnest((public.get_church_transaction_page(
     target_church_id => 'f2020000-0000-4000-8000-000000000001',
     transaction_last4 => '9999'
   )).transactions) record),
  'Community Care',
  'campaign label is joined through the same tenant key'
);

-- Invalid input and authorization failures (38-47).
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_page_size => 0)$$,
  '%CHURCH_TRANSACTIONS_INVALID_PAGE_SIZE%',
  'invalid page size fails closed'
);
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_cursor_created_at => now())$$,
  '%CHURCH_TRANSACTIONS_INVALID_CURSOR%',
  'partial keyset cursor fails closed'
);
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_date_from => '2026-09-19',
      transaction_date_to => '2026-09-18')$$,
  '%CHURCH_TRANSACTIONS_INVALID_DATE_RANGE%',
  'reversed date range fails closed'
);
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_min_amount_minor => 2000,
      transaction_max_amount_minor => 1000)$$,
  '%CHURCH_TRANSACTIONS_INVALID_AMOUNT_RANGE%',
  'reversed amount range fails closed'
);
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_recurring_state => 'unknown')$$,
  '%CHURCH_TRANSACTIONS_INVALID_RECURRING_STATE%',
  'unknown recurring state fails closed'
);
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_last4 => '42')$$,
  '%CHURCH_TRANSACTIONS_INVALID_LAST4%',
  'malformed last four fails closed'
);
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      target_church_id => 'f2020000-0000-4000-8000-000000000001',
      transaction_cancellation_state => 'unknown')$$,
  '%CHURCH_TRANSACTIONS_INVALID_CANCELLATION_STATE%',
  'unknown cancellation state fails closed'
);
reset role;

set local "request.jwt.claim.sub" = 'f2010000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      'f2020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_TRANSACTIONS_FORBIDDEN%',
  'staff without financial_read is denied'
);
reset role;

set local "request.jwt.claim.sub" = 'f2010000-0000-4000-8000-000000000005';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      'f2020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_TRANSACTIONS_FORBIDDEN%',
  'inactive finance identity fails closed'
);
reset role;

set local "request.jwt.claim.sub" = 'f2010000-0000-4000-8000-000000000006';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_transaction_page(
      'f2020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_TRANSACTIONS_FORBIDDEN%',
  'other owner cannot cross tenant boundary'
);
reset role;

select * from extensions.finish();

rollback;
