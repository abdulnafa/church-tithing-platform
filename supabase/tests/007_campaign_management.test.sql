begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(88);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('91000000-0000-4000-8000-000000001101', 'owner-p11-hosted@example.test', now(), '{"display_name":"P11 Hosted Owner"}'),
  ('91000000-0000-4000-8000-000000001102', 'other-p11-hosted@example.test', now(), '{"display_name":"P11 Hosted Other"}'),
  ('91000000-0000-4000-8000-000000001103', 'staff-p11-hosted@example.test', now(), '{"display_name":"P11 Hosted Staff"}'),
  ('91000000-0000-4000-8000-000000001104', 'finance-p11-hosted@example.test', now(), '{"display_name":"P11 Hosted Finance"}'),
  ('91000000-0000-4000-8000-000000001105', 'inactive-p11-hosted@example.test', now(), '{"display_name":"P11 Hosted Inactive"}');

update public.profiles set is_active = false
where id = '91000000-0000-4000-8000-000000001105';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at, suspended_at
) values
  ('92000000-0000-4000-8000-000000001101', 'P11 Hosted Primary', 'P11 Hosted Primary Inc.', 'p11-hosted-primary', 'active', 'BBD', 'America/Barbados', 'primary-p11-hosted@example.test', now(), null),
  ('92000000-0000-4000-8000-000000001102', 'P11 Hosted Empty', 'P11 Hosted Empty Inc.', 'p11-hosted-empty', 'active', 'BBD', 'America/Barbados', 'empty-p11-hosted@example.test', now(), null),
  ('92000000-0000-4000-8000-000000001103', 'P11 Hosted Other', 'P11 Hosted Other Inc.', 'p11-hosted-other', 'onboarding', 'USD', 'America/New_York', 'other-p11-hosted@example.test', null, null),
  ('92000000-0000-4000-8000-000000001104', 'P11 Hosted Suspended', 'P11 Hosted Suspended Inc.', 'p11-hosted-suspended', 'suspended', 'BBD', 'America/Barbados', 'suspended-p11-hosted@example.test', now(), now());

insert into public.church_memberships (church_id, user_id, role, status)
values
  ('92000000-0000-4000-8000-000000001101', '91000000-0000-4000-8000-000000001101', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000001101', '91000000-0000-4000-8000-000000001103', 'staff', 'active'),
  ('92000000-0000-4000-8000-000000001101', '91000000-0000-4000-8000-000000001104', 'finance_admin', 'active'),
  ('92000000-0000-4000-8000-000000001101', '91000000-0000-4000-8000-000000001105', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000001102', '91000000-0000-4000-8000-000000001101', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000001103', '91000000-0000-4000-8000-000000001102', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000001104', '91000000-0000-4000-8000-000000001101', 'owner', 'active');

insert into public.funds (
  id, church_id, name, slug, description, status, is_default, sort_order
) values
  ('94000000-0000-4000-8000-000000001101', '92000000-0000-4000-8000-000000001101', 'Campaigns', 'campaigns', 'Campaign route', 'active', false, 1),
  ('94000000-0000-4000-8000-000000001102', '92000000-0000-4000-8000-000000001101', 'Legacy', 'legacy', null, 'archived', false, 2),
  ('94000000-0000-4000-8000-000000001103', '92000000-0000-4000-8000-000000001103', 'Other Campaigns', 'other-campaigns', null, 'active', false, 1);

insert into public.campaigns (
  id, church_id, fund_id, name, slug, description, status,
  goal_amount_minor, currency, ends_at
) values
  ('95000000-0000-4000-8000-000000001101', '92000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', 'Draft Appeal', 'draft-appeal', 'Draft', 'draft', 500000, 'BBD', null),
  ('95000000-0000-4000-8000-000000001102', '92000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', 'Active Appeal', 'active-appeal', 'Active', 'active', 1000000, 'BBD', null),
  ('95000000-0000-4000-8000-000000001103', '92000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', 'Recurring Appeal', 'recurring-appeal', null, 'active', null, 'BBD', null),
  ('95000000-0000-4000-8000-000000001104', '92000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', 'Closed Appeal', 'closed-appeal', null, 'closed', null, 'BBD', null),
  ('95000000-0000-4000-8000-000000001105', '92000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', 'Archived Appeal', 'archived-appeal', null, 'archived', null, 'BBD', null),
  ('95000000-0000-4000-8000-000000001106', '92000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', 'Ended Draft', 'ended-draft', null, 'draft', null, 'BBD', '2020-01-01Z'),
  ('95000000-0000-4000-8000-000000001107', '92000000-0000-4000-8000-000000001103', '94000000-0000-4000-8000-000000001103', 'Other Appeal', 'other-appeal', null, 'draft', null, 'USD', null);

insert into public.donors (id, church_id, display_name, email)
values ('96000000-0000-4000-8000-000000001101', '92000000-0000-4000-8000-000000001101', 'P11 Hosted Donor', 'donor-p11-hosted@example.test');
insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status,
  is_primary, charges_enabled, recurring_enabled, supported_currencies
) values (
  '97000000-0000-4000-8000-000000001101', '92000000-0000-4000-8000-000000001101',
  'mock', 'p11-hosted-account', 'active', true, true, true, array['BBD']
);
insert into public.recurring_gifts (
  id, church_id, donor_id, fund_id, campaign_id, payment_connection_id,
  amount_minor, currency, frequency, status,
  provider_subscription_reference, started_at
) values (
  '98000000-0000-4000-8000-000000001101', '92000000-0000-4000-8000-000000001101',
  '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101',
  '95000000-0000-4000-8000-000000001103', '97000000-0000-4000-8000-000000001101',
  2500, 'BBD', 'monthly', 'active', 'p11-hosted-recurring', now()
);

insert into public.donations (
  id, church_id, donor_id, fund_id, campaign_id, payment_connection_id,
  source, status, amount_minor, refunded_amount_minor, currency,
  external_idempotency_key, donated_at, refunded_at
) values
  ('99000000-0000-4000-8000-000000001101', '92000000-0000-4000-8000-000000001101', '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', '95000000-0000-4000-8000-000000001102', '97000000-0000-4000-8000-000000001101', 'online', 'succeeded', 1000, 0, 'BBD', 'p11-hosted-success', now(), null),
  ('99000000-0000-4000-8000-000000001102', '92000000-0000-4000-8000-000000001101', '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', '95000000-0000-4000-8000-000000001102', '97000000-0000-4000-8000-000000001101', 'online', 'partially_refunded', 1000, 200, 'BBD', 'p11-hosted-partial', now(), now()),
  ('99000000-0000-4000-8000-000000001103', '92000000-0000-4000-8000-000000001101', '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', '95000000-0000-4000-8000-000000001102', '97000000-0000-4000-8000-000000001101', 'online', 'refunded', 1000, 1000, 'BBD', 'p11-hosted-refunded', now(), now()),
  ('99000000-0000-4000-8000-000000001104', '92000000-0000-4000-8000-000000001101', '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', '95000000-0000-4000-8000-000000001102', '97000000-0000-4000-8000-000000001101', 'online', 'disputed', 1000, 0, 'BBD', 'p11-hosted-disputed', now(), null),
  ('99000000-0000-4000-8000-000000001105', '92000000-0000-4000-8000-000000001101', '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', '95000000-0000-4000-8000-000000001102', null, 'cash', 'succeeded', 5000, 0, 'BBD', null, now(), null),
  ('99000000-0000-4000-8000-000000001106', '92000000-0000-4000-8000-000000001101', '96000000-0000-4000-8000-000000001101', '94000000-0000-4000-8000-000000001101', '95000000-0000-4000-8000-000000001102', '97000000-0000-4000-8000-000000001101', 'online', 'pending', 9000, 0, 'BBD', 'p11-hosted-pending', null, null);

-- Migration/privilege contract (1-24).
select extensions.is((select column_default from information_schema.columns where table_schema='public' and table_name='churches' and column_name='campaigns_revision'), '0', 'campaign revision starts at zero');
select extensions.is((select count(*) from pg_constraint where conrelid='public.churches'::regclass and conname='churches_campaigns_revision_nonnegative'), 1::bigint, 'campaign revision is nonnegative');
select extensions.is((select is_nullable from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='fund_id'), 'NO', 'campaign fund is required');
select extensions.ok(to_regclass('public.campaigns_name_unique_idx') is not null, 'canonical campaign name is unique per church');
select extensions.ok(to_regclass('public.donations_campaign_progress_idx') is not null, 'eligible progress has a covering index');
select extensions.is((select relrowsecurity from pg_class where oid='public.church_campaign_mutation_requests'::regclass), true, 'ledger has RLS');
select extensions.is((select relforcerowsecurity from pg_class where oid='public.church_campaign_mutation_requests'::regclass), true, 'ledger forces RLS');
select extensions.ok(to_regprocedure('public.get_church_campaigns(uuid)') is not null and to_regprocedure('public.get_church_campaign_progress(uuid)') is not null and to_regprocedure('public.mutate_church_campaign(uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)') is not null, 'three exact campaign RPCs exist');
select extensions.is((select prorettype from pg_proc where oid='public.get_church_campaigns(uuid)'::regprocedure), 'public.church_campaign_snapshot'::regtype::oid, 'config returns scalar snapshot');
select extensions.is((select proretset from pg_proc where oid='public.get_church_campaign_progress(uuid)'::regprocedure), true, 'progress returns typed rows');
select extensions.is((select prorettype from pg_proc where oid='public.mutate_church_campaign(uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)'::regprocedure), 'public.church_campaign_mutation_result'::regtype::oid, 'mutation returns typed scalar');
select extensions.is(has_function_privilege('authenticated','public.get_church_campaigns(uuid)','EXECUTE'), true, 'authenticated can call config RPC');
select extensions.is(has_function_privilege('anon','public.get_church_campaigns(uuid)','EXECUTE'), false, 'anon cannot call config RPC');
select extensions.is(has_function_privilege('authenticated','public.get_church_campaign_progress(uuid)','EXECUTE'), true, 'authenticated can call progress boundary');
select extensions.is(has_function_privilege('anon','public.get_church_campaign_progress(uuid)','EXECUTE'), false, 'anon cannot call progress');
select extensions.is(has_function_privilege('authenticated','public.mutate_church_campaign(uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)','EXECUTE'), true, 'authenticated can call mutation boundary');
select extensions.is(has_function_privilege('anon','public.mutate_church_campaign(uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)','EXECUTE'), false, 'anon cannot call mutation');
select extensions.is(has_column_privilege('authenticated','public.campaigns','created_by','SELECT'), false, 'authenticated cannot read creator identity directly');
select extensions.is(has_column_privilege('authenticated','public.campaigns','status','SELECT'), true, 'authenticated retains reviewed config columns');
select extensions.is(has_table_privilege('service_role','public.campaigns','INSERT'), false, 'service role cannot bypass campaign create RPC');
select extensions.is(has_table_privilege('service_role','public.campaigns','UPDATE'), false, 'service role cannot bypass campaign mutation RPC');
select extensions.is(has_table_privilege('service_role','public.campaigns','DELETE'), false, 'service role cannot delete campaigns');
select extensions.is(has_table_privilege('authenticated','public.church_campaign_mutation_requests','SELECT'), false, 'authenticated cannot read the ledger');
select extensions.is(has_table_privilege('service_role','public.church_campaign_mutation_requests','SELECT'), false, 'service role cannot read the ledger');

-- Atomic config snapshots and progress privacy (25-34).
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.is((public.get_church_campaigns('92000000-0000-4000-8000-000000001102')).campaigns_revision, 0::bigint, 'empty snapshot returns revision');
select extensions.is(cardinality((public.get_church_campaigns('92000000-0000-4000-8000-000000001102')).campaigns), 0, 'empty snapshot returns typed empty array');
select extensions.is(cardinality((public.get_church_campaigns('92000000-0000-4000-8000-000000001101')).campaigns), 6, 'owner reads all campaign configurations');
select extensions.is(((((public.get_church_campaigns('92000000-0000-4000-8000-000000001101')).campaigns)[1]).status)::text, 'draft', 'config ordering is deterministic with drafts first');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001103';
set local role authenticated;
select extensions.is(cardinality((public.get_church_campaigns('92000000-0000-4000-8000-000000001101')).campaigns), 6, 'staff retains config read');
select extensions.throws_like($$select * from public.get_church_campaign_progress('92000000-0000-4000-8000-000000001101')$$, '%CAMPAIGNS_FORBIDDEN%', 'staff cannot read donation-derived progress');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001102';
set local role authenticated;
select extensions.throws_like($$select public.get_church_campaigns('92000000-0000-4000-8000-000000001101')$$, '%CAMPAIGNS_FORBIDDEN%', 'other tenant owner cannot read config');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.get_church_campaigns('92000000-0000-4000-8000-000000001104')$$, '%CAMPAIGNS_FORBIDDEN%', 'suspended church fails closed');
select extensions.is((select jsonb_build_object('raised',raised_amount_minor_text,'count',eligible_donation_count_text) from public.get_church_campaign_progress('92000000-0000-4000-8000-000000001101') where campaign_id='95000000-0000-4000-8000-000000001102'), '{"raised":"1800","count":"2"}'::jsonb, 'progress includes only remaining online finalized gifts');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001104';
set local role authenticated;
select extensions.is((select raised_amount_minor_text from public.get_church_campaign_progress('92000000-0000-4000-8000-000000001101') where campaign_id='95000000-0000-4000-8000-000000001102'), '1800', 'finance role may read progress');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001102';
set local role authenticated;
select extensions.throws_like($$select * from public.get_church_campaign_progress('92000000-0000-4000-8000-000000001101')$$, '%CAMPAIGNS_FORBIDDEN%', 'other tenant owner cannot read progress');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001105';
set local role authenticated;
select extensions.throws_like($$select * from public.get_church_campaign_progress('92000000-0000-4000-8000-000000001101')$$, '%CAMPAIGNS_FORBIDDEN%', 'inactive owner cannot read progress');
reset role;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select * from public.get_church_campaign_progress('92000000-0000-4000-8000-000000001104')$$, '%CAMPAIGNS_FORBIDDEN%', 'suspended church progress fails closed');
reset role;

-- Validation, create, replay, and draft update (35-56).
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_campaign(null,'92000000-0000-4000-8000-000000001101',0,'create',null,'Valid','valid',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_INVALID_REQUEST_ID%', 'null request is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',-1,'create',null,'Valid','valid',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_INVALID_EXPECTED_REVISION%', 'negative revision is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'destroy',null,null,null,null,null,null)$$, '%CAMPAIGNS_INVALID_OPERATION%', 'unknown operation is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'activate','95000000-0000-4000-8000-000000001101','Unexpected',null,null,null,null)$$, '%CAMPAIGNS_INVALID_ARGUMENTS%', 'lifecycle argument shape is strict');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'create',null,'x','valid',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_INVALID_NAME%', 'short name is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'create',null,'Valid','Bad Slug',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_INVALID_SLUG%', 'noncanonical slug is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'create',null,'Valid','valid',repeat('x',1001),'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_INVALID_DESCRIPTION%', 'long description is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'create',null,'Valid','valid',null,'94000000-0000-4000-8000-000000001101','0')$$, '%CAMPAIGNS_INVALID_GOAL%', 'zero goal is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',0,'create',null,'Valid','valid',null,'94000000-0000-4000-8000-000000001101','9007199254740992')$$, '%CAMPAIGNS_INVALID_GOAL%', 'unsafe integer goal is rejected');
select extensions.is((select jsonb_build_object('name',name,'description',description,'status',status,'goal',goal_amount_minor_text,'currency',currency,'starts',starts_at,'ends',ends_at,'revision',campaigns_revision,'replayed',replayed) from public.mutate_church_campaign('93000000-0000-4000-8000-000000001101','92000000-0000-4000-8000-000000001101',0,'create',null,U&'\00A0Mercy\2003Appeal\FEFF','mercy-appeal',U&'\00A0Community help\000D\000ALine two\2003','94000000-0000-4000-8000-000000001101','9007199254740991')), '{"name":"Mercy Appeal","description":"Community help\nLine two","status":"draft","goal":"9007199254740991","currency":"BBD","starts":null,"ends":null,"revision":1,"replayed":false}'::jsonb, 'create canonicalizes and returns lossless goal text');
select extensions.is((select image_url from public.campaigns where slug='mercy-appeal' and church_id='92000000-0000-4000-8000-000000001101'), null::text, 'new campaign image remains null');
select extensions.is((select jsonb_build_object('action',action_code,'entity',entity_code,'changes',sanitized_changes) from public.audit_logs where request_id='93000000-0000-4000-8000-000000001101'), jsonb_build_object('action','campaign_created','entity','campaign','changes',jsonb_build_object('campaign_id',(select id from public.campaigns where slug='mercy-appeal' and church_id='92000000-0000-4000-8000-000000001101'))), 'create audit contains only campaign ID');
reset role;
select extensions.ok((select payload_sha256 ~ '^[0-9a-f]{64}$' from public.church_campaign_mutation_requests where request_id='93000000-0000-4000-8000-000000001101'), 'private ledger stores canonical hash');
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001102','92000000-0000-4000-8000-000000001101',1,'create',null,'mercy appeal','mercy-two',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_NAME_CONFLICT%', 'case-insensitive duplicate name is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001103','92000000-0000-4000-8000-000000001101',1,'create',null,'Mercy Two','mercy-appeal',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_SLUG_CONFLICT%', 'duplicate immutable slug is rejected');
select extensions.is((select replayed from public.mutate_church_campaign('93000000-0000-4000-8000-000000001101','92000000-0000-4000-8000-000000001101',0,'create',null,'Mercy Appeal','mercy-appeal',E'Community help\nLine two','94000000-0000-4000-8000-000000001101','9007199254740991')), true, 'same canonical request replays before stale CAS');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001101','92000000-0000-4000-8000-000000001101',0,'create',null,'Changed','changed',null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_IDEMPOTENCY_CONFLICT%', 'changed request reuse is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001104','92000000-0000-4000-8000-000000001101',0,'update',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),'Stale',null,null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_REVISION_CONFLICT%', 'new stale request is rejected');
select extensions.is((select jsonb_build_object('name',name,'slug',slug,'description',description,'goal',goal_amount_minor_text,'revision',campaigns_revision) from public.mutate_church_campaign('93000000-0000-4000-8000-000000001105','92000000-0000-4000-8000-000000001101',1,'update',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),' Mercy   Outreach ',null,'','94000000-0000-4000-8000-000000001101',null)), '{"name":"Mercy Outreach","slug":"mercy-appeal","description":null,"goal":null,"revision":2}'::jsonb, 'draft update changes only mutable copy and goal');
select extensions.is((select sanitized_changes from public.audit_logs where request_id='93000000-0000-4000-8000-000000001105'), jsonb_build_object('campaign_id',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),'field_names',jsonb_build_array('description','goal_amount_minor','name')), 'update audit contains actual sorted field names');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',2,'update',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),'Mercy Outreach',null,null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_NO_CHANGES%', 'no-op update is rejected');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',2,'update',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),'Mercy Outreach',null,null,'94000000-0000-4000-8000-000000001102',null)$$, '%CAMPAIGNS_INVALID_ARGUMENTS%', 'draft fund cannot change');
reset role;

-- Lifecycle, immutable history, recurring safety, and rollback (57-84).
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.is((select jsonb_build_object('status',status,'revision',campaigns_revision) from public.mutate_church_campaign('93000000-0000-4000-8000-000000001106','92000000-0000-4000-8000-000000001101',2,'activate',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),null,null,null,null,null)), '{"status":"active","revision":3}'::jsonb, 'draft activates explicitly');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',3,'update',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),'Changed',null,null,'94000000-0000-4000-8000-000000001101',null)$$, '%CAMPAIGNS_NOT_DRAFT%', 'active configuration is frozen');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',3,'close','95000000-0000-4000-8000-000000001103',null,null,null,null,null)$$, '%CAMPAIGNS_ACTIVE_RECURRING_GIFTS%', 'nonterminal recurring gift blocks close');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',3,'activate','95000000-0000-4000-8000-000000001106',null,null,null,null,null)$$, '%CAMPAIGNS_WINDOW_ENDED%', 'ended legacy draft cannot activate');
select extensions.is((select status::text from public.mutate_church_campaign('93000000-0000-4000-8000-000000001107','92000000-0000-4000-8000-000000001101',3,'close',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),null,null,null,null,null)), 'closed', 'active campaign closes manually');
select extensions.is((select status::text from public.mutate_church_campaign('93000000-0000-4000-8000-000000001108','92000000-0000-4000-8000-000000001101',4,'archive',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),null,null,null,null,null)), 'archived', 'closed campaign archives');
select extensions.is((select jsonb_build_object('status',status,'revision',campaigns_revision) from public.mutate_church_campaign('93000000-0000-4000-8000-000000001109','92000000-0000-4000-8000-000000001101',5,'restore',(select id from public.campaigns where church_id='92000000-0000-4000-8000-000000001101' and slug='mercy-appeal'),null,null,null,null,null)), '{"status":"closed","revision":6}'::jsonb, 'archive restore returns to closed, never active');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',6,'archive','95000000-0000-4000-8000-000000001102',null,null,null,null,null)$$, '%CAMPAIGNS_NOT_CLOSED%', 'archive requires closed');
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001199','92000000-0000-4000-8000-000000001101',6,'restore','95000000-0000-4000-8000-000000001104',null,null,null,null,null)$$, '%CAMPAIGNS_NOT_ARCHIVED%', 'restore requires archived');
select extensions.is((select campaign_id from public.donations where id='99000000-0000-4000-8000-000000001101'), '95000000-0000-4000-8000-000000001102'::uuid, 'lifecycle never rewrites donation attribution');
reset role;
select extensions.throws_like($$update public.campaigns set slug='changed' where id='95000000-0000-4000-8000-000000001101'$$, '%CAMPAIGN_SLUG_IMMUTABLE%', 'slug is immutable for trusted updates');
select extensions.throws_like($$update public.campaigns set fund_id='94000000-0000-4000-8000-000000001102' where id='95000000-0000-4000-8000-000000001101'$$, '%CAMPAIGN_FUND_IMMUTABLE%', 'fund is immutable for trusted updates');
select extensions.throws_like($$update public.campaigns set currency='USD' where id='95000000-0000-4000-8000-000000001101'$$, '%CAMPAIGN_CURRENCY_IMMUTABLE%', 'currency is immutable for trusted updates');
select extensions.throws_like($$update public.campaigns set image_url='https://example.test/image.webp' where id='95000000-0000-4000-8000-000000001101'$$, '%CAMPAIGN_IMAGE_IMMUTABLE%', 'image is read-only in P11');
select extensions.throws_like($$update public.campaigns set starts_at=now() where id='95000000-0000-4000-8000-000000001101'$$, '%CAMPAIGN_DATES_IMMUTABLE%', 'dates are read-only in P11');
select extensions.throws_like($$insert into public.campaigns(church_id,fund_id,name,slug,status,currency) values('92000000-0000-4000-8000-000000001101','94000000-0000-4000-8000-000000001102','Bad Route','bad-route','draft','BBD')$$, '%CAMPAIGN_ROUTE_INVALID%', 'trusted direct insert cannot use archived fund');
insert into public.recurring_gifts (id,church_id,donor_id,fund_id,campaign_id,payment_connection_id,amount_minor,currency,frequency,status,provider_subscription_reference,started_at,canceled_at) values ('98000000-0000-4000-8000-000000001102','92000000-0000-4000-8000-000000001101','96000000-0000-4000-8000-000000001101','94000000-0000-4000-8000-000000001101','95000000-0000-4000-8000-000000001104','97000000-0000-4000-8000-000000001101',2500,'BBD','monthly','canceled','p11-hosted-canceled',now(),now());
select extensions.is((select status::text from public.recurring_gifts where id='98000000-0000-4000-8000-000000001102'), 'canceled', 'canceled history may reference closed campaign');
select extensions.throws_like($$update public.recurring_gifts set status='active',canceled_at=null where id='98000000-0000-4000-8000-000000001102'$$, '%RECURRING_CAMPAIGN_NOT_ACTIVE%', 'status-only recurring reactivation is blocked');
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$insert into public.campaigns(church_id,fund_id,name,slug,currency) values('92000000-0000-4000-8000-000000001101','94000000-0000-4000-8000-000000001101','Direct','direct','BBD')$$, '%permission denied%', 'authenticated direct insert is denied');
select extensions.throws_like($$select * from public.church_campaign_mutation_requests$$, '%permission denied%', 'authenticated cannot read private ledger');
reset role;
set local role service_role;
select extensions.throws_like($$update public.campaigns set status='active' where id='95000000-0000-4000-8000-000000001101'$$, '%permission denied%', 'service role cannot bypass campaign workflow');
select extensions.throws_like($$select * from public.church_campaign_mutation_requests$$, '%permission denied%', 'service role cannot read private ledger');
reset role;
select extensions.throws_like($$update public.church_campaign_mutation_requests set payload_sha256=repeat('a',64) where request_id='93000000-0000-4000-8000-000000001101'$$, '%CAMPAIGNS_LEDGER_APPEND_ONLY%', 'ledger update is blocked');
select extensions.throws_like($$delete from public.church_campaign_mutation_requests where request_id='93000000-0000-4000-8000-000000001101'$$, '%CAMPAIGNS_LEDGER_APPEND_ONLY%', 'ledger delete is blocked');
select extensions.throws_like($$truncate public.church_campaign_mutation_requests$$, '%CAMPAIGNS_LEDGER_APPEND_ONLY%', 'ledger truncate is blocked');
create function public.p11_hosted_force_late_failure() returns trigger language plpgsql set search_path='' as $$begin raise exception 'P11_FORCED_LATE_FAILURE'; end;$$;
create trigger p11_hosted_force_late_failure before insert on public.church_campaign_mutation_requests for each row execute function public.p11_hosted_force_late_failure();
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000001101';
set local role authenticated;
select extensions.throws_like($$select public.mutate_church_campaign('93000000-0000-4000-8000-000000001198','92000000-0000-4000-8000-000000001101',6,'archive','95000000-0000-4000-8000-000000001104',null,null,null,null,null)$$, '%P11_FORCED_LATE_FAILURE%', 'late ledger failure aborts mutation');
reset role;
drop trigger p11_hosted_force_late_failure on public.church_campaign_mutation_requests;
drop function public.p11_hosted_force_late_failure();
select extensions.is((select jsonb_build_object('revision',(select campaigns_revision from public.churches where id='92000000-0000-4000-8000-000000001101'),'status',(select status from public.campaigns where id='95000000-0000-4000-8000-000000001104'),'failed',(select count(*) from public.church_campaign_mutation_requests where request_id='93000000-0000-4000-8000-000000001198'))), '{"revision":6,"status":"closed","failed":0}'::jsonb, 'late failure rolls back campaign, revision, audit, and ledger');
select extensions.ok(not exists(select 1 from public.audit_logs where church_id='92000000-0000-4000-8000-000000001101' and sanitized_changes::text ~* '(Mercy|Community help)'), 'audit payloads contain no names or descriptions');
select extensions.is((select jsonb_build_object('revision',(select campaigns_revision from public.churches where id='92000000-0000-4000-8000-000000001101'),'ledgers',count(*),'audits',(select count(*) from public.audit_logs where church_id='92000000-0000-4000-8000-000000001101')) from public.church_campaign_mutation_requests where church_id='92000000-0000-4000-8000-000000001101'), '{"revision":6,"ledgers":6,"audits":6}'::jsonb, 'each successful mutation has one revision, ledger, and audit');

select * from extensions.finish();
rollback;
