begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(54);

-- Exact aggregate contracts, stable guarded RPC, and index reuse (1-24).
select extensions.has_type(
  'public', 'church_giving_report_currency_summary',
  'per-currency report summary type exists'
);
select extensions.has_type(
  'public', 'church_giving_report_trend_point',
  'report trend-point type exists'
);
select extensions.has_type(
  'public', 'church_giving_report_fund_summary',
  'per-fund report summary type exists'
);
select extensions.has_type(
  'public', 'church_giving_report_gift_type_summary',
  'per-gift-type report summary type exists'
);
select extensions.has_type(
  'public', 'church_giving_report_result',
  'giving-report envelope type exists'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid =
     'public.church_giving_report_currency_summary'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{currency,gross_amount_minor,processing_fee_minor,refunded_amount_minor,recorded_net_amount_minor,gift_count}',
  'currency summary contains only exact accounting aggregates'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid =
     'public.church_giving_report_trend_point'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{bucket_start,currency,gross_amount_minor,processing_fee_minor,refunded_amount_minor,recorded_net_amount_minor,gift_count}',
  'trend point contains only bucket, currency, and exact aggregates'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid =
     'public.church_giving_report_fund_summary'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{fund_id,fund_name,currency,gross_amount_minor,processing_fee_minor,refunded_amount_minor,recorded_net_amount_minor,gift_count}',
  'fund summary contains only fund identity and exact aggregates'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid =
     'public.church_giving_report_gift_type_summary'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{gift_type,currency,gross_amount_minor,processing_fee_minor,refunded_amount_minor,recorded_net_amount_minor,gift_count}',
  'gift-type summary contains only finite type, currency, and exact aggregates'
);
select extensions.is(
  (select pg_catalog.array_agg(attribute.attname order by attribute.attnum)::text
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.church_giving_report_result'::regclass
     and attribute.attnum > 0
     and not attribute.attisdropped),
  '{church_id,church_timezone,report_period,report_as_of_date,period_start_date,period_end_date,currency_summaries,trend_points,fund_summaries,gift_type_summaries}',
  'report envelope contains only tenant, period, and aggregate dimensions'
);
select extensions.is(
  (select pg_catalog.count(*)
   from pg_catalog.pg_attribute attribute
   where attribute.attrelid in (
       'public.church_giving_report_currency_summary'::regclass,
       'public.church_giving_report_trend_point'::regclass,
       'public.church_giving_report_fund_summary'::regclass,
       'public.church_giving_report_gift_type_summary'::regclass,
       'public.church_giving_report_result'::regclass
     )
     and attribute.attname in (
       'transaction_id', 'donation_id', 'donor_id', 'donor_name',
       'donor_email', 'donor_message', 'payment_method_brand',
       'payment_method_last4', 'provider_payment_reference',
       'provider_charge_reference', 'provider_subscription_reference',
       'failure_code', 'failure_message', 'prayer_request_id',
       'recurring_gift_id', 'recurring_status'
     )),
  0::bigint,
  'aggregate contracts expose no donor, payment, provider, prayer, or row identity'
);
select extensions.ok(
  pg_catalog.to_regprocedure(
    'public.get_church_giving_report(uuid,public.church_report_period,date)'
  ) is not null,
  'giving-report RPC has the exact reviewed signature'
);
select extensions.is(
  (select procedure_entry.provolatile::text
   from pg_catalog.pg_proc procedure_entry
   where procedure_entry.oid =
     'public.get_church_giving_report(uuid,public.church_report_period,date)'::regprocedure),
  's',
  'read-only giving report is stable'
);
select extensions.is(
  (select procedure_entry.prosecdef
   from pg_catalog.pg_proc procedure_entry
   where procedure_entry.oid =
     'public.get_church_giving_report(uuid,public.church_report_period,date)'::regprocedure),
  true,
  'giving report is security definer'
);
select extensions.ok(
  (select procedure_entry.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc procedure_entry
   where procedure_entry.oid =
     'public.get_church_giving_report(uuid,public.church_report_period,date)'::regprocedure),
  'security-definer report pins an empty search path'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.get_church_giving_report(uuid,public.church_report_period,date)',
    'EXECUTE'
  ),
  true,
  'authenticated callers may execute the guarded report RPC'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.get_church_giving_report(uuid,public.church_report_period,date)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot execute the report RPC'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.get_church_giving_report(uuid,public.church_report_period,date)',
    'EXECUTE'
  ),
  false,
  'service role cannot bypass the authenticated report boundary'
);
select extensions.is(
  has_type_privilege(
    'authenticated', 'public.church_giving_report_currency_summary', 'USAGE'
  )
  and has_type_privilege(
    'authenticated', 'public.church_giving_report_trend_point', 'USAGE'
  )
  and has_type_privilege(
    'authenticated', 'public.church_giving_report_fund_summary', 'USAGE'
  )
  and has_type_privilege(
    'authenticated', 'public.church_giving_report_gift_type_summary', 'USAGE'
  )
  and has_type_privilege(
    'authenticated', 'public.church_giving_report_result', 'USAGE'
  ),
  true,
  'authenticated callers may use every aggregate result type'
);
select extensions.is(
  has_type_privilege(
    'anon', 'public.church_giving_report_currency_summary', 'USAGE'
  )
  or has_type_privilege(
    'anon', 'public.church_giving_report_trend_point', 'USAGE'
  )
  or has_type_privilege(
    'anon', 'public.church_giving_report_fund_summary', 'USAGE'
  )
  or has_type_privilege(
    'anon', 'public.church_giving_report_gift_type_summary', 'USAGE'
  )
  or has_type_privilege(
    'anon', 'public.church_giving_report_result', 'USAGE'
  ),
  false,
  'anonymous callers cannot use any aggregate result type'
);
select extensions.is(
  has_type_privilege(
    'service_role', 'public.church_giving_report_currency_summary', 'USAGE'
  )
  or has_type_privilege(
    'service_role', 'public.church_giving_report_trend_point', 'USAGE'
  )
  or has_type_privilege(
    'service_role', 'public.church_giving_report_fund_summary', 'USAGE'
  )
  or has_type_privilege(
    'service_role', 'public.church_giving_report_gift_type_summary', 'USAGE'
  )
  or has_type_privilege(
    'service_role', 'public.church_giving_report_result', 'USAGE'
  ),
  false,
  'service role cannot use any aggregate result type'
);
select extensions.has_index(
  'public', 'donations', 'donations_church_report_cursor_idx',
  'giving reports reuse the reviewed tenant donated-at index'
);
select extensions.ok(
  pg_catalog.pg_get_indexdef('public.donations_church_report_cursor_idx'::regclass)
    like '%(church_id, donated_at DESC, id DESC)%',
  'reused index leads with tenant then descending donated-at cursor'
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
  'reused partial index contains only timestamped post-capture states'
);

-- Rollback-only active, onboarding, inactive, and two-tenant fixture.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('f4010000-0000-4000-8000-000000000001',
    'owner-p22-hosted@example.test', now(),
    '{"display_name":"P22 Hosted Owner"}'),
  ('f4010000-0000-4000-8000-000000000002',
    'finance-p22-hosted@example.test', now(),
    '{"display_name":"P22 Hosted Finance"}'),
  ('f4010000-0000-4000-8000-000000000003',
    'accountant-p22-hosted@example.test', now(),
    '{"display_name":"P22 Hosted Accountant"}'),
  ('f4010000-0000-4000-8000-000000000004',
    'staff-p22-hosted@example.test', now(),
    '{"display_name":"P22 Hosted Staff"}'),
  ('f4010000-0000-4000-8000-000000000005',
    'inactive-p22-hosted@example.test', now(),
    '{"display_name":"P22 Hosted Inactive"}'),
  ('f4010000-0000-4000-8000-000000000006',
    'other-p22-hosted@example.test', now(),
    '{"display_name":"P22 Hosted Other"}');

update public.profiles
set is_active = false
where id = 'f4010000-0000-4000-8000-000000000005';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at, suspended_at
) values
  ('f4020000-0000-4000-8000-000000000001', 'P22 Hosted Primary',
    'P22 Hosted Primary Inc.', 'p22-hosted-primary', 'active', 'BBD',
    'America/Barbados', 'primary-p22-hosted@example.test',
    statement_timestamp(), null),
  ('f4020000-0000-4000-8000-000000000002', 'P22 Hosted Other',
    'P22 Hosted Other Inc.', 'p22-hosted-other', 'active', 'USD', 'UTC',
    'other-p22-hosted@example.test', statement_timestamp(), null),
  ('f4020000-0000-4000-8000-000000000003', 'P22 Hosted Onboarding',
    'P22 Hosted Onboarding Inc.', 'p22-hosted-onboarding', 'onboarding',
    'BBD', 'America/Barbados', 'onboarding-p22-hosted@example.test',
    null, null),
  ('f4020000-0000-4000-8000-000000000004', 'P22 Hosted Suspended',
    'P22 Hosted Suspended Inc.', 'p22-hosted-suspended', 'suspended',
    'BBD', 'America/Barbados', 'suspended-p22-hosted@example.test',
    statement_timestamp(), statement_timestamp());

insert into public.church_memberships (church_id, user_id, role, status)
values
  ('f4020000-0000-4000-8000-000000000001',
    'f4010000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('f4020000-0000-4000-8000-000000000001',
    'f4010000-0000-4000-8000-000000000002', 'finance_admin', 'active'),
  ('f4020000-0000-4000-8000-000000000001',
    'f4010000-0000-4000-8000-000000000003', 'accountant', 'active'),
  ('f4020000-0000-4000-8000-000000000001',
    'f4010000-0000-4000-8000-000000000004', 'staff', 'active'),
  ('f4020000-0000-4000-8000-000000000001',
    'f4010000-0000-4000-8000-000000000005', 'owner', 'active'),
  ('f4020000-0000-4000-8000-000000000002',
    'f4010000-0000-4000-8000-000000000006', 'owner', 'active'),
  ('f4020000-0000-4000-8000-000000000003',
    'f4010000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('f4020000-0000-4000-8000-000000000004',
    'f4010000-0000-4000-8000-000000000001', 'owner', 'active');

update public.funds
set id = 'f4030000-0000-4000-8000-000000000002'
where church_id = 'f4020000-0000-4000-8000-000000000001'
  and is_default;

update public.funds
set id = 'f4030000-0000-4000-8000-000000000003'
where church_id = 'f4020000-0000-4000-8000-000000000002'
  and is_default;

insert into public.funds (
  id, church_id, name, slug, status, is_default, sort_order
) values (
  'f4030000-0000-4000-8000-000000000001',
  'f4020000-0000-4000-8000-000000000001',
  'Missions', 'missions-p22-hosted', 'active', false, 1
);

insert into public.donors (id, church_id, display_name, email, is_anonymous)
values (
  'f4040000-0000-4000-8000-000000000001',
  'f4020000-0000-4000-8000-000000000001',
  'Private Donor', 'private-p22-hosted@example.test', false
);

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status, is_primary,
  charges_enabled, recurring_enabled, payouts_enabled, supported_currencies,
  capabilities
) values (
  'f4050000-0000-4000-8000-000000000001',
  'f4020000-0000-4000-8000-000000000001',
  'mock-development-gateway', 'p22-hosted-primary', 'active', true, true,
  true, true, array['BBD', 'USD'],
  '{"environment":"development","settlement_mode":"direct_to_church"}'
);

insert into public.recurring_gifts (
  id, church_id, donor_id, fund_id, payment_connection_id, amount_minor,
  currency, frequency, status, provider_subscription_reference,
  payment_method_brand, payment_method_last4, started_at, canceled_at
) values (
  'f4060000-0000-4000-8000-000000000001',
  'f4020000-0000-4000-8000-000000000001',
  'f4040000-0000-4000-8000-000000000001',
  'f4030000-0000-4000-8000-000000000001',
  'f4050000-0000-4000-8000-000000000001', 1000, 'BBD', 'weekly',
  'canceled', 'p22-hosted-private-plan', 'Visa', '1111',
  '2026-01-01T00:00:00Z', '2026-09-18T00:00:00Z'
);

insert into public.donations (
  id, church_id, donor_id, fund_id, recurring_gift_id,
  payment_connection_id, source, status, amount_minor, currency,
  processing_fee_minor, refunded_amount_minor, donor_display_name,
  donor_email, donor_message, external_idempotency_key, donated_at,
  failed_at, refunded_at, created_at, updated_at
) values
  -- Exact Barbados-local last-seven-days start; canceled plan stays historical.
  ('f4070000-0000-4000-8000-000000000001',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000001',
    'f4060000-0000-4000-8000-000000000001',
    'f4050000-0000-4000-8000-000000000001', 'online', 'succeeded',
    1000, 'BBD', 100, 0, 'Private Donor',
    'private-p22-hosted@example.test', 'never expose this private note',
    'p22-hosted-week-boundary', '2026-09-13T04:00:00Z', null, null,
    '2025-01-01T00:00:00Z', '2026-09-13T04:00:00Z'),
  ('f4070000-0000-4000-8000-000000000002',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000001', null, null, 'cash',
    'partially_refunded', 2000, 'BBD', 100, 500, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-15T12:00:00Z', null, '2026-09-18T12:00:00Z',
    '2026-09-15T12:00:00Z', '2026-09-18T12:00:00Z'),
  ('f4070000-0000-4000-8000-000000000003',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'refunded', 3000, 'BBD', 100, 3000, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-16T12:00:00Z', null, '2026-09-18T13:00:00Z',
    '2026-09-16T12:00:00Z', '2026-09-18T13:00:00Z'),
  ('f4070000-0000-4000-8000-000000000004',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'disputed', 4000, 'USD', 200, 0, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-18T12:00:00Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  ('f4070000-0000-4000-8000-000000000005',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'succeeded', 5000, 'BBD', 100, 0, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-05T12:00:00Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  -- One second before the local week boundary, still inside September.
  ('f4070000-0000-4000-8000-000000000006',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'succeeded', 5500, 'BBD', 100, 0, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-13T03:59:59Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  -- One second before the local month boundary, still inside 2026.
  ('f4070000-0000-4000-8000-000000000007',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'succeeded', 6000, 'BBD', 100, 0, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-01T03:59:59Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  -- One second before the local year boundary, full-history only.
  ('f4070000-0000-4000-8000-000000000008',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'succeeded', 7000, 'BBD', 100, 0, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-01-01T03:59:59Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
  -- Exact local end boundary is excluded.
  ('f4070000-0000-4000-8000-000000000009',
    'f4020000-0000-4000-8000-000000000001',
    'f4040000-0000-4000-8000-000000000001',
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'succeeded', 8000, 'BBD', 100, 0, 'Private Donor',
    'private-p22-hosted@example.test', null, null,
    '2026-09-20T04:00:00Z', null, null,
    '2026-09-20T04:00:00Z', '2026-09-20T04:00:00Z'),
  -- Attempt states are present but must never affect any aggregate.
  ('f4070000-0000-4000-8000-000000000010',
    'f4020000-0000-4000-8000-000000000001', null,
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'pending', 9000, 'BBD', 0, 0, 'Pending Secret',
    'pending-p22-hosted@example.test', null, null,
    '2026-09-18T14:00:00Z', null, null,
    '2026-09-18T14:00:00Z', '2026-09-18T14:00:00Z'),
  ('f4070000-0000-4000-8000-000000000011',
    'f4020000-0000-4000-8000-000000000001', null,
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'processing', 9100, 'BBD', 0, 0, 'Processing Secret',
    'processing-p22-hosted@example.test', null, null,
    '2026-09-18T15:00:00Z', null, null,
    '2026-09-18T15:00:00Z', '2026-09-18T15:00:00Z'),
  ('f4070000-0000-4000-8000-000000000012',
    'f4020000-0000-4000-8000-000000000001', null,
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'failed', 9200, 'BBD', 0, 0, 'Failed Secret',
    'failed-p22-hosted@example.test', null, null,
    '2026-09-18T16:00:00Z', '2026-09-18T16:00:00Z', null,
    '2026-09-18T16:00:00Z', '2026-09-18T16:00:00Z'),
  ('f4070000-0000-4000-8000-000000000013',
    'f4020000-0000-4000-8000-000000000001', null,
    'f4030000-0000-4000-8000-000000000002', null, null, 'cash',
    'canceled', 9300, 'BBD', 0, 0, 'Canceled Secret',
    'canceled-p22-hosted@example.test', null, null,
    '2026-09-18T17:00:00Z', null, null,
    '2026-09-18T17:00:00Z', '2026-09-18T17:00:00Z'),
  -- Captured second-tenant amount must never enter the primary aggregates.
  ('f4070000-0000-4000-8000-000000000014',
    'f4020000-0000-4000-8000-000000000002', null,
    'f4030000-0000-4000-8000-000000000003', null, null, 'cash',
    'succeeded', 999999, 'USD', 0, 0, 'Other Tenant Secret',
    'other-secret-p22-hosted@example.test', 'cross tenant secret', null,
    '2026-09-18T12:00:00Z', null, null,
    '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z');

create temporary table p22_report_results (
  result_name text primary key,
  report_result public.church_giving_report_result not null
) on commit drop;

grant select, insert on table p22_report_results to authenticated;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000001';
set local role authenticated;
insert into p22_report_results values
  ('owner_last_7_days', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000001',
    'last_7_days', '2026-09-19'
  )),
  ('owner_month', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000001',
    'month', '2026-09-19'
  )),
  ('owner_year', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000001',
    'year', '2026-09-19'
  )),
  ('owner_all', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000001',
    'all', '2026-09-19'
  )),
  ('owner_onboarding', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000003',
    'all', '2026-09-19'
  ));
reset role;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000002';
set local role authenticated;
insert into p22_report_results values (
  'finance_all', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000001',
    'all', '2026-09-19'
  )
);
reset role;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000003';
set local role authenticated;
insert into p22_report_results values (
  'accountant_all', public.get_church_giving_report(
    'f4020000-0000-4000-8000-000000000001',
    'all', '2026-09-19'
  )
);
reset role;

-- Exact period, currency, trend, fund, and gift-type aggregates (25-45).
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'church_id', (report_result).church_id,
     'timezone', (report_result).church_timezone,
     'period', (report_result).report_period,
     'as_of', (report_result).report_as_of_date,
     'start', (report_result).period_start_date,
     'end', (report_result).period_end_date
   )
   from p22_report_results where result_name = 'owner_last_7_days'),
  '{"as_of":"2026-09-19","church_id":"f4020000-0000-4000-8000-000000000001","end":"2026-09-19","period":"last_7_days","start":"2026-09-13","timezone":"America/Barbados"}'::jsonb,
  'active church last-seven-days metadata uses Barbados-local dates'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'owner_last_7_days'),
  '[{"currency":"BBD","gift_count":"3","gross_amount_minor":"6000","processing_fee_minor":"300","recorded_net_amount_minor":"2200","refunded_amount_minor":"3500"},{"currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'last-seven-days totals keep BBD and USD separate with exact signed math'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'period', (report_result).report_period,
     'start', (report_result).period_start_date,
     'end', (report_result).period_end_date
   )
   from p22_report_results where result_name = 'owner_month'),
  '{"end":"2026-09-19","period":"month","start":"2026-09-01"}'::jsonb,
  'month report uses the church-local calendar-month boundary'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'owner_month'),
  '[{"currency":"BBD","gift_count":"5","gross_amount_minor":"16500","processing_fee_minor":"500","recorded_net_amount_minor":"12500","refunded_amount_minor":"3500"},{"currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'month totals exclude the gift one second before the local month boundary'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'period', (report_result).report_period,
     'start', (report_result).period_start_date,
     'end', (report_result).period_end_date
   )
   from p22_report_results where result_name = 'owner_year'),
  '{"end":"2026-09-19","period":"year","start":"2026-01-01"}'::jsonb,
  'year report uses the church-local calendar-year boundary'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'owner_year'),
  '[{"currency":"BBD","gift_count":"6","gross_amount_minor":"22500","processing_fee_minor":"600","recorded_net_amount_minor":"18400","refunded_amount_minor":"3500"},{"currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'year totals exclude the gift one second before the local year boundary'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'period', (report_result).report_period,
     'has_start', (report_result).period_start_date is not null,
     'end', (report_result).period_end_date
   )
   from p22_report_results where result_name = 'owner_all'),
  '{"end":"2026-09-19","has_start":false,"period":"all"}'::jsonb,
  'full history has no lower bound and still uses the local as-of end'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'owner_all'),
  '[{"currency":"BBD","gift_count":"7","gross_amount_minor":"29500","processing_fee_minor":"700","recorded_net_amount_minor":"25300","refunded_amount_minor":"3500"},{"currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'full-history totals exclude end-boundary, attempt-state, and other-tenant gifts'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).trend_points)
   from p22_report_results where result_name = 'owner_last_7_days'),
  '[{"bucket_start":"2026-09-13","currency":"BBD","gift_count":"1","gross_amount_minor":"1000","processing_fee_minor":"100","recorded_net_amount_minor":"900","refunded_amount_minor":"0"},{"bucket_start":"2026-09-15","currency":"BBD","gift_count":"1","gross_amount_minor":"2000","processing_fee_minor":"100","recorded_net_amount_minor":"1400","refunded_amount_minor":"500"},{"bucket_start":"2026-09-16","currency":"BBD","gift_count":"1","gross_amount_minor":"3000","processing_fee_minor":"100","recorded_net_amount_minor":"-100","refunded_amount_minor":"3000"},{"bucket_start":"2026-09-18","currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'last-seven-days trend uses exact daily local buckets and signed net'
);
select extensions.is(
  (select pg_catalog.array_agg(point.bucket_start order by point.ordinality)
   from p22_report_results result_entry
   cross join lateral unnest((result_entry.report_result).trend_points)
     with ordinality point(
       bucket_start, currency, gross_amount_minor, processing_fee_minor,
       refunded_amount_minor, recorded_net_amount_minor, gift_count,
       ordinality
     )
   where result_entry.result_name = 'owner_month'),
  array[
    '2026-09-05', '2026-09-12', '2026-09-13',
    '2026-09-15', '2026-09-16', '2026-09-18'
  ]::date[],
  'month trend remains daily and follows local donated-at dates'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).trend_points)
   from p22_report_results where result_name = 'owner_year'),
  '[{"bucket_start":"2026-08-01","currency":"BBD","gift_count":"1","gross_amount_minor":"6000","processing_fee_minor":"100","recorded_net_amount_minor":"5900","refunded_amount_minor":"0"},{"bucket_start":"2026-09-01","currency":"BBD","gift_count":"5","gross_amount_minor":"16500","processing_fee_minor":"500","recorded_net_amount_minor":"12500","refunded_amount_minor":"3500"},{"bucket_start":"2026-09-01","currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'year trend switches to exact monthly buckets without combining currencies'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).trend_points)
   from p22_report_results where result_name = 'owner_all'),
  '[{"bucket_start":"2025-12-01","currency":"BBD","gift_count":"1","gross_amount_minor":"7000","processing_fee_minor":"100","recorded_net_amount_minor":"6900","refunded_amount_minor":"0"},{"bucket_start":"2026-08-01","currency":"BBD","gift_count":"1","gross_amount_minor":"6000","processing_fee_minor":"100","recorded_net_amount_minor":"5900","refunded_amount_minor":"0"},{"bucket_start":"2026-09-01","currency":"BBD","gift_count":"5","gross_amount_minor":"16500","processing_fee_minor":"500","recorded_net_amount_minor":"12500","refunded_amount_minor":"3500"},{"bucket_start":"2026-09-01","currency":"USD","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'full-history trend uses stable monthly buckets across local year boundary'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).fund_summaries)
   from p22_report_results where result_name = 'owner_last_7_days'),
  '[{"currency":"BBD","fund_id":"f4030000-0000-4000-8000-000000000001","fund_name":"Missions","gift_count":"2","gross_amount_minor":"3000","processing_fee_minor":"200","recorded_net_amount_minor":"2300","refunded_amount_minor":"500"},{"currency":"BBD","fund_id":"f4030000-0000-4000-8000-000000000002","fund_name":"Tithes","gift_count":"1","gross_amount_minor":"3000","processing_fee_minor":"100","recorded_net_amount_minor":"-100","refunded_amount_minor":"3000"},{"currency":"USD","fund_id":"f4030000-0000-4000-8000-000000000002","fund_name":"Tithes","gift_count":"1","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'fund summaries reconcile exact totals per currency in stable order'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).gift_type_summaries)
   from p22_report_results where result_name = 'owner_last_7_days'),
  '[{"currency":"BBD","gift_count":"2","gift_type":"one_time","gross_amount_minor":"5000","processing_fee_minor":"200","recorded_net_amount_minor":"1300","refunded_amount_minor":"3500"},{"currency":"BBD","gift_count":"1","gift_type":"recurring","gross_amount_minor":"1000","processing_fee_minor":"100","recorded_net_amount_minor":"900","refunded_amount_minor":"0"},{"currency":"USD","gift_count":"1","gift_type":"one_time","gross_amount_minor":"4000","processing_fee_minor":"200","recorded_net_amount_minor":"3800","refunded_amount_minor":"0"}]'::jsonb,
  'gift-type summaries reconcile one-time and recurring history per currency'
);
select extensions.is(
  (select pg_catalog.to_jsonb(summary)
   from p22_report_results result_entry
   cross join lateral unnest(
     (result_entry.report_result).gift_type_summaries
   ) summary
   where result_entry.result_name = 'owner_last_7_days'
     and summary.gift_type = 'recurring'),
  '{"currency":"BBD","gift_count":"1","gift_type":"recurring","gross_amount_minor":"1000","processing_fee_minor":"100","recorded_net_amount_minor":"900","refunded_amount_minor":"0"}'::jsonb,
  'captured recurring history remains after its current plan is canceled'
);
select extensions.ok(
  (select pg_catalog.to_jsonb(report_result)::text !~* (
     'private-p22|never expose|other tenant secret|cross tenant secret|999999'
   )
   from p22_report_results where result_name = 'owner_all'),
  'aggregate report contains no donor, provider-plan, note, or other-tenant data'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'finance_all'),
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'owner_all'),
  'finance administrator receives the authorized exact aggregates'
);
select extensions.is(
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'accountant_all'),
  (select pg_catalog.to_jsonb((report_result).currency_summaries)
   from p22_report_results where result_name = 'owner_all'),
  'accountant receives the authorized exact aggregates'
);
select extensions.is(
  (select pg_catalog.jsonb_build_object(
     'church', (report_result).church_id,
     'timezone', (report_result).church_timezone,
     'currencies', pg_catalog.cardinality(
       (report_result).currency_summaries
     ),
     'trends', pg_catalog.cardinality((report_result).trend_points),
     'funds', pg_catalog.cardinality((report_result).fund_summaries),
     'gift_types', pg_catalog.cardinality(
       (report_result).gift_type_summaries
     )
   )
   from p22_report_results where result_name = 'owner_onboarding'),
  '{"church":"f4020000-0000-4000-8000-000000000003","currencies":0,"funds":0,"gift_types":0,"timezone":"America/Barbados","trends":0}'::jsonb,
  'authorized onboarding church receives typed empty aggregates'
);
select extensions.is(
  (select pg_catalog.count(*)
   from p22_report_results result_entry
   cross join lateral unnest(
     (result_entry.report_result).currency_summaries
   ) summary
   where result_entry.result_name = 'owner_all'
     and summary.currency = 'BBD'
     and summary.gift_count = '7'
     and summary.gross_amount_minor = '29500'
     and summary.processing_fee_minor = '700'
     and summary.refunded_amount_minor = '3500'
     and summary.recorded_net_amount_minor = '25300'),
  1::bigint,
  'all captured states count once while pending, processing, failed, and canceled count zero'
);
select extensions.is(
  (select pg_catalog.count(*)
   from p22_report_results result_entry
   cross join lateral unnest(
     (result_entry.report_result).currency_summaries
   ) summary
   where result_entry.result_name = 'owner_all'
     and summary.currency not in ('BBD', 'USD')),
  0::bigint,
  'only primary-tenant BBD and USD currencies are present'
);

-- Fail-closed authorization and invalid input paths (46-54).
set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_GIVING_REPORT_FORBIDDEN%',
  'staff without financial reporting permissions is denied'
);
reset role;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000005';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_GIVING_REPORT_FORBIDDEN%',
  'inactive reporting identity fails closed'
);
reset role;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000006';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_GIVING_REPORT_FORBIDDEN%',
  'another church owner cannot cross the tenant boundary'
);
reset role;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000004')$$,
  '%CHURCH_GIVING_REPORT_FORBIDDEN%',
  'suspended church is denied while active and onboarding are allowed'
);
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001',
      null,
      '2026-09-19')$$,
  '%CHURCH_GIVING_REPORT_INVALID_PERIOD%',
  'null period fails closed'
);
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001',
      'all',
      '1999-12-31')$$,
  '%CHURCH_GIVING_REPORT_INVALID_AS_OF_DATE%',
  'out-of-range as-of date fails closed'
);
reset role;

set local "request.jwt.claim.sub" = '';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001')$$,
  '%CHURCH_GIVING_REPORT_FORBIDDEN%',
  'authenticated role without a user identity fails closed'
);
reset role;

set local "request.jwt.claim.sub" = '';
set local role anon;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001')$$,
  '%permission denied%',
  'anonymous role cannot invoke the giving-report RPC'
);
reset role;

set local "request.jwt.claim.sub" = 'f4010000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.throws_like(
  $$select public.get_church_giving_report(
      'f4020000-0000-4000-8000-000000000001')$$,
  '%permission denied%',
  'service role cannot invoke the user-authorized giving-report RPC'
);
reset role;

select * from extensions.finish();

rollback;
