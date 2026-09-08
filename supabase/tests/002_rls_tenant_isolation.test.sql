begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(50);

-- This suite exercises policies as Supabase API roles. All synthetic fixtures
-- are transaction-scoped and the final rollback leaves hosted databases clean.
insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'p04-owner-a@example.test',
    '{"display_name":"P04 Owner A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'p04-finance-a@example.test',
    '{"display_name":"P04 Finance A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    'p04-staff-a@example.test',
    '{"display_name":"P04 Staff A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000604',
    'p04-owner-b@example.test',
    '{"display_name":"P04 Owner B"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000605',
    'p04-donor-a@example.test',
    '{"display_name":"P04 Donor A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000606',
    'p04-donor-b@example.test',
    '{"display_name":"P04 Donor B"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000607',
    'p04-disabled-a@example.test',
    '{"display_name":"P04 Disabled Owner A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000608',
    'p04-revoked-a@example.test',
    '{"display_name":"P04 Revoked Owner A"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000609',
    'p04-super@example.test',
    '{"display_name":"P04 Super Admin"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000610',
    'p04-support@example.test',
    '{"display_name":"P04 Support Admin"}'::jsonb
  );

update public.profiles
set is_active = false
where id = '00000000-0000-4000-8000-000000000607';

insert into public.platform_admins (user_id, role, is_active)
values
  ('00000000-0000-4000-8000-000000000609', 'super_admin', true),
  ('00000000-0000-4000-8000-000000000610', 'support', true),
  ('00000000-0000-4000-8000-000000000607', 'super_admin', true);

insert into public.churches (
  id,
  name,
  slug,
  status,
  default_currency,
  activated_at
)
values
  (
    '00000000-0000-4000-8000-000000000621',
    'P04 Hosted Church A',
    'p04-hosted-church-a',
    'active',
    'USD',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000622',
    'P04 Hosted Church B',
    'p04-hosted-church-b',
    'active',
    'CAD',
    now()
  );

insert into public.church_memberships (
  church_id,
  user_id,
  role,
  status,
  accepted_at,
  revoked_at
)
values
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000601',
    'owner',
    'active',
    now(),
    null
  ),
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000602',
    'finance_admin',
    'active',
    now(),
    null
  ),
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000603',
    'staff',
    'active',
    now(),
    null
  ),
  (
    '00000000-0000-4000-8000-000000000622',
    '00000000-0000-4000-8000-000000000604',
    'owner',
    'active',
    now(),
    null
  ),
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000607',
    'owner',
    'active',
    now(),
    null
  ),
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000608',
    'owner',
    'revoked',
    now(),
    now()
  );

insert into public.campaigns (
  id,
  church_id,
  fund_id,
  name,
  slug,
  status,
  currency
)
values
  (
    '00000000-0000-4000-8000-000000000631',
    '00000000-0000-4000-8000-000000000621',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000621'
        and is_default
    ),
    'P04 Hosted Campaign A',
    'p04-hosted-campaign-a',
    'active',
    'USD'
  ),
  (
    '00000000-0000-4000-8000-000000000632',
    '00000000-0000-4000-8000-000000000622',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000622'
        and is_default
    ),
    'P04 Hosted Campaign B',
    'p04-hosted-campaign-b',
    'active',
    'CAD'
  );

insert into public.donors (
  id,
  church_id,
  auth_user_id,
  display_name,
  email
)
values
  (
    '00000000-0000-4000-8000-000000000641',
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000605',
    'P04 Donor A',
    'p04-donor-a@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000642',
    '00000000-0000-4000-8000-000000000621',
    null,
    'P04 Other Donor A',
    'p04-other-a@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000643',
    '00000000-0000-4000-8000-000000000622',
    '00000000-0000-4000-8000-000000000606',
    'P04 Donor B',
    'p04-donor-b@example.test'
  );

insert into public.payment_provider_connections (
  id,
  church_id,
  provider,
  external_account_reference,
  status
)
values
  (
    '00000000-0000-4000-8000-000000000651',
    '00000000-0000-4000-8000-000000000621',
    'p04-hosted-provider',
    'p04-hosted-account-a',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000000652',
    '00000000-0000-4000-8000-000000000622',
    'p04-hosted-provider',
    'p04-hosted-account-b',
    'active'
  );

insert into public.donations (
  id,
  church_id,
  donor_id,
  fund_id,
  source,
  status,
  amount_minor,
  currency,
  donated_at
)
values
  (
    '00000000-0000-4000-8000-000000000661',
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000641',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000621'
        and is_default
    ),
    'cash',
    'succeeded',
    5000,
    'USD',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000662',
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000642',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000621'
        and is_default
    ),
    'cash',
    'succeeded',
    6000,
    'USD',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000663',
    '00000000-0000-4000-8000-000000000622',
    '00000000-0000-4000-8000-000000000643',
    (
      select id from public.funds
      where church_id = '00000000-0000-4000-8000-000000000622'
        and is_default
    ),
    'cash',
    'succeeded',
    7000,
    'CAD',
    now()
  );

insert into public.prayer_requests (
  id,
  church_id,
  donation_id,
  donor_id,
  body,
  consented_at
)
values
  (
    '00000000-0000-4000-8000-000000000671',
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000661',
    '00000000-0000-4000-8000-000000000641',
    'P04 hosted prayer A',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000672',
    '00000000-0000-4000-8000-000000000622',
    '00000000-0000-4000-8000-000000000663',
    '00000000-0000-4000-8000-000000000643',
    'P04 hosted prayer B',
    now()
  );

insert into public.platform_subscriptions (
  church_id,
  plan_code,
  amount_minor,
  currency
)
values
  ('00000000-0000-4000-8000-000000000621', 'p04-hosted-a', 2500, 'USD'),
  ('00000000-0000-4000-8000-000000000622', 'p04-hosted-b', 3000, 'USD');

insert into public.email_events (
  church_id,
  donor_id,
  donation_id,
  template_key,
  recipient_email
)
values
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000641',
    '00000000-0000-4000-8000-000000000661',
    'p04-receipt',
    'p04-donor-a@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000622',
    '00000000-0000-4000-8000-000000000643',
    '00000000-0000-4000-8000-000000000663',
    'p04-receipt',
    'p04-donor-b@example.test'
  );

insert into public.audit_logs (
  church_id,
  actor_type,
  action,
  entity_table,
  entity_id
)
values
  (
    '00000000-0000-4000-8000-000000000621',
    'system',
    'p04.hosted.created',
    'churches',
    '00000000-0000-4000-8000-000000000621'
  ),
  (
    '00000000-0000-4000-8000-000000000622',
    'system',
    'p04.hosted.created',
    'churches',
    '00000000-0000-4000-8000-000000000622'
  );

-- Active-profile helper and exact function ACL contract (assertions 1-5).
select extensions.ok(
  to_regprocedure('public.is_active_authenticated_user()') is not null,
  'active-profile authorization helper exists'
);

select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.is_active_authenticated_user()',
    'EXECUTE'
  ),
  true,
  'authenticated users can execute the active-profile helper'
);

select extensions.is(
  has_function_privilege(
    'anon',
    'public.is_active_authenticated_user()',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot execute the active-profile helper'
);

select extensions.is(
  has_function_privilege(
    'service_role',
    'public.is_active_authenticated_user()',
    'EXECUTE'
  ),
  false,
  'service role cannot call an end-user authorization helper'
);

select extensions.is(
  has_function_privilege(
    'public',
    'public.is_active_authenticated_user()',
    'EXECUTE'
  ),
  false,
  'PUBLIC has no implicit execute privilege on the helper'
);

-- Church owner: own-tenant access, no cross-tenant leakage (6-11).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000601';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(id) from public.churches),
  1::bigint,
  'owner sees only their church'
);
select extensions.is(
  (select count(id) from public.church_memberships),
  1::bigint,
  'owner direct membership reads are self-only; roster access is RPC-only'
);
select extensions.is(
  (select count(id) from public.donations),
  2::bigint,
  'owner sees donations from their church only'
);
select extensions.is(
  (select count(id) from public.prayer_requests),
  1::bigint,
  'owner sees non-deleted prayers from their church only'
);
select extensions.is(
  (select count(id) from public.platform_subscriptions),
  1::bigint,
  'owner sees their church subscription only'
);
select extensions.is(
  (select count(id) from public.audit_logs),
  1::bigint,
  'owner sees their church audit log only'
);

reset role;

-- Finance administrator: financial operations, never pastoral/audit data (12-17).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000602';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(id) from public.donors),
  2::bigint,
  'finance administrator sees donors from their church only'
);
select extensions.is(
  (select count(id) from public.donations),
  2::bigint,
  'finance administrator sees donations from their church only'
);
select extensions.is(
  (select count(id) from public.payment_provider_connections),
  1::bigint,
  'finance administrator sees their church provider connection only'
);
select extensions.is(
  (select count(id) from public.prayer_requests),
  0::bigint,
  'finance administrator cannot read pastoral prayer data'
);
select extensions.is(
  (select count(id) from public.email_events),
  1::bigint,
  'finance administrator sees their church email event only'
);
select extensions.is(
  (select count(id) from public.audit_logs),
  0::bigint,
  'finance administrator cannot read owner-only audit data'
);

reset role;

-- Staff: pastoral access without financial access (18-19).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000603';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000603","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(id) from public.donations),
  0::bigint,
  'staff cannot read financial donation rows'
);
select extensions.is(
  (select count(id) from public.prayer_requests),
  0::bigint,
  'staff cannot read prayer requests without the dedicated permission'
);

reset role;

-- Donor: self-service rows only, including isolation inside one church (20-22).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000605';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000605","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(id) from public.donors),
  1::bigint,
  'donor sees only their linked donor record'
);
select extensions.is(
  (select count(id) from public.donations),
  1::bigint,
  'donor sees only their own donation'
);
select extensions.is(
  (select count(id) from public.prayer_requests),
  1::bigint,
  'donor sees only their own non-deleted prayer'
);

reset role;

-- Disabled profile: an unexpired session and active database roles fail closed
-- while the status-bearing profile itself remains readable (23-29).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000607';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000607","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(id) from public.profiles where not is_active),
  1::bigint,
  'disabled user can read their own inactive profile status'
);
select extensions.is(
  (select count(user_id) from public.platform_admins),
  0::bigint,
  'disabled profile cannot use an active platform administrator row'
);
select extensions.is(
  (select count(id) from public.churches),
  0::bigint,
  'disabled profile cannot read tenant records'
);
select extensions.is(
  (select count(id) from public.church_memberships),
  0::bigint,
  'disabled profile cannot read its active membership row'
);
select extensions.is(
  public.is_active_authenticated_user(),
  false,
  'active-profile helper rejects a disabled profile'
);
select extensions.is(
  public.is_platform_super_admin(),
  false,
  'super-admin helper rejects a disabled profile'
);
update public.profiles
set display_name = 'P04 forbidden disabled update'
where id = '00000000-0000-4000-8000-000000000607';

select extensions.is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000607'
  ),
  'P04 Disabled Owner A',
  'disabled profile cannot mutate its safe profile fields'
);

reset role;

-- Revocation removes tenant access but leaves the own membership visible (30-31).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000608';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000608","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(id) from public.church_memberships),
  1::bigint,
  'revoked user can see their own membership status'
);
select extensions.is(
  (select count(id) from public.churches),
  0::bigint,
  'revoked membership grants no church access'
);

reset role;

-- Platform roles: final P13 least privilege keeps direct rows self-only and
-- exposes cross-tenant summaries solely through narrow RPCs (32-37).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000609';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000609","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(user_id) from public.platform_admins),
  1::bigint,
  'super administrator direct identity reads are self-only'
);
select extensions.is(
  (
    select count(id)
    from public.churches
    where id in (
      '00000000-0000-4000-8000-000000000621',
      '00000000-0000-4000-8000-000000000622'
    )
  ),
  0::bigint,
  'super administrator uses the minimum P13 tenant RPC instead of direct church rows'
);
select extensions.is(
  (
    select count(id)
    from public.platform_subscriptions
    where church_id in (
      '00000000-0000-4000-8000-000000000621',
      '00000000-0000-4000-8000-000000000622'
    )
  ),
  0::bigint,
  'super administrator has no direct subscription-policy bypass'
);
select extensions.is(
  (select count(id) from public.donations),
  0::bigint,
  'platform status does not bypass donor financial policies'
);

reset role;

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000610';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000610","role":"authenticated"}';
set local role authenticated;

select extensions.is(
  (select count(user_id) from public.platform_admins),
  1::bigint,
  'support administrator sees only their own platform role'
);
select extensions.is(
  (select count(id) from public.churches),
  0::bigint,
  'support administrator has no super-admin tenant bypass'
);

reset role;

-- Anonymous giving RPC and privilege boundary (38-44).
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;

select extensions.is(
  (
    select count(*)
    from (
      select * from public.get_public_giving_page('p04-hosted-church-a')
      union all
      select * from public.get_public_giving_page('p04-hosted-church-b')
    ) pages
  ),
  2::bigint,
  'anonymous giving resolves both exact active church slugs'
);
select extensions.is(
  (
    select sum(cardinality(page.funds))
    from (
      select * from public.get_public_giving_page('p04-hosted-church-a')
      union all
      select * from public.get_public_giving_page('p04-hosted-church-b')
    ) page
  ),
  2::bigint,
  'anonymous giving RPC returns each active default fund'
);
select extensions.is(
  (
    select sum(cardinality(page.campaigns))
    from (
      select * from public.get_public_giving_page('p04-hosted-church-a')
      union all
      select * from public.get_public_giving_page('p04-hosted-church-b')
    ) page
  ),
  2::bigint,
  'anonymous giving RPC returns each current active campaign'
);
select extensions.is(
  (
    select count(*)
    from public.get_public_church_identities(array[
      '00000000-0000-4000-8000-000000000621',
      '00000000-0000-4000-8000-000000000622'
    ]::uuid[])
  ),
  2::bigint,
  'bounded identity lookup resolves only exact requested active churches'
);
select extensions.throws_like(
  $$select id from public.churches$$,
  '%permission denied%',
  'anonymous clients cannot directly enumerate churches'
);
select extensions.throws_like(
  $$select id from public.donations$$,
  '%permission denied%',
  'anonymous clients cannot read private donation rows'
);
select extensions.throws_like(
  $$select public.is_active_authenticated_user()$$,
  '%permission denied%',
  'anonymous clients cannot invoke authenticated authorization helpers'
);

reset role;

-- Authenticated writes stay server-controlled except the safe own-profile
-- projection (45-50).
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000601';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}';
set local role authenticated;

update public.profiles
set display_name = 'P04 Updated Owner A'
where id = '00000000-0000-4000-8000-000000000601';

select extensions.is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000601'
  ),
  'P04 Updated Owner A',
  'active user can update an approved field on their own profile'
);

update public.profiles
set display_name = 'P04 Forbidden Owner B'
where id = '00000000-0000-4000-8000-000000000604';

reset role;

select extensions.is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000604'
  ),
  'P04 Owner B',
  'active user cannot update another profile'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000601';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}';
set local role authenticated;

select extensions.throws_like(
  $$
    update public.profiles
    set email = 'p04-forbidden@example.test'
    where id = '00000000-0000-4000-8000-000000000601'
  $$,
  '%permission denied%',
  'authenticated user cannot update a protected profile column'
);
select extensions.throws_like(
  $$
    insert into public.donations (
      church_id,
      fund_id,
      source,
      amount_minor,
      currency
    ) values (
      '00000000-0000-4000-8000-000000000621',
      (
        select id from public.funds
        where church_id = '00000000-0000-4000-8000-000000000621'
          and is_default
      ),
      'cash',
      1000,
      'USD'
    )
  $$,
  '%permission denied%',
  'authenticated user cannot insert a donation directly'
);
select extensions.throws_like(
  $$
    delete from public.qr_links
    where church_id = '00000000-0000-4000-8000-000000000621'
  $$,
  '%permission denied%',
  'authenticated user cannot delete a permanent QR route'
);
select extensions.throws_like(
  $$
    insert into public.audit_logs (church_id, action, entity_table)
    values (
      '00000000-0000-4000-8000-000000000621',
      'p04.client-write',
      'churches'
    )
  $$,
  '%permission denied%',
  'authenticated user cannot append audit events directly'
);

reset role;

select * from extensions.finish();

rollback;
