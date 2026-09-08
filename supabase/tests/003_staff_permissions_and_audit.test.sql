begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(100);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000801', 'p07-owner@example.test', '{"display_name":"P07 Owner"}'),
  ('00000000-0000-4000-8000-000000000802', 'p07-finance@example.test', '{"display_name":"P07 Finance"}'),
  ('00000000-0000-4000-8000-000000000803', 'p07-accountant@example.test', '{"display_name":"P07 Accountant"}'),
  ('00000000-0000-4000-8000-000000000804', 'p07-staff@example.test', '{"display_name":"P07 Staff"}'),
  ('00000000-0000-4000-8000-000000000805', 'p07-other-owner@example.test', '{"display_name":"P07 Other Owner"}'),
  ('00000000-0000-4000-8000-000000000806', 'p07-onboarding@example.test', '{"display_name":"P07 Onboarding Owner"}'),
  ('00000000-0000-4000-8000-000000000807', 'p07-suspended@example.test', '{"display_name":"P07 Suspended Owner"}'),
  ('00000000-0000-4000-8000-000000000808', 'p07-canceled@example.test', '{"display_name":"P07 Canceled Owner"}'),
  ('00000000-0000-4000-8000-000000000809', 'p07-archived@example.test', '{"display_name":"P07 Archived Owner"}'),
  ('00000000-0000-4000-8000-000000000810', 'p07-disabled@example.test', '{"display_name":"P07 Disabled Owner"}'),
  ('00000000-0000-4000-8000-000000000811', 'p07-revoked@example.test', '{"display_name":"P07 Revoked Owner"}'),
  ('00000000-0000-4000-8000-000000000812', 'p07-support@example.test', '{"display_name":"P07 Support"}'),
  ('00000000-0000-4000-8000-000000000813', 'p07-deleted-actor@example.test', '{"display_name":"P07 Historical Actor"}'),
  ('00000000-0000-4000-8000-000000000814', 'p07-super@example.test', '{"display_name":"P07 Super Admin"}');

update public.profiles
set is_active = false
where id = '00000000-0000-4000-8000-000000000810';

insert into public.platform_admins (user_id, role, is_active)
values
  ('00000000-0000-4000-8000-000000000812', 'support', true),
  ('00000000-0000-4000-8000-000000000814', 'super_admin', true);

insert into public.churches (
  id, name, slug, status, default_currency, activated_at, suspended_at
)
values
  ('00000000-0000-4000-8000-000000000821', 'P07 Hosted Active', 'p07-hosted-active', 'active', 'USD', now(), null),
  ('00000000-0000-4000-8000-000000000822', 'P07 Hosted Other', 'p07-hosted-other', 'active', 'CAD', now(), null),
  ('00000000-0000-4000-8000-000000000823', 'P07 Hosted Onboarding', 'p07-hosted-onboarding', 'onboarding', 'USD', null, null),
  ('00000000-0000-4000-8000-000000000824', 'P07 Hosted Suspended', 'p07-hosted-suspended', 'suspended', 'USD', now(), now()),
  ('00000000-0000-4000-8000-000000000825', 'P07 Hosted Canceled', 'p07-hosted-canceled', 'canceled', 'USD', now(), null),
  ('00000000-0000-4000-8000-000000000826', 'P07 Hosted Archived', 'p07-hosted-archived', 'archived', 'USD', now(), null);

insert into public.church_memberships (
  church_id, user_id, role, status, accepted_at, revoked_at
)
values
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000801', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000802', 'finance_admin', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000803', 'accountant', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000804', 'staff', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000805', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000823', '00000000-0000-4000-8000-000000000806', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000824', '00000000-0000-4000-8000-000000000807', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000825', '00000000-0000-4000-8000-000000000808', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000826', '00000000-0000-4000-8000-000000000809', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000810', 'owner', 'active', now(), null),
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000811', 'owner', 'revoked', now(), now()),
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000813', 'staff', 'active', now(), null);

insert into public.campaigns (
  id, church_id, fund_id, name, slug, status, currency
)
values (
  '00000000-0000-4000-8000-000000000831',
  '00000000-0000-4000-8000-000000000821',
  (
    select id from public.funds
    where church_id = '00000000-0000-4000-8000-000000000821' and is_default
  ),
  'P07 Hosted Campaign',
  'p07-hosted-campaign',
  'active',
  'USD'
);

insert into public.donors (id, church_id, display_name, email)
values
  ('00000000-0000-4000-8000-000000000832', '00000000-0000-4000-8000-000000000821', 'P07 Donor', 'p07-donor@example.test'),
  ('00000000-0000-4000-8000-000000000833', '00000000-0000-4000-8000-000000000822', 'P07 Other Donor', 'p07-other-donor@example.test');

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status
)
values (
  '00000000-0000-4000-8000-000000000834',
  '00000000-0000-4000-8000-000000000821',
  'p07-hosted-provider',
  'p07-hosted-account',
  'active'
);

insert into public.recurring_gifts (
  id, church_id, donor_id, fund_id, payment_connection_id,
  amount_minor, currency, frequency, status,
  provider_subscription_reference, started_at
)
values (
  '00000000-0000-4000-8000-000000000835',
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000832',
  (
    select id from public.funds
    where church_id = '00000000-0000-4000-8000-000000000821' and is_default
  ),
  '00000000-0000-4000-8000-000000000834',
  2500,
  'USD',
  'monthly',
  'active',
  'p07-hosted-subscription',
  now()
);

insert into public.donations (
  id, church_id, donor_id, fund_id, source, status,
  amount_minor, currency, donated_at
)
values
  (
    '00000000-0000-4000-8000-000000000836',
    '00000000-0000-4000-8000-000000000821',
    '00000000-0000-4000-8000-000000000832',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000821' and is_default
    ),
    'cash', 'succeeded', 5000, 'USD', now()
  ),
  (
    '00000000-0000-4000-8000-000000000837',
    '00000000-0000-4000-8000-000000000822',
    '00000000-0000-4000-8000-000000000833',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000822' and is_default
    ),
    'cash', 'succeeded', 6000, 'CAD', now()
  );

insert into public.prayer_requests (
  id, church_id, donation_id, donor_id, body, consented_at
)
values (
  '00000000-0000-4000-8000-000000000838',
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000836',
  '00000000-0000-4000-8000-000000000832',
  'P07 hosted private prayer',
  now()
);

insert into public.receipts (
  id, church_id, donation_id, donor_id, receipt_number,
  status, amount_minor, currency, issued_at
)
values (
  '00000000-0000-4000-8000-000000000839',
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000836',
  '00000000-0000-4000-8000-000000000832',
  'P07-HOSTED-RECEIPT',
  'issued',
  5000,
  'USD',
  now()
);

insert into public.annual_statements (
  id, church_id, donor_id, tax_year, statement_number, status,
  currency, total_amount_minor, period_start, period_end
)
values (
  '00000000-0000-4000-8000-000000000840',
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000832',
  2026,
  'P07-HOSTED-STATEMENT',
  'draft',
  'USD',
  5000,
  '2026-01-01',
  '2026-12-31'
);

insert into public.statement_donations (
  church_id, statement_id, donation_id, donor_id, included_amount_minor
)
values (
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000840',
  '00000000-0000-4000-8000-000000000836',
  '00000000-0000-4000-8000-000000000832',
  5000
);

insert into public.platform_subscriptions (
  church_id, plan_code, amount_minor, currency
)
values
  ('00000000-0000-4000-8000-000000000821', 'p07-hosted-active', 9900, 'USD'),
  ('00000000-0000-4000-8000-000000000822', 'p07-hosted-other', 9900, 'USD');

insert into public.email_events (
  church_id, donor_id, donation_id, template_key, recipient_email
)
values (
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000832',
  '00000000-0000-4000-8000-000000000836',
  'p07-hosted-receipt',
  'p07-donor@example.test'
);

set local role service_role;
do $setup$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000801',
    true
  );
  perform public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'user',
    event_action => 'church_settings_updated',
    event_entity => 'church',
    event_entity_id => '00000000-0000-4000-8000-000000000821',
    event_actor_user_id => '00000000-0000-4000-8000-000000000801',
    event_request_id => 'p07-hosted-seed',
    event_ip_hash => repeat('a', 64),
    event_sanitized_changes => '{"setting_keys":["primary_color"]}'
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000814',
    true
  );
  perform public.append_audit_event(
    target_church_id => null,
    event_actor_type => 'support',
    event_action => 'platform_settings_updated',
    event_entity => 'platform_settings',
    event_actor_user_id => '00000000-0000-4000-8000-000000000814',
    event_request_id => 'p07-hosted-platform-seed',
    event_sanitized_changes => '{"setting_keys":["brand_name"]}'
  );
end;
$setup$;
reset role;

-- Catalog, function, and ACL contract (1-18).
select extensions.ok(
  to_regprocedure('public.get_my_church_permissions(uuid)') is not null,
  'permission-list helper exists'
);
select extensions.ok(
  to_regprocedure('public.has_church_permission(uuid,public.church_permission)') is not null,
  'permission predicate exists'
);
select extensions.ok(
  to_regprocedure('public.append_audit_event(uuid,public.audit_actor_type,public.audit_action,public.audit_entity,text,uuid,text,text,jsonb)') is not null,
  'typed audit writer exists'
);
select extensions.is(
  has_function_privilege('authenticated', 'public.get_my_church_permissions(uuid)', 'EXECUTE'),
  true,
  'authenticated users can resolve their permissions'
);
select extensions.is(
  has_function_privilege('anon', 'public.get_my_church_permissions(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot resolve church permissions'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.append_audit_event(uuid,public.audit_actor_type,public.audit_action,public.audit_entity,text,uuid,text,text,jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot invoke the audit writer'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.append_audit_event(uuid,public.audit_actor_type,public.audit_action,public.audit_entity,text,uuid,text,text,jsonb)',
    'EXECUTE'
  ),
  true,
  'service role can invoke the private audit writer'
);
select extensions.is(
  has_type_privilege('authenticated', 'public.audit_action', 'USAGE'),
  false,
  'authenticated clients cannot construct audit action values'
);
select extensions.is(
  has_type_privilege('service_role', 'public.audit_action', 'USAGE'),
  true,
  'service role can use the typed audit action catalog'
);
select extensions.is(
  has_type_privilege('authenticated', 'public.audit_actor_type', 'USAGE'),
  false,
  'authenticated clients cannot construct audit actor values'
);
select extensions.is(
  has_type_privilege('service_role', 'public.audit_actor_type', 'USAGE'),
  true,
  'service role can use the typed audit actor catalog'
);
select extensions.is(
  has_type_privilege('authenticated', 'public.audit_entity', 'USAGE'),
  false,
  'authenticated clients cannot construct audit entity values'
);
select extensions.is(
  has_type_privilege('service_role', 'public.audit_entity', 'USAGE'),
  true,
  'service role can use the typed audit entity catalog'
);
select extensions.is(
  has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE'),
  false,
  'service role cannot advance the audit sequence directly'
);
select extensions.is(
  has_table_privilege('service_role', 'public.audit_logs', 'INSERT'),
  false,
  'service role cannot bypass the typed audit writer with direct inserts'
);
select extensions.is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.audit_logs'::regclass
      and conname = 'audit_logs_actor_user_id_fkey'
  ),
  0::bigint,
  'audit actor UUID is an immutable snapshot without a lifecycle foreign key'
);
select extensions.is(
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.audit_logs'::regclass
      and tgname = 'audit_logs_capture_actor_snapshot'
      and not tgisinternal
  ),
  1::bigint,
  'actor snapshot trigger exists'
);
select extensions.is(
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.audit_logs'::regclass
      and tgname = 'audit_logs_append_only'
      and not tgisinternal
  ),
  1::bigint,
  'append-only trigger remains installed'
);
select extensions.is(
  (
    select count(*)
    from pg_enum enum_value
    join pg_type enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'audit_action'
      and enum_value.enumlabel = 'refund'
  ),
  0::bigint,
  'refund is absent from the approved audit action catalog'
);
select extensions.is(
  (
    select count(*)
    from pg_enum enum_value
    join pg_type enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace namespace on namespace.oid = enum_type.typnamespace
    where namespace.nspname = 'public'
      and enum_type.typname = 'audit_action'
      and enum_value.enumlabel = 'statement_published'
  ),
  0::bigint,
  'statement lifecycle actions are absent pending approval'
);
select extensions.is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname like '%permission%'
      and coalesce(qual, '') like '%has_church_role%'
  ),
  0::bigint,
  'permission policies no longer use broad role-list checks'
);
select extensions.is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'churches_workspace_read',
        'funds_permission_read',
        'campaigns_permission_read',
        'donors_permission_read',
        'payment_connections_permission_read',
        'recurring_gifts_permission_read',
        'donations_permission_read',
        'prayer_requests_permission_read',
        'receipts_permission_read',
        'annual_statements_permission_read',
        'statement_donations_permission_read',
        'platform_subscriptions_permission_read',
        'qr_links_permission_read',
        'email_events_permission_read',
        'audit_logs_permission_read'
      )
      and cmd = 'SELECT'
  ),
  15::bigint,
  'all fifteen P07 policies are read-only'
);

-- Exact role matrix (19-22).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
set local role authenticated;
select extensions.is(
  public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text,
  '{workspace_read,funds_read,funds_manage,campaigns_read,campaigns_manage,qr_read,settings_manage,staff_manage,provider_manage,audit_read,billing_manage,financial_read,members_read,reports_read,reports_export,receipts_read,statements_read,provider_status_read,email_status_read,prayer_requests_review}'::text,
  'owner receives the complete conservative permission set'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000802';
set local role authenticated;
select extensions.is(
  public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text,
  '{workspace_read,funds_read,campaigns_read,qr_read,financial_read,members_read,reports_read,reports_export,receipts_read,statements_read,provider_status_read,email_status_read}'::text,
  'finance administrator receives finance and provider-status reads'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000803';
set local role authenticated;
select extensions.is(
  public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text,
  '{workspace_read,funds_read,campaigns_read,qr_read,financial_read,members_read,reports_read,reports_export,receipts_read,statements_read}'::text,
  'accountant receives reporting reads without provider status'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000804';
set local role authenticated;
select extensions.is(
  public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text,
  '{workspace_read,funds_read,campaigns_read,qr_read}'::text,
  'staff receives basic workspace reads only'
);
reset role;

-- Named predicates, onboarding, and fail-closed states (23-39).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
set local role authenticated;
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'funds_manage'), true, 'owner can manage funds');
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'campaigns_manage'), true, 'owner can manage campaigns');
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000822', 'workspace_read'), false, 'owner cannot cross tenant boundaries');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000802';
set local role authenticated;
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'reports_export'), true, 'finance administrator can export reports');
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'prayer_requests_review'), false, 'finance administrator cannot review prayers');
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'staff_manage'), false, 'finance administrator cannot manage staff');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000803';
set local role authenticated;
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'statements_read'), true, 'accountant can read statements');
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'provider_status_read'), false, 'accountant cannot read provider status');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000804';
set local role authenticated;
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'prayer_requests_review'), false, 'staff cannot review prayer requests');
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'financial_read'), false, 'staff cannot read financial records');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000812';
set local role authenticated;
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000821', 'workspace_read'), false, 'support role has no church permission or impersonation path');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000806';
set local role authenticated;
select extensions.is(public.has_church_permission('00000000-0000-4000-8000-000000000823', 'settings_manage'), true, 'onboarding owner can prepare their church');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000807';
set local role authenticated;
select extensions.is(public.get_my_church_permissions('00000000-0000-4000-8000-000000000824')::text, '{}'::text, 'suspended church fails closed');
select extensions.is(
  (select count(id) from public.church_memberships where user_id = '00000000-0000-4000-8000-000000000807'),
  0::bigint,
  'suspended church hides the caller own membership metadata'
);
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000808';
set local role authenticated;
select extensions.is(public.get_my_church_permissions('00000000-0000-4000-8000-000000000825')::text, '{}'::text, 'canceled church fails closed');
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000809';
set local role authenticated;
select extensions.is(public.get_my_church_permissions('00000000-0000-4000-8000-000000000826')::text, '{}'::text, 'archived church fails closed');
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000810';
set local role authenticated;
select extensions.is(public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text, '{}'::text, 'disabled profile fails closed');
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000811';
set local role authenticated;
select extensions.is(public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text, '{}'::text, 'revoked membership fails closed');
select extensions.is(
  (select count(id) from public.church_memberships where user_id = '00000000-0000-4000-8000-000000000811'),
  1::bigint,
  'revoked member can see their revoked state while the church remains eligible'
);
reset role;

-- RLS role boundaries (40-67).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
set local role authenticated;
select extensions.is((select count(id) from public.churches), 1::bigint, 'owner sees one church');
select extensions.is((select count(id) from public.church_memberships), 1::bigint, 'owner direct membership reads are self-only; staff roster is RPC-only');
select extensions.is((select count(id) from public.donations), 1::bigint, 'owner sees own-church donations');
select extensions.is((select count(id) from public.prayer_requests), 1::bigint, 'owner sees own-church prayer requests');
select extensions.is((select count(id) from public.platform_subscriptions), 1::bigint, 'owner sees own-church billing status');
select extensions.is((select count(id) from public.audit_logs), 1::bigint, 'owner sees own-church audit events but not global events');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000802';
set local role authenticated;
select extensions.is((select count(id) from public.donors), 1::bigint, 'finance administrator sees own-church members');
select extensions.is((select count(id) from public.donations), 1::bigint, 'finance administrator sees own-church finances');
select extensions.is((select count(id) from public.payment_provider_connections), 1::bigint, 'finance administrator sees provider status');
select extensions.is((select count(id) from public.email_events), 1::bigint, 'finance administrator sees email status');
select extensions.is((select count(id) from public.prayer_requests), 0::bigint, 'finance administrator cannot read prayer text');
select extensions.is((select count(id) from public.audit_logs), 0::bigint, 'finance administrator cannot read audit events');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000803';
set local role authenticated;
select extensions.is((select count(id) from public.donations), 1::bigint, 'accountant sees own-church finances');
select extensions.is((select count(id) from public.receipts), 1::bigint, 'accountant sees receipts');
select extensions.is((select count(id) from public.annual_statements), 1::bigint, 'accountant sees statements');
select extensions.is((select count(id) from public.payment_provider_connections), 0::bigint, 'accountant cannot read provider status');
select extensions.is((select count(id) from public.email_events), 0::bigint, 'accountant cannot read email delivery status');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000804';
set local role authenticated;
select extensions.is((select count(id) from public.churches), 1::bigint, 'staff sees the basic church workspace');
select extensions.is((select count(id) from public.funds), 1::bigint, 'staff sees funds');
select extensions.is((select count(id) from public.campaigns), 1::bigint, 'staff sees campaigns');
select extensions.is((select count(church_id) from public.qr_links), 1::bigint, 'staff sees the permanent QR record');
select extensions.is((select count(id) from public.donations), 0::bigint, 'staff cannot read donation rows');
select extensions.is((select count(id) from public.prayer_requests), 0::bigint, 'staff cannot read prayer request text');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000812';
set local role authenticated;
select extensions.is((select count(id) from public.churches), 0::bigint, 'support cannot enter a church workspace');
select extensions.is((select count(id) from public.audit_logs), 0::bigint, 'support cannot read church or global audit events');
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000814';
set local role authenticated;
select extensions.is((select count(id) from public.audit_logs), 0::bigint, 'super admin audit access stays closed pending approved authority');
select extensions.is(public.get_my_church_permissions('00000000-0000-4000-8000-000000000821')::text, '{}'::text, 'platform super admin does not implicitly impersonate church staff');
select extensions.is((select count(id) from public.donations), 0::bigint, 'platform super admin has no finance-policy bypass');
reset role;

-- Explicitly denied sensitive mutations (68-75).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
set local role authenticated;
select extensions.throws_like(
  $$update public.church_memberships set role = 'owner' where user_id = '00000000-0000-4000-8000-000000000804'$$,
  '%permission denied%',
  'owner cannot transfer ownership or change owner roles directly'
);
select extensions.throws_like(
  $$update public.recurring_gifts set status = 'canceled' where id = '00000000-0000-4000-8000-000000000835'$$,
  '%permission denied%',
  'staff-side recurring cancellation remains closed'
);
select extensions.throws_like(
  $$insert into public.donations (church_id, fund_id, source, amount_minor, currency)
    values (
      '00000000-0000-4000-8000-000000000821',
      (select id from public.funds where church_id = '00000000-0000-4000-8000-000000000821' and is_default),
      'cash', 1000, 'USD'
    )$$,
  '%permission denied%',
  'manual gifts remain closed'
);
select extensions.throws_like(
  $$update public.annual_statements set status = 'published' where id = '00000000-0000-4000-8000-000000000840'$$,
  '%permission denied%',
  'statement lifecycle remains closed'
);
select extensions.throws_like(
  $$delete from public.prayer_requests where id = '00000000-0000-4000-8000-000000000838'$$,
  '%permission denied%',
  'prayer deletion remains closed'
);
select extensions.throws_like(
  $$update public.donations
    set status = 'refunded', refunded_amount_minor = amount_minor, refunded_at = now()
    where id = '00000000-0000-4000-8000-000000000836'$$,
  '%permission denied%',
  'refund mutation remains closed'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    '00000000-0000-4000-8000-000000000821', 'user', 'fund_updated', 'fund'
  )$$,
  '%permission denied%',
  'church owner cannot forge audit events'
);
reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000812';
set local role authenticated;
select extensions.throws_like(
  $$update public.donations
    set status = 'refunded', refunded_amount_minor = amount_minor, refunded_at = now()
    where id = '00000000-0000-4000-8000-000000000836'$$,
  '%permission denied%',
  'support has no refund or impersonation path'
);
reset role;

-- Typed audit writer validation (76-83).
set local role service_role;
select extensions.throws_like(
  $$insert into public.audit_logs (church_id, actor_type, action, entity_table)
    values ('00000000-0000-4000-8000-000000000821', 'system', 'forged', 'church')$$,
  '%permission denied%',
  'service role cannot bypass the typed writer'
);
select extensions.throws_like(
  $$select nextval('public.audit_logs_id_seq')$$,
  '%permission denied%',
  'service role cannot advance the audit sequence directly'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'system', event_action => 'fund_updated',
    event_entity => 'campaign'
  )$$,
  '%audit action and entity do not match%',
  'writer rejects mismatched action and entity types'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'system', event_action => 'fund_updated',
    event_entity => 'fund',
    event_sanitized_changes => '{"data":"never"}'
  )$$,
  '%unsafe or invalid%',
  'writer rejects unknown generic audit keys'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'system', event_action => 'church_status_changed',
    event_entity => 'church',
    event_sanitized_changes => '{"reason_code":"sk_live_neverlog"}'
  )$$,
  '%unsafe or invalid%',
  'writer rejects secret-like values in an otherwise allowed field'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'system', event_action => 'fund_updated',
    event_entity => 'fund', event_entity_id => 'sk_live_neverlog'
  )$$,
  '%entity identifier is invalid%',
  'writer rejects secret-like entity identifiers'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'system', event_action => 'fund_updated',
    event_entity => 'fund', event_request_id => 'sk_live_neverlog'
  )$$,
  '%request identifier is invalid%',
  'writer rejects secret-like request identifiers'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => null, event_actor_type => 'system',
    event_action => 'fund_updated', event_entity => 'fund'
  )$$,
  '%requires a church%',
  'church audit event cannot omit its church'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'user', event_action => 'platform_settings_updated',
    event_entity => 'platform_settings',
    event_actor_user_id => '00000000-0000-4000-8000-000000000814'
  )$$,
  '%cannot have a church%',
  'global platform settings event cannot be attached to a church'
);
select extensions.throws_like(
  $$select 'refund'::public.audit_action$$,
  '%invalid input value%',
  'unsupported refund action is not representable'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'system', event_action => 'fund_updated',
    event_entity => 'fund',
    event_actor_user_id => '00000000-0000-4000-8000-000000000801'
  )$$,
  '%cannot carry a user UUID%',
  'system audit actors cannot be confused with user actors'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000822',
    event_actor_type => 'user', event_action => 'church_settings_updated',
    event_entity => 'church',
    event_actor_user_id => '00000000-0000-4000-8000-000000000801',
    event_sanitized_changes => '{"setting_keys":["primary_color"]}'
  )$$,
  '%no active church capacity%',
  'user actor must have active membership in the target church'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000810';
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'user', event_action => 'church_settings_updated',
    event_entity => 'church',
    event_actor_user_id => '00000000-0000-4000-8000-000000000810',
    event_sanitized_changes => '{"setting_keys":["primary_color"]}'
  )$$,
  '%no active church capacity%',
  'disabled profile cannot be recorded as a user actor'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000801';
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => null,
    event_actor_type => 'support', event_action => 'platform_settings_updated',
    event_entity => 'platform_settings',
    event_actor_user_id => '00000000-0000-4000-8000-000000000801',
    event_sanitized_changes => '{"setting_keys":["brand_name"]}'
  )$$,
  '%no active platform capacity%',
  'support actor must have an active platform role'
);
select extensions.throws_like(
  $$select public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'user', event_action => 'church_settings_updated',
    event_entity => 'church',
    event_actor_user_id => '00000000-0000-4000-8000-000000000813',
    event_sanitized_changes => '{"setting_keys":["primary_color"]}'
  )$$,
  '%must match authenticated request identity%',
  'active human actor cannot be impersonated by a different request identity'
);
reset role;

-- Immutable actor snapshot remains stable across a blocked identity deletion (84-87).
set local role service_role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000813';
do $snapshot$
begin
  perform public.append_audit_event(
    target_church_id => '00000000-0000-4000-8000-000000000821',
    event_actor_type => 'user',
    event_action => 'prayer_request_reviewed',
    event_entity => 'prayer_request',
    event_entity_id => '00000000-0000-4000-8000-000000000838',
    event_actor_user_id => '00000000-0000-4000-8000-000000000813',
    event_sanitized_changes => '{"reviewed":true}'
  );
end;
$snapshot$;
reset role;

select extensions.throws_like(
  $$delete from auth.users
    where id = '00000000-0000-4000-8000-000000000813'$$,
  '%church_memberships_user_id_fkey%',
  'Auth identity deletion cannot erase membership history'
);

select extensions.is(
  (
    select actor_user_id
    from public.audit_logs
    where actor_user_id = '00000000-0000-4000-8000-000000000813'
  ),
  '00000000-0000-4000-8000-000000000813'::uuid,
  'blocked Auth deletion does not rewrite the actor UUID snapshot'
);
select extensions.is(
  (
    select actor_display_name_snapshot
    from public.audit_logs
    where actor_user_id = '00000000-0000-4000-8000-000000000813'
  ),
  'P07 Historical Actor'::text,
  'display-name snapshot remains stable after blocked Auth deletion'
);
select extensions.is(
  (
    select actor_role_snapshot
    from public.audit_logs
    where actor_user_id = '00000000-0000-4000-8000-000000000813'
  ),
  'staff'::text,
  'role snapshot remains stable after blocked Auth deletion'
);

select * from extensions.finish();

rollback;
