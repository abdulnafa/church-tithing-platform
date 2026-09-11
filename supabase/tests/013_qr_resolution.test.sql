begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('f1100000-0000-4000-8000-000000000001', 'owner-p17@example.test', now(),
    '{"display_name":"P17 Owner"}'),
  ('f1100000-0000-4000-8000-000000000002', 'staff-p17@example.test', now(),
    '{"display_name":"P17 Staff"}'),
  ('f1100000-0000-4000-8000-000000000003', 'other-owner-p17@example.test', now(),
    '{"display_name":"P17 Other Owner"}'),
  ('f1100000-0000-4000-8000-000000000004', 'inactive-owner-p17@example.test', now(),
    '{"display_name":"P17 Inactive Owner"}'),
  ('f1100000-0000-4000-8000-000000000005', 'revoked-owner-p17@example.test', now(),
    '{"display_name":"P17 Revoked Owner"}'),
  ('f1100000-0000-4000-8000-000000000006', 'onboarding-owner-p17@example.test', now(),
    '{"display_name":"P17 Onboarding Owner"}'),
  ('f1100000-0000-4000-8000-000000000007', 'suspended-owner-p17@example.test', now(),
    '{"display_name":"P17 Suspended Owner"}');

update public.profiles
set is_active = false
where id = 'f1100000-0000-4000-8000-000000000004';

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at, suspended_at
) values
  ('f1200000-0000-4000-8000-000000000001', 'P17 Active',
    'P17 Active Inc.', 'p17-active', 'active', 'BBD', 'America/Barbados',
    'active-p17@example.test', now(), null),
  ('f1200000-0000-4000-8000-000000000002', 'P17 Other',
    'P17 Other Inc.', 'p17-other', 'active', 'BBD', 'America/Barbados',
    'other-p17@example.test', now(), null),
  ('f1200000-0000-4000-8000-000000000003', 'P17 Onboarding',
    'P17 Onboarding Inc.', 'p17-onboarding', 'onboarding', 'BBD',
    'America/Barbados', 'onboarding-p17@example.test', null, null),
  ('f1200000-0000-4000-8000-000000000004', 'P17 Suspended',
    'P17 Suspended Inc.', 'p17-suspended', 'suspended', 'BBD',
    'America/Barbados', 'suspended-p17@example.test', now(), now()),
  ('f1200000-0000-4000-8000-000000000005', 'P17 Canceled',
    'P17 Canceled Inc.', 'p17-canceled', 'canceled', 'BBD',
    'America/Barbados', 'canceled-p17@example.test', now(), now()),
  ('f1200000-0000-4000-8000-000000000006', 'P17 Archived',
    'P17 Archived Inc.', 'p17-archived', 'archived', 'BBD',
    'America/Barbados', 'archived-p17@example.test', now(), now());

insert into public.church_memberships (church_id, user_id, role, status)
values
  ('f1200000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('f1200000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000002', 'staff', 'active'),
  ('f1200000-0000-4000-8000-000000000002',
    'f1100000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('f1200000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000004', 'owner', 'active'),
  ('f1200000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000005', 'owner', 'revoked'),
  ('f1200000-0000-4000-8000-000000000003',
    'f1100000-0000-4000-8000-000000000006', 'owner', 'active'),
  ('f1200000-0000-4000-8000-000000000004',
    'f1100000-0000-4000-8000-000000000007', 'owner', 'active');

select pg_catalog.set_config(
  'p17.active_code',
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000001'),
  true
);
select pg_catalog.set_config(
  'p17.inactive_code',
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000002'),
  true
);
select pg_catalog.set_config(
  'p17.onboarding_code',
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000003'),
  true
);
select pg_catalog.set_config(
  'p17.suspended_code',
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000004'),
  true
);
select pg_catalog.set_config(
  'p17.canceled_code',
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000005'),
  true
);
select pg_catalog.set_config(
  'p17.archived_code',
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000006'),
  true
);

update public.qr_links
set is_active = false
where church_id = 'f1200000-0000-4000-8000-000000000002';

select extensions.plan(56);

-- Function shape, access control, and permanent routing invariants (1-25).
select extensions.ok(
  to_regprocedure('public.resolve_public_qr(text)') is not null,
  'public QR resolver exists'
);
select extensions.ok(
  to_regprocedure('public.get_church_qr_snapshot(uuid)') is not null,
  'church QR snapshot RPC exists'
);
select extensions.is(
  (select proretset from pg_proc
   where oid = 'public.resolve_public_qr(text)'::regprocedure),
  true,
  'public resolver returns a row set'
);
select extensions.is(
  (select proretset from pg_proc
   where oid = 'public.get_church_qr_snapshot(uuid)'::regprocedure),
  true,
  'snapshot returns a row set'
);
select extensions.is(
  (select prosecdef from pg_proc
   where oid = 'public.resolve_public_qr(text)'::regprocedure),
  true,
  'public resolver is security definer'
);
select extensions.is(
  (select prosecdef from pg_proc
   where oid = 'public.get_church_qr_snapshot(uuid)'::regprocedure),
  true,
  'snapshot is security definer'
);
select extensions.is(
  (select provolatile::text from pg_proc
   where oid = 'public.resolve_public_qr(text)'::regprocedure),
  's',
  'public resolver is stable'
);
select extensions.is(
  (select provolatile::text from pg_proc
   where oid = 'public.get_church_qr_snapshot(uuid)'::regprocedure),
  's',
  'snapshot is stable'
);
select extensions.is(
  (select prorows::bigint from pg_proc
   where oid = 'public.resolve_public_qr(text)'::regprocedure),
  1::bigint,
  'public resolver advertises one-row cardinality'
);
select extensions.is(
  (select prorows::bigint from pg_proc
   where oid = 'public.get_church_qr_snapshot(uuid)'::regprocedure),
  1::bigint,
  'snapshot advertises one-row cardinality'
);
select extensions.is(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename = 'qr_links'
     and policyname = 'qr_links_permission_read'),
  0::bigint,
  'direct authenticated QR policy is removed'
);
select extensions.is(
  has_function_privilege('anon', 'public.resolve_public_qr(text)', 'EXECUTE'),
  true,
  'anon may execute only the public resolver'
);
select extensions.is(
  has_function_privilege(
    'authenticated', 'public.resolve_public_qr(text)', 'EXECUTE'
  ),
  false,
  'authenticated cannot execute the session-free public resolver'
);
select extensions.is(
  has_function_privilege(
    'service_role', 'public.resolve_public_qr(text)', 'EXECUTE'
  ),
  false,
  'service role cannot execute the public resolver'
);
select extensions.is(
  has_function_privilege(
    'authenticated', 'public.get_church_qr_snapshot(uuid)', 'EXECUTE'
  ),
  true,
  'authenticated may execute the guarded snapshot'
);
select extensions.is(
  has_function_privilege(
    'anon', 'public.get_church_qr_snapshot(uuid)', 'EXECUTE'
  ),
  false,
  'anon cannot execute the church snapshot'
);
select extensions.is(
  has_function_privilege(
    'service_role', 'public.get_church_qr_snapshot(uuid)', 'EXECUTE'
  ),
  false,
  'service role cannot execute the church snapshot'
);
select extensions.is(
  has_column_privilege('anon', 'public.qr_links', 'short_code', 'SELECT'),
  false,
  'anon cannot enumerate QR rows directly'
);
select extensions.is(
  has_column_privilege(
    'authenticated', 'public.qr_links', 'short_code', 'SELECT'
  ),
  false,
  'authenticated cannot read QR rows directly'
);
select extensions.is(
  has_table_privilege('service_role', 'public.qr_links', 'SELECT'),
  true,
  'service role retains operational QR reads'
);
select extensions.is(
  has_column_privilege(
    'service_role', 'public.qr_links', 'is_active', 'UPDATE'
  ),
  true,
  'service role retains QR availability updates'
);
select extensions.is(
  has_column_privilege(
    'service_role', 'public.qr_links', 'scan_count', 'UPDATE'
  ),
  true,
  'service role retains aggregate scan-count updates'
);
select extensions.is(
  has_column_privilege(
    'service_role', 'public.qr_links', 'short_code', 'UPDATE'
  ),
  false,
  'service role cannot change permanent short codes'
);
select extensions.is(
  (select count(*) from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'qr_links_short_code_unique_idx',
       'qr_links_one_church_code_idx'
     )),
  2::bigint,
  'unique code and one-code-per-church indexes remain installed'
);
select extensions.is(
  (select count(*) from pg_trigger
   where tgrelid = 'public.qr_links'::regclass
     and tgname in ('qr_links_keep_routing', 'qr_links_require_one_per_church')
     and not tgisinternal),
  2::bigint,
  'routing immutability and one-code triggers remain installed'
);

-- Anonymous resolver behavior and privacy-neutral failure surface (26-39).
set local role anon;
select extensions.is(
  (select church_slug from public.resolve_public_qr(
    pg_catalog.current_setting('p17.active_code')
  )),
  'p17-active',
  'active code resolves to only the current canonical slug'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.current_setting('p17.active_code')
  )),
  1::bigint,
  'an exact active code resolves to exactly one row'
);
select extensions.set_eq(
  $$select procedure.proargnames[position.argument_index]
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.generate_subscripts(
      procedure.proargnames,
      1
    ) position(argument_index)
    where procedure.oid = 'public.resolve_public_qr(text)'::regprocedure
      and procedure.proargmodes[position.argument_index] = 't'::"char"$$,
  array['church_slug'],
  'resolver exposes exactly one reviewed field'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.upper(pg_catalog.current_setting('p17.active_code'))
  )),
  0::bigint,
  'uppercase input is not normalized and returns no row'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr('short')),
  0::bigint,
  'too-short input returns no row'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr('-invalid-code')),
  0::bigint,
  'noncanonical input returns no row'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(null::text)),
  0::bigint,
  'null input returns no row'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr('missing-code-123')),
  0::bigint,
  'unknown code returns no row'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.current_setting('p17.inactive_code')
  )),
  0::bigint,
  'inactive QR is indistinguishable from unknown'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.current_setting('p17.onboarding_code')
  )),
  0::bigint,
  'onboarding church is indistinguishable from unknown'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.current_setting('p17.suspended_code')
  )),
  0::bigint,
  'suspended church is indistinguishable from unknown'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.current_setting('p17.canceled_code')
  )),
  0::bigint,
  'canceled church is indistinguishable from unknown'
);
select extensions.is(
  (select count(*) from public.resolve_public_qr(
    pg_catalog.current_setting('p17.archived_code')
  )),
  0::bigint,
  'archived church is indistinguishable from unknown'
);
select extensions.throws_like(
  $$select short_code from public.qr_links limit 1$$,
  '%permission denied%',
  'anon cannot bypass the resolver with a direct table read'
);
reset role;

-- Trusted evidence separately verifies that public reads do not mutate scan
-- analytics (39).
select extensions.is(
  (select scan_count from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000001'),
  0::bigint,
  'public resolution does not mutate scan count'
);

-- Permission-checked dashboard snapshot and tenant isolation (40-51).
set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.is(
  (select jsonb_build_object(
    'church_id', church_id,
    'church_slug', church_slug,
    'short_code', short_code,
    'is_active', is_active
  ) from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000001'
  )),
  jsonb_build_object(
    'church_id', 'f1200000-0000-4000-8000-000000000001'::uuid,
    'church_slug', 'p17-active',
    'short_code', pg_catalog.current_setting('p17.active_code'),
    'is_active', true
  ),
  'owner receives the exact permanent QR snapshot'
);
select extensions.set_eq(
  $$select key
    from public.get_church_qr_snapshot(
      'f1200000-0000-4000-8000-000000000001'
    ) snapshot
    cross join lateral jsonb_object_keys(to_jsonb(snapshot)) key$$,
  array['church_id', 'church_slug', 'short_code', 'is_active'],
  'snapshot exposes exactly four reviewed fields'
);
select extensions.throws_like(
  $$select short_code from public.qr_links limit 1$$,
  '%permission denied%',
  'authorized staff cannot bypass the snapshot with direct reads'
);
select extensions.throws_like(
  $$select * from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000002'
  )$$,
  '%QR_SNAPSHOT_FORBIDDEN%',
  'cross-tenant snapshot access fails with the neutral permission error'
);
select extensions.throws_like(
  $$select * from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000099'
  )$$,
  '%QR_SNAPSHOT_FORBIDDEN%',
  'missing target uses the same neutral permission error'
);
reset role;

set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000002';
set local role authenticated;
select extensions.is(
  (select church_id from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000001'
  )),
  'f1200000-0000-4000-8000-000000000001'::uuid,
  'staff qr_read permission independently authorizes the snapshot'
);
reset role;

set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000003';
set local role authenticated;
select extensions.is(
  (select is_active from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000002'
  )),
  false,
  'authorized snapshot exposes inactive QR availability explicitly'
);
reset role;

set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000006';
set local role authenticated;
select extensions.is(
  (select church_slug from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000003'
  )),
  'p17-onboarding',
  'authorized onboarding workspace may obtain its printable snapshot'
);
reset role;

set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000004';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000001'
  )$$,
  '%QR_SNAPSHOT_FORBIDDEN%',
  'inactive profile fails closed'
);
reset role;

set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000005';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000001'
  )$$,
  '%QR_SNAPSHOT_FORBIDDEN%',
  'revoked membership fails closed'
);
reset role;

set local "request.jwt.claim.sub" = 'f1100000-0000-4000-8000-000000000007';
set local role authenticated;
select extensions.throws_like(
  $$select * from public.get_church_qr_snapshot(
    'f1200000-0000-4000-8000-000000000004'
  )$$,
  '%QR_SNAPSHOT_FORBIDDEN%',
  'suspended church workspace fails closed'
);
reset role;

set local role authenticated;
select extensions.throws_like(
  $$select * from public.resolve_public_qr(
    pg_catalog.current_setting('p17.active_code')
  )$$,
  '%permission denied%',
  'authenticated sessions cannot call the anonymous resolver'
);
reset role;

-- A printed short code remains stable while resolution follows a current slug
-- and never mutates operational or tenant state (52-55).
update public.churches
set slug = 'p17-renamed'
where id = 'f1200000-0000-4000-8000-000000000001';

set local role anon;
select extensions.is(
  (select church_slug from public.resolve_public_qr(
    pg_catalog.current_setting('p17.active_code')
  )),
  'p17-renamed',
  'stable printed code follows the church current slug'
);
reset role;

select extensions.is(
  (select short_code from public.qr_links
   where church_id = 'f1200000-0000-4000-8000-000000000001'),
  pg_catalog.current_setting('p17.active_code'),
  'church slug changes never rewrite the permanent short code'
);
select extensions.is(
  (select count(*) from public.qr_links
   where church_id between 'f1200000-0000-4000-8000-000000000001'
                       and 'f1200000-0000-4000-8000-000000000006'),
  6::bigint,
  'resolver and snapshot reads preserve one QR fixture per church'
);
select extensions.is(
  (select count(*) from public.audit_logs
   where church_id between 'f1200000-0000-4000-8000-000000000001'
                       and 'f1200000-0000-4000-8000-000000000006'),
  0::bigint,
  'read-only resolution does not invent audit mutations'
);

select * from extensions.finish();
rollback;
