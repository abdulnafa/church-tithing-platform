begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(90);

-- Schema, consent evidence, RLS, and privilege contract (1-31).
select extensions.is(
  (select count(*) from public.prayer_request_consent_versions),
  0::bigint,
  'P16 registers no unapproved consent version'
);
select extensions.is(
  (select is_nullable from information_schema.columns
   where table_schema='public' and table_name='prayer_requests'
     and column_name='donation_id'),
  'YES',
  'donation linkage is optional'
);
select extensions.is(
  (select is_nullable from information_schema.columns
   where table_schema='public' and table_name='prayer_requests'
     and column_name='consent_version_id'),
  'NO',
  'consent version evidence is mandatory'
);
select extensions.is(
  (select column_default from information_schema.columns
   where table_schema='public' and table_name='prayer_requests'
     and column_name='revision'),
  '0',
  'review revision starts at zero'
);
select extensions.is(
  (select column_default from information_schema.columns
   where table_schema='public' and table_name='prayer_requests'
     and column_name='retention_policy_status'),
  '''pending_client_approval''::text',
  'retention remains explicitly pending client approval'
);
select extensions.is(
  (select relrowsecurity from pg_class
   where oid='public.prayer_requests'::regclass),
  true,
  'prayer requests enable RLS'
);
select extensions.is(
  (select relforcerowsecurity from pg_class
   where oid='public.prayer_requests'::regclass),
  true,
  'prayer requests force RLS'
);
select extensions.is(
  (select relforcerowsecurity from pg_class
   where oid='public.prayer_request_consent_versions'::regclass),
  true,
  'consent catalog forces RLS'
);
select extensions.is(
  (select relforcerowsecurity from pg_class
   where oid='public.prayer_request_review_requests'::regclass),
  true,
  'review ledger forces RLS'
);
select extensions.is(
  (select count(*) from pg_policies
   where schemaname='public' and tablename='prayer_requests'),
  0::bigint,
  'no direct prayer-request policy remains'
);
select extensions.is(
  (select count(*) from pg_policies
   where schemaname='public'
     and tablename in (
       'prayer_request_consent_versions',
       'prayer_request_review_requests'
     )),
  0::bigint,
  'private consent and review ledgers have no policies'
);
select extensions.is(
  (select confdeltype::text from pg_constraint
   where conname='prayer_requests_church_id_fkey'),
  'r',
  'church deletion cannot cascade prayer text'
);
select extensions.is(
  (select confdeltype::text from pg_constraint
   where conname='prayer_requests_reviewed_by_fkey'),
  'r',
  'reviewer deletion cannot erase prayer review attribution'
);
select extensions.is(
  (select confdeltype::text from pg_constraint
   where conname='prayer_requests_consent_version_fkey'),
  'r',
  'consent evidence deletion is restricted'
);
select extensions.is(
  (select count(*) from pg_indexes
   where schemaname='public' and indexname='prayer_requests_queue_idx'),
  1::bigint,
  'mixed queue order has an index'
);
select extensions.is(
  (select count(*) from pg_indexes
   where schemaname='public'
     and indexname='prayer_requests_consent_version_fk_idx'),
  1::bigint,
  'consent-version foreign key is indexed'
);
select extensions.is(
  has_table_privilege('anon', 'public.prayer_requests', 'SELECT'),
  false,
  'anonymous role cannot read prayer text directly'
);
select extensions.is(
  has_table_privilege('authenticated', 'public.prayer_requests', 'SELECT'),
  false,
  'authenticated role cannot read prayer text directly'
);
select extensions.is(
  has_table_privilege('service_role', 'public.prayer_requests', 'SELECT'),
  false,
  'service role cannot read prayer text directly'
);
select extensions.is(
  has_table_privilege('authenticated', 'public.prayer_requests', 'UPDATE'),
  false,
  'authenticated role cannot update prayer rows directly'
);
select extensions.is(
  has_table_privilege('authenticated', 'public.prayer_requests', 'DELETE'),
  false,
  'authenticated role cannot delete prayer rows directly'
);
select extensions.is(
  has_table_privilege('service_role', 'public.prayer_requests', 'DELETE'),
  false,
  'service role has no prayer deletion authority'
);
select extensions.is(
  (select count(*) from information_schema.column_privileges
   where table_schema='public' and table_name='prayer_requests'
     and grantee in ('anon','authenticated','service_role')),
  0::bigint,
  'no application role has a hidden prayer column grant'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.get_prayer_request_queue(uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated role may execute the bounded queue RPC'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.get_prayer_request_queue(uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous role cannot execute the queue RPC'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.get_prayer_request_queue(uuid)',
    'EXECUTE'
  ),
  false,
  'service role cannot execute the queue RPC'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.review_prayer_request(uuid,uuid,uuid,bigint)',
    'EXECUTE'
  ),
  true,
  'authenticated role may execute the guarded review RPC'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.review_prayer_request(uuid,uuid,uuid,bigint)',
    'EXECUTE'
  ),
  false,
  'service role cannot execute the review RPC'
);
select extensions.is(
  (select prokind::text from pg_proc
   where oid='public.get_prayer_request_queue(uuid)'::regprocedure),
  'f',
  'queue boundary is a function'
);
select extensions.is(
  (select prosecdef from pg_proc
   where oid='public.get_prayer_request_queue(uuid)'::regprocedure),
  true,
  'queue boundary is security definer'
);
select extensions.is(
  (select prosecdef from pg_proc
   where oid='public.review_prayer_request(uuid,uuid,uuid,bigint)'::regprocedure),
  true,
  'review boundary is security definer'
);

-- Exact body canonicalization and unsafe-formatting parity (32-41).
select extensions.is(
  public.canonicalize_prayer_request_body(E' \tLine one\r\nLine two\r \n'),
  E'Line one\nLine two',
  'CRLF and CR normalize to LF and outer ASCII whitespace trims'
);
select extensions.is(
  public.canonicalize_prayer_request_body(chr(160) || 'Prayer' || chr(160)),
  chr(160) || 'Prayer' || chr(160),
  'NBSP is preserved rather than silently canonicalized'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting(E'Line\tA\nLine B'),
  false,
  'internal TAB and LF are safe'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(8) || 'B'),
  true,
  'forbidden C0 control is rejected'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(11) || 'B'),
  true,
  'vertical tab is rejected'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(127) || 'B'),
  true,
  'DEL is rejected'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(133) || 'B'),
  true,
  'C1 control is rejected'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(1564) || 'B'),
  true,
  'Arabic letter mark is rejected'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(8238) || 'B'),
  true,
  'bidi override is rejected'
);
select extensions.is(
  public.prayer_request_body_has_unsafe_formatting('A' || chr(8297) || 'B'),
  true,
  'bidi isolate terminator is rejected'
);

-- Rollback-only fixture. Raw consent wording is deliberately absent.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('81000000-0000-4000-8000-000000000001', 'owner-p16@example.test', now(),
    '{"display_name":"P16 Owner"}'),
  ('81000000-0000-4000-8000-000000000002', 'finance-p16@example.test', now(),
    '{"display_name":"P16 Finance"}'),
  ('81000000-0000-4000-8000-000000000003', 'staff-p16@example.test', now(),
    '{"display_name":"P16 Staff"}'),
  ('81000000-0000-4000-8000-000000000004', 'other-owner-p16@example.test', now(),
    '{"display_name":"P16 Other Owner"}'),
  ('81000000-0000-4000-8000-000000000005', 'inactive-owner-p16@example.test', now(),
    '{"display_name":"P16 Inactive Owner"}'),
  ('81000000-0000-4000-8000-000000000006', 'revoked-owner-p16@example.test', now(),
    '{"display_name":"P16 Revoked Owner"}'),
  ('81000000-0000-4000-8000-000000000007', 'onboarding-owner-p16@example.test', now(),
    '{"display_name":"P16 Onboarding Owner"}'),
  ('81000000-0000-4000-8000-000000000008', 'suspended-owner-p16@example.test', now(),
    '{"display_name":"P16 Suspended Owner"}');

update public.profiles set is_active=false
where id='81000000-0000-4000-8000-000000000005';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at, suspended_at
) values
  ('82000000-0000-4000-8000-000000000001', 'P16 Primary',
    'P16 Primary Inc.', 'p16-hosted-primary', 'active', 'BBD',
    'America/Barbados', 'primary-p16@example.test', now(), null),
  ('82000000-0000-4000-8000-000000000002', 'P16 Other',
    'P16 Other Inc.', 'p16-hosted-other', 'active', 'BBD',
    'America/Barbados', 'other-p16@example.test', now(), null),
  ('82000000-0000-4000-8000-000000000003', 'P16 Onboarding',
    'P16 Onboarding Inc.', 'p16-hosted-onboarding', 'onboarding', 'BBD',
    'America/Barbados', 'onboarding-p16@example.test', null, null),
  ('82000000-0000-4000-8000-000000000004', 'P16 Suspended',
    'P16 Suspended Inc.', 'p16-hosted-suspended', 'suspended', 'BBD',
    'America/Barbados', 'suspended-p16@example.test', now(), now());

insert into public.church_memberships (church_id, user_id, role, status)
values
  ('82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000002', 'finance_admin', 'active'),
  ('82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000003', 'staff', 'active'),
  ('82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000004', 'owner', 'active'),
  ('82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000005', 'owner', 'active'),
  ('82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000006', 'owner', 'revoked'),
  ('82000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000007', 'owner', 'active'),
  ('82000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000008', 'owner', 'active');

insert into public.donors (id, church_id, display_name, email, is_anonymous)
values
  ('83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001', 'P16 Donor',
    'donor-p16@example.test', false),
  ('83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002', 'P16 Other Donor',
    'other-donor-p16@example.test', false);

insert into public.donations (
  id, church_id, donor_id, fund_id, source, status, amount_minor,
  currency, donor_display_name, donor_email, donated_at
) values
  ('84000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    (select id from public.funds
      where church_id='82000000-0000-4000-8000-000000000001' and is_default),
    'cash', 'succeeded', 5000, 'BBD', 'P16 Donor',
    'donor-p16@example.test', '2026-01-01T00:00:00Z'),
  ('84000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000002',
    (select id from public.funds
      where church_id='82000000-0000-4000-8000-000000000002' and is_default),
    'cash', 'succeeded', 6000, 'BBD', 'P16 Other Donor',
    'other-donor-p16@example.test', '2026-01-01T00:00:00Z');

insert into public.prayer_request_consent_versions (
  version_id, wording_sha256, approved_at
) values ('p16-hosted-v1', repeat('a',64), now());

insert into public.prayer_requests (
  id, church_id, donation_id, donor_id, body, consented_at,
  consent_version_id, created_at, updated_at, reviewed_at, reviewed_by,
  revision
) values
  ('85000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001', null, null,
    'Oldest pending prayer', '2026-01-01T00:00:00Z', 'p16-hosted-v1',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null, null, 0),
  ('85000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001', null, null,
    'Newer pending prayer', '2026-01-02T00:00:00Z', 'p16-hosted-v1',
    '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', null, null, 0),
  ('85000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000001', null, null,
    'Older reviewed prayer', '2026-01-03T00:00:00Z', 'p16-hosted-v1',
    '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z',
    '2026-01-04T00:00:00Z', '81000000-0000-4000-8000-000000000001', 1),
  ('85000000-0000-4000-8000-000000000004',
    '82000000-0000-4000-8000-000000000001', null, null,
    'Newer reviewed prayer', '2026-01-03T00:00:00Z', 'p16-hosted-v1',
    '2026-01-03T00:00:00Z', '2026-01-05T00:00:00Z',
    '2026-01-05T00:00:00Z', '81000000-0000-4000-8000-000000000001', 1),
  ('85000000-0000-4000-8000-000000000005',
    '82000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001', 'Hidden linked prayer',
    '2026-01-06T00:00:00Z', 'p16-hosted-v1',
    '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z', null, null, 0),
  ('85000000-0000-4000-8000-000000000006',
    '82000000-0000-4000-8000-000000000002', null, null,
    'Other tenant prayer', '2026-01-01T00:00:00Z', 'p16-hosted-v1',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null, null, 0),
  ('85000000-0000-4000-8000-000000000007',
    '82000000-0000-4000-8000-000000000003', null, null,
    'Onboarding prayer', '2026-01-01T00:00:00Z', 'p16-hosted-v1',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null, null, 0),
  ('85000000-0000-4000-8000-000000000008',
    '82000000-0000-4000-8000-000000000004', null, null,
    'Suspended prayer', '2026-01-01T00:00:00Z', 'p16-hosted-v1',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null, null, 0),
  ('85000000-0000-4000-8000-000000000009',
    '82000000-0000-4000-8000-000000000001', null, null,
    'Late failure prayer', '2026-01-07T00:00:00Z', 'p16-hosted-v1',
    '2026-01-07T00:00:00Z', '2026-01-07T00:00:00Z', null, null, 0);

-- Consent/body/linkage/retention checks with real rows (42-53).
select extensions.lives_ok(
  $$insert into public.prayer_requests (
      church_id, body, consented_at, consent_version_id
    ) values
      ('82000000-0000-4000-8000-000000000001', repeat('🙏',2000), now(),
        'p16-hosted-v1'),
      ('82000000-0000-4000-8000-000000000001', 'Second independent', now(),
        'p16-hosted-v1')$$,
  'multiple independent prayers and 2,000 code points are accepted'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, body, consented_at, consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001', repeat('🙏',2001),
      now(), 'p16-hosted-v1')$$,
  '%prayer_requests_body_canonical%',
  '2,001 code points are rejected'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, body, consented_at, consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001', '  not canonical  ',
      now(), 'p16-hosted-v1')$$,
  '%prayer_requests_body_canonical%',
  'noncanonical edge whitespace is rejected'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, body, consented_at, consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001',
      'unsafe' || chr(8238), now(), 'p16-hosted-v1')$$,
  '%prayer_requests_body_canonical%',
  'unsafe formatting is rejected at storage'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, body, consented_at, consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001', 'Unknown consent',
      now(), 'unknown-v1')$$,
  '%prayer_requests_consent_version_fkey%',
  'unknown consent version is rejected'
);
select extensions.throws_like(
  $$update public.prayer_request_consent_versions
      set wording_sha256=repeat('b',64) where version_id='p16-hosted-v1'$$,
  '%PRAYER_CONSENT_VERSION_IMMUTABLE%',
  'consent digest is immutable'
);
select extensions.throws_like(
  $$delete from public.prayer_request_consent_versions
      where version_id='p16-hosted-v1'$$,
  '%PRAYER_CONSENT_VERSION_IMMUTABLE%',
  'consent evidence cannot be deleted'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, donor_id, body, consented_at, consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001', 'Donor only', now(),
      'p16-hosted-v1')$$,
  '%prayer_requests_donor_requires_donation%',
  'donor identity cannot be attached without its donation'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, donation_id, donor_id, body, consented_at,
      consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000002', 'Cross tenant', now(),
      'p16-hosted-v1')$$,
  '%foreign key constraint%',
  'cross-tenant hidden linkage is rejected'
);
select extensions.throws_like(
  $$insert into public.prayer_requests (
      church_id, donation_id, donor_id, body, consented_at,
      consent_version_id
    ) values ('82000000-0000-4000-8000-000000000001',
      '84000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001', 'Duplicate link', now(),
      'p16-hosted-v1')$$,
  '%prayer_requests_one_per_donation%',
  'one nonnull donation can link to only one prayer'
);
select extensions.throws_like(
  $$update public.prayer_requests set deleted_at=now()
      where id='85000000-0000-4000-8000-000000000001'$$,
  '%PRAYER_REQUEST_PRIVATE_FIELDS_IMMUTABLE%',
  'no tombstone or retention mutation is available'
);
select extensions.throws_like(
  $$update public.prayer_requests set body='Changed body'
      where id='85000000-0000-4000-8000-000000000001'$$,
  '%PRAYER_REQUEST_PRIVATE_FIELDS_IMMUTABLE%',
  'prayer text is immutable'
);

delete from public.prayer_requests
where body in (repeat('🙏',2000), 'Second independent');

-- Owner queue, minimum DTO, ordering, and tenant/role failures (54-66).
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select count(*) from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000001')),
  6::bigint,
  'owner receives own church queue through RPC only'
);
select extensions.is(
  (select prayer_request_id from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000001') limit 1),
  '85000000-0000-4000-8000-000000000001'::uuid,
  'oldest unreviewed request is first'
);
select extensions.is(
  (select prayer_request_id from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000001') offset 4 limit 1),
  '85000000-0000-4000-8000-000000000004'::uuid,
  'most recently reviewed request leads reviewed group'
);
select extensions.is(
  (select array_agg(attribute.attname order by attribute.attnum)::text
   from pg_attribute attribute
   where attribute.attrelid='public.prayer_request_queue_record'::regclass
     and attribute.attnum > 0 and not attribute.attisdropped),
  '{prayer_request_id,body,is_reviewed,consented_at,created_at,reviewed_at,updated_at,revision}',
  'queue type contains only the approved fields in order'
);
select extensions.throws_like(
  $$select body from public.prayer_requests$$,
  '%permission denied%',
  'owner cannot bypass queue projection'
);
reset role;

set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_prayer_request_queue(
      '82000000-0000-4000-8000-000000000001')$$,
  '%PRAYER_QUEUE_FORBIDDEN%',
  'finance administrator cannot read prayer queue'
);
reset role;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000003';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_prayer_request_queue(
      '82000000-0000-4000-8000-000000000001')$$,
  '%PRAYER_QUEUE_FORBIDDEN%',
  'staff cannot read prayer queue'
);
reset role;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000005';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_prayer_request_queue(
      '82000000-0000-4000-8000-000000000001')$$,
  '%PRAYER_QUEUE_FORBIDDEN%',
  'inactive owner profile fails closed'
);
reset role;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000006';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_prayer_request_queue(
      '82000000-0000-4000-8000-000000000001')$$,
  '%PRAYER_QUEUE_FORBIDDEN%',
  'revoked owner membership fails closed'
);
reset role;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000008';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_prayer_request_queue(
      '82000000-0000-4000-8000-000000000004')$$,
  '%PRAYER_QUEUE_FORBIDDEN%',
  'suspended church fails closed'
);
reset role;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.is(
  (select count(*) from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000002')),
  1::bigint,
  'other owner sees only the other church queue'
);
select extensions.throws_like(
  $$select * from public.get_prayer_request_queue(
      '82000000-0000-4000-8000-000000000001')$$,
  '%PRAYER_QUEUE_FORBIDDEN%',
  'owner cannot cross tenant boundary'
);
reset role;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000007';
set local role authenticated;
select extensions.is(
  (select count(*) from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000003')),
  1::bigint,
  'onboarding owner retains current workspace prayer permission'
);
reset role;

-- One-way review, CAS, replay, audit minimization, and rollback (67-84).
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select replayed from public.review_prayer_request(
    '82000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000002',
    '86000000-0000-4000-8000-000000000001', 0)),
  false,
  'first exact review is not a replay'
);
reset role;
select extensions.is(
  (select revision from public.prayer_requests
   where id='85000000-0000-4000-8000-000000000002'),
  1::bigint,
  'review increments row revision once'
);
select extensions.ok(
  (select reviewed_at <= updated_at from public.prayer_requests
   where id='85000000-0000-4000-8000-000000000002'),
  'review timestamp never exceeds updated timestamp'
);
select extensions.is(
  (select reviewed_by from public.prayer_requests
   where id='85000000-0000-4000-8000-000000000002'),
  '81000000-0000-4000-8000-000000000001'::uuid,
  'review captures exact owner identity'
);
select extensions.is(
  (select sanitized_changes from public.audit_logs
   where action_code='prayer_request_reviewed'
     and entity_id='85000000-0000-4000-8000-000000000002'),
  '{"prayer_request_id":"85000000-0000-4000-8000-000000000002","reviewed":true}'::jsonb,
  'review audit stores only identifier and boolean state'
);
select extensions.ok(
  not (select sanitized_changes::text from public.audit_logs
       where action_code='prayer_request_reviewed'
         and entity_id='85000000-0000-4000-8000-000000000002')
      like '%Newer pending prayer%',
  'review audit excludes prayer text'
);
select extensions.is(
  (select count(*) from public.prayer_request_review_requests
   where prayer_request_id='85000000-0000-4000-8000-000000000002'),
  1::bigint,
  'review writes one private replay row'
);
select extensions.ok(
  (select payload_sha256 ~ '^[0-9a-f]{64}$'
   from public.prayer_request_review_requests
   where prayer_request_id='85000000-0000-4000-8000-000000000002'),
  'review ledger stores only an opaque payload digest'
);
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select replayed from public.review_prayer_request(
    '82000000-0000-4000-8000-000000000001',
    '85000000-0000-4000-8000-000000000002',
    '86000000-0000-4000-8000-000000000001', 0)),
  true,
  'exact retry returns stable replay'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001', 0)$$,
  '%PRAYER_REVIEW_IDEMPOTENCY_CONFLICT%',
  'same request UUID with another prayer conflicts'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000002', 1)$$,
  '%PRAYER_REVIEW_REVISION_CONFLICT%',
  'stale or future revision conflicts'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000003',
      '86000000-0000-4000-8000-000000000003', 1)$$,
  '%PRAYER_REVIEW_ALREADY_REVIEWED%',
  'reviewed row cannot transition again'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000006',
      '86000000-0000-4000-8000-000000000004', 0)$$,
  '%PRAYER_REVIEW_NOT_FOUND%',
  'cross-tenant prayer identifier is indistinguishable from missing'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001', null,
      '86000000-0000-4000-8000-000000000005', 0)$$,
  '%PRAYER_REVIEW_NOT_FOUND%',
  'null prayer identifier is a generic not-found result'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000001',
      '86000000-0000-3000-8000-000000000001', 0)$$,
  '%PRAYER_REVIEW_INVALID_REQUEST_ID%',
  'review request must be UUID v4'
);
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000006', -1)$$,
  '%PRAYER_REVIEW_INVALID_EXPECTED_REVISION%',
  'negative review revision is rejected'
);
select extensions.throws_like(
  $$update public.prayer_requests set reviewed_at=now(), revision=1
      where id='85000000-0000-4000-8000-000000000003'$$,
  '%permission denied%',
  'authenticated caller cannot rewrite reviewed state directly'
);
reset role;

update public.church_memberships set status='revoked'
where church_id='82000000-0000-4000-8000-000000000001'
  and user_id='81000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.review_prayer_request(
      '82000000-0000-4000-8000-000000000001',
      '85000000-0000-4000-8000-000000000002',
      '86000000-0000-4000-8000-000000000001', 0)$$,
  '%PRAYER_REVIEW_FORBIDDEN%',
  'removed owner cannot replay a former review result'
);
reset role;
update public.church_memberships set status='active'
where church_id='82000000-0000-4000-8000-000000000001'
  and user_id='81000000-0000-4000-8000-000000000001';

-- Cap and append-only/retention closure (85-90).
insert into public.prayer_requests (
  church_id, body, consented_at, consent_version_id, created_at, updated_at
)
select '82000000-0000-4000-8000-000000000001',
  'Generated pending ' || value::text,
  '2026-02-01T00:00:00Z'::timestamptz,
  'p16-hosted-v1',
  '2026-02-01T00:00:00Z'::timestamptz + value * interval '1 minute',
  '2026-02-01T00:00:00Z'::timestamptz + value * interval '1 minute'
from generate_series(1,101) value;
set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select count(*) from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000001')),
  100::bigint,
  'queue is capped at exactly 100 rows'
);
select extensions.is(
  (select prayer_request_id from public.get_prayer_request_queue(
    '82000000-0000-4000-8000-000000000001') limit 1),
  '85000000-0000-4000-8000-000000000001'::uuid,
  'cap retains oldest unreviewed request first'
);
reset role;
select extensions.throws_like(
  $$update public.prayer_request_review_requests set payload_sha256=repeat('f',64)
      where prayer_request_id='85000000-0000-4000-8000-000000000002'$$,
  '%PRAYER_REVIEW_LEDGER_APPEND_ONLY%',
  'review replay ledger is append-only'
);
select extensions.throws_like(
  $$delete from public.prayer_request_review_requests
      where prayer_request_id='85000000-0000-4000-8000-000000000002'$$,
  '%PRAYER_REVIEW_LEDGER_APPEND_ONLY%',
  'review replay ledger cannot be deleted'
);
select extensions.throws_like(
  $$delete from public.churches
      where id='82000000-0000-4000-8000-000000000001'$$,
  '%prayer_requests_church_id_fkey%',
  'church deletion cannot cascade prayer text'
);
select extensions.is(
  (select count(*) from public.prayer_requests where deleted_at is not null),
  0::bigint,
  'no prayer row has retention deletion state'
);

select * from extensions.finish();

rollback;
