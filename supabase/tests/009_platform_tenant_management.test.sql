begin;

create extension if not exists pgtap with schema extensions;

select set_config(
  'p13.baseline_total',
  (select count(*)::text from public.churches),
  true
);
select set_config(
  'p13.baseline_onboarding',
  (select count(*)::text from public.churches where status = 'onboarding'),
  true
);
select set_config(
  'p13.baseline_active',
  (select count(*)::text from public.churches where status = 'active'),
  true
);
select set_config(
  'p13.baseline_suspended',
  (select count(*)::text from public.churches where status = 'suspended'),
  true
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('81000000-0000-4000-8000-000000002101', 'super-p13-hosted@example.test', now(), '{"display_name":"P13 Hosted Super"}'),
  ('81000000-0000-4000-8000-000000002102', 'other-super-p13-hosted@example.test', now(), '{"display_name":"Other P13 Hosted Super"}'),
  ('81000000-0000-4000-8000-000000002103', 'support-p13-hosted@example.test', now(), '{"display_name":"P13 Hosted Support"}'),
  ('81000000-0000-4000-8000-000000002104', 'owner-p13-hosted@example.test', now(), '{"display_name":"P13 Hosted Owner"}'),
  ('81000000-0000-4000-8000-000000002105', 'inactive-owner-p13-hosted@example.test', now(), '{"display_name":"Inactive P13 Hosted Owner"}'),
  ('81000000-0000-4000-8000-000000002106', 'unconfirmed-owner-p13-hosted@example.test', null, '{"display_name":"Unconfirmed P13 Hosted Owner"}');

update public.profiles set is_active = false
where id = '81000000-0000-4000-8000-000000002105';

insert into public.platform_admins (user_id, role, is_active)
values
  ('81000000-0000-4000-8000-000000002101', 'super_admin', true),
  ('81000000-0000-4000-8000-000000002102', 'super_admin', true),
  ('81000000-0000-4000-8000-000000002103', 'support', true);

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  primary_color, secondary_color, support_email, activated_at,
  suspended_at, created_at, updated_at
) values
  (
    '82000000-0000-4000-8000-000000002101', 'P13 Ready Church',
    'P13 Ready Church Inc.', 'p13-hosted-ready', 'onboarding', 'BBD',
    'America/Barbados', null, null, 'ready-p13-hosted@example.test',
    null, null, transaction_timestamp() - interval '5 seconds',
    transaction_timestamp() - interval '5 seconds'
  ),
  (
    '82000000-0000-4000-8000-000000002102', 'P13 Incomplete Church',
    null, 'p13-hosted-incomplete', 'onboarding', 'BBD',
    'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '4 seconds',
    transaction_timestamp() - interval '4 seconds'
  ),
  (
    '82000000-0000-4000-8000-000000002103', 'P13 Active Church',
    'P13 Active Church Inc.', 'p13-hosted-active', 'active', 'BBD',
    'America/Barbados', null, null, 'active-p13-hosted@example.test',
    transaction_timestamp() - interval '3 seconds', null,
    transaction_timestamp() - interval '3 seconds',
    transaction_timestamp() - interval '3 seconds'
  ),
  (
    '82000000-0000-4000-8000-000000002104', 'P13 Suspended Church',
    'P13 Suspended Church Inc.', 'p13-hosted-suspended', 'suspended', 'BBD',
    'America/Barbados', null, null, 'suspended-p13-hosted@example.test',
    transaction_timestamp() - interval '2 seconds',
    transaction_timestamp() - interval '1 second',
    transaction_timestamp() - interval '2 seconds',
    transaction_timestamp() - interval '1 second'
  ),
  (
    '82000000-0000-4000-8000-000000002105', E'Bad\001Name',
    'P13 Malformed Church Inc.', 'p13-hosted-malformed', 'onboarding', 'EUR',
    E'Bad\001Zone', null, null, 'malformed-p13-hosted@example.test', null,
    null, transaction_timestamp() - interval '1 second',
    transaction_timestamp() - interval '1 second'
  );

insert into public.church_memberships (
  id, church_id, user_id, role, status
) values
  ('83000000-0000-4000-8000-000000002101', '82000000-0000-4000-8000-000000002101', '81000000-0000-4000-8000-000000002104', 'owner', 'active'),
  ('83000000-0000-4000-8000-000000002102', '82000000-0000-4000-8000-000000002103', '81000000-0000-4000-8000-000000002104', 'owner', 'active'),
  ('83000000-0000-4000-8000-000000002103', '82000000-0000-4000-8000-000000002104', '81000000-0000-4000-8000-000000002104', 'owner', 'active'),
  ('83000000-0000-4000-8000-000000002104', '82000000-0000-4000-8000-000000002105', '81000000-0000-4000-8000-000000002104', 'owner', 'active'),
  ('83000000-0000-4000-8000-000000002105', '82000000-0000-4000-8000-000000002102', '81000000-0000-4000-8000-000000002105', 'owner', 'active'),
  ('83000000-0000-4000-8000-000000002106', '82000000-0000-4000-8000-000000002102', '81000000-0000-4000-8000-000000002106', 'owner', 'revoked');

update public.qr_links set is_active = false
where church_id = '82000000-0000-4000-8000-000000002102';

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status,
  is_primary, charges_enabled, supported_currencies, capabilities
) values (
  '85000000-0000-4000-8000-000000002101',
  '82000000-0000-4000-8000-000000002101',
  'p13-hosted-test-adapter', 'acct_p13_hosted_opaque', 'pending', true, false,
  array['BBD'], '{"mode":"test"}'::jsonb
);

insert into public.platform_subscriptions (
  id, church_id, provider, status, plan_code, amount_minor, currency
) values (
  '85000000-0000-4000-8000-000000002102',
  '82000000-0000-4000-8000-000000002101',
  'stripe', 'incomplete', 'p13-hosted-test-plan', 9900, 'USD'
);

select set_config(
  'p13.external_snapshot',
  (
    select pg_catalog.jsonb_build_object(
      'provider', to_jsonb(connection) - 'updated_at',
      'subscription', to_jsonb(subscription) - 'updated_at'
    )::text
    from public.payment_provider_connections connection
    join public.platform_subscriptions subscription
      on subscription.church_id = connection.church_id
    where connection.id = '85000000-0000-4000-8000-000000002101'
      and subscription.id = '85000000-0000-4000-8000-000000002102'
  ),
  true
);

select extensions.plan(106);

-- Schema, constraints, private state, and exact privileges.
select extensions.is((select column_default from information_schema.columns where table_schema='public' and table_name='churches' and column_name='lifecycle_revision'), '0', 'lifecycle revision defaults to zero');
select extensions.ok(exists(select 1 from pg_constraint where conrelid='public.churches'::regclass and conname='churches_lifecycle_revision_nonnegative'), 'lifecycle revision is nonnegative');
select extensions.ok(exists(select 1 from pg_constraint where conrelid='public.churches'::regclass and conname='churches_lifecycle_timestamps_consistent'), 'lifecycle timestamps are constrained');
select extensions.ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='churches_platform_keyset_idx'), 'tenant keyset order is indexed');
select extensions.is((select count(*) from public.platform_onboarding_defaults), 1::bigint, 'one defaults row exists');
select extensions.is((select jsonb_build_object('currency',default_currency,'timezone',default_timezone,'primary',default_primary_color,'secondary',default_secondary_color,'revision',settings_revision) from public.platform_onboarding_defaults), '{"currency":"BBD","timezone":"America/Barbados","primary":"#1F6D60","secondary":"#E1B85A","revision":0}'::jsonb, 'future onboarding defaults start at reviewed values');
select extensions.is((select relrowsecurity from pg_class where oid='public.platform_onboarding_defaults'::regclass), true, 'defaults table has RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.platform_onboarding_defaults'::regclass), true, 'defaults table forces RLS');
select extensions.is((select relrowsecurity from pg_class where oid='public.platform_tenant_lifecycle_requests'::regclass), true, 'lifecycle ledger has RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.platform_tenant_lifecycle_requests'::regclass), true, 'lifecycle ledger forces RLS');
select extensions.is((select relrowsecurity from pg_class where oid='public.platform_onboarding_default_requests'::regclass), true, 'defaults ledger has RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.platform_onboarding_default_requests'::regclass), true, 'defaults ledger forces RLS');
select extensions.is(has_function_privilege('authenticated','public.get_platform_tenants(integer,timestamp with time zone,uuid)','EXECUTE'), true, 'authenticated may call tenant page boundary');
select extensions.is(has_function_privilege('anon','public.get_platform_tenants(integer,timestamp with time zone,uuid)','EXECUTE'), false, 'anonymous cannot call tenant page boundary');
select extensions.is(has_function_privilege('authenticated','public.mutate_platform_tenant_lifecycle(uuid,uuid,bigint,text,text)','EXECUTE'), true, 'authenticated may call lifecycle boundary');
select extensions.is(has_function_privilege('authenticated','public.get_platform_onboarding_defaults()','EXECUTE'), true, 'authenticated may call defaults read boundary');
select extensions.is(has_function_privilege('authenticated','public.update_platform_onboarding_defaults(uuid,bigint,text,text,text,text)','EXECUTE'), true, 'authenticated may call defaults update boundary');
select extensions.is(has_table_privilege('service_role','public.churches','UPDATE'), false, 'service role cannot mutate church lifecycle directly');
select extensions.is(has_table_privilege('service_role','public.platform_admins','SELECT'), false, 'service role cannot inspect the escalation table');
select extensions.is(has_table_privilege('service_role','public.platform_admins','UPDATE'), false, 'service role cannot assign platform roles');
select extensions.is(has_column_privilege('authenticated','public.platform_admins','role','SELECT'), true, 'authenticated request identity can read its own role column');
select extensions.is(has_column_privilege('authenticated','public.platform_admins','created_by','SELECT'), false, 'authenticated request identity cannot read creator UUIDs');
select extensions.is((select count(*) from pg_policies where schemaname='public' and policyname in ('churches_platform_admin_read','funds_platform_admin_read','campaigns_platform_admin_read','qr_links_platform_admin_read','platform_subscriptions_platform_admin_read')), 0::bigint, 'provisional broad platform policies are removed');
select extensions.is((select count(*) from pg_policies where schemaname='public' and tablename='platform_admins' and policyname='platform_admins_read_self'), 1::bigint, 'platform administrator direct identity is self-only');

-- Minimum keyset page, derived readiness, nullable legacy safety, and auth.
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.is((select (page).total_tenant_count from (select public.get_platform_tenants(2,null,null) page) q), current_setting('p13.baseline_total')::bigint + 5, 'tenant total includes the five scoped fixtures');
select extensions.is((select jsonb_build_object('onboarding',(page).onboarding_count,'active',(page).active_count,'suspended',(page).suspended_count) from (select public.get_platform_tenants(2,null,null) page) q), jsonb_build_object('onboarding',current_setting('p13.baseline_onboarding')::bigint + 3,'active',current_setting('p13.baseline_active')::bigint + 1,'suspended',current_setting('p13.baseline_suspended')::bigint + 1), 'status aggregates are database-only counts');
select extensions.is((select array_agg(tenant.church_id order by ordinality) from unnest((public.get_platform_tenants(2,null,null)).tenants) with ordinality tenant(church_id,display_name,slug,status,default_currency,timezone,foundation_ready,missing_readiness_codes,lifecycle_revision,created_at,activated_at,suspended_at,ordinality)), array['82000000-0000-4000-8000-000000002105','82000000-0000-4000-8000-000000002104']::uuid[], 'first page uses deterministic newest-first order');
select extensions.is((select jsonb_build_object('name',tenant.display_name,'currency',tenant.default_currency,'timezone',tenant.timezone,'ready',tenant.foundation_ready,'missing',tenant.missing_readiness_codes) from unnest((public.get_platform_tenants(50,null,null)).tenants) tenant where tenant.church_id='82000000-0000-4000-8000-000000002105'), '{"name":"Church workspace","currency":null,"timezone":null,"ready":false,"missing":["church_profile"]}'::jsonb, 'malformed legacy copy is safe and truth-preserving nullable');
select extensions.is((select jsonb_build_object('ready',tenant.foundation_ready,'missing',tenant.missing_readiness_codes) from unnest((public.get_platform_tenants(50,null,null)).tenants) tenant where tenant.church_id='82000000-0000-4000-8000-000000002101'), '{"ready":true,"missing":[]}'::jsonb, 'optional colours do not block readiness');
select extensions.is((select tenant.missing_readiness_codes from unnest((public.get_platform_tenants(50,null,null)).tenants) tenant where tenant.church_id='82000000-0000-4000-8000-000000002102'), array['active_owner','church_profile','permanent_qr']::text[], 'incomplete tenant reports only approved readiness codes');
select extensions.ok((select (page).has_more and (page).next_cursor_created_at is not null and (page).next_cursor_church_id='82000000-0000-4000-8000-000000002104' from (select public.get_platform_tenants(2,null,null) page) q), 'first page returns the last visible row as next cursor');
select extensions.is((select array_agg(tenant.church_id order by ordinality) from (select public.get_platform_tenants(2,(public.get_platform_tenants(2,null,null)).next_cursor_created_at,(public.get_platform_tenants(2,null,null)).next_cursor_church_id) page) q cross join lateral unnest((q.page).tenants) with ordinality tenant(church_id,display_name,slug,status,default_currency,timezone,foundation_ready,missing_readiness_codes,lifecycle_revision,created_at,activated_at,suspended_at,ordinality)), array['82000000-0000-4000-8000-000000002103','82000000-0000-4000-8000-000000002102']::uuid[], 'second keyset page has no overlap');
select extensions.set_eq($$select key from jsonb_object_keys(to_jsonb(((public.get_platform_tenants(1,null,null)).tenants)[1])) key$$, array['church_id','display_name','slug','status','default_currency','timezone','foundation_ready','missing_readiness_codes','lifecycle_revision','created_at','activated_at','suspended_at'], 'tenant record exposes only reviewed keys');
select extensions.throws_like($$select public.get_platform_tenants(0,null,null)$$, '%PLATFORM_TENANTS_INVALID_PAGE_SIZE%', 'invalid page size is rejected');
select extensions.throws_like($$select public.get_platform_tenants(20,now(),null)$$, '%PLATFORM_TENANTS_INVALID_CURSOR%', 'partial keyset cursor is rejected');
reset role;

set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002103';
set local role authenticated;
select extensions.throws_like($$select public.get_platform_tenants()$$, '%PLATFORM_TENANTS_FORBIDDEN%', 'support cannot list tenants');
select extensions.throws_like($$select public.get_platform_onboarding_defaults()$$, '%PLATFORM_DEFAULTS_FORBIDDEN%', 'support cannot read onboarding defaults');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002101',0,'activate',null)$$, '%PLATFORM_LIFECYCLE_FORBIDDEN%', 'support cannot mutate lifecycle');
reset role;

set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.is((select count(*) from public.platform_admins), 1::bigint, 'super administrator direct identity read is self-only');
select extensions.is((select count(*) from public.churches where id between '82000000-0000-4000-8000-000000002101' and '82000000-0000-4000-8000-000000002105'), 0::bigint, 'super administrator cannot read direct fixture church rows');
select extensions.is((select count(*) from public.funds where church_id between '82000000-0000-4000-8000-000000002101' and '82000000-0000-4000-8000-000000002105'), 0::bigint, 'super administrator cannot read direct fixture funds');
select extensions.is((select count(*) from public.qr_links where church_id between '82000000-0000-4000-8000-000000002101' and '82000000-0000-4000-8000-000000002105'), 0::bigint, 'super administrator cannot read direct fixture QR rows');
select extensions.is((select count(*) from public.platform_subscriptions where church_id='82000000-0000-4000-8000-000000002101'), 0::bigint, 'super administrator cannot read subscription state');
select extensions.is((select count(*) from public.payment_provider_connections where church_id='82000000-0000-4000-8000-000000002101'), 0::bigint, 'super administrator cannot read provider state');
select extensions.is((select count(*) from public.donations where church_id='82000000-0000-4000-8000-000000002101'), 0::bigint, 'super administrator has no donor-financial bypass');
select extensions.throws_like($$select created_by from public.platform_admins$$, '%permission denied%', 'creator identity projection is denied');
select extensions.throws_like($$update public.churches set status='archived' where id='82000000-0000-4000-8000-000000002101'$$, '%permission denied%', 'authenticated cannot mutate lifecycle directly');
reset role;
set local role service_role;
select extensions.throws_like($$select * from public.platform_admins$$, '%permission denied%', 'service role cannot read platform role assignments');
select extensions.throws_like($$update public.churches set status='archived' where id='82000000-0000-4000-8000-000000002101'$$, '%permission denied%', 'service role cannot bypass lifecycle workflow');
reset role;

-- Readiness rechecks, lifecycle graph, CAS/replay, visibility, and isolation.
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002102',0,'activate',null)$$, '%PLATFORM_LIFECYCLE_TENANT_NOT_READY%', 'incomplete tenant cannot activate');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle(null,'82000000-0000-4000-8000-000000002101',0,'activate',null)$$, '%PLATFORM_LIFECYCLE_INVALID_REQUEST%', 'null lifecycle request is rejected');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002101',-1,'activate',null)$$, '%PLATFORM_LIFECYCLE_INVALID_EXPECTED_REVISION%', 'negative lifecycle revision is rejected');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002101',0,'archive',null)$$, '%PLATFORM_LIFECYCLE_INVALID_OPERATION%', 'unapproved lifecycle operation is rejected');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002103',0,'suspend','billing_failure')$$, '%PLATFORM_LIFECYCLE_INVALID_REASON%', 'billing is not a manual suspension reason');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002101',0,'activate','church_request')$$, '%PLATFORM_LIFECYCLE_INVALID_ARGUMENTS%', 'activation cannot carry suspension reason');
reset role;

update public.qr_links set is_active=false where church_id='82000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002101','82000000-0000-4000-8000-000000002101',0,'activate',null)$$, '%PLATFORM_LIFECYCLE_TENANT_NOT_READY%', 'QR readiness is recomputed inside mutation');
reset role;
update public.qr_links set is_active=true where church_id='82000000-0000-4000-8000-000000002101';
update public.profiles set is_active=false where id='81000000-0000-4000-8000-000000002104';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002101','82000000-0000-4000-8000-000000002101',0,'activate',null)$$, '%PLATFORM_LIFECYCLE_TENANT_NOT_READY%', 'owner profile readiness is recomputed inside mutation');
reset role;
update public.profiles set is_active=true where id='81000000-0000-4000-8000-000000002104';
select extensions.is((select jsonb_build_object('status',status,'revision',lifecycle_revision,'audits',(select count(*) from public.audit_logs where church_id='82000000-0000-4000-8000-000000002101' and action_code='church_status_changed'),'ledgers',(select count(*) from public.platform_tenant_lifecycle_requests where church_id='82000000-0000-4000-8000-000000002101')) from public.churches where id='82000000-0000-4000-8000-000000002101'), '{"status":"onboarding","revision":0,"audits":0,"ledgers":0}'::jsonb, 'failed readiness checks leave no lifecycle residue');

set local role authenticated;
select extensions.is((select jsonb_build_object('status',status,'revision',lifecycle_revision,'suspended',suspended_at,'replayed',replayed) from public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002101','82000000-0000-4000-8000-000000002101',0,'activate',null)), '{"status":"active","revision":1,"suspended":null,"replayed":false}'::jsonb, 'ready onboarding tenant activates');
reset role;
select extensions.ok((select activated_at is not null and activated_at >= created_at from public.churches where id='82000000-0000-4000-8000-000000002101'), 'activation timestamp is non-null and not before creation');
select extensions.is((select sanitized_changes from public.audit_logs where request_id='84000000-0000-4000-8000-000000002101'), '{"from_status":"onboarding","to_status":"active","reason_code":"foundation_ready"}'::jsonb, 'activation audit contains only status and finite reason');
set local role authenticated;
select extensions.is((select replayed from public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002101','82000000-0000-4000-8000-000000002101',0,'activate',null)), true, 'exact lifecycle retry replays before stale CAS');
reset role;
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002102';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002101','82000000-0000-4000-8000-000000002101',0,'activate',null)$$, '%PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT%', 'other Super Admin cannot replay another actor request');
reset role;
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002101','82000000-0000-4000-8000-000000002101',0,'suspend','church_request')$$, '%PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT%', 'changed lifecycle request reuse is rejected');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002101',0,'suspend','church_request')$$, '%PLATFORM_LIFECYCLE_REVISION_CONFLICT%', 'new stale lifecycle request is rejected');
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002199','82000000-0000-4000-8000-000000002103',0,'restore',null)$$, '%PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED%', 'active tenant cannot use restore edge');
select extensions.is((select jsonb_build_object('status',status,'revision',lifecycle_revision,'replayed',replayed) from public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002102','82000000-0000-4000-8000-000000002101',1,'suspend','compliance_review')), '{"status":"suspended","revision":2,"replayed":false}'::jsonb, 'active tenant suspends for a finite neutral reason');
reset role;
select extensions.ok((select suspended_at is not null and suspended_at >= activated_at from public.churches where id='82000000-0000-4000-8000-000000002101'), 'suspension timestamp is not before original activation');

set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002104';
set local role authenticated;
select extensions.is(cardinality(public.get_my_church_permissions('82000000-0000-4000-8000-000000002101')), 0, 'suspension removes owner workspace permissions');
reset role;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;
select extensions.is((select jsonb_build_object('page',(select count(*) from public.get_public_giving_page('p13-hosted-ready')),'identity',(select count(*) from public.get_public_church_identities(array['82000000-0000-4000-8000-000000002101']::uuid[])))), '{"page":0,"identity":0}'::jsonb, 'suspension removes both bounded anonymous public projections');
reset role;

set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
update public.profiles set is_active=false where id='81000000-0000-4000-8000-000000002104';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002103','82000000-0000-4000-8000-000000002101',2,'restore',null)$$, '%PLATFORM_LIFECYCLE_TENANT_NOT_READY%', 'restore rechecks active owner foundation');
reset role;
update public.profiles set is_active=true where id='81000000-0000-4000-8000-000000002104';
set local role authenticated;
select extensions.is((select jsonb_build_object('status',status,'revision',lifecycle_revision,'suspended',suspended_at,'replayed',replayed) from public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002103','82000000-0000-4000-8000-000000002101',2,'restore',null)), '{"status":"active","revision":3,"suspended":null,"replayed":false}'::jsonb, 'ready suspended tenant restores');
reset role;
select extensions.is((select activated_at from public.churches where id='82000000-0000-4000-8000-000000002101'), (select result_activated_at from public.platform_tenant_lifecycle_requests where church_id='82000000-0000-4000-8000-000000002101' and operation='activate'), 'restore preserves the original activation timestamp');

set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002104';
set local role authenticated;
select extensions.ok(cardinality(public.get_my_church_permissions('82000000-0000-4000-8000-000000002101')) > 0, 'restoration returns owner workspace permissions');
reset role;
set local "request.jwt.claim.sub" = '';
set local role anon;
select extensions.is((select jsonb_build_object('page',(select count(*) from public.get_public_giving_page('p13-hosted-ready')),'identity',(select count(*) from public.get_public_church_identities(array['82000000-0000-4000-8000-000000002101']::uuid[])))), '{"page":1,"identity":1}'::jsonb, 'restoration returns both bounded anonymous active projections');
reset role;
select extensions.is((select pg_catalog.jsonb_build_object('provider',to_jsonb(connection)-'updated_at','subscription',to_jsonb(subscription)-'updated_at')::text from public.payment_provider_connections connection join public.platform_subscriptions subscription on subscription.church_id=connection.church_id where connection.id='85000000-0000-4000-8000-000000002101' and subscription.id='85000000-0000-4000-8000-000000002102'), current_setting('p13.external_snapshot'), 'manual lifecycle never mutates provider or subscription records');
select extensions.is((select count(*) from public.audit_logs where church_id='82000000-0000-4000-8000-000000002101' and action_code='church_status_changed'), 3::bigint, 'three successful lifecycle edges produce exactly three audits');

-- Strict singleton defaults, exact idempotency, audit, and rollback safety.
select set_config('p13.existing_church_snapshot',(select jsonb_build_object('currency',default_currency,'timezone',timezone,'primary',primary_color,'secondary',secondary_color,'settings_revision',settings_revision,'lifecycle_revision',lifecycle_revision)::text from public.churches where id='82000000-0000-4000-8000-000000002101'),true);
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.is((select jsonb_build_object('currency',default_currency,'timezone',default_timezone,'primary',default_primary_color,'secondary',default_secondary_color,'revision',settings_revision) from public.get_platform_onboarding_defaults()), '{"currency":"BBD","timezone":"America/Barbados","primary":"#1F6D60","secondary":"#E1B85A","revision":0}'::jsonb, 'Super Admin reads future defaults');
select extensions.throws_like($$select public.update_platform_onboarding_defaults(null,0,'BBD','America/Barbados','#1F6D60','#E1B85A')$$, '%PLATFORM_DEFAULTS_INVALID_REQUEST_ID%', 'null defaults request is rejected');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',-1,'BBD','America/Barbados','#1F6D60','#E1B85A')$$, '%PLATFORM_DEFAULTS_INVALID_EXPECTED_REVISION%', 'negative defaults revision is rejected');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',0,'EUR','America/Barbados','#1F6D60','#E1B85A')$$, '%PLATFORM_DEFAULTS_INVALID_CURRENCY%', 'unsupported future default currency is rejected');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',0,'BBD','Not/A_Zone','#1F6D60','#E1B85A')$$, '%PLATFORM_DEFAULTS_INVALID_TIMEZONE%', 'invalid future default timezone is rejected');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',0,'BBD','America/Barbados','red','#E1B85A')$$, '%PLATFORM_DEFAULTS_INVALID_PRIMARY_COLOR%', 'invalid primary colour is rejected');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',0,'BBD','America/Barbados','#1F6D60','#12345Z')$$, '%PLATFORM_DEFAULTS_INVALID_SECONDARY_COLOR%', 'invalid secondary colour is rejected');
select extensions.is((select jsonb_build_object('currency',default_currency,'timezone',default_timezone,'primary',default_primary_color,'secondary',default_secondary_color,'revision',settings_revision,'replayed',replayed) from public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002104',0,' usd ',' Factory ',' #123abc ',' #fedcba ')), '{"currency":"USD","timezone":"Factory","primary":"#123ABC","secondary":"#FEDCBA","revision":1,"replayed":false}'::jsonb, 'PostgreSQL-valid timezone output remains available even when Node Intl lacks the name');
reset role;
select extensions.is((select sanitized_changes from public.audit_logs where request_id='84000000-0000-4000-8000-000000002104'), '{"setting_keys":["default_currency","default_timezone","default_primary_color","default_secondary_color"]}'::jsonb, 'defaults audit contains changed field names only');
select extensions.is((select jsonb_build_object('currency',default_currency,'timezone',timezone,'primary',primary_color,'secondary',secondary_color,'settings_revision',settings_revision,'lifecycle_revision',lifecycle_revision)::text from public.churches where id='82000000-0000-4000-8000-000000002101'), current_setting('p13.existing_church_snapshot'), 'future defaults update never rewrites an existing church or its revisions');
set local role authenticated;
select extensions.is((select replayed from public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002104',0,'USD','Factory','#123ABC','#FEDCBA')), true, 'exact defaults retry replays before stale CAS');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',1,'USD','Factory','#123ABC','#FEDCBA')$$, '%PLATFORM_DEFAULTS_NO_CHANGES%', 'defaults no-op is rejected');
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002199',0,'BBD','America/Barbados','#1F6D60','#E1B85A')$$, '%PLATFORM_DEFAULTS_REVISION_CONFLICT%', 'new stale defaults request is rejected');
reset role;
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002102';
set local role authenticated;
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002104',0,'USD','Factory','#123ABC','#FEDCBA')$$, '%PLATFORM_DEFAULTS_IDEMPOTENCY_CONFLICT%', 'other Super Admin cannot reuse request identity');
reset role;

select extensions.throws_like($$update public.platform_onboarding_defaults set default_timezone='Not/A_Zone'$$, '%PLATFORM_DEFAULTS_INVALID_TIMEZONE%', 'table boundary validates real timezone names');
select extensions.throws_like($$delete from public.platform_onboarding_defaults$$, '%PLATFORM_DEFAULTS_SINGLETON_PROTECTED%', 'defaults singleton cannot be deleted');
select extensions.throws_like($$truncate public.platform_onboarding_defaults$$, '%PLATFORM_DEFAULTS_SINGLETON_PROTECTED%', 'defaults singleton cannot be truncated');
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.throws_like($$select * from public.platform_tenant_lifecycle_requests$$, '%permission denied%', 'authenticated cannot inspect lifecycle ledger');
select extensions.throws_like($$select * from public.platform_onboarding_default_requests$$, '%permission denied%', 'authenticated cannot inspect defaults ledger');
reset role;
select extensions.throws_like($$update public.platform_tenant_lifecycle_requests set payload_sha256=repeat('a',64) where request_id='84000000-0000-4000-8000-000000002101'$$, '%PLATFORM_MANAGEMENT_LEDGER_APPEND_ONLY%', 'lifecycle ledger update is blocked');
select extensions.throws_like($$truncate public.platform_onboarding_default_requests$$, '%PLATFORM_MANAGEMENT_LEDGER_APPEND_ONLY%', 'defaults ledger truncate is blocked');

-- Existing P08 provisioning and P12 owner reservation remain compatible.
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.is((select owner_membership_status::text from public.provision_church('84000000-0000-4000-8000-000000002108','P13 Provisioned Church','P13 Provisioned Church Inc.','p13-hosted-provisioned','reserved-owner-p13-hosted@example.test','support-provisioned-p13-hosted@example.test','BBD','America/Barbados','#1F6D60','#E1B85A',null)), 'invited', 'P08 provisioning still creates a reserved owner after ACL narrowing');
reset role;
select set_config('p13.provisioned_church',(select church_id::text from public.church_provisioning_requests where request_id='84000000-0000-4000-8000-000000002108'),true);
select set_config('p13.provisioned_membership',(select owner_membership_id::text from public.church_provisioning_requests where request_id='84000000-0000-4000-8000-000000002108'),true);
select extensions.is(public.platform_tenant_missing_readiness(current_setting('p13.provisioned_church')::uuid), array['active_owner']::text[], 'reserved owner is honestly pending in readiness');
insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data) values('81000000-0000-4000-8000-000000002107','reserved-owner-p13-hosted@example.test',now(),'{"display_name":"Reserved P13 Hosted Owner"}');
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002107';
set local role authenticated;
select extensions.is((select jsonb_build_object('role',role,'status',status,'replayed',replayed) from public.claim_church_staff_invitation(current_setting('p13.provisioned_membership')::uuid)), '{"role":"owner","status":"active","replayed":false}'::jsonb, 'P12 exact verified owner can claim the P08 reservation');
reset role;
select extensions.is(public.platform_tenant_missing_readiness(current_setting('p13.provisioned_church')::uuid), array[]::text[], 'claimed owner completes P13 foundation readiness');

-- Forced late failures prove transaction-wide rollback.
create function public.p13_hosted_force_lifecycle_failure()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'P13_FORCED_LIFECYCLE_FAILURE'; end;
$$;
create trigger p13_hosted_force_lifecycle_failure
before insert on public.platform_tenant_lifecycle_requests
for each row execute function public.p13_hosted_force_lifecycle_failure();
set local "request.jwt.claim.sub" = '81000000-0000-4000-8000-000000002101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_platform_tenant_lifecycle('84000000-0000-4000-8000-000000002106','82000000-0000-4000-8000-000000002103',0,'suspend','administrative_hold')$$, '%P13_FORCED_LIFECYCLE_FAILURE%', 'late lifecycle ledger failure aborts mutation');
reset role;
drop trigger p13_hosted_force_lifecycle_failure on public.platform_tenant_lifecycle_requests;
drop function public.p13_hosted_force_lifecycle_failure();
select extensions.is((select jsonb_build_object('status',status,'revision',lifecycle_revision,'audits',(select count(*) from public.audit_logs where church_id='82000000-0000-4000-8000-000000002103' and action_code='church_status_changed'),'ledgers',(select count(*) from public.platform_tenant_lifecycle_requests where church_id='82000000-0000-4000-8000-000000002103')) from public.churches where id='82000000-0000-4000-8000-000000002103'), '{"status":"active","revision":0,"audits":0,"ledgers":0}'::jsonb, 'late lifecycle failure rolls back church, audit, and ledger');

create function public.p13_hosted_force_defaults_failure()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'P13_FORCED_DEFAULTS_FAILURE'; end;
$$;
create trigger p13_hosted_force_defaults_failure
before insert on public.platform_onboarding_default_requests
for each row execute function public.p13_hosted_force_defaults_failure();
set local role authenticated;
select extensions.throws_like($$select public.update_platform_onboarding_defaults('84000000-0000-4000-8000-000000002107',1,'CAD','America/Barbados','#112233','#445566')$$, '%P13_FORCED_DEFAULTS_FAILURE%', 'late defaults ledger failure aborts mutation');
reset role;
drop trigger p13_hosted_force_defaults_failure on public.platform_onboarding_default_requests;
drop function public.p13_hosted_force_defaults_failure();
select extensions.is((select jsonb_build_object('currency',default_currency,'revision',settings_revision,'audits',(select count(*) from public.audit_logs where action_code='platform_settings_updated' and request_id='84000000-0000-4000-8000-000000002107'),'ledgers',(select count(*) from public.platform_onboarding_default_requests where request_id='84000000-0000-4000-8000-000000002107')) from public.platform_onboarding_defaults), '{"currency":"USD","revision":1,"audits":0,"ledgers":0}'::jsonb, 'late defaults failure rolls back singleton, audit, and ledger');

select * from extensions.finish();
rollback;
