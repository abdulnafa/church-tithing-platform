begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(65);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('40000000-0000-4000-8000-000000000901', 'owner-p09-hosted@example.test', now(), '{"display_name":"P09 Hosted Owner"}'),
  ('40000000-0000-4000-8000-000000000902', 'other-owner-p09-hosted@example.test', now(), '{"display_name":"P09 Hosted Other"}'),
  ('40000000-0000-4000-8000-000000000903', 'staff-p09-hosted@example.test', now(), '{"display_name":"P09 Hosted Staff"}'),
  ('40000000-0000-4000-8000-000000000904', 'inactive-p09-hosted@example.test', now(), '{"display_name":"P09 Hosted Inactive"}'),
  ('40000000-0000-4000-8000-000000000905', 'super-p09-hosted@example.test', now(), '{"display_name":"P09 Hosted Super"}');

update public.profiles set is_active = false
where id = '40000000-0000-4000-8000-000000000904';

insert into public.platform_admins (user_id, role, is_active)
values ('40000000-0000-4000-8000-000000000905', 'super_admin', true);

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  primary_color, secondary_color, thank_you_message, support_email,
  logo_storage_path, activated_at, suspended_at
)
values
  ('50000000-0000-4000-8000-000000000901', 'P09 Hosted Church',
   'P09 Hosted Church Inc.', 'p09-hosted', 'active', 'BBD',
   'America/Barbados', '#112233', '#445566', 'Thank you for giving.',
   'office-p09@example.test', null, now(), null),
  ('50000000-0000-4000-8000-000000000902', 'P09 Other Church',
   'P09 Other Church Inc.', 'p09-hosted-other', 'onboarding', 'USD',
   'America/Barbados', null, null, null, 'other-p09@example.test',
   '50000000-0000-4000-8000-000000000902/60000000-0000-4000-8000-000000000906.webp',
   null, null),
  ('50000000-0000-4000-8000-000000000903', 'P09 Suspended Church',
   'P09 Suspended Church Inc.', 'p09-hosted-suspended', 'suspended', 'USD',
   'America/Barbados', null, null, null, 'suspended-p09@example.test', null,
   now(), now());

insert into public.church_memberships (
  church_id, user_id, role, status, accepted_at
)
values
  ('50000000-0000-4000-8000-000000000901', '40000000-0000-4000-8000-000000000901', 'owner', 'active', now()),
  ('50000000-0000-4000-8000-000000000901', '40000000-0000-4000-8000-000000000903', 'staff', 'active', now()),
  ('50000000-0000-4000-8000-000000000902', '40000000-0000-4000-8000-000000000902', 'owner', 'active', now()),
  ('50000000-0000-4000-8000-000000000901', '40000000-0000-4000-8000-000000000904', 'owner', 'active', now()),
  ('50000000-0000-4000-8000-000000000903', '40000000-0000-4000-8000-000000000901', 'owner', 'active', now());

-- Schema, RPC, ledger, bucket, and ACL contract (1-24).
select extensions.ok(
  to_regprocedure('public.get_church_settings(uuid)') is not null,
  'settings read RPC exists'
);
select extensions.ok(
  to_regprocedure('public.update_church_settings(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text)') is not null,
  'settings update RPC has the exact typed signature'
);
select extensions.ok(
  to_regprocedure('public.get_pending_church_logo_cleanups(uuid)') is not null,
  'pending logo cleanup RPC exists'
);
select extensions.ok(
  to_regprocedure('public.complete_church_logo_cleanup(uuid,uuid,text)') is not null,
  'logo cleanup acknowledgement RPC exists'
);
select extensions.is(
  (
    select prorettype = 'public.church_settings_update_result'::regtype
    from pg_proc
    where oid = 'public.update_church_settings(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text)'::regprocedure
  ), true, 'update RPC returns its scalar result composite'
);
select extensions.is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.update_church_settings(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text)'::regprocedure
  ), true, 'update RPC is SECURITY DEFINER'
);
select extensions.is(
  (
    select proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.update_church_settings(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text)'::regprocedure
  ), true, 'update RPC fixes an empty search_path'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.update_church_settings(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ), true, 'authenticated callers can invoke settings update'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.update_church_settings(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ), false, 'anonymous callers cannot invoke settings update'
);
select extensions.is(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.church_settings_update_requests'::regclass
  ), true, 'private settings ledger enables and forces RLS'
);
select extensions.is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename = 'church_settings_update_requests'
  ), 0::bigint, 'private settings ledger has no RLS policies'
);
select extensions.is(
  has_table_privilege(
    'authenticated', 'public.church_settings_update_requests', 'SELECT'
  ), false, 'authenticated has no direct ledger read'
);
select extensions.is(
  has_table_privilege(
    'service_role', 'public.church_settings_update_requests', 'SELECT'
  ), false, 'service role has no direct ledger read'
);
select extensions.is(
  (
    select jsonb_build_object(
      'public', public,
      'limit', file_size_limit,
      'mime', to_jsonb(allowed_mime_types)
    )
    from storage.buckets where id = 'church-logos'
  ),
  '{"public":true,"limit":768000,"mime":["image/webp"]}'::jsonb,
  'church logo bucket is public and accepts only sanitized WebP under 768000 bytes'
);
select extensions.is(
  (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'church_logos_tenant_insert' and cmd = 'INSERT'
  ), 1::bigint, 'tenant logo insert policy exists'
);
select extensions.is(
  (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'church_logos_tenant_metadata_read' and cmd = 'SELECT'
  ), 1::bigint, 'tenant logo metadata read policy exists'
);
select extensions.is(
  (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'church_logos_tenant_delete' and cmd = 'DELETE'
  ), 1::bigint, 'tenant logo delete policy exists'
);
select extensions.is(
  (
    select permissive from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'church_logos_no_update' and cmd = 'UPDATE'
  ), 'RESTRICTIVE', 'logo overwrite policy is an explicit restrictive deny'
);
select extensions.is(
  has_column_privilege('anon', 'public.churches', 'id', 'SELECT'),
  false, 'anonymous church identity now flows only through bounded P14 RPCs'
);
select extensions.is(
  has_column_privilege('anon', 'public.churches', 'default_currency', 'SELECT'),
  false, 'anonymous no longer has currency column read'
);
select extensions.is(
  has_column_privilege('anon', 'public.churches', 'support_email', 'SELECT'),
  false, 'anonymous no longer has support email column read'
);
select extensions.is(
  has_column_privilege('authenticated', 'public.churches', 'status', 'SELECT'),
  true, 'authenticated retains church identity status read'
);
select extensions.is(
  has_column_privilege('authenticated', 'public.churches', 'legal_name', 'SELECT'),
  false, 'authenticated cannot directly read legal name'
);
select extensions.throws_like(
  $$update public.churches
    set logo_storage_path =
      '50000000-0000-4000-8000-000000000902/60000000-0000-4000-8000-000000000901.webp'
    where id = '50000000-0000-4000-8000-000000000901'$$,
  '%churches_logo_storage_path_format%',
  'relational check rejects a cross-tenant active logo pointer'
);

-- Permission-gated snapshot and canonical profile update (25-37).
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
select extensions.is(
  (
    select jsonb_build_object(
      'church_id', result.church_id,
      'name', result.display_name,
      'slug', result.slug,
      'status', result.status,
      'currency', result.default_currency,
      'revision', result.settings_revision
    ) from public.get_church_settings(
      '50000000-0000-4000-8000-000000000901'
    ) result
  ),
  '{"church_id":"50000000-0000-4000-8000-000000000901","name":"P09 Hosted Church","slug":"p09-hosted","status":"active","currency":"BBD","revision":0}'::jsonb,
  'owner reads full settings through the typed RPC at revision zero'
);
reset role;

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000903';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_settings('50000000-0000-4000-8000-000000000901')$$,
  '%SETTINGS_FORBIDDEN%', 'staff cannot read private church settings'
);
reset role;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000902';
set local role authenticated;
select extensions.is(
  (
    select result.status::text from public.get_church_settings(
      '50000000-0000-4000-8000-000000000902'
    ) result
  ), 'onboarding', 'owner can manage their own onboarding church settings'
);
select extensions.throws_like(
  $$select public.get_church_settings('50000000-0000-4000-8000-000000000901')$$,
  '%SETTINGS_FORBIDDEN%', 'another church owner cannot read settings'
);
reset role;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000904';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_settings('50000000-0000-4000-8000-000000000901')$$,
  '%SETTINGS_FORBIDDEN%', 'inactive owner profile fails closed'
);
reset role;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000905';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_settings('50000000-0000-4000-8000-000000000901')$$,
  '%SETTINGS_FORBIDDEN%', 'platform super admin does not inherit church settings access'
);
reset role;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
select extensions.throws_like(
  $$select public.get_church_settings('50000000-0000-4000-8000-000000000903')$$,
  '%SETTINGS_FORBIDDEN%', 'suspended church settings fail closed'
);

select extensions.is(
  (
    select result.settings_revision
    from public.update_church_settings(
      '60000000-0000-4000-8000-000000000901',
      '50000000-0000-4000-8000-000000000901', 0,
      '  Harbour   Grace  ', '  Harbour   Grace Inc.  ',
      ' GIVING-P09@EXAMPLE.TEST ', ' America/Barbados ',
      ' #1a2b3c ', ' #DDEEFF ', E'  Thank you!\nGod bless.  ',
      'keep', null
    ) result
  ), 1::bigint, 'canonical settings update increments revision exactly once'
);
reset role;

select extensions.is(
  (
    select jsonb_build_object(
      'name', name, 'legal', legal_name, 'email', support_email,
      'timezone', timezone, 'primary', primary_color,
      'secondary', secondary_color, 'thanks', thank_you_message,
      'revision', settings_revision, 'slug', slug,
      'currency', default_currency, 'status', status
    ) from public.churches
    where id = '50000000-0000-4000-8000-000000000901'
  ),
  '{"name":"Harbour Grace","legal":"Harbour Grace Inc.","email":"giving-p09@example.test","timezone":"America/Barbados","primary":"#1A2B3C","secondary":"#DDEEFF","thanks":"Thank you!\nGod bless.","revision":1,"slug":"p09-hosted","currency":"BBD","status":"active"}'::jsonb,
  'stored settings are canonical while slug, currency, and status remain read-only'
);
select extensions.is(
  (
    select jsonb_build_object(
      'actor', actor_user_id, 'type', actor_type, 'role', actor_role_snapshot,
      'action', action_code, 'entity', entity_code
    ) from public.audit_logs
    where church_id = '50000000-0000-4000-8000-000000000901'
      and action_code = 'church_settings_updated'
  ),
  '{"actor":"40000000-0000-4000-8000-000000000901","type":"user","role":"owner","action":"church_settings_updated","entity":"church"}'::jsonb,
  'settings update captures authenticated owner audit provenance'
);
select extensions.ok(
  (
    select (sanitized_changes -> 'setting_keys') =
      '["legal_name","name","primary_color","secondary_color","support_email","thank_you_message"]'::jsonb
    from public.audit_logs
    where church_id = '50000000-0000-4000-8000-000000000901'
      and action_code = 'church_settings_updated'
  ), 'audit contains only sorted keys that actually changed'
);
select extensions.ok(
  not exists (
    select 1 from public.audit_logs
    where church_id = '50000000-0000-4000-8000-000000000901'
      and sanitized_changes::text ~* '(Harbour|giving-p09|God bless)'
  ), 'audit contains no settings values or private copy'
);
select extensions.is(
  (
    select count(*) from public.church_settings_update_requests
    where church_id = '50000000-0000-4000-8000-000000000901'
      and payload_sha256 ~ '^[0-9a-f]{64}$'
  ), 1::bigint, 'private ledger stores one canonical fingerprint'
);

-- Replay, CAS, and no-op behavior (38-42).
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
select extensions.is(
  (
    select result.replayed from public.update_church_settings(
      '60000000-0000-4000-8000-000000000901',
      '50000000-0000-4000-8000-000000000901', 0,
      'Harbour Grace', 'Harbour Grace Inc.',
      'giving-p09@example.test', 'America/Barbados', '#1A2B3C', '#DDEEFF',
      E'Thank you!\nGod bless.', 'keep', null
    ) result
  ), true, 'same canonical request replays before stale revision rejection'
);
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000901',
      '50000000-0000-4000-8000-000000000901', 0,
      'Changed reuse', 'Harbour Grace Inc.', 'giving-p09@example.test',
      'America/Barbados', '#1A2B3C', '#DDEEFF', E'Thank you!\nGod bless.',
      'keep', null)$$,
  '%SETTINGS_IDEMPOTENCY_CONFLICT%',
  'same request ID with changed canonical payload is rejected'
);
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000904',
      '50000000-0000-4000-8000-000000000901', 0,
      'Stale request', 'Harbour Grace Inc.', 'giving-p09@example.test',
      'America/Barbados', '#1A2B3C', '#DDEEFF', E'Thank you!\nGod bless.',
      'keep', null)$$,
  '%SETTINGS_REVISION_CONFLICT%', 'new request with stale revision is rejected'
);
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000904',
      '50000000-0000-4000-8000-000000000901', 1,
      'Harbour Grace', 'Harbour Grace Inc.', 'giving-p09@example.test',
      'America/Barbados', '#1A2B3C', '#DDEEFF', E'Thank you!\nGod bless.',
      'keep', null)$$,
  '%SETTINGS_NO_CHANGES%', 'no-op keep update is rejected'
);
reset role;
select extensions.is(
  (
    select jsonb_build_object(
      'revision', settings_revision,
      'audits', (select count(*) from public.audit_logs a
        where a.church_id = church.id and a.action_code = 'church_settings_updated'),
      'ledgers', (select count(*) from public.church_settings_update_requests r
        where r.church_id = church.id)
    ) from public.churches church
    where id = '50000000-0000-4000-8000-000000000901'
  ), '{"revision":1,"audits":1,"ledgers":1}'::jsonb,
  'replay, stale, and no-op attempts create no extra state'
);

-- Tenant-scoped Storage and race-safe logo lifecycle (43-54).
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'church-logos',
  '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp',
  '40000000-0000-4000-8000-000000000901',
  '{"mimetype":"image/webp","size":120000}'::jsonb
);
select extensions.is(
  (
    select name from storage.objects
    where bucket_id = 'church-logos'
      and name = '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
  ),
  '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp',
  'owner uploads one exact tenant-scoped WebP object'
);
reset role;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000902';
set local role authenticated;
select extensions.throws_like(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'church-logos',
      '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000905.webp',
      '40000000-0000-4000-8000-000000000902',
      '{"mimetype":"image/webp","size":100}'::jsonb
    )$$,
  '%row-level security%', 'cross-tenant owner upload is denied'
);
select extensions.is(
  (
    select count(*) from storage.objects
    where bucket_id = 'church-logos'
      and name = '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
  ), 0::bigint, 'cross-tenant owner cannot read logo object metadata'
);
select extensions.is(
  public.can_delete_church_logo(
    '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
  ), false, 'cross-tenant owner cannot delete a logo object'
);
reset role;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
select extensions.throws_like(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'church-logos',
      '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000905.png',
      '40000000-0000-4000-8000-000000000901',
      '{"mimetype":"image/png","size":100}'::jsonb
    )$$,
  '%row-level security%', 'non-WebP path is denied by Storage policy'
);
select extensions.is(
  public.can_upload_church_logo(
    '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
  ), true, 'upload policy helper admits the owner tenant path'
);
select extensions.is(
  (
    select result.settings_revision from public.update_church_settings(
      '60000000-0000-4000-8000-000000000902',
      '50000000-0000-4000-8000-000000000901', 1,
      'Harbour Grace Logo', 'Harbour Grace Inc.', 'giving-p09@example.test',
      'America/Barbados', '#1A2B3C', '#DDEEFF', E'Thank you!\nGod bless.',
      'replace',
      '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
    ) result
  ), 2::bigint, 'request-bound stored WebP becomes active at next revision'
);
select extensions.is(
  public.can_delete_church_logo(
    '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
  ), false, 'delete policy helper denies the active logo pointer'
);
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'church-logos',
  '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000903.webp',
  '40000000-0000-4000-8000-000000000901',
  '{"mimetype":"image/webp","size":130000}'::jsonb
);
select extensions.is(
  (
    select count(*) from storage.objects
    where bucket_id = 'church-logos'
      and name = '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000903.webp'
  ), 1::bigint, 'owner uploads a second unique sanitized logo'
);
select extensions.is(
  (
    select jsonb_build_object(
      'revision', result.settings_revision,
      'logo', result.logo_storage_path,
      'cleanup', result.logo_cleanup_path,
      'state', result.logo_cleanup_status
    ) from public.update_church_settings(
      '60000000-0000-4000-8000-000000000903',
      '50000000-0000-4000-8000-000000000901', 2,
      'Harbour Grace New Logo', 'Harbour Grace Inc.',
      'giving-p09@example.test', 'America/Barbados', '#1A2B3C', '#DDEEFF',
      E'Thank you!\nGod bless.', 'replace',
      '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000903.webp'
    ) result
  ),
  '{"revision":3,"logo":"50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000903.webp","cleanup":"50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp","state":"pending"}'::jsonb,
  'replacement atomically exposes the locked prior path as pending cleanup'
);
select extensions.throws_like(
  $$select public.complete_church_logo_cleanup(
      '50000000-0000-4000-8000-000000000901',
      '60000000-0000-4000-8000-000000000903',
      '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp')$$,
  '%SETTINGS_CLEANUP_OBJECT_EXISTS%',
  'cleanup cannot be acknowledged while old Storage object exists'
);
select extensions.is(
  (
    select count(*) from public.get_pending_church_logo_cleanups(
      '50000000-0000-4000-8000-000000000901'
    )
  ), 1::bigint, 'pending cleanup list exposes the one old path'
);
select extensions.is(
  public.can_delete_church_logo(
    '50000000-0000-4000-8000-000000000901/60000000-0000-4000-8000-000000000902.webp'
  ), true, 'delete policy helper admits a superseded same-tenant logo'
);
reset role;

-- SQL cannot invoke Storage's protected object-delete trigger path. Use an
-- independent, deliberately absent old-logo path to prove durable cleanup
-- state transitions; the hosted Storage API fixture covers real deletion.
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000902';
set local role authenticated;
select extensions.is(
  (
    select jsonb_build_object(
      'revision', result.settings_revision,
      'logo', result.logo_storage_path,
      'cleanup', result.logo_cleanup_path,
      'state', result.logo_cleanup_status
    ) from public.update_church_settings(
      '60000000-0000-4000-8000-000000000906',
      '50000000-0000-4000-8000-000000000902', 0,
      'P09 Other Church', 'P09 Other Church Inc.',
      'other-p09@example.test', 'America/Barbados', null, null, null,
      'remove', null
    ) result
  ),
  '{"revision":1,"logo":null,"cleanup":"50000000-0000-4000-8000-000000000902/60000000-0000-4000-8000-000000000906.webp","state":"pending"}'::jsonb,
  'separate absent-path fixture enters pending cleanup state'
);
select extensions.is(
  public.complete_church_logo_cleanup(
    '50000000-0000-4000-8000-000000000902',
    '60000000-0000-4000-8000-000000000906',
    '50000000-0000-4000-8000-000000000902/60000000-0000-4000-8000-000000000906.webp'
  ), true, 'absent old object can be acknowledged complete'
);
select extensions.is(
  jsonb_build_object(
    'repeat', public.complete_church_logo_cleanup(
      '50000000-0000-4000-8000-000000000902',
      '60000000-0000-4000-8000-000000000906',
      '50000000-0000-4000-8000-000000000902/60000000-0000-4000-8000-000000000906.webp'
    ),
    'replayed_state', (
      select result.logo_cleanup_status from public.update_church_settings(
        '60000000-0000-4000-8000-000000000906',
        '50000000-0000-4000-8000-000000000902', 0,
        'P09 Other Church', 'P09 Other Church Inc.',
        'other-p09@example.test', 'America/Barbados', null, null, null,
        'remove', null
      ) result
    )
  ),
  '{"repeat":true,"replayed_state":"completed"}'::jsonb,
  'cleanup acknowledgement and update replay preserve completed state'
);
reset role;

-- Independent validation, private-state guards, and atomic late failure (55-60).
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000905',
      '50000000-0000-4000-8000-000000000901', 3,
      'x', 'Harbour Grace Inc.', 'giving-p09@example.test',
      'America/Barbados', '#1A2B3C', '#DDEEFF', null, 'keep', null)$$,
  '%SETTINGS_INVALID_CHURCH_NAME%', 'short display name is rejected'
);
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000905',
      '50000000-0000-4000-8000-000000000901', 3,
      'Valid Name', 'Valid Legal', 'support@localhost',
      'America/Barbados', '#1A2B3C', '#DDEEFF', null, 'keep', null)$$,
  '%SETTINGS_INVALID_SUPPORT_EMAIL%', 'invalid support email is rejected'
);
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000905',
      '50000000-0000-4000-8000-000000000901', 3,
      'Valid Name', 'Valid Legal', 'valid@example.test',
      'Barbados/Imaginary', '#1A2B3C', '#DDEEFF', null, 'keep', null)$$,
  '%SETTINGS_INVALID_TIMEZONE%', 'unknown timezone is rejected'
);
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000905',
      '50000000-0000-4000-8000-000000000901', 3,
      'Valid Name', 'Valid Legal', 'valid@example.test',
      'America/Barbados', '#12345G', '#DDEEFF', null, 'keep', null)$$,
  '%SETTINGS_INVALID_PRIMARY_COLOR%', 'invalid brand color is rejected'
);
select extensions.throws_like(
  $$select * from public.church_settings_update_requests$$,
  '%permission denied%', 'authenticated owner cannot read private ledger directly'
);
reset role;

create function public.p09_hosted_force_late_failure()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'P09_FORCED_LATE_FAILURE'; end;
$$;
create trigger p09_hosted_force_late_failure
before insert on public.church_settings_update_requests
for each row execute function public.p09_hosted_force_late_failure();

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000901';
set local role authenticated;
select extensions.throws_like(
  $$select public.update_church_settings(
      '60000000-0000-4000-8000-000000000909',
      '50000000-0000-4000-8000-000000000901', 3,
      'Must Roll Back', 'Harbour Grace Inc.', 'giving-p09@example.test',
      'America/Barbados', '#1A2B3C', '#DDEEFF', E'Thank you!\nGod bless.',
      'keep', null)$$,
  '%P09_FORCED_LATE_FAILURE%', 'late ledger failure aborts the entire update statement'
);
reset role;
drop trigger p09_hosted_force_late_failure
  on public.church_settings_update_requests;
drop function public.p09_hosted_force_late_failure();

select extensions.is(
  (
    select jsonb_build_object(
      'revision', settings_revision,
      'name', name,
      'audits', (select count(*) from public.audit_logs a
        where a.church_id = church.id and a.action_code = 'church_settings_updated'),
      'failed_ledgers', (select count(*)
        from public.church_settings_update_requests r
        where r.request_id = '60000000-0000-4000-8000-000000000909')
    ) from public.churches church
    where id = '50000000-0000-4000-8000-000000000901'
  ),
  '{"revision":3,"name":"Harbour Grace New Logo","audits":3,"failed_ledgers":0}'::jsonb,
  'late failure leaves church, audit count, revision, and ledger unchanged'
);

select * from extensions.finish();

rollback;
