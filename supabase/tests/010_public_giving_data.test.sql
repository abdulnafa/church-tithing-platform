begin;

create extension if not exists pgtap with schema extensions;

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  logo_storage_path, logo_url, primary_color, secondary_color,
  thank_you_message, created_at, activated_at, suspended_at
) values
  (
    'd1000000-0000-4000-8000-000000000001', 'P14 Hosted Active',
    'P14 Hosted Active Inc.', 'p14-hosted-active', 'active', 'BBD',
    'America/Barbados',
    'd1000000-0000-4000-8000-000000000001/d1000000-0000-4000-8000-000000000099.webp',
    'javascript:legacy-is-not-public', '#1f6d60', '#e1b85a',
    E'Hosted thanks.\r\nLine two.\rLine three.',
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'd2000000-0000-4000-8000-000000000001', 'P14 Hosted Other',
    'P14 Hosted Other Inc.', 'p14-hosted-other', 'active', 'USD',
    'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'd3000000-0000-4000-8000-000000000001', 'P14 Hosted Onboarding',
    'P14 Hosted Onboarding Inc.', 'p14-hosted-onboarding', 'onboarding',
    'BBD', 'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days', null, null
  ),
  (
    'd4000000-0000-4000-8000-000000000001', 'P14 Hosted Suspended',
    'P14 Hosted Suspended Inc.', 'p14-hosted-suspended', 'suspended',
    'BBD', 'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days',
    transaction_timestamp() - interval '1 day'
  ),
  (
    'd5000000-0000-4000-8000-000000000001', 'P14 Hosted Canceled',
    'P14 Hosted Canceled Inc.', 'p14-hosted-canceled', 'canceled', 'BBD',
    'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days', null, null
  ),
  (
    'd6000000-0000-4000-8000-000000000001', 'P14 Hosted Archived',
    'P14 Hosted Archived Inc.', 'p14-hosted-archived', 'archived', 'BBD',
    'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days', null, null
  ),
  (
    'd7000000-0000-4000-8000-000000000001', 'X',
    'P14 Hosted Unsafe Inc.', 'p14-hosted-unsafe-name', 'active', 'BBD',
    'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'd8000000-0000-4000-8000-000000000001', 'P14 Hosted Bad Currency',
    'P14 Hosted Bad Currency Inc.', 'p14-hosted-bad-currency', 'active',
    'ZZZ', 'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'd9000000-0000-4000-8000-000000000001', 'P14 Hosted Branding',
    'P14 Hosted Branding Inc.', 'p14-hosted-branding', 'active', 'BBD',
    'America/Barbados',
    'd9000000-0000-4000-8000-000000000001/d9000000-0000-4000-8000-000000000099.webp',
    'https://legacy.invalid/logo.svg', '#abcdef', '#123abc',
    E'Unsafe\001thank-you', transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'da000000-0000-4000-8000-000000000001',
    pg_catalog.chr(65279) || pg_catalog.chr(160) || 'P14' ||
      pg_catalog.chr(8195) || 'Hosted' || pg_catalog.chr(160) ||
      'Canonical' || pg_catalog.chr(65279),
    'P14 Hosted Canonical Inc.', 'p14-hosted-canonical', 'active', 'BBD',
    'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'db000000-0000-4000-8000-000000000001',
    repeat(pg_catalog.chr(128591), 120), 'P14 Hosted 120 Inc.',
    'p14-hosted-name-120', 'active', 'BBD', 'America/Barbados',
    null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'dc000000-0000-4000-8000-000000000001',
    repeat(pg_catalog.chr(128591), 121), 'P14 Hosted 121 Inc.',
    'p14-hosted-name-121', 'active', 'BBD', 'America/Barbados',
    null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'dd000000-0000-4000-8000-000000000001', 'P14 Hosted Broken Default',
    'P14 Hosted Broken Default Inc.', 'p14-hosted-broken-default', 'active',
    'BBD', 'America/Barbados', null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  ),
  (
    'de000000-0000-4000-8000-000000000001',
    repeat(pg_catalog.chr(128591), 2000), 'P14 Hosted Oversized Inc.',
    'p14-hosted-oversized-name', 'active', 'BBD', 'America/Barbados',
    null, null, null, null, null,
    transaction_timestamp() - interval '20 days',
    transaction_timestamp() - interval '19 days', null
  );

update public.funds
set name = 'Tithes', description = 'The active default fund.'
where church_id = 'd1000000-0000-4000-8000-000000000001'
  and is_default;

insert into public.funds (
  id, church_id, name, slug, description, status, is_default, sort_order
) values
  (
    'd1000000-0000-4000-8000-000000000101',
    'd1000000-0000-4000-8000-000000000001',
    'Zeta Fund', 'zeta-fund', 'Configured first.', 'active', false, 1
  ),
  (
    'd1000000-0000-4000-8000-000000000102',
    'd1000000-0000-4000-8000-000000000001',
    'Alpha Fund', 'alpha-fund', 'Configured second.', 'active', false, 2
  ),
  (
    'd1000000-0000-4000-8000-000000000103',
    'd1000000-0000-4000-8000-000000000001',
    'Archived Route', 'archived-route', 'Campaign route closes.',
    'active', false, 3
  ),
  (
    'd1000000-0000-4000-8000-000000000104',
    'd1000000-0000-4000-8000-000000000001',
    'Multibyte Fund', 'multibyte-fund',
    repeat(pg_catalog.chr(128591), 500), 'active', false, 4
  ),
  (
    'd2000000-0000-4000-8000-000000000101',
    'd2000000-0000-4000-8000-000000000001',
    'Other Tenant Fund', 'other-tenant-fund', 'Must not cross tenants.',
    'active', false, 1
  );

insert into public.campaigns (
  id, church_id, fund_id, name, slug, description, status,
  goal_amount_minor, currency, starts_at, ends_at
) values
  (
    'd1000000-0000-4000-8000-000000000201',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000101',
    'Recent Campaign', 'recent-campaign', 'Currently visible.', 'active',
    9007199254740991, 'BBD', transaction_timestamp() - interval '1 day',
    transaction_timestamp() + interval '10 days'
  ),
  (
    'd1000000-0000-4000-8000-000000000202',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000102',
    'Always Campaign', 'always-campaign', 'No visibility dates.', 'active',
    null, 'BBD', null, null
  ),
  (
    'd1000000-0000-4000-8000-000000000203',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000102',
    'Future Campaign', 'future-campaign', 'Not started.', 'active', 1000,
    'BBD', transaction_timestamp() + interval '1 day',
    transaction_timestamp() + interval '10 days'
  ),
  (
    'd1000000-0000-4000-8000-000000000204',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000102',
    'Ended Campaign', 'ended-campaign', 'Already ended.', 'active', 1000,
    'BBD', transaction_timestamp() - interval '10 days',
    transaction_timestamp() - interval '1 day'
  ),
  (
    'd1000000-0000-4000-8000-000000000205',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000102',
    'Draft Campaign', 'draft-campaign', 'Not active.', 'draft', 1000,
    'BBD', null, null
  ),
  (
    'd1000000-0000-4000-8000-000000000206',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000103',
    'Archived Fund Campaign', 'archived-fund-campaign',
    'Its fund is no longer active.', 'active', 1000, 'BBD', null, null
  ),
  (
    'd1000000-0000-4000-8000-000000000207',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000104',
    'Multibyte Campaign', 'multibyte-campaign',
    repeat(pg_catalog.chr(128591), 1000), 'active', 5000, 'BBD',
    transaction_timestamp() - interval '2 days',
    transaction_timestamp() + interval '10 days'
  ),
  (
    'd2000000-0000-4000-8000-000000000201',
    'd2000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000101',
    'Other Tenant Campaign', 'other-tenant-campaign',
    'Must not cross tenants.', 'active', 1000, 'USD', null, null
  );

update public.funds set status = 'archived'
where id = 'd1000000-0000-4000-8000-000000000103';

insert into public.donations (
  church_id, fund_id, campaign_id, source, status, amount_minor,
  currency, donated_at
) values (
  'd1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000101',
  'd1000000-0000-4000-8000-000000000201',
  'cash', 'succeeded', 987654, 'BBD', transaction_timestamp()
);

-- Deliberately violate only this fixture's deferred aggregate invariant. P14
-- must fail closed rather than exposing a page without one active default.
update public.funds set is_default = false
where church_id = 'dd000000-0000-4000-8000-000000000001'
  and is_default;

select extensions.plan(84);

-- Typed schema, indexes, ACLs, and retired global projections (1-31).
select extensions.ok(to_regprocedure('public.get_public_giving_page(text)') is not null, 'public giving page RPC exists');
select extensions.ok(to_regprocedure('public.get_public_church_identities(uuid[])') is not null, 'bounded public identity RPC exists');
select extensions.is((select proretset and prorettype='public.public_giving_page_record'::regtype from pg_proc where oid='public.get_public_giving_page(text)'::regprocedure), true, 'page RPC returns SETOF exact record');
select extensions.is((select proretset and prorettype='public.public_church_identity_record'::regtype from pg_proc where oid='public.get_public_church_identities(uuid[])'::regprocedure), true, 'identity RPC returns SETOF exact record');
select extensions.ok(to_regtype('public.public_church_identity_record') is not null, 'identity record type exists');
select extensions.ok(to_regtype('public.public_giving_fund_record') is not null, 'fund record type exists');
select extensions.ok(to_regtype('public.public_giving_campaign_record') is not null, 'campaign record type exists');
select extensions.ok(to_regtype('public.public_giving_page_record') is not null, 'page record type exists');
select extensions.ok(to_regprocedure('public.canonicalize_public_display_name(text)') is not null, 'display-name canonicalizer exists');
select extensions.ok(to_regprocedure('public.canonicalize_public_multiline_text(text)') is not null, 'multiline canonicalizer exists');
select extensions.ok(to_regclass('public.churches_public_identity_idx') is not null, 'active identity lookup is indexed');
select extensions.ok(to_regclass('public.churches_public_giving_slug_idx') is not null, 'active slug lookup is indexed');
select extensions.ok(to_regclass('public.funds_public_giving_order_idx') is not null, 'active fund order is indexed');
select extensions.ok(to_regclass('public.campaigns_public_giving_order_idx') is not null, 'active campaign order is indexed');
select extensions.is((select count(*) from pg_indexes where schemaname='public' and indexname in ('churches_public_identity_idx','churches_public_giving_slug_idx','funds_public_giving_order_idx','campaigns_public_giving_order_idx') and indexdef ~* 'INCLUDE[^)]*(description|thank_you_message)'), 0::bigint, 'public indexes never include large free text');
select extensions.is((select count(*) from pg_policies where schemaname='public' and policyname in ('churches_public_read_active','funds_public_read_active','campaigns_public_read_active','qr_links_public_read_active')), 0::bigint, 'global anonymous configuration policies are removed');
select extensions.is(has_function_privilege('anon','public.get_public_giving_page(text)','EXECUTE'), true, 'anon may call page RPC');
select extensions.is(has_function_privilege('anon','public.get_public_church_identities(uuid[])','EXECUTE'), true, 'anon may call identity RPC');
select extensions.is(has_function_privilege('authenticated','public.get_public_giving_page(text)','EXECUTE'), false, 'authenticated cannot call page RPC');
select extensions.is(has_function_privilege('authenticated','public.get_public_church_identities(uuid[])','EXECUTE'), false, 'authenticated cannot call identity RPC');
select extensions.is(has_function_privilege('service_role','public.get_public_giving_page(text)','EXECUTE'), false, 'service role cannot call page RPC');
select extensions.is(has_function_privilege('service_role','public.get_public_church_identities(uuid[])','EXECUTE'), false, 'service role cannot call identity RPC');
select extensions.is(has_function_privilege('anon','public.canonicalize_public_display_name(text)','EXECUTE'), false, 'anon cannot call internal name helper');
select extensions.is(has_function_privilege('authenticated','public.canonicalize_public_multiline_text(text)','EXECUTE'), false, 'authenticated cannot call internal multiline helper');
select extensions.is(has_type_privilege('anon','public.public_giving_page_record','USAGE'), true, 'anon may use page result type');
select extensions.is(has_type_privilege('authenticated','public.public_giving_page_record','USAGE'), false, 'authenticated cannot use page result type');
select extensions.is(has_column_privilege('anon','public.churches','id','SELECT'), false, 'anon cannot directly enumerate churches');
select extensions.is(has_column_privilege('anon','public.funds','id','SELECT'), false, 'anon cannot directly enumerate funds');
select extensions.is(has_column_privilege('anon','public.campaigns','id','SELECT'), false, 'anon cannot directly enumerate campaigns');
select extensions.is(has_column_privilege('anon','public.qr_links','short_code','SELECT'), false, 'anon cannot directly enumerate QR routes');
select extensions.is((select count(*) from public.payment_provider_connections where church_id='d1000000-0000-4000-8000-000000000001'), 0::bigint, 'active fixture has no provider dependency');

-- Anonymous page shape, ordering, filters, and canonical public copy (32-59).
set local role anon;
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-active')), 1::bigint, 'active usable slug returns exactly one page');
select extensions.is((select jsonb_build_object('id',page.church_id,'slug',page.church_slug,'name',page.display_name,'currency',page.default_currency,'primary',page.primary_color,'secondary',page.secondary_color) from public.get_public_giving_page('p14-hosted-active') page), '{"id":"d1000000-0000-4000-8000-000000000001","slug":"p14-hosted-active","name":"P14 Hosted Active","currency":"BBD","primary":"#1F6D60","secondary":"#E1B85A"}'::jsonb, 'page returns canonical minimum church profile and colours');
select extensions.set_eq($$select key from public.get_public_giving_page('p14-hosted-active') page cross join lateral jsonb_object_keys(to_jsonb(page)) key$$, array['church_id','church_slug','display_name','default_currency','logo_storage_path','primary_color','secondary_color','thank_you_message','funds','campaigns'], 'page record exposes exact reviewed keys');
select extensions.set_eq($$select key from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.funds) fund cross join lateral jsonb_object_keys(to_jsonb(fund)) key limit 4$$, array['fund_id','name','description','is_default'], 'fund record exposes exact reviewed keys');
select extensions.set_eq($$select key from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.campaigns) campaign cross join lateral jsonb_object_keys(to_jsonb(campaign)) key limit 5$$, array['campaign_id','fund_id','name','description','goal_amount_minor_text'], 'campaign record exposes exact reviewed keys');
select extensions.is((select string_agg(fund.name,',' order by ordinality) from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.funds) with ordinality fund(fund_id,name,description,is_default,ordinality)), 'Tithes,Zeta Fund,Alpha Fund,Multibyte Fund', 'all and only active funds use configured deterministic order');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.funds) fund where fund.is_default), 1::bigint, 'successful page contains exactly one active default fund');
select extensions.is((select string_agg(campaign.name,',' order by ordinality) from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.campaigns) with ordinality campaign(campaign_id,fund_id,name,description,goal_amount_minor_text,ordinality)), 'Recent Campaign,Multibyte Campaign,Always Campaign', 'campaign order is deterministic and excludes future ended draft and archived-fund routes');
select extensions.is((select campaign.goal_amount_minor_text from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.campaigns) campaign where campaign.campaign_id='d1000000-0000-4000-8000-000000000201'), '9007199254740991', 'campaign goal remains lossless canonical decimal text');
select extensions.is((select char_length(fund.description) from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.funds) fund where fund.fund_id='d1000000-0000-4000-8000-000000000104'), 500, 'maximum multibyte fund description remains readable after lean index creation');
select extensions.is((select char_length(campaign.description) from public.get_public_giving_page('p14-hosted-active') page cross join lateral unnest(page.campaigns) campaign where campaign.campaign_id='d1000000-0000-4000-8000-000000000207'), 1000, 'maximum multibyte campaign description remains readable after lean index creation');
select extensions.ok(position('987654' in coalesce((select to_jsonb(page)::text from public.get_public_giving_page('p14-hosted-active') page), '')) = 0, 'donation amount and progress never enter the page projection');
select extensions.ok(position('javascript:' in coalesce((select to_jsonb(page)::text from public.get_public_giving_page('p14-hosted-active') page), '')) = 0, 'legacy logo URL never enters the page projection');
select extensions.is((select count(*) from public.get_public_giving_page('missing-p14-hosted')), 0::bigint, 'missing slug returns zero rows');
select extensions.is((select count(*) from public.get_public_giving_page('P14-HOSTED-ACTIVE')), 0::bigint, 'malformed noncanonical slug returns zero rows');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-onboarding')), 0::bigint, 'onboarding church is indistinguishable from missing');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-suspended')), 0::bigint, 'suspended church is indistinguishable from missing');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-canceled')), 0::bigint, 'canceled church is indistinguishable from missing');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-archived')), 0::bigint, 'archived church is indistinguishable from missing');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-unsafe-name')), 0::bigint, 'unsafe essential name fails closed');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-bad-currency')), 0::bigint, 'unsupported essential currency fails closed');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-broken-default')), 0::bigint, 'missing active default foundation fails closed');
select extensions.is((select display_name from public.get_public_giving_page('p14-hosted-canonical')), 'P14 Hosted Canonical', 'NBSP FEFF and Unicode spacing normalize with JavaScript parity');
select extensions.is((select char_length(display_name) from public.get_public_giving_page('p14-hosted-name-120')), 120, '120 astral code points remain valid');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-name-121')), 0::bigint, '121 astral code points fail closed');
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-oversized-name')), 0::bigint, 'oversized active legacy name remains writable but fails closed without entering an index');
select extensions.is((select thank_you_message from public.get_public_giving_page('p14-hosted-active')), E'Hosted thanks.\nLine two.\nLine three.', 'CRLF and bare CR canonicalize to LF');
select extensions.is((select thank_you_message from public.get_public_giving_page('p14-hosted-branding')), null::text, 'unsafe optional thank-you degrades to null');
reset role;

-- Bounded identity lookup and role enforcement (60-75).
set local role anon;
select extensions.is((select array_agg(church_id order by church_id) from public.get_public_church_identities(array['d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001']::uuid[])), array['d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001']::uuid[], 'identity lookup returns only exact requested active churches in deterministic order');
select extensions.set_eq($$select key from public.get_public_church_identities(array['d1000000-0000-4000-8000-000000000001']::uuid[]) identity cross join lateral jsonb_object_keys(to_jsonb(identity)) key$$, array['church_id','display_name','church_slug'], 'identity record exposes exact reviewed keys');
select extensions.is((select count(*) from public.get_public_church_identities(null::uuid[])), 0::bigint, 'null identity array fails closed');
select extensions.is((select count(*) from public.get_public_church_identities(array[]::uuid[])), 0::bigint, 'empty identity array fails closed');
select extensions.is((select count(*) from public.get_public_church_identities(array['d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001']::uuid[])), 0::bigint, 'duplicate identity array fails closed');
select extensions.is((select count(*) from public.get_public_church_identities(array['d1000000-0000-4000-8000-000000000001'::uuid,null::uuid])), 0::bigint, 'null identity member fails closed');
select extensions.is((select count(*) from public.get_public_church_identities((select array_agg(('e0000000-0000-4000-8000-' || pg_catalog.lpad(number::text,12,'0'))::uuid) from pg_catalog.generate_series(1,51) number))), 0::bigint, 'identity lookup rejects more than 50 IDs');
select extensions.is((select count(*) from public.get_public_church_identities(array['d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001']::uuid[])), 0::bigint, 'all inactive lifecycle states are indistinguishable in identity lookup');
select extensions.is((select display_name from public.get_public_church_identities(array['da000000-0000-4000-8000-000000000001']::uuid[])), 'P14 Hosted Canonical', 'identity lookup uses the same explicit Unicode name canonicalization');
select extensions.is((select count(*) from public.get_public_church_identities(array['dc000000-0000-4000-8000-000000000001']::uuid[])), 0::bigint, 'identity lookup rejects overlong public name');
select extensions.throws_like($$select id from public.churches limit 1$$, '%permission denied%', 'anon direct church reads are denied');
select extensions.throws_like($$select id from public.funds limit 1$$, '%permission denied%', 'anon direct fund reads are denied');
select extensions.throws_like($$select short_code from public.qr_links limit 1$$, '%permission denied%', 'anon direct QR enumeration is denied');
reset role;

set local role authenticated;
select extensions.throws_like($$select * from public.get_public_giving_page('p14-hosted-active')$$, '%permission denied%', 'authenticated session cannot call anonymous page boundary');
select extensions.throws_like($$select * from public.get_public_church_identities(array['d1000000-0000-4000-8000-000000000001']::uuid[])$$, '%permission denied%', 'authenticated session cannot call anonymous identity boundary');
reset role;

set local role service_role;
select extensions.throws_like($$select * from public.get_public_giving_page('p14-hosted-active')$$, '%permission denied%', 'service role cannot call anonymous page boundary');
reset role;

-- Optional legacy branding degrades safely instead of hiding the page (76-80).
alter table public.churches
  drop constraint churches_logo_storage_path_format,
  drop constraint churches_primary_color_format,
  drop constraint churches_secondary_color_format;
update public.churches
set
  logo_storage_path = 'd2000000-0000-4000-8000-000000000001/d2000000-0000-4000-8000-000000000099.webp',
  primary_color = 'not-a-color',
  secondary_color = '#12345G'
where id = 'd9000000-0000-4000-8000-000000000001';

set local role anon;
select extensions.is((select count(*) from public.get_public_giving_page('p14-hosted-branding')), 1::bigint, 'malformed optional legacy branding keeps usable page available');
select extensions.is((select logo_storage_path from public.get_public_giving_page('p14-hosted-branding')), null::text, 'cross-tenant legacy logo path degrades to null');
select extensions.is((select primary_color from public.get_public_giving_page('p14-hosted-branding')), null::text, 'malformed primary colour degrades to null');
select extensions.is((select secondary_color from public.get_public_giving_page('p14-hosted-branding')), null::text, 'malformed secondary colour degrades to null');
select extensions.throws_like($$select id from public.campaigns limit 1$$, '%permission denied%', 'anon direct campaign reads are denied');
reset role;

-- The security-definer reads never mutate tenant or financial state (81-84).
select extensions.is((select count(*) from public.churches where id between 'd1000000-0000-4000-8000-000000000001' and 'de000000-0000-4000-8000-000000000001'), 14::bigint, 'public reads do not mutate church fixtures');
select extensions.is((select count(*) from public.donations where church_id='d1000000-0000-4000-8000-000000000001' and amount_minor=987654), 1::bigint, 'public reads do not mutate donation fixture');
select extensions.is((select count(*) from public.payment_provider_connections where church_id='d1000000-0000-4000-8000-000000000001'), 0::bigint, 'public page remains independent of provider state');
select extensions.is((select count(*) from public.platform_subscriptions where church_id='d1000000-0000-4000-8000-000000000001'), 0::bigint, 'public page remains independent of subscription state');

select * from extensions.finish();
rollback;
