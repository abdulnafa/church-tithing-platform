begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(51);

-- Schema and privilege contract
select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename = any (array[
        'profiles',
        'platform_admins',
        'churches',
        'church_memberships',
        'funds',
        'campaigns',
        'donors',
        'payment_provider_connections',
        'recurring_gifts',
        'donations',
        'prayer_requests',
        'prayer_request_consent_versions',
        'prayer_request_review_requests',
        'receipts',
        'annual_statements',
        'statement_donations',
        'platform_subscriptions',
        'payment_provider_references',
        'qr_links',
        'webhook_events',
        'email_events',
        'audit_logs'
      ])
  ),
  22::bigint,
  'all 22 baseline and P16-sensitive application tables exist'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'profiles',
        'platform_admins',
        'churches',
        'church_memberships',
        'funds',
        'campaigns',
        'donors',
        'payment_provider_connections',
        'recurring_gifts',
        'donations',
        'prayer_requests',
        'prayer_request_consent_versions',
        'prayer_request_review_requests',
        'receipts',
        'annual_statements',
        'statement_donations',
        'platform_subscriptions',
        'payment_provider_references',
        'qr_links',
        'webhook_events',
        'email_events',
        'audit_logs'
      ])
      and c.relrowsecurity
  ),
  22::bigint,
  'RLS is enabled on every baseline and P16-sensitive application table'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'profiles',
        'platform_admins',
        'churches',
        'church_memberships',
        'funds',
        'campaigns',
        'donors',
        'payment_provider_connections',
        'recurring_gifts',
        'donations',
        'prayer_requests',
        'prayer_request_consent_versions',
        'prayer_request_review_requests',
        'receipts',
        'annual_statements',
        'statement_donations',
        'platform_subscriptions',
        'payment_provider_references',
        'qr_links',
        'webhook_events',
        'email_events',
        'audit_logs'
      ])
      and not c.relrowsecurity
  ),
  0::bigint,
  'no application table is missing RLS'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'on_church_created' and not tgisinternal
  ),
  'church provisioning trigger exists'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'funds_require_one_active_default' and not tgisinternal
  ),
  'deferred default-fund invariant trigger exists'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'qr_links_keep_routing' and not tgisinternal
  ),
  'permanent QR routing trigger exists'
);

select extensions.ok(
  exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'audit_logs_reject_truncate' and not tgisinternal
  ),
  'audit-log truncate guard exists'
);

select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'public.donations', 'INSERT'),
  false,
  'authenticated clients cannot insert donations directly'
);

select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'public.receipts', 'INSERT'),
  false,
  'authenticated clients cannot forge receipts'
);

select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'public.annual_statements', 'INSERT'),
  false,
  'authenticated clients cannot forge annual statements'
);

select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'public.qr_links', 'UPDATE'),
  false,
  'authenticated clients cannot update permanent QR records'
);

select extensions.is(
  pg_catalog.has_table_privilege('authenticated', 'public.qr_links', 'DELETE'),
  false,
  'authenticated clients cannot delete permanent QR records'
);

select extensions.is(
  pg_catalog.has_column_privilege('anon', 'public.churches', 'name', 'SELECT'),
  false,
  'anonymous clients cannot enumerate church names outside the bounded RPCs'
);

select extensions.is(
  pg_catalog.has_column_privilege('anon', 'public.churches', 'created_by', 'SELECT'),
  false,
  'anonymous giving cannot read church attribution IDs'
);

select extensions.is(
  pg_catalog.has_column_privilege('anon', 'public.qr_links', 'short_code', 'SELECT'),
  false,
  'anonymous QR enumeration remains closed until the bounded P17 resolver'
);

select extensions.is(
  pg_catalog.has_column_privilege('anon', 'public.qr_links', 'scan_count', 'SELECT'),
  false,
  'anonymous QR resolution cannot read analytics'
);

select extensions.is(
  pg_catalog.has_table_privilege('service_role', 'public.audit_logs', 'INSERT'),
  false,
  'service role cannot insert audit events outside the typed writer'
);

select extensions.is(
  pg_catalog.has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE'),
  false,
  'service role cannot truncate audit history'
);

select extensions.is(
  pg_catalog.has_table_privilege('service_role', 'public.qr_links', 'DELETE'),
  false,
  'service role cannot delete the permanent QR record'
);

select extensions.is(
  pg_catalog.has_column_privilege(
    'service_role',
    'public.qr_links',
    'scan_count',
    'UPDATE'
  ),
  true,
  'service role can update QR scan analytics'
);

select extensions.is(
  pg_catalog.has_column_privilege(
    'service_role',
    'public.qr_links',
    'short_code',
    'UPDATE'
  ),
  false,
  'service role cannot update permanent QR routing fields'
);

select extensions.is(
  pg_catalog.has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE'),
  false,
  'anonymous clients cannot use the audit sequence'
);

select extensions.is(
  pg_catalog.has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'UPDATE'),
  false,
  'anonymous clients cannot advance the audit sequence'
);

select extensions.is(
  pg_catalog.has_sequence_privilege(
    'authenticated',
    'public.audit_logs_id_seq',
    'USAGE'
  ),
  false,
  'authenticated clients cannot use the audit sequence'
);

select extensions.is(
  pg_catalog.has_sequence_privilege(
    'authenticated',
    'public.audit_logs_id_seq',
    'UPDATE'
  ),
  false,
  'authenticated clients cannot advance the audit sequence'
);

select extensions.is(
  pg_catalog.has_sequence_privilege(
    'service_role',
    'public.audit_logs_id_seq',
    'USAGE'
  ),
  false,
  'service role cannot use the audit sequence directly'
);

select extensions.is(
  pg_catalog.has_sequence_privilege(
    'service_role',
    'public.audit_logs_id_seq',
    'UPDATE'
  ),
  false,
  'service role cannot advance the audit sequence directly'
);

select extensions.is(
  pg_catalog.has_function_privilege(
    'anon',
    'public.is_church_member(uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot execute authenticated RLS helpers'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = any (array[
        'funds_default_must_be_active',
        'recurring_gifts_tenant_identity_key',
        'donations_recurring_identity_tenant_fk',
        'donations_recurring_identity_required',
        'donations_refund_state_consistent',
        'annual_statements_supersedes_donor_tenant_fk'
      ])
  ),
  6::bigint,
  'all hardened financial and identity constraints exist'
);

-- Provisioning and representative integrity behavior
insert into public.churches (id, name, slug, default_currency)
values (
  '00000000-0000-4000-8000-000000000201',
  'P02 Contract Church',
  'p02-contract-church',
  'BBD'
);

select extensions.is(
  (
    select count(*) from public.funds
    where church_id = '00000000-0000-4000-8000-000000000201'
      and name = 'Tithes'
      and slug = 'tithes'
  ),
  1::bigint,
  'church provisioning creates exactly one Tithes fund'
);

select extensions.ok(
  (
    select is_default and status = 'active'
    from public.funds
    where church_id = '00000000-0000-4000-8000-000000000201'
      and slug = 'tithes'
  ),
  'provisioned Tithes fund is the active default'
);

select extensions.is(
  (
    select count(*) from public.qr_links
    where church_id = '00000000-0000-4000-8000-000000000201'
  ),
  1::bigint,
  'church provisioning creates exactly one permanent QR record'
);

select extensions.ok(
  (
    select kind = 'church' and fund_id is null and campaign_id is null
    from public.qr_links
    where church_id = '00000000-0000-4000-8000-000000000201'
  ),
  'provisioned QR resolves to the church giving homepage'
);

select extensions.ok(
  (
    select short_code = lower(short_code)
      and char_length(short_code) between 8 and 64
      and short_code ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
    from public.qr_links
    where church_id = '00000000-0000-4000-8000-000000000201'
  ),
  'provisioned QR short code is lowercase and URL-safe'
);

select extensions.throws_like(
  $$
    insert into public.qr_links (church_id, kind)
    values ('00000000-0000-4000-8000-000000000201', 'church')
  $$,
  '%qr_links_one_church_code_idx%',
  'a church cannot receive a second permanent QR record'
);

insert into public.churches (id, name, slug)
values (
  '00000000-0000-4000-8000-000000000205',
  'P02 Empty Contract Church',
  'p02-empty-contract-church'
);

select extensions.throws_ok(
  $$
    do $test$
    begin
      delete from public.funds
      where church_id = '00000000-0000-4000-8000-000000000205'
        and is_default;
      set constraints funds_require_one_active_default immediate;
    end;
    $test$
  $$,
  'P0001',
  'church must have exactly one active default fund',
  'a church cannot lose its only active default fund'
);

select extensions.throws_ok(
  $$
    do $test$
    begin
      delete from public.qr_links
      where church_id = '00000000-0000-4000-8000-000000000205';
      set constraints qr_links_require_one_per_church immediate;
    end;
    $test$
  $$,
  'P0001',
  'church must have exactly one permanent QR link',
  'a church cannot lose its permanent QR record'
);

select extensions.throws_like(
  $$
    insert into public.funds (church_id, name, slug, status, is_default)
    values (
      '00000000-0000-4000-8000-000000000201',
      'Another default',
      'another-default',
      'active',
      true
    )
  $$,
  '%funds_one_default_idx%',
  'a church cannot have two active default funds'
);

insert into public.churches (id, name, slug)
values (
  '00000000-0000-4000-8000-000000000202',
  'P02 Other Church',
  'p02-other-church'
);

select extensions.throws_like(
  $$
    insert into public.campaigns (
      church_id,
      fund_id,
      name,
      slug,
      currency
    ) values (
      '00000000-0000-4000-8000-000000000201',
      (
        select id from public.funds
        where church_id = '00000000-0000-4000-8000-000000000202'
          and is_default
      ),
      'Cross-tenant campaign',
      'cross-tenant-campaign',
      'BBD'
    )
  $$,
  '%CAMPAIGN_ROUTE_INVALID%',
  'cross-tenant campaign-to-fund references are rejected by the final route guard'
);

insert into public.donations (
  id,
  church_id,
  fund_id,
  source,
  status,
  amount_minor,
  currency,
  processing_fee_minor,
  refunded_amount_minor,
  donated_at
) values (
  '00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-000000000201',
  (
    select id from public.funds
    where church_id = '00000000-0000-4000-8000-000000000201'
      and is_default
  ),
  'cash',
  'succeeded',
  10000,
  'BBD',
  200,
  0,
  now()
);

select extensions.is(
  (
    select net_amount_minor from public.donations
    where id = '00000000-0000-4000-8000-000000000203'
  ),
  9800::bigint,
  'net donation amount is generated from gross, fee, and refund values'
);

insert into public.payment_provider_connections (
  id,
  church_id,
  provider,
  external_account_reference
) values (
  '00000000-0000-4000-8000-000000000204',
  '00000000-0000-4000-8000-000000000201',
  'p02-test-provider',
  'p02-test-account'
);

select extensions.throws_like(
  $$
    insert into public.donations (
      church_id,
      fund_id,
      payment_connection_id,
      source,
      amount_minor,
      currency
    ) values (
      '00000000-0000-4000-8000-000000000201',
      (
        select id from public.funds
        where church_id = '00000000-0000-4000-8000-000000000201'
          and is_default
      ),
      '00000000-0000-4000-8000-000000000204',
      'online',
      1000,
      'BBD'
    )
  $$,
  '%donations_online_idempotency_required%',
  'online donations require a nonblank idempotency key'
);

insert into public.donations (
  id,
  church_id,
  fund_id,
  payment_connection_id,
  source,
  amount_minor,
  currency,
  external_idempotency_key
) values (
  '00000000-0000-4000-8000-000000000206',
  '00000000-0000-4000-8000-000000000201',
  (
    select id from public.funds
    where church_id = '00000000-0000-4000-8000-000000000201'
      and is_default
  ),
  '00000000-0000-4000-8000-000000000204',
  'online',
  1000,
  'BBD',
  'p02-pgtap-online-one'
);

select extensions.is(
  (
    select count(*) from public.donations
    where id = '00000000-0000-4000-8000-000000000206'
      and status = 'pending'
  ),
  1::bigint,
  'a valid idempotent online donation is accepted'
);

select extensions.throws_like(
  $$
    insert into public.donations (
      church_id,
      fund_id,
      payment_connection_id,
      source,
      amount_minor,
      currency,
      external_idempotency_key
    ) values (
      '00000000-0000-4000-8000-000000000201',
      (
        select id from public.funds
        where church_id = '00000000-0000-4000-8000-000000000201'
          and is_default
      ),
      '00000000-0000-4000-8000-000000000204',
      'online',
      1200,
      'BBD',
      'p02-pgtap-online-one'
    )
  $$,
  '%donations_idempotency_unique_idx%',
  'duplicate church idempotency keys are rejected'
);

insert into public.receipts (
  id,
  church_id,
  donation_id,
  receipt_number,
  amount_minor,
  currency
) values (
  '00000000-0000-4000-8000-000000000207',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000203',
  'P02-VALID',
  10000,
  'BBD'
);

select extensions.is(
  (
    select count(*) from public.receipts
    where id = '00000000-0000-4000-8000-000000000207'
  ),
  1::bigint,
  'a receipt matching its successful donation is accepted'
);

select extensions.throws_ok(
  $$
    insert into public.receipts (
      church_id,
      donation_id,
      receipt_number,
      version,
      amount_minor,
      currency
    ) values (
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000203',
      'P02-MISMATCH',
      2,
      9999,
      'BBD'
    )
  $$,
  'P0001',
  'receipt snapshot must match the donation',
  'receipt snapshots cannot change the collected amount'
);

select extensions.throws_ok(
  $$
    update public.donations
    set amount_minor = 9999
    where id = '00000000-0000-4000-8000-000000000203'
  $$,
  'P0001',
  'donation identity and giving snapshot cannot be changed',
  'historical donation amounts cannot be changed'
);

select extensions.throws_ok(
  $$
    update public.qr_links
    set short_code = 'changed-code-123'
    where church_id = '00000000-0000-4000-8000-000000000201'
  $$,
  'P0001',
  'permanent QR routing fields cannot be changed',
  'permanent QR short codes cannot be changed'
);

select extensions.throws_ok(
  $$
    update public.funds
    set church_id = '00000000-0000-4000-8000-000000000202'
    where church_id = '00000000-0000-4000-8000-000000000201'
      and is_default
  $$,
  'P0001',
  'church_id cannot be changed',
  'tenant-owned records cannot move between churches'
);

insert into public.audit_logs (
  church_id,
  actor_type,
  action,
  entity_table,
  entity_id
) values (
  '00000000-0000-4000-8000-000000000201',
  'system',
  'p02.contract.created',
  'churches',
  '00000000-0000-4000-8000-000000000201'
);

select extensions.throws_ok(
  $$update public.audit_logs set action = 'p02.changed'$$,
  'P0001',
  'audit_logs is append-only',
  'audit events cannot be updated'
);

select extensions.throws_ok(
  $$delete from public.audit_logs$$,
  'P0001',
  'audit_logs is append-only',
  'audit events cannot be deleted'
);

select extensions.throws_like(
  $$truncate table public.audit_logs$$,
  '%cannot truncate a table referenced in a foreign key constraint%',
  'audit history cannot be truncated while immutable ledgers reference it'
);

select * from extensions.finish();

rollback;
