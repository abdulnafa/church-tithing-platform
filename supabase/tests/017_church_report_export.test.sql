begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(53);

-- Schema, exact projection, cursor index, and least-privilege boundary (1-19).
select extensions.has_type(
  'public', 'church_report_period',
  'finite report-period type exists'
);
select extensions.has_type(
  'public', 'church_report_export_record',
  'minimum report-export record type exists'
);
select extensions.has_type(
  'public', 'church_report_export_result',
  'report-export envelope type exists'
);
select extensions.has_index(
  'public', 'donations', 'donations_church_report_cursor_idx',
  'tenant, donated-at, and UUID export cursor is indexed'
);
select extensions.ok(
  pg_catalog.pg_get_indexdef('public.donations_church_report_cursor_idx'::regclass)
    like '%(church_id, donated_at DESC, id DESC)%',
  'export index follows tenant equality then descending donated-at cursor'
);
select extensions.ok(
  (select pg_catalog.pg_get_expr(index_entry.indpred, index_entry.indrelid)
   from pg_catalog.pg_index index_entry
   where index_entry.indexrelid =
     'public.donations_church_report_cursor_idx'::regclass)
    like '%donated_at IS NOT NULL%'
  and (select pg_catalog.pg_get_expr(index_entry.indpred, index_entry.indrelid)
       from pg_catalog.pg_index index_entry
       where index_entry.indexrelid =
         'public.donations_church_report_cursor_idx'::regclass)
    like '%succeeded%'
  and (select pg_catalog.pg_get_expr(index_entry.indpred, index_entry.indrelid)
       from pg_catalog.pg_index index_entry
       where index_entry.indexrelid =
         'public.donations_church_report_cursor_idx'::regclass)
    like '%partially_refunded%'
  and (select pg_catalog.pg_get_expr(index_entry.indpred, index_entry.indrelid)
       from pg_catalog.pg_index index_entry
       where index_entry.indexrelid =
         'public.donations_church_report_cursor_idx'::regclass)
    like '%refunded%'
  and (select pg_catalog.pg_get_expr(index_entry.indpred, index_entry.indrelid)
       from pg_catalog.pg_index index_entry
       where index_entry.indexrelid =
         'public.donations_church_report_cursor_idx'::regclass)
    like '%disputed%',
  'partial index contains only post-capture rows with a collection timestamp'
);
select extensions.ok(
  pg_catalog.to_regprocedure(
    'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)'
  ) is not null,
  'report-export function has the exact reviewed signature'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)',
    'EXECUTE'
  ),
  true,
  'authenticated callers may execute the guarded export boundary'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot execute the export boundary'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)',
    'EXECUTE'
  ),
  false,
  'service role cannot bypass the authenticated export boundary'
);
select extensions.is(
  has_type_privilege('authenticated', 'public.church_report_period', 'USAGE')
  and has_type_privilege(
    'authenticated', 'public.church_report_export_record', 'USAGE'
  )
  and has_type_privilege(
    'authenticated', 'public.church_report_export_result', 'USAGE'
  ),
  true,
  'authenticated callers may use only the guarded export boundary types'
);
select extensions.is(
  has_type_privilege('anon', 'public.church_report_period', 'USAGE')
  or has_type_privilege('anon', 'public.church_report_export_record', 'USAGE')
  or has_type_privilege('anon', 'public.church_report_export_result', 'USAGE'),
  false,
  'anonymous callers cannot use any export boundary type'
);
select extensions.is(
  has_type_privilege('service_role', 'public.church_report_period', 'USAGE')
  or has_type_privilege(
    'service_role', 'public.church_report_export_record', 'USAGE'
  )
  or has_type_privilege(
    'service_role', 'public.church_report_export_result', 'USAGE'
  ),
  false,
  'service role cannot use any export boundary type'
);
select extensions.is(
  (select procedure_entry.prosecdef
   from pg_catalog.pg_proc procedure_entry
   where procedure_entry.oid =
     'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)'::regprocedure),
  true,
  'report export is security definer'
);
select extensions.is(
  (select procedure_entry.provolatile::text
   from pg_catalog.pg_proc procedure_entry
   where procedure_entry.oid =
     'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)'::regprocedure),
  'v',
  'audited report export is volatile'
);
select extensions.ok(
  (select procedure_entry.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc procedure_entry
   where procedure_entry.oid =
     'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)'::regprocedure),
  'security-definer export pins an empty search path'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_report_export_record'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{transaction_id,donated_at,donor_name,fund_name,campaign_name,source,frequency,recurring_status,gross_amount_minor,currency,processing_fee_minor,refunded_amount_minor,recorded_net_amount_minor,payment_method_brand,payment_method_last4,payment_status}',
  'export record contains only approved accounting fields in order'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_report_export_result'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{church_id,church_slug,church_timezone,report_period,report_as_of_date,period_start_date,period_end_date,transactions}',
  'export envelope contains only tenant, period, and row data'
);
select extensions.is(
  (select pg_catalog.count(*)
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_report_export_record'::regclass
     and attribute.attname in (
       'church_id', 'donor_id', 'donor_email', 'donor_message',
       'provider_payment_reference', 'provider_charge_reference',
       'failure_code', 'failure_message', 'prayer_request_id'
     )),
  0::bigint,
  'export record excludes tenant internals, contact data, messages, provider IDs, and prayer linkage'
);

-- Rollback-only multi-tenant fixture.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('f3010000-0000-4000-8000-000000000001',
    'owner-p21-hosted@example.test', now(),
    '{"display_name":"P21 Hosted Owner"}'),
  ('f3010000-0000-4000-8000-000000000002',
    'finance-p21-hosted@example.test', now(),
    '{"display_name":"P21 Hosted Finance"}'),
  ('f3010000-0000-4000-8000-000000000003',
    'accountant-p21-hosted@example.test', now(),
    '{"display_name":"P21 Hosted Accountant"}'),
  ('f3010000-0000-4000-8000-000000000004',
    'staff-p21-hosted@example.test', now(),
    '{"display_name":"P21 Hosted Staff"}'),
  ('f3010000-0000-4000-8000-000000000005',
    'inactive-p21-hosted@example.test', now(),
    '{"display_name":"P21 Hosted Inactive"}'),
  ('f3010000-0000-4000-8000-000000000006',
    'other-p21-hosted@example.test', now(),
    '{"display_name":"P21 Hosted Other"}');

update public.profiles
set is_active = false
where id = 'f3010000-0000-4000-8000-000000000005';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at, suspended_at
) values
  ('f3020000-0000-4000-8000-000000000001', 'P21 Hosted Primary',
    'P21 Hosted Primary Inc.', 'p21-hosted-primary', 'active', 'BBD',
    'America/Barbados', 'primary-p21-hosted@example.test',
    statement_timestamp(), null),
  ('f3020000-0000-4000-8000-000000000002', 'P21 Hosted Other',
    'P21 Hosted Other Inc.', 'p21-hosted-other', 'active', 'USD', 'UTC',
    'other-p21-hosted@example.test', statement_timestamp(), null),
  ('f3020000-0000-4000-8000-000000000003', 'P21 Hosted Suspended',
    'P21 Hosted Suspended Inc.', 'p21-hosted-suspended', 'suspended', 'BBD',
    'America/Barbados', 'suspended-p21-hosted@example.test',
    statement_timestamp(),
    statement_timestamp());

insert into public.church_memberships (church_id, user_id, role, status)
values
  ('f3020000-0000-4000-8000-000000000001',
    'f3010000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('f3020000-0000-4000-8000-000000000001',
    'f3010000-0000-4000-8000-000000000002', 'finance_admin', 'active'),
  ('f3020000-0000-4000-8000-000000000001',
    'f3010000-0000-4000-8000-000000000003', 'accountant', 'active'),
  ('f3020000-0000-4000-8000-000000000001',
    'f3010000-0000-4000-8000-000000000004', 'staff', 'active'),
  ('f3020000-0000-4000-8000-000000000001',
    'f3010000-0000-4000-8000-000000000005', 'owner', 'active'),
  ('f3020000-0000-4000-8000-000000000002',
    'f3010000-0000-4000-8000-000000000006', 'owner', 'active'),
  ('f3020000-0000-4000-8000-000000000003',
    'f3010000-0000-4000-8000-000000000001', 'owner', 'active');

insert into public.funds (
  id, church_id, name, slug, status, is_default, sort_order
) values
  ('f3040000-0000-4000-8000-000000000001',
    'f3020000-0000-4000-8000-000000000001',
    'Community Missions', 'community-missions', 'active', false, 1),
  ('f3040000-0000-4000-8000-000000000002',
    'f3020000-0000-4000-8000-000000000002',
    'Other Secret Fund', 'other-secret-fund', 'active', false, 1);

insert into public.campaigns (
  id, church_id, fund_id, name, slug, status, currency
) values (
  'f3050000-0000-4000-8000-000000000001',
  'f3020000-0000-4000-8000-000000000001',
  'f3040000-0000-4000-8000-000000000001',
  'Community Care', 'community-care-p21', 'active', 'BBD'
);

insert into public.donors (id, church_id, display_name, email, is_anonymous)
values
  ('f3060000-0000-4000-8000-000000000001',
    'f3020000-0000-4000-8000-000000000001', 'Alpha Donor',
    'hidden-alpha-p21@example.test', false),
  ('f3060000-0000-4000-8000-000000000002',
    'f3020000-0000-4000-8000-000000000001', 'Beta Donor',
    'hidden-beta-p21@example.test', false),
  ('f3060000-0000-4000-8000-000000000003',
    'f3020000-0000-4000-8000-000000000002', 'Other Tenant Secret',
    'other-secret-p21@example.test', false);

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status, is_primary,
  charges_enabled, recurring_enabled, payouts_enabled, supported_currencies,
  capabilities
) values (
  'f3030000-0000-4000-8000-000000000001',
  'f3020000-0000-4000-8000-000000000001',
  'mock-development-gateway', 'p21-hosted-primary', 'active', true, true,
  true, true, array['BBD', 'USD'],
  '{"environment":"development","settlement_mode":"direct_to_church"}'
);

insert into public.recurring_gifts (
  id, church_id, donor_id, fund_id, payment_connection_id, amount_minor,
  currency, frequency, status, provider_subscription_reference,
  payment_method_brand, payment_method_last4, started_at, next_charge_at,
  canceled_at
) values (
  'f3070000-0000-4000-8000-000000000001',
  'f3020000-0000-4000-8000-000000000001',
  'f3060000-0000-4000-8000-000000000001',
  'f3040000-0000-4000-8000-000000000001',
  'f3030000-0000-4000-8000-000000000001', 1000, 'BBD', 'monthly',
  'canceled', 'p21-hosted-canceled-plan', 'Mastercard', '2222',
  '2026-01-01T00:00:00Z', null, '2026-09-18T00:00:00Z'
);

insert into public.donations (
  id, church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
  payment_connection_id, source, status, amount_minor, currency,
  processing_fee_minor, refunded_amount_minor, provider_payment_reference,
  provider_charge_reference, payment_method_brand, payment_method_last4,
  donor_display_name, donor_email, donor_message, external_idempotency_key,
  donated_at, failed_at, refunded_at, created_at, updated_at
) values
  -- Exact end boundary: excluded from every report ending on 19 September.
  ('f3080000-0000-4000-8000-000000000010',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 1010, 'BBD', 10, 0, 'p21-hidden-payment-end',
    'p21-hidden-charge-end', 'Visa', '1010', 'End Boundary Donor',
    'hidden-end-p21@example.test', 'hidden end message', 'p21-end-boundary',
    '2026-09-20T04:00:00Z', null, null,
    '2026-09-20T04:00:00Z', '2026-09-20T04:00:00Z'),
  -- Last instant of the church-local as-of date; exact bigint text survives.
  ('f3080000-0000-4000-8000-000000000009',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'disputed', 9007199254740993, 'BBD', 123, 0,
    'p21-hidden-payment-dispute', 'p21-hidden-charge-dispute', 'Visa', '4242',
    '  Alpha   Donor  ', 'hidden-alpha-p21@example.test',
    'never expose dispute message', 'p21-last-instant',
    '2026-09-20T03:59:59Z', null, null,
    '2025-01-01T00:00:00Z', '2026-09-20T03:59:59Z'),
  -- A full refund retains the fee, so recorded net is a signed -50 string.
  ('f3080000-0000-4000-8000-000000000008',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    'f3040000-0000-4000-8000-000000000001',
    'f3050000-0000-4000-8000-000000000001',
    'f3070000-0000-4000-8000-000000000001',
    'f3030000-0000-4000-8000-000000000001', 'online', 'refunded',
    1000, 'BBD', 50, 1000, 'p21-hidden-payment-refund',
    'p21-hidden-charge-refund', 'Mastercard', '2222', 'Alpha Donor',
    'hidden-alpha-p21@example.test', 'never expose refund message',
    'p21-refunded', '2026-09-19T12:00:00Z', null,
    '2026-09-19T13:00:00Z', '2026-09-19T12:00:00Z',
    '2026-09-19T13:00:00Z'),
  -- Same instant: descending UUID is the stable tie-break.
  ('f3080000-0000-4000-8000-000000000007',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000002',
    'f3040000-0000-4000-8000-000000000001', null, null,
    'f3030000-0000-4000-8000-000000000001', 'online',
    'partially_refunded', 4000, 'USD', 130, 500,
    'p21-hidden-payment-partial', 'p21-hidden-charge-partial', ' Visa ',
    '7777', 'Beta Donor', 'hidden-beta-p21@example.test',
    'never expose partial message', 'p21-same-time-high',
    '2026-09-18T04:30:00Z', null, '2026-09-18T05:00:00Z',
    '2026-09-18T04:30:00Z', '2026-09-18T05:00:00Z'),
  ('f3080000-0000-4000-8000-000000000006',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000002',
    'f3040000-0000-4000-8000-000000000001', null, null,
    'f3030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 3000, 'BBD', 100, 0, 'p21-hidden-payment-same-low',
    'p21-hidden-charge-same-low', 'Visa', '6666', null,
    'hidden-beta-p21@example.test', 'never expose low message',
    'p21-same-time-low', '2026-09-18T04:30:00Z', null, null,
    '2026-09-18T04:30:00Z', '2026-09-18T04:30:00Z'),
  -- Exact last-seven-days local start; created_at is deliberately older.
  ('f3080000-0000-4000-8000-000000000005',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 2500, 'BBD', 75, 0, 'p21-hidden-payment-start',
    'p21-hidden-charge-start', 'Visa', '5555', 'Start Boundary Donor',
    'hidden-start-p21@example.test', 'never expose start message',
    'p21-exact-start', '2026-09-13T04:00:00Z', null, null,
    '2025-01-01T00:00:00Z', '2026-09-13T04:00:00Z'),
  -- One second before last-seven-days local start; created_at is in-range.
  ('f3080000-0000-4000-8000-000000000004',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 2400, 'BBD', 70, 0, 'p21-hidden-payment-before-week',
    'p21-hidden-charge-before-week', 'Visa', '4444', 'Before Week Donor',
    'hidden-before-week-p21@example.test', 'never expose before-week message',
    'p21-before-week', '2026-09-13T03:59:59Z', null, null,
    '2026-09-18T00:00:00Z', '2026-09-18T00:00:00Z'),
  -- One second before the Barbados September boundary.
  ('f3080000-0000-4000-8000-000000000003',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 2300, 'BBD', 65, 0, 'p21-hidden-payment-before-month',
    'p21-hidden-charge-before-month', 'Visa', '3333', 'Before Month Donor',
    'hidden-before-month-p21@example.test',
    'never expose before-month message', 'p21-before-month',
    '2026-09-01T03:59:59Z', null, null,
    '2026-09-01T03:59:59Z', '2026-09-01T03:59:59Z'),
  -- One second before the Barbados 2026 boundary.
  ('f3080000-0000-4000-8000-000000000002',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000001',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'succeeded', 2200, 'BBD', 60, 0, 'p21-hidden-payment-before-year',
    'p21-hidden-charge-before-year', 'Visa', '2222', 'Before Year Donor',
    'hidden-before-year-p21@example.test', 'never expose before-year message',
    'p21-before-year', '2026-01-01T03:59:59Z', null, null,
    '2026-01-01T03:59:59Z', '2026-01-01T03:59:59Z'),
  -- Non-post-capture states inside the selected time range remain excluded.
  ('f3080000-0000-4000-8000-000000000104',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000002',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'pending', 1400, 'BBD', 0, 0, 'p21-hidden-payment-pending',
    'p21-hidden-charge-pending', null, null, 'Pending Secret',
    'hidden-pending-p21@example.test', 'never expose pending message',
    'p21-pending', '2026-09-18T12:00:00Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  ('f3080000-0000-4000-8000-000000000103',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000002',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'processing', 1300, 'BBD', 0, 0, 'p21-hidden-payment-processing',
    'p21-hidden-charge-processing', null, null, 'Processing Secret',
    'hidden-processing-p21@example.test', 'never expose processing message',
    'p21-processing', '2026-09-18T12:00:00Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  ('f3080000-0000-4000-8000-000000000102',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000002',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'failed', 1200, 'BBD', 0, 0, 'p21-hidden-payment-failed',
    'p21-hidden-charge-failed', null, null, 'Failed Secret',
    'hidden-failed-p21@example.test', 'never expose failed message',
    'p21-failed', '2026-09-18T12:00:00Z', '2026-09-18T12:00:01Z', null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:01Z'),
  ('f3080000-0000-4000-8000-000000000101',
    'f3020000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000002',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000001'
       and is_default),
    null, null, 'f3030000-0000-4000-8000-000000000001', 'online',
    'canceled', 1100, 'BBD', 0, 0, 'p21-hidden-payment-canceled',
    'p21-hidden-charge-canceled', null, null, 'Canceled Secret',
    'hidden-canceled-p21@example.test', 'never expose canceled message',
    'p21-canceled', '2026-09-18T12:00:00Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  -- A second-tenant captured row must never cross the boundary.
  ('f3080000-0000-4000-8000-000000000001',
    'f3020000-0000-4000-8000-000000000002',
    'f3060000-0000-4000-8000-000000000003',
    (select id from public.funds
     where church_id = 'f3020000-0000-4000-8000-000000000002'
       and is_default),
    null, null, null, 'cash', 'succeeded', 999999, 'USD', 0, 0,
    'other-hidden-payment-p21', 'other-hidden-charge-p21', null, null,
    'Other Tenant Secret', 'other-secret-p21@example.test',
    'cross tenant secret', null, '2026-09-19T12:00:00Z', null, null,
    '2026-09-19T12:00:00Z', '2026-09-19T12:00:00Z');

create temporary table p21_export_results (
  result_name text primary key,
  export_result public.church_report_export_result not null
) on commit drop;

grant select, insert on table p21_export_results to authenticated;

-- Each successful call is captured once so assertions do not create extra audits.
set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000001';
set local role authenticated;
insert into p21_export_results values
  ('owner_last_7_days', public.export_church_giving_report(
    'f3020000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000001',
    'last_7_days', '2026-09-19'
  )),
  ('owner_month', public.export_church_giving_report(
    'f3020000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000002',
    'month', '2026-09-19'
  )),
  ('owner_year', public.export_church_giving_report(
    'f3020000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000003',
    'year', '2026-09-19'
  )),
  ('owner_all', public.export_church_giving_report(
    'f3020000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000004',
    'all', '2026-09-19'
  ));
reset role;

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000002';
set local role authenticated;
insert into p21_export_results values (
  'finance_last_7_days', public.export_church_giving_report(
    'f3020000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000005',
    'last_7_days', '2026-09-19'
  )
);
reset role;

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000003';
set local role authenticated;
insert into p21_export_results values (
  'accountant_last_7_days', public.export_church_giving_report(
    'f3020000-0000-4000-8000-000000000001',
    'f3090000-0000-4000-8000-000000000006',
    'last_7_days', '2026-09-19'
  )
);
reset role;

-- Exact, tenant-safe, post-capture projection and local period semantics (20-42).
select extensions.is(
  (select ((export_result).church_id)::text
   from p21_export_results where result_name = 'owner_last_7_days'),
  'f3020000-0000-4000-8000-000000000001',
  'export envelope identifies only the selected church'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'slug', (export_result).church_slug,
     'timezone', (export_result).church_timezone,
     'period', (export_result).report_period,
     'as_of', (export_result).report_as_of_date
   )
   from p21_export_results where result_name = 'owner_last_7_days'),
  '{"as_of":"2026-09-19","period":"last_7_days","slug":"p21-hosted-primary","timezone":"America/Barbados"}'::jsonb,
  'export envelope returns reviewed tenant and period metadata'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'start', (export_result).period_start_date,
     'end', (export_result).period_end_date
   )
   from p21_export_results where result_name = 'owner_last_7_days'),
  '{"end":"2026-09-19","start":"2026-09-13"}'::jsonb,
  'last seven days are the church-local as-of date minus six through as-of'
);
select extensions.is(
  (select pg_catalog.cardinality((export_result).transactions)
   from p21_export_results where result_name = 'owner_last_7_days'),
  5,
  'last-seven-days export contains only five captured in-bound rows'
);
select extensions.is(
  (select pg_catalog.array_agg(row_entry.transaction_id order by row_entry.ordinality)
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions)
     with ordinality row_entry(
       transaction_id, donated_at, donor_name, fund_name, campaign_name,
       source, frequency, recurring_status, gross_amount_minor, currency,
       processing_fee_minor, refunded_amount_minor, recorded_net_amount_minor,
       payment_method_brand, payment_method_last4, payment_status, ordinality
     )
   where result_entry.result_name = 'owner_last_7_days'),
  array[
    'f3080000-0000-4000-8000-000000000009',
    'f3080000-0000-4000-8000-000000000008',
    'f3080000-0000-4000-8000-000000000007',
    'f3080000-0000-4000-8000-000000000006',
    'f3080000-0000-4000-8000-000000000005'
  ]::uuid[],
  'donated-at desc with UUID desc tie-break is stable and uses local half-open boundaries'
);
select extensions.is(
  (select pg_catalog.array_agg(row_entry.payment_status order by row_entry.payment_status)
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'),
  array[
    'succeeded', 'succeeded', 'partially_refunded', 'refunded', 'disputed'
  ]::public.donation_status[],
  'all four post-capture states are exported and no attempt state is included'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'gross', row_entry.gross_amount_minor,
     'fee', row_entry.processing_fee_minor,
     'refund', row_entry.refunded_amount_minor,
     'net', row_entry.recorded_net_amount_minor,
     'currency', row_entry.currency
   )
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'
     and row_entry.transaction_id =
       'f3080000-0000-4000-8000-000000000009'),
  '{"currency":"BBD","fee":"123","gross":"9007199254740993","net":"9007199254740870","refund":"0"}'::jsonb,
  'amounts above JavaScript safe integer range remain exact decimal text'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'gross', row_entry.gross_amount_minor,
     'fee', row_entry.processing_fee_minor,
     'refund', row_entry.refunded_amount_minor,
     'net', row_entry.recorded_net_amount_minor
   )
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'
     and row_entry.transaction_id =
       'f3080000-0000-4000-8000-000000000008'),
  '{"fee":"50","gross":"1000","net":"-50","refund":"1000"}'::jsonb,
  'current cumulative refund and signed recorded net are projected exactly'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'frequency', row_entry.frequency,
     'status', row_entry.recurring_status,
     'fund', row_entry.fund_name,
     'campaign', row_entry.campaign_name
   )
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'
     and row_entry.transaction_id =
       'f3080000-0000-4000-8000-000000000008'),
  '{"campaign":"Community Care","frequency":"monthly","fund":"Community Missions","status":"canceled"}'::jsonb,
  'current recurring-plan state stays descriptive without removing captured history'
);
select extensions.is(
  (select row_entry.payment_method_brand
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'
     and row_entry.transaction_id =
       'f3080000-0000-4000-8000-000000000007'),
  null::text,
  'noncanonical payment brand degrades to null'
);
select extensions.is(
  (select row_entry.donor_name
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'
     and row_entry.transaction_id =
       'f3080000-0000-4000-8000-000000000009'),
  'Alpha Donor',
  'donor snapshot is canonicalized before export'
);
select extensions.is(
  (select row_entry.donor_name
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_last_7_days'
     and row_entry.transaction_id =
       'f3080000-0000-4000-8000-000000000006'),
  'Anonymous donor',
  'missing donor snapshot uses the privacy-safe anonymous label'
);
select extensions.ok(
  (select export_result::text !~* (
     'hidden-|never expose|other tenant secret|cross tenant secret|p21-hidden'
   )
   from p21_export_results where result_name = 'owner_all'),
  'serialized export contains no contact, message, provider, or cross-tenant secrets'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'start', (export_result).period_start_date,
     'end', (export_result).period_end_date,
     'rows', pg_catalog.cardinality((export_result).transactions)
   )
   from p21_export_results where result_name = 'owner_month'),
  '{"end":"2026-09-19","rows":6,"start":"2026-09-01"}'::jsonb,
  'month period uses the church-local calendar month and donated-at boundary'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'start', (export_result).period_start_date,
     'end', (export_result).period_end_date,
     'rows', pg_catalog.cardinality((export_result).transactions)
   )
   from p21_export_results where result_name = 'owner_year'),
  '{"end":"2026-09-19","rows":7,"start":"2026-01-01"}'::jsonb,
  'year period uses the church-local calendar year and donated-at boundary'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'has_start', (export_result).period_start_date is not null,
     'end', (export_result).period_end_date,
     'rows', pg_catalog.cardinality((export_result).transactions)
   )
   from p21_export_results where result_name = 'owner_all'),
  '{"end":"2026-09-19","has_start":false,"rows":8}'::jsonb,
  'full history has no lower bound but still ends after the local as-of date'
);
select extensions.is(
  (select pg_catalog.count(*)
   from p21_export_results result_entry
   cross join lateral unnest((result_entry.export_result).transactions) row_entry
   where result_entry.result_name = 'owner_all'
     and row_entry.transaction_id in (
       'f3080000-0000-4000-8000-000000000010',
       'f3080000-0000-4000-8000-000000000104',
       'f3080000-0000-4000-8000-000000000103',
       'f3080000-0000-4000-8000-000000000102',
       'f3080000-0000-4000-8000-000000000101',
       'f3080000-0000-4000-8000-000000000001'
     )),
  0::bigint,
  'end-boundary, attempt-state, and second-tenant rows stay excluded'
);
select extensions.is(
  (select pg_catalog.cardinality((export_result).transactions)
   from p21_export_results where result_name = 'finance_last_7_days'),
  5,
  'finance administrator receives the authorized tenant export'
);
select extensions.is(
  (select pg_catalog.cardinality((export_result).transactions)
   from p21_export_results where result_name = 'accountant_last_7_days'),
  5,
  'accountant receives the authorized tenant export'
);
select extensions.is(
  (select pg_catalog.count(*)
   from public.audit_logs
   where request_id = 'f3090000-0000-4000-8000-000000000001'),
  1::bigint,
  'one successful export creates exactly one audit row'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'action', action_code,
     'entity', entity_code,
     'entity_id', entity_id,
     'actor', actor_user_id,
     'changes', sanitized_changes
   )
   from public.audit_logs
   where request_id = 'f3090000-0000-4000-8000-000000000001'),
  '{"action":"report_exported","actor":"f3010000-0000-4000-8000-000000000001","changes":{"format":"csv","report_type":"giving_last_7_days","row_count":5},"entity":"report","entity_id":"f3090000-0000-4000-8000-000000000001"}'::jsonb,
  'export audit stores only finite report metadata, actor, and request identity'
);
select extensions.ok(
  (select sanitized_changes::text !~* (
     'donor|email|message|provider|payment|card|prayer|hidden|secret'
   )
   from public.audit_logs
   where request_id = 'f3090000-0000-4000-8000-000000000001'),
  'export audit contains no donor, provider, payment-method, or prayer data'
);

-- Fail-closed authorization and invalid-input paths (43-53).
select extensions.is(
  (select pg_catalog.count(*)
   from public.audit_logs
   where church_id = 'f3020000-0000-4000-8000-000000000001'
     and action_code = 'report_exported'
     and request_id in (
       'f3090000-0000-4000-8000-000000000001',
       'f3090000-0000-4000-8000-000000000002',
       'f3090000-0000-4000-8000-000000000003',
       'f3090000-0000-4000-8000-000000000004',
       'f3090000-0000-4000-8000-000000000005',
       'f3090000-0000-4000-8000-000000000006'
     )),
  6::bigint,
  'each authorized owner, finance, or accountant call creates one audit'
);

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000101')$$,
  '%CHURCH_REPORT_EXPORT_FORBIDDEN%',
  'staff without financial and export permissions is denied'
);
reset role;

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000005';
set local role authenticated;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000102')$$,
  '%CHURCH_REPORT_EXPORT_FORBIDDEN%',
  'inactive finance identity fails closed'
);
reset role;

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000006';
set local role authenticated;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000103')$$,
  '%CHURCH_REPORT_EXPORT_FORBIDDEN%',
  'another church owner cannot cross the tenant boundary'
);
reset role;

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000003',
      'f3090000-0000-4000-8000-000000000104')$$,
  '%CHURCH_REPORT_EXPORT_FORBIDDEN%',
  'suspended church fails closed even for its owner'
);
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000105',
      'all', '1999-12-31')$$,
  '%CHURCH_REPORT_EXPORT_INVALID_AS_OF_DATE%',
  'out-of-range as-of date fails closed'
);
reset role;

set local "request.jwt.claim.sub" = '';
set local role authenticated;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000106')$$,
  '%CHURCH_REPORT_EXPORT_FORBIDDEN%',
  'authenticated role without a user identity fails closed'
);
reset role;

set local "request.jwt.claim.sub" = '';
set local role anon;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000107')$$,
  '%permission denied%',
  'anonymous role cannot invoke the export function'
);
reset role;

set local "request.jwt.claim.sub" = 'f3010000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.throws_like(
  $$select public.export_church_giving_report(
      'f3020000-0000-4000-8000-000000000001',
      'f3090000-0000-4000-8000-000000000108')$$,
  '%permission denied%',
  'service role cannot invoke the user-authorized export function'
);
reset role;

select extensions.is(
  (select pg_catalog.count(*)
   from public.audit_logs
   where request_id in (
     'f3090000-0000-4000-8000-000000000101',
     'f3090000-0000-4000-8000-000000000102',
     'f3090000-0000-4000-8000-000000000103',
     'f3090000-0000-4000-8000-000000000104',
     'f3090000-0000-4000-8000-000000000105',
     'f3090000-0000-4000-8000-000000000106',
     'f3090000-0000-4000-8000-000000000107',
     'f3090000-0000-4000-8000-000000000108'
   )),
  0::bigint,
  'denied and invalid requests leave no audit residue'
);
select extensions.is(
  (select pg_catalog.count(*)
   from public.audit_logs
   where church_id = 'f3020000-0000-4000-8000-000000000002'
     and action_code = 'report_exported'),
  0::bigint,
  'cross-tenant attempts create no second-tenant audit evidence'
);
select extensions.is(
  (select pg_catalog.count(*)
   from public.audit_logs
   where church_id = 'f3020000-0000-4000-8000-000000000003'
     and action_code = 'report_exported'),
  0::bigint,
  'inactive church attempts create no audit evidence'
);

select * from extensions.finish();

rollback;
