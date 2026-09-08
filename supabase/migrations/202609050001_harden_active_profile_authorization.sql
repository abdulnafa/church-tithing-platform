begin;

-- A valid Supabase session is not enough to authorize application access.
-- This helper makes an application-level profile suspension effective at the
-- database boundary, including while an already-issued access token is valid.
create or replace function public.is_active_authenticated_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
  );
$$;

-- Rebuild the existing access helpers so every tenant or platform lookup fails
-- closed when the caller has no profile or their profile has been disabled.
create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_active_authenticated_user())
    and exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = (select auth.uid())
        and pa.is_active
        and pa.role = 'super_admin'
    );
$$;

create or replace function public.is_church_member(target_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_active_authenticated_user())
    and exists (
      select 1
      from public.church_memberships cm
      where cm.church_id = target_church_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
    );
$$;

create or replace function public.has_church_role(
  target_church_id uuid,
  allowed_roles public.church_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_active_authenticated_user())
    and exists (
      select 1
      from public.church_memberships cm
      where cm.church_id = target_church_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and cm.role = any(allowed_roles)
    );
$$;

create or replace function public.owns_donor(target_donor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.is_active_authenticated_user())
    and exists (
      select 1
      from public.donors d
      where d.id = target_donor_id
        and d.auth_user_id = (select auth.uid())
    );
$$;

-- Reassert exact function privileges. CREATE OR REPLACE normally preserves an
-- existing ACL, but the migration keeps the intended boundary explicit.
revoke all on function public.is_active_authenticated_user()
  from public, anon, authenticated, service_role;
revoke all on function public.is_platform_super_admin()
  from public, anon, authenticated, service_role;
revoke all on function public.is_church_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.has_church_role(uuid, public.church_member_role[])
  from public, anon, authenticated, service_role;
revoke all on function public.owns_donor(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_active_authenticated_user() to authenticated;
grant execute on function public.is_platform_super_admin() to authenticated;
grant execute on function public.is_church_member(uuid) to authenticated;
grant execute on function public.has_church_role(uuid, public.church_member_role[])
  to authenticated;
grant execute on function public.owns_donor(uuid) to authenticated;

-- Direct auth.uid() branches also need the active-profile condition. Reading a
-- disabled user's own profile remains intentionally available so the app can
-- explain the disabled state; all tenant reads and profile mutations are denied.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    and (select public.is_active_authenticated_user())
  )
  with check (
    id = (select auth.uid())
    and (select public.is_active_authenticated_user())
  );

drop policy if exists platform_admins_read on public.platform_admins;
create policy platform_admins_read
  on public.platform_admins for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (select public.is_active_authenticated_user())
    )
    or (select public.is_platform_super_admin())
  );

drop policy if exists church_memberships_read_own_or_owner
  on public.church_memberships;
create policy church_memberships_read_own_or_owner
  on public.church_memberships for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (select public.is_active_authenticated_user())
    )
    or public.has_church_role(
      church_id,
      array['owner']::public.church_member_role[]
    )
  );

drop policy if exists donors_read_own on public.donors;
create policy donors_read_own
  on public.donors for select to authenticated
  using (public.owns_donor(id));

commit;
