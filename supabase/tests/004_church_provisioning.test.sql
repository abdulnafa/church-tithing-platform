begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(69);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000a01', 'super-p08-hosted@example.test', now(), '{"display_name":"P08 Hosted Super"}'),
  ('00000000-0000-4000-8000-000000000a02', 'support-p08-hosted@example.test', now(), '{"display_name":"P08 Hosted Support"}'),
  ('00000000-0000-4000-8000-000000000a03', 'ordinary-p08-hosted@example.test', now(), '{"display_name":"P08 Hosted Ordinary"}'),
  ('00000000-0000-4000-8000-000000000a04', 'disabled-super-p08-hosted@example.test', now(), '{"display_name":"P08 Hosted Disabled"}'),
  ('00000000-0000-4000-8000-000000000a05', 'active-owner-p08-hosted@example.test', now(), '{"display_name":"P08 Hosted Owner"}'),
  ('00000000-0000-4000-8000-000000000a06', 'unconfirmed-owner-p08-hosted@example.test', null, '{"display_name":"P08 Hosted Unconfirmed"}'),
  ('00000000-0000-4000-8000-000000000a07', 'inactive-owner-p08-hosted@example.test', now(), '{"display_name":"P08 Hosted Inactive"}');

update public.profiles
set is_active = false
where id in (
  '00000000-0000-4000-8000-000000000a04',
  '00000000-0000-4000-8000-000000000a07'
);

insert into public.platform_admins (user_id, role, is_active)
values
  ('00000000-0000-4000-8000-000000000a01', 'super_admin', true),
  ('00000000-0000-4000-8000-000000000a02', 'support', true),
  ('00000000-0000-4000-8000-000000000a04', 'super_admin', true);

-- Schema, RLS, ACL, and locking contract (1-18).
select extensions.ok(
  to_regprocedure('public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)') is not null,
  'typed provisioning RPC exists'
);
select extensions.is(
  (
    select prorettype = 'public.church_provisioning_result'::regtype
    from pg_proc
    where oid = 'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ),
  true,
  'RPC returns the scalar provisioning result composite'
);
select extensions.is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ),
  true,
  'RPC is SECURITY DEFINER'
);
select extensions.is(
  (
    select proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  ),
  true,
  'RPC fixes an empty search_path'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  true,
  'authenticated role can invoke provisioning'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  false,
  'anonymous role cannot invoke provisioning'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  false,
  'service role cannot invoke provisioning directly'
);
select extensions.is(
  has_type_privilege(
    'authenticated', 'public.church_provisioning_result', 'USAGE'
  ),
  true,
  'authenticated role can consume the result composite'
);
select extensions.is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.church_provisioning_requests'::regclass
  ),
  true,
  'private ledger has RLS enabled'
);
select extensions.is(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'public.church_provisioning_requests'::regclass
  ),
  true,
  'private ledger forces RLS'
);
select extensions.is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'church_provisioning_requests'
  ),
  0::bigint,
  'private ledger has no access policies'
);
select extensions.is(
  has_table_privilege(
    'authenticated', 'public.church_provisioning_requests', 'SELECT'
  ),
  false,
  'authenticated role has no direct ledger read'
);
select extensions.is(
  has_table_privilege(
    'service_role', 'public.church_provisioning_requests', 'SELECT'
  ),
  false,
  'service role has no direct ledger read'
);
select extensions.is(
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.church_provisioning_requests'::regclass
      and tgname = 'church_provisioning_requests_append_only'
      and not tgisinternal
  ),
  1::bigint,
  'ledger update/delete append-only trigger exists'
);
select extensions.is(
  (
    select count(*)
    from pg_trigger
    where tgrelid = 'public.church_provisioning_requests'::regclass
      and tgname = 'church_provisioning_requests_reject_truncate'
      and not tgisinternal
  ),
  1::bigint,
  'ledger truncate guard exists'
);
select extensions.is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.church_provisioning_requests'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) like '%requested_by_user_id, request_id%'
  ),
  1::bigint,
  'ledger idempotency key is caller plus request UUID'
);
select extensions.is(
  (
    select regexp_count(
      pg_get_functiondef(
        'public.provision_church(uuid,text,text,text,text,text,text,text,text,text,text)'::regprocedure
      ),
      'pg_advisory_xact_lock'
    )
  ),
  2,
  'RPC transaction-locks both request identity and canonical slug'
);
select extensions.is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.church_provisioning_requests'::regclass
      and conname = 'church_provisioning_requests_hash_format'
  ),
  1::bigint,
  'ledger requires a canonical lowercase SHA-256 fingerprint'
);

-- Successful confirmed-owner provisioning and exact derived records (19-29).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.is(
  (
    select result.replayed
    from public.provision_church(
      '00000000-0000-4000-8000-000000000b01',
      '  P08   Hosted Church  ',
      '  P08   Hosted Church Inc.  ',
      'p08-hosted-church',
      ' ACTIVE-OWNER-P08-HOSTED@EXAMPLE.TEST ',
      ' GIVING-P08-HOSTED@EXAMPLE.TEST ',
      ' usd ',
      ' America/Barbados ',
      ' #1a2b3c ',
      '',
      E'  Thank you!\nGod bless.  '
    ) result
  ),
  false,
  'first canonical provisioning call is not a replay'
);
reset role;

select extensions.is(
  (
    select pg_catalog.jsonb_build_object(
      'name', name,
      'legal_name', legal_name,
      'status', status,
      'currency', default_currency,
      'timezone', timezone,
      'primary', primary_color,
      'secondary', secondary_color,
      'support_email', support_email,
      'thank_you', thank_you_message,
      'public_settings', public_settings,
      'logo', logo_url,
      'activated', activated_at
    )
    from public.churches where slug = 'p08-hosted-church'
  ),
  '{"name":"P08 Hosted Church","legal_name":"P08 Hosted Church Inc.","status":"onboarding","currency":"USD","timezone":"America/Barbados","primary":"#1A2B3C","secondary":null,"support_email":"giving-p08-hosted@example.test","thank_you":"Thank you!\nGod bless.","public_settings":{},"logo":null,"activated":null}'::jsonb,
  'church stores only canonical approved onboarding fields'
);
select extensions.is(
  (
    select count(*) from public.funds fund
    join public.churches church on church.id = fund.church_id
    where church.slug = 'p08-hosted-church'
  ),
  1::bigint,
  'existing trigger creates exactly one fund'
);
select extensions.is(
  (
    select pg_catalog.jsonb_build_object(
      'name', fund.name,
      'slug', fund.slug,
      'status', fund.status,
      'default', fund.is_default
    )
    from public.funds fund
    join public.churches church on church.id = fund.church_id
    where church.slug = 'p08-hosted-church'
  ),
  '{"name":"Tithes","slug":"tithes","status":"active","default":true}'::jsonb,
  'default fund has the exact Tithes shape'
);
select extensions.is(
  (
    select count(*) from public.qr_links qr
    join public.churches church on church.id = qr.church_id
    where church.slug = 'p08-hosted-church'
      and qr.kind = 'church'
      and qr.fund_id is null
      and qr.campaign_id is null
      and qr.is_active
      and qr.short_code ~ '^[a-z0-9][a-z0-9_-]{6,62}[a-z0-9]$'
  ),
  1::bigint,
  'existing trigger creates exactly one permanent church QR record'
);
select extensions.is(
  (
    select pg_catalog.jsonb_build_object(
      'user_id', membership.user_id,
      'invited_email', membership.invited_email,
      'role', membership.role,
      'status', membership.status,
      'accepted', membership.accepted_at is not null,
      'invited_by', membership.invited_by
    )
    from public.church_memberships membership
    join public.churches church on church.id = membership.church_id
    where church.slug = 'p08-hosted-church'
  ),
  '{"user_id":"00000000-0000-4000-8000-000000000a05","invited_email":"active-owner-p08-hosted@example.test","role":"owner","status":"active","accepted":true,"invited_by":"00000000-0000-4000-8000-000000000a01"}'::jsonb,
  'confirmed active profile becomes the one active owner'
);
select extensions.is(
  (
    select pg_catalog.jsonb_build_object(
      'actor_user_id', audit.actor_user_id,
      'actor_type', audit.actor_type,
      'actor_name', audit.actor_display_name_snapshot,
      'actor_role', audit.actor_role_snapshot,
      'action', audit.action_code,
      'entity', audit.entity_code
    )
    from public.audit_logs audit
    join public.churches church on church.id = audit.church_id
    where church.slug = 'p08-hosted-church'
  ),
  '{"actor_user_id":"00000000-0000-4000-8000-000000000a01","actor_type":"support","actor_name":"P08 Hosted Super","actor_role":"super_admin","action":"church_provisioned","entity":"church"}'::jsonb,
  'P07 captures the authenticated super-admin support capacity'
);
select extensions.ok(
  (
    select array_agg(key order by key)
    from public.audit_logs audit
    cross join lateral jsonb_object_keys(audit.sanitized_changes) key
    join public.churches church on church.id = audit.church_id
    where church.slug = 'p08-hosted-church'
  ) = array[
    'church_slug', 'currency', 'default_fund_id',
    'owner_membership_status', 'qr_short_code'
  ]::text[],
  'audit payload contains only the approved non-PII keys'
);
select extensions.ok(
  not exists (
    select 1
    from public.audit_logs audit
    join public.churches church on church.id = audit.church_id
    where church.slug = 'p08-hosted-church'
      and audit.sanitized_changes::text ~*
        '(P08 Hosted Church|active-owner|giving-p08|Thank you)'
  ),
  'audit payload excludes names, emails, and thank-you copy'
);
select extensions.is(
  (
    select count(*)
    from public.church_provisioning_requests request
    join public.churches church on church.id = request.church_id
    where church.slug = 'p08-hosted-church'
      and request.payload_sha256 ~ '^[0-9a-f]{64}$'
      and request.provisioning_status = 'completed'
  ),
  1::bigint,
  'private ledger stores one completed fingerprint and exact result references'
);
select extensions.is(
  (
    select pg_catalog.jsonb_build_object(
      'subscriptions', (select count(*) from public.platform_subscriptions where church_id = church.id),
      'providers', (select count(*) from public.payment_provider_connections where church_id = church.id),
      'emails', (select count(*) from public.email_events where church_id = church.id)
    )
    from public.churches church where slug = 'p08-hosted-church'
  ),
  '{"subscriptions":0,"providers":0,"emails":0}'::jsonb,
  'v1 provisioning creates no billing, provider, or email records'
);
select extensions.is(
  (
    select count(*) from auth.users
    where email = 'newly-created-by-provisioning@example.test'
  ),
  0::bigint,
  'provisioning never creates an Auth user'
);

-- Canonical replay, key conflict, and slug collision (30-33).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.is(
  (
    select result.replayed
    from public.provision_church(
      '00000000-0000-4000-8000-000000000b01',
      'P08 Hosted Church',
      'P08 Hosted Church Inc.',
      'p08-hosted-church',
      'active-owner-p08-hosted@example.test',
      'giving-p08-hosted@example.test',
      'USD',
      'America/Barbados',
      '#1A2B3C',
      null,
      E'Thank you!\nGod bless.'
    ) result
  ),
  true,
  'same key and canonical payload returns the exact replay result'
);
reset role;
select extensions.is(
  (
    select pg_catalog.jsonb_build_object(
      'churches', count(distinct church.id),
      'audits', count(distinct audit.id),
      'ledger', count(distinct request.request_id)
    )
    from public.churches church
    join public.audit_logs audit on audit.church_id = church.id
    join public.church_provisioning_requests request
      on request.church_id = church.id
    where church.slug = 'p08-hosted-church'
  ),
  '{"churches":1,"audits":1,"ledger":1}'::jsonb,
  'replay creates no duplicate church, audit, or ledger row'
);
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b01',
    'P08 Hosted Church', 'P08 Hosted Church Inc.', 'p08-hosted-church',
    'active-owner-p08-hosted@example.test',
    'giving-p08-hosted@example.test', 'USD', 'America/Barbados',
    '#1A2B3C', null, 'Changed payload'
  )$$,
  '%PROVISION_IDEMPOTENCY_CONFLICT%',
  'same caller/key with a different canonical payload is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b02',
    'Duplicate Slug', 'Duplicate Slug Inc.', 'p08-hosted-church',
    'new-owner@example.test', 'giving@example.test',
    'USD', 'America/Barbados', null, null, null
  )$$,
  '%PROVISION_SLUG_UNAVAILABLE%',
  'a different request cannot provision an existing slug'
);
reset role;

-- Invited/unconfirmed/inactive owner resolution (34-39).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.is(
  (
    select result.owner_membership_status::text
    from public.provision_church(
      '00000000-0000-4000-8000-000000000b03',
      'Invited Owner Church', 'Invited Owner Church Inc.',
      'p08-hosted-invited', ' NEW-OWNER-P08@EXAMPLE.TEST ',
      'giving-invited@example.test', 'BBD', 'America/Barbados',
      null, null, null
    ) result
  ),
  'invited'::text,
  'absent owner email produces an invited membership'
);
select extensions.is(
  (
    select result.owner_membership_status::text
    from public.provision_church(
      '00000000-0000-4000-8000-000000000b04',
      'Unconfirmed Owner Church', 'Unconfirmed Owner Church Inc.',
      'p08-hosted-unconfirmed',
      'unconfirmed-owner-p08-hosted@example.test',
      'giving-unconfirmed@example.test', 'CAD', 'America/Barbados',
      null, null, null
    ) result
  ),
  'invited'::text,
  'unconfirmed Auth email also produces an invited membership'
);
reset role;
select extensions.is(
  (
    select count(*)
    from public.church_memberships membership
    join public.churches church on church.id = membership.church_id
    where church.slug in ('p08-hosted-invited', 'p08-hosted-unconfirmed')
      and membership.user_id is null
      and membership.invited_email is not null
      and membership.role = 'owner'
      and membership.status = 'invited'
  ),
  2::bigint,
  'both invitation paths create no premature user association'
);
select extensions.is(
  (
    select count(*) from auth.users where email = 'new-owner-p08@example.test'
  ),
  0::bigint,
  'absent invited owner is not created in Auth'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b05',
    'Inactive Owner Church', 'Inactive Owner Church Inc.',
    'p08-hosted-inactive', 'inactive-owner-p08-hosted@example.test',
    'giving-inactive@example.test', 'XCD', 'America/Barbados',
    null, null, null
  )$$,
  '%PROVISION_OWNER_PROFILE_INACTIVE%',
  'inactive owner profile is rejected rather than invited'
);
reset role;
select extensions.is(
  (select count(*) from public.churches where slug = 'p08-hosted-inactive'),
  0::bigint,
  'inactive-owner rejection leaves no church residue'
);

-- Authorization and direct-access denials (40-46).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a03';
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b06', 'Denied Ordinary',
    'Denied Ordinary Inc.', 'p08-denied-ordinary', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null
  )$$,
  '%PROVISION_FORBIDDEN%',
  'ordinary authenticated user is denied'
);
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a02';
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b07', 'Denied Support',
    'Denied Support Inc.', 'p08-denied-support', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null
  )$$,
  '%PROVISION_FORBIDDEN%',
  'platform support role is denied'
);
reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a04';
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b08', 'Denied Disabled',
    'Denied Disabled Inc.', 'p08-denied-disabled', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null
  )$$,
  '%PROVISION_FORBIDDEN%',
  'disabled super-admin profile is denied'
);
select extensions.throws_like(
  $$select * from public.church_provisioning_requests$$,
  '%permission denied%',
  'authenticated super-admin has no direct ledger read'
);
select extensions.throws_like(
  $$insert into public.church_provisioning_requests (
      requested_by_user_id, request_id, payload_sha256, church_id,
      church_slug, owner_membership_id, owner_membership_status,
      default_fund_id, qr_link_id, qr_short_code, audit_log_id
    ) values (
      '00000000-0000-4000-8000-000000000a01',
      '00000000-0000-4000-8000-000000000b09', repeat('a', 64),
      gen_random_uuid(), 'forged', gen_random_uuid(), 'active',
      gen_random_uuid(), gen_random_uuid(), 'forgedcode', 1
    )$$,
  '%permission denied%',
  'authenticated client has no direct ledger insert'
);
reset role;
set local role anon;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b10', 'Denied Anonymous',
    'Denied Anonymous Inc.', 'p08-denied-anon', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null
  )$$,
  '%permission denied%',
  'anonymous client cannot execute the RPC'
);
select extensions.is(
  (select count(*) from public.get_public_giving_page('p08-hosted-church')),
  0::bigint,
  'anonymous public page cannot resolve an onboarding church'
);
reset role;

-- Independent database validation including control characters (47-57).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(null, 'Valid Church', 'Valid Church Inc.',
    'p08-invalid-request', 'new@example.test', 'giving@example.test',
    'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_REQUEST_ID_REQUIRED%', 'null request ID is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'x', 'Valid Legal Name',
    'p08-invalid-name', 'new@example.test', 'giving@example.test',
    'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_CHURCH_NAME%', 'short display name is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid' || chr(1),
    'Valid Legal Name', 'p08-control-name', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_CHURCH_NAME%', 'display-name control characters are rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church', 'x',
    'p08-invalid-legal', 'new@example.test', 'giving@example.test',
    'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_LEGAL_NAME%', 'short legal name is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid' || chr(127), 'p08-control-legal', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_LEGAL_NAME%', 'legal-name control characters are rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'Invalid-Slug', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_SLUG%', 'strict slug rejects uppercase input'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-owner-email', 'owner@localhost',
    'giving@example.test', 'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_OWNER_EMAIL%', 'owner email requires validated dotted-domain syntax'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-support-email', 'new@example.test',
    null, 'USD', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_SUPPORT_EMAIL%', 'support email is required and validated'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-currency', 'new@example.test',
    'giving@example.test', 'EUR', 'America/Barbados', null, null, null)$$,
  '%PROVISION_INVALID_CURRENCY%', 'unsupported currency is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-timezone', 'new@example.test',
    'giving@example.test', 'USD', 'Barbados/Imaginary', null, null, null)$$,
  '%PROVISION_INVALID_TIMEZONE%', 'timezone must exist in pg_timezone_names'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-colors', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', '#12345G', null, null)$$,
  '%PROVISION_INVALID_PRIMARY_COLOR%', 'invalid primary color is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-secondary', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, '123456', null)$$,
  '%PROVISION_INVALID_SECONDARY_COLOR%', 'invalid secondary color is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-invalid-thanks', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null,
    repeat('x', 501))$$,
  '%PROVISION_INVALID_THANK_YOU_MESSAGE%', 'overlong thank-you copy is rejected'
);
select extensions.throws_like(
  $$select public.provision_church(gen_random_uuid(), 'Valid Church',
    'Valid Church Inc.', 'p08-control-thanks', 'new@example.test',
    'giving@example.test', 'USD', 'America/Barbados', null, null,
    'Thanks' || chr(1))$$,
  '%PROVISION_INVALID_THANK_YOU_MESSAGE%', 'unsafe thank-you control characters are rejected'
);
reset role;

-- Owner lifecycle snapshot regression.
select extensions.throws_like(
  $$delete from auth.users
    where id = '00000000-0000-4000-8000-000000000a05'$$,
  '%church_memberships_user_id_fkey%',
  'owner Auth deletion cannot erase membership history'
);
select extensions.is(
  (
    select count(*) from public.church_provisioning_requests
    where request_id = '00000000-0000-4000-8000-000000000b01'
  ),
  1::bigint,
  'blocked owner Auth deletion does not rewrite the result ledger'
);
select extensions.is(
  (
    select count(*) from public.church_memberships membership
    join public.church_provisioning_requests request
      on request.owner_membership_id = membership.id
    where request.request_id = '00000000-0000-4000-8000-000000000b01'
  ),
  1::bigint,
  'blocked owner Auth deletion preserves the live membership'
);
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.is(
  (
    select result.replayed
    from public.provision_church(
      '00000000-0000-4000-8000-000000000b01',
      'P08 Hosted Church', 'P08 Hosted Church Inc.', 'p08-hosted-church',
      'active-owner-p08-hosted@example.test',
      'giving-p08-hosted@example.test', 'USD', 'America/Barbados',
      '#1A2B3C', null, E'Thank you!\nGod bless.'
    ) result
  ),
  true,
  'replay returns the immutable original membership result after blocked account deletion'
);
reset role;

-- Append-only enforcement and forced late-failure atomicity.
select extensions.throws_like(
  $$update public.church_provisioning_requests
    set provisioning_status = 'completed'
    where request_id = '00000000-0000-4000-8000-000000000b01'$$,
  '%PROVISION_LEDGER_APPEND_ONLY%',
  'ledger rows cannot be updated even by the migration owner'
);
select extensions.throws_like(
  $$truncate public.church_provisioning_requests$$,
  '%PROVISION_LEDGER_APPEND_ONLY%',
  'ledger cannot be truncated even by the migration owner'
);

create function public.p08_hosted_force_late_failure()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'P08_FORCED_LATE_FAILURE';
end;
$$;
create trigger p08_hosted_force_late_failure
before insert on public.church_provisioning_requests
for each row execute function public.p08_hosted_force_late_failure();

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000a01';
set local role authenticated;
select extensions.throws_like(
  $$select public.provision_church(
    '00000000-0000-4000-8000-000000000b11', 'Forced Failure Church',
    'Forced Failure Church Inc.', 'p08-hosted-forced-failure',
    'new@example.test', 'giving@example.test', 'USD',
    'America/Barbados', null, null, null
  )$$,
  '%P08_FORCED_LATE_FAILURE%',
  'late ledger failure rolls the provisioning statement back atomically'
);
reset role;

drop trigger p08_hosted_force_late_failure
  on public.church_provisioning_requests;
drop function public.p08_hosted_force_late_failure();

select extensions.is(
  (
    select
      (select count(*) from public.churches where slug = 'p08-hosted-forced-failure')
      + (select count(*) from public.funds fund
         join public.churches church on church.id = fund.church_id
         where church.slug = 'p08-hosted-forced-failure')
      + (select count(*) from public.qr_links qr
         join public.churches church on church.id = qr.church_id
         where church.slug = 'p08-hosted-forced-failure')
      + (select count(*) from public.church_memberships membership
         join public.churches church on church.id = membership.church_id
         where church.slug = 'p08-hosted-forced-failure')
      + (select count(*) from public.audit_logs audit
         join public.churches church on church.id = audit.church_id
         where church.slug = 'p08-hosted-forced-failure')
      + (select count(*) from public.church_provisioning_requests request
         where request.request_id = '00000000-0000-4000-8000-000000000b11')
  ),
  0::bigint,
  'forced failure leaves zero church, audit, or ledger residue'
);

select * from extensions.finish();

rollback;
