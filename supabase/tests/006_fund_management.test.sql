begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(77);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('41000000-0000-4000-8000-000000001101', 'owner-p10-hosted@example.test', now(), '{"display_name":"P10 Hosted Owner"}'),
  ('41000000-0000-4000-8000-000000001102', 'other-owner-p10-hosted@example.test', now(), '{"display_name":"P10 Hosted Other"}'),
  ('41000000-0000-4000-8000-000000001103', 'staff-p10-hosted@example.test', now(), '{"display_name":"P10 Hosted Staff"}'),
  ('41000000-0000-4000-8000-000000001104', 'inactive-p10-hosted@example.test', now(), '{"display_name":"P10 Hosted Inactive"}');

update public.profiles set is_active = false
where id = '41000000-0000-4000-8000-000000001104';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at, suspended_at
)
values
  ('51000000-0000-4000-8000-000000001101', 'P10 Hosted Primary',
   'P10 Hosted Primary Inc.', 'p10-hosted-primary', 'active', 'BBD',
   'America/Barbados', 'primary-p10-hosted@example.test', now(), null),
  ('51000000-0000-4000-8000-000000001102', 'P10 Hosted Other',
   'P10 Hosted Other Inc.', 'p10-hosted-other', 'onboarding', 'USD',
   'America/Barbados', 'other-p10-hosted@example.test', null, null),
  ('51000000-0000-4000-8000-000000001103', 'P10 Hosted Suspended',
   'P10 Hosted Suspended Inc.', 'p10-hosted-suspended', 'suspended', 'USD',
   'America/Barbados', 'suspended-p10-hosted@example.test', now(), now());

insert into public.church_memberships (
  church_id, user_id, role, status, accepted_at
)
values
  ('51000000-0000-4000-8000-000000001101', '41000000-0000-4000-8000-000000001101', 'owner', 'active', now()),
  ('51000000-0000-4000-8000-000000001101', '41000000-0000-4000-8000-000000001103', 'staff', 'active', now()),
  ('51000000-0000-4000-8000-000000001102', '41000000-0000-4000-8000-000000001102', 'owner', 'active', now()),
  ('51000000-0000-4000-8000-000000001101', '41000000-0000-4000-8000-000000001104', 'owner', 'active', now()),
  ('51000000-0000-4000-8000-000000001103', '41000000-0000-4000-8000-000000001101', 'owner', 'active', now());

insert into public.funds (
  id, church_id, name, slug, description, status, is_default, sort_order
)
values
  ('61000000-0000-4000-8000-000000001101', '51000000-0000-4000-8000-000000001101', 'Campaign Fund', 'campaign-fund', 'Open campaign dependency', 'active', false, 2),
  ('61000000-0000-4000-8000-000000001102', '51000000-0000-4000-8000-000000001101', 'Recurring Fund', 'recurring-fund', 'Recurring dependency', 'active', false, 3),
  ('61000000-0000-4000-8000-000000001103', '51000000-0000-4000-8000-000000001101', 'History Fund', 'history-fund', 'Historical records', 'active', false, 4),
  ('61000000-0000-4000-8000-000000001104', '51000000-0000-4000-8000-000000001101', 'Movable Fund', 'movable-fund', null, 'active', false, 5),
  ('61000000-0000-4000-8000-000000001105', '51000000-0000-4000-8000-000000001101', 'Archived Fund', 'archived-fund', 'Old category', 'archived', false, 1),
  ('61000000-0000-4000-8000-000000001106', '51000000-0000-4000-8000-000000001102', 'Other Fund', 'other-fund', null, 'active', false, 2);

insert into public.campaigns (
  id, church_id, fund_id, name, slug, status, currency
)
values
  ('81000000-0000-4000-8000-000000001101', '51000000-0000-4000-8000-000000001101', '61000000-0000-4000-8000-000000001101', 'Open Campaign', 'open-campaign', 'draft', 'BBD'),
  ('81000000-0000-4000-8000-000000001102', '51000000-0000-4000-8000-000000001101', '61000000-0000-4000-8000-000000001103', 'Closed Campaign', 'closed-campaign', 'closed', 'BBD');

insert into public.donors (id, church_id, display_name, email)
values ('91000000-0000-4000-8000-000000001101', '51000000-0000-4000-8000-000000001101', 'P10 Synthetic Donor', 'donor-p10-hosted@example.test');

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status,
  is_primary, charges_enabled, recurring_enabled, supported_currencies
)
values (
  'a1000000-0000-4000-8000-000000001101', '51000000-0000-4000-8000-000000001101',
  'mock', 'p10-hosted-account', 'active', true, true, true, array['BBD']
);

insert into public.recurring_gifts (
  id, church_id, donor_id, fund_id, payment_connection_id,
  amount_minor, currency, frequency, status,
  provider_subscription_reference, started_at, canceled_at
)
values
  ('b1000000-0000-4000-8000-000000001101', '51000000-0000-4000-8000-000000001101', '91000000-0000-4000-8000-000000001101', '61000000-0000-4000-8000-000000001102', 'a1000000-0000-4000-8000-000000001101', 2500, 'BBD', 'monthly', 'active', 'p10-hosted-active', now(), null),
  ('b1000000-0000-4000-8000-000000001102', '51000000-0000-4000-8000-000000001101', '91000000-0000-4000-8000-000000001101', '61000000-0000-4000-8000-000000001103', 'a1000000-0000-4000-8000-000000001101', 1500, 'BBD', 'monthly', 'canceled', 'p10-hosted-canceled', now(), now());

insert into public.donations (
  id, church_id, donor_id, fund_id, source, status,
  amount_minor, currency, donated_at
)
values (
  'c1000000-0000-4000-8000-000000001101', '51000000-0000-4000-8000-000000001101',
  '91000000-0000-4000-8000-000000001101', '61000000-0000-4000-8000-000000001103',
  'cash', 'succeeded', 5000, 'BBD', now()
);

-- Schema, typed RPC, ACL, and private-ledger contract (1-19).
select extensions.ok(to_regprocedure('public.get_church_funds(uuid)') is not null, 'fund list RPC exists');
select extensions.ok(to_regprocedure('public.mutate_church_fund(uuid,uuid,bigint,text,uuid,text,text,text)') is not null, 'fund mutation RPC has exact signature');
select extensions.is((select proretset and prorettype = 'public.church_fund_record'::regtype from pg_proc where oid = 'public.get_church_funds(uuid)'::regprocedure), true, 'fund list returns SETOF typed records');
select extensions.is((select prorettype = 'public.church_fund_mutation_result'::regtype from pg_proc where oid = 'public.mutate_church_fund(uuid,uuid,bigint,text,uuid,text,text,text)'::regprocedure), true, 'mutation returns scalar typed result');
select extensions.is((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'churches' and column_name = 'funds_revision'), '0', 'fund revision starts at zero');
select extensions.is((select count(*) from pg_constraint where conrelid = 'public.churches'::regclass and conname = 'churches_funds_revision_nonnegative'), 1::bigint, 'fund revision is nonnegative');
select extensions.is((select count(*) from pg_indexes where schemaname = 'public' and indexname = 'funds_name_unique_idx'), 1::bigint, 'case-insensitive fund names are unique');
select extensions.is((select count(*) from pg_indexes where schemaname = 'public' and indexname = 'funds_active_sort_order_unique_idx'), 1::bigint, 'active order positions are unique');
select extensions.is((select count(*) from pg_indexes where schemaname = 'public' and indexname = 'church_fund_mutation_requests_result_fund_idx'), 1::bigint, 'ledger fund foreign key has supporting index');
select extensions.is((select count(*) from pg_trigger where tgrelid = 'public.funds'::regclass and tgname = 'funds_keep_slug' and not tgisinternal), 1::bigint, 'fund slug immutability trigger exists');
select extensions.is((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.church_fund_mutation_requests'::regclass), true, 'private ledger enables and forces RLS');
select extensions.is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'church_fund_mutation_requests'), 0::bigint, 'private ledger has no policies');
select extensions.is((select count(*) from pg_constraint where conrelid = 'public.church_fund_mutation_requests'::regclass and conname = 'church_fund_mutation_requests_church_revision_unique'), 1::bigint, 'one ledger result exists per church revision');
select extensions.is((select count(*) from pg_constraint where conrelid = 'public.church_fund_mutation_requests'::regclass and conname = 'church_fund_mutation_requests_audit_unique'), 1::bigint, 'each ledger result owns one audit event');
select extensions.is((select count(*) from pg_trigger where tgrelid = 'public.church_fund_mutation_requests'::regclass and tgname = 'church_fund_mutation_requests_no_truncate' and not tgisinternal), 1::bigint, 'private ledger blocks truncate');
select extensions.is(has_function_privilege('authenticated', 'public.get_church_funds(uuid)', 'EXECUTE'), true, 'authenticated can call fund list');
select extensions.is(has_function_privilege('anon', 'public.get_church_funds(uuid)', 'EXECUTE'), false, 'anonymous cannot call fund list');
select extensions.is(has_function_privilege('authenticated', 'public.mutate_church_fund(uuid,uuid,bigint,text,uuid,text,text,text)', 'EXECUTE'), true, 'authenticated can call mutation boundary');
select extensions.is(has_function_privilege('anon', 'public.mutate_church_fund(uuid,uuid,bigint,text,uuid,text,text,text)', 'EXECUTE'), false, 'anonymous cannot call mutation boundary');

-- Read visibility and independent mutation authorization (20-30).
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.is((select count(*) from public.get_church_funds('51000000-0000-4000-8000-000000001101')), 6::bigint, 'owner reads active and archived funds');
select extensions.is((select string_agg(slug, ',' order by case when status = 'active' then 0 else 1 end, case when status = 'active' then sort_order end nulls last, lower(name), fund_id) from public.get_church_funds('51000000-0000-4000-8000-000000001101')), 'tithes,campaign-fund,recurring-fund,history-fund,movable-fund,archived-fund', 'list ordering is deterministic and active first');
reset role;
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001103';
set local role authenticated;
select extensions.is((select count(*) from public.get_church_funds('51000000-0000-4000-8000-000000001101')), 6::bigint, 'staff retains funds_read');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'update','61000000-0000-4000-8000-000000001104','Forbidden',null,null)$$, '%FUNDS_FORBIDDEN%', 'staff cannot mutate funds');
reset role;
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001102';
set local role authenticated;
select extensions.is((select count(*) from public.get_church_funds('51000000-0000-4000-8000-000000001102')), 2::bigint, 'onboarding owner reads own funds');
select extensions.throws_like($$select public.get_church_funds('51000000-0000-4000-8000-000000001101')$$, '%FUNDS_FORBIDDEN%', 'other owner cannot read tenant');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'update','61000000-0000-4000-8000-000000001104','Forbidden',null,null)$$, '%FUNDS_FORBIDDEN%', 'other owner cannot mutate tenant');
reset role;
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001104';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'update','61000000-0000-4000-8000-000000001104','Forbidden',null,null)$$, '%FUNDS_FORBIDDEN%', 'inactive owner fails closed');
reset role;
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.get_church_funds('51000000-0000-4000-8000-000000001103')$$, '%FUNDS_FORBIDDEN%', 'suspended church read fails closed');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001103',0,'update','61000000-0000-4000-8000-000000001104','Forbidden',null,null)$$, '%FUNDS_FORBIDDEN%', 'suspended church mutation fails closed');
reset role;
set local role anon;
select extensions.is((select cardinality(funds) from public.get_public_giving_page('p10-hosted-primary')), 5, 'anonymous bounded page returns only active funds for the exact active church slug');
reset role;

-- Validation and canonical create/replay/update (31-49).
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_fund(null,'51000000-0000-4000-8000-000000001101',0,'create',null,'Valid','valid',null)$$, '%FUNDS_INVALID_REQUEST_ID%', 'null request ID is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',-1,'create',null,'Valid','valid',null)$$, '%FUNDS_INVALID_EXPECTED_REVISION%', 'negative revision is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'destroy',null,null,null,null)$$, '%FUNDS_INVALID_OPERATION%', 'unknown operation is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'set_default','61000000-0000-4000-8000-000000001104','Unexpected',null,null)$$, '%FUNDS_INVALID_ARGUMENTS%', 'operation argument shape is strict');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'create',null,'x','valid',null)$$, '%FUNDS_INVALID_NAME%', 'short name is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'create',null,'Valid Name','Not-Canonical',null)$$, '%FUNDS_INVALID_SLUG%', 'noncanonical slug is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',0,'create',null,'Valid Name','valid-name',repeat('x',501))$$, '%FUNDS_INVALID_DESCRIPTION%', 'long description is rejected');
select extensions.is((select jsonb_build_object('name',name,'slug',slug,'description',description,'status',status,'default',is_default,'order',sort_order,'revision',funds_revision,'replayed',replayed) from public.mutate_church_fund('71000000-0000-4000-8000-000000001101','51000000-0000-4000-8000-000000001101',0,'create',null,U&'\00A0Mercy\2003Fund\FEFF','mercy-fund',U&'\00A0Community support\000D\000ALine two\2003')), '{"name":"Mercy Fund","slug":"mercy-fund","description":"Community support\nLine two","status":"active","default":false,"order":6,"revision":1,"replayed":false}'::jsonb, 'create canonicalizes ECMAScript edge whitespace and appends exactly once');
select extensions.ok((select fund_id::text ~ '^[0-9a-f-]{36}$' from public.get_church_funds('51000000-0000-4000-8000-000000001101') where slug = 'mercy-fund'), 'created fund has server UUID');
select extensions.is((select jsonb_build_object('action',action_code,'entity',entity_code,'changes',sanitized_changes) from public.audit_logs where request_id = '71000000-0000-4000-8000-000000001101'), jsonb_build_object('action','fund_created','entity','fund','changes',jsonb_build_object('fund_id',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'))), 'create audit contains only the fund ID');
reset role;
select extensions.is((select jsonb_build_object('revision',result_funds_revision,'hash',payload_sha256 ~ '^[0-9a-f]{64}$') from public.church_fund_mutation_requests where request_id = '71000000-0000-4000-8000-000000001101'), '{"revision":1,"hash":true}'::jsonb, 'private ledger stores revision and canonical hash');
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001102','51000000-0000-4000-8000-000000001101',1,'create',null,'mercy fund','mercy-giving',null)$$, '%FUNDS_NAME_CONFLICT%', 'case-insensitive duplicate name is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001103','51000000-0000-4000-8000-000000001101',1,'create',null,'Mercy Giving','mercy-fund',null)$$, '%FUNDS_SLUG_CONFLICT%', 'duplicate immutable slug is rejected');
select extensions.is((select replayed from public.mutate_church_fund('71000000-0000-4000-8000-000000001101','51000000-0000-4000-8000-000000001101',0,'create',null,'Mercy Fund','mercy-fund',E'Community support\nLine two')), true, 'same canonical request replays before stale CAS');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001101','51000000-0000-4000-8000-000000001101',0,'create',null,'Changed','changed',null)$$, '%FUNDS_IDEMPOTENCY_CONFLICT%', 'changed reuse is rejected');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001104','51000000-0000-4000-8000-000000001101',0,'update',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),'Stale Change',null,null)$$, '%FUNDS_REVISION_CONFLICT%', 'new stale request is rejected');
select extensions.is((select jsonb_build_object('name',name,'slug',slug,'description',description,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001105','51000000-0000-4000-8000-000000001101',1,'update',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),' Mercy Outreach ',null,'')), '{"name":"Mercy Outreach","slug":"mercy-fund","description":null,"revision":2}'::jsonb, 'update changes only editable metadata');
select extensions.is((select sanitized_changes from public.audit_logs where request_id = '71000000-0000-4000-8000-000000001105'), jsonb_build_object('fund_id',(select id from public.funds where slug = 'mercy-fund' and church_id = '51000000-0000-4000-8000-000000001101'),'field_names',jsonb_build_array('description','name')), 'update audit has sorted field names only');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',2,'update',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),'Mercy Outreach',null,null)$$, '%FUNDS_NO_CHANGES%', 'no-op update is rejected');
reset role;
select extensions.throws_like($$update public.funds set slug = 'changed-slug' where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'$$, '%FUND_SLUG_IMMUTABLE%', 'slug is immutable even for trusted direct updates');

-- Default, movement, archive, restore, and history behavior (50-64).
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.is((select jsonb_build_object('default',is_default,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001106','51000000-0000-4000-8000-000000001101',2,'set_default',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),null,null,null)), '{"default":true,"revision":3}'::jsonb, 'default changes atomically');
select extensions.is((select jsonb_build_object('defaults',(select count(*) from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and is_default and status = 'active'),'donation',(select fund_id from public.donations where id = 'c1000000-0000-4000-8000-000000001101'),'recurring',(select fund_id from public.recurring_gifts where id = 'b1000000-0000-4000-8000-000000001101'))), '{"defaults":1,"donation":"61000000-0000-4000-8000-000000001103","recurring":"61000000-0000-4000-8000-000000001102"}'::jsonb, 'default change never rewrites attribution');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',3,'set_default',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),null,null,null)$$, '%FUNDS_NO_CHANGES%', 'setting current default is a no-op');
select extensions.is((select jsonb_build_object('order',sort_order,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001107','51000000-0000-4000-8000-000000001101',3,'move_up',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),null,null,null)), '{"order":5,"revision":4}'::jsonb, 'move up swaps the adjacent active order');
select extensions.is((select jsonb_build_object('order',sort_order,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001108','51000000-0000-4000-8000-000000001101',4,'move_down',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),null,null,null)), '{"order":6,"revision":5}'::jsonb, 'move down restores the adjacent active order');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001109','51000000-0000-4000-8000-000000001101',5,'move_up',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and is_default = false and slug = 'tithes'),null,null,null)$$, '%FUNDS_ORDER_BOUNDARY%', 'first active fund cannot move up');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001109','51000000-0000-4000-8000-000000001101',5,'move_up','61000000-0000-4000-8000-000000001105',null,null,null)$$, '%FUNDS_NOT_ACTIVE%', 'archived fund cannot move');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',5,'archive',(select id from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and slug = 'mercy-fund'),null,null,null)$$, '%FUNDS_DEFAULT_REQUIRED%', 'default fund cannot be archived');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',5,'archive','61000000-0000-4000-8000-000000001101',null,null,null)$$, '%FUNDS_OPEN_CAMPAIGNS%', 'draft or active campaign blocks archive');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',5,'archive','61000000-0000-4000-8000-000000001102',null,null,null)$$, '%FUNDS_ACTIVE_RECURRING_GIFTS%', 'nonterminal recurring gift blocks archive');
select extensions.is((select jsonb_build_object('status',status,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001110','51000000-0000-4000-8000-000000001101',5,'archive','61000000-0000-4000-8000-000000001103',null,null,null)), '{"status":"archived","revision":6}'::jsonb, 'closed campaigns, canceled recurring, and donations do not block archive');
select extensions.is((select jsonb_build_object('fund',(select fund_id from public.donations where id = 'c1000000-0000-4000-8000-000000001101'),'audit',(select action_code from public.audit_logs where request_id = '71000000-0000-4000-8000-000000001110'))), '{"fund":"61000000-0000-4000-8000-000000001103","audit":"fund_archived"}'::jsonb, 'archive preserves donation attribution and uses finite audit action');
select extensions.is((select jsonb_build_object('status',status,'default',is_default,'order',sort_order,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001111','51000000-0000-4000-8000-000000001101',6,'restore','61000000-0000-4000-8000-000000001103',null,null,null)), '{"status":"active","default":false,"order":7,"revision":7}'::jsonb, 'restore appends active and nondefault');
select extensions.is((select sanitized_changes from public.audit_logs where request_id = '71000000-0000-4000-8000-000000001111'), '{"fund_id":"61000000-0000-4000-8000-000000001103","field_names":["sort_order","status"]}'::jsonb, 'restore audit contains actual sorted field names');
select extensions.is((select jsonb_build_object('name',name,'status',status,'revision',funds_revision) from public.mutate_church_fund('71000000-0000-4000-8000-000000001112','51000000-0000-4000-8000-000000001101',7,'update','61000000-0000-4000-8000-000000001105','Archived Legacy',null,null)), '{"name":"Archived Legacy","status":"archived","revision":8}'::jsonb, 'archived fund metadata remains editable');
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',8,'restore','61000000-0000-4000-8000-000000001104',null,null,null)$$, '%FUNDS_NOT_ARCHIVED%', 'restore requires archived status');
reset role;

-- Direct mutation closure, append-only ledger, and atomic late failure (65-75).
set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$insert into public.funds (church_id,name,slug) values ('51000000-0000-4000-8000-000000001101','Direct','direct')$$, '%permission denied%', 'authenticated direct fund insert is denied');
select extensions.throws_like($$delete from public.funds where id = '61000000-0000-4000-8000-000000001104'$$, '%permission denied%', 'authenticated direct fund delete is denied');
select extensions.throws_like($$select * from public.church_fund_mutation_requests$$, '%permission denied%', 'authenticated cannot read private ledger');
reset role;
set local role service_role;
select extensions.throws_like($$select * from public.church_fund_mutation_requests$$, '%permission denied%', 'service role cannot read private ledger');
reset role;
select extensions.throws_like($$update public.church_fund_mutation_requests set payload_sha256 = repeat('a',64) where request_id = '71000000-0000-4000-8000-000000001101'$$, '%FUNDS_LEDGER_APPEND_ONLY%', 'ledger update is blocked');
select extensions.throws_like($$delete from public.church_fund_mutation_requests where request_id = '71000000-0000-4000-8000-000000001101'$$, '%FUNDS_LEDGER_APPEND_ONLY%', 'ledger delete is blocked');
select extensions.throws_like($$truncate public.church_fund_mutation_requests$$, '%FUNDS_LEDGER_APPEND_ONLY%', 'ledger truncate is blocked');

create function public.p10_hosted_force_late_failure()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'P10_FORCED_LATE_FAILURE'; end;
$$;
create trigger p10_hosted_force_late_failure
before insert on public.church_fund_mutation_requests
for each row execute function public.p10_hosted_force_late_failure();

set local "request.jwt.claim.sub" = '41000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_fund('71000000-0000-4000-8000-000000001199','51000000-0000-4000-8000-000000001101',8,'update','61000000-0000-4000-8000-000000001104','Must Roll Back',null,null)$$, '%P10_FORCED_LATE_FAILURE%', 'late ledger failure aborts entire mutation statement');
reset role;
drop trigger p10_hosted_force_late_failure on public.church_fund_mutation_requests;
drop function public.p10_hosted_force_late_failure();

select extensions.is((select jsonb_build_object('revision',(select funds_revision from public.churches where id = '51000000-0000-4000-8000-000000001101'),'name',(select name from public.funds where id = '61000000-0000-4000-8000-000000001104'),'failed_ledgers',(select count(*) from public.church_fund_mutation_requests where request_id = '71000000-0000-4000-8000-000000001199'))), '{"revision":8,"name":"Movable Fund","failed_ledgers":0}'::jsonb, 'late failure rolls back row, revision, audit, and ledger');
select extensions.is((select jsonb_build_object('ledgers',count(*),'audits',(select count(*) from public.audit_logs where church_id = '51000000-0000-4000-8000-000000001101'),'defaults',(select count(*) from public.funds where church_id = '51000000-0000-4000-8000-000000001101' and is_default and status = 'active')) from public.church_fund_mutation_requests where church_id = '51000000-0000-4000-8000-000000001101'), '{"ledgers":8,"audits":8,"defaults":1}'::jsonb, 'successful mutations have exact ledger, audit, and default counts');
select extensions.ok(not exists (select 1 from public.audit_logs where church_id = '51000000-0000-4000-8000-000000001101' and sanitized_changes::text ~* '(Mercy|Community support|Archived Legacy)'), 'audit payloads contain no names or descriptions');

select * from extensions.finish();
rollback;
