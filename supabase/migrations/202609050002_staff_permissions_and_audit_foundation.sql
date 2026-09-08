begin;

-- P07 starts with a deliberately conservative permission catalog. Adding a
-- permission here does not open a mutation path: authenticated table writes
-- remain closed until a later workflow adds a narrowly scoped, audited RPC.
create type public.church_permission as enum (
  'workspace_read',
  'funds_read',
  'funds_manage',
  'campaigns_read',
  'campaigns_manage',
  'qr_read',
  'settings_manage',
  'staff_manage',
  'provider_manage',
  'audit_read',
  'billing_manage',
  'financial_read',
  'members_read',
  'reports_read',
  'reports_export',
  'receipts_read',
  'statements_read',
  'provider_status_read',
  'email_status_read',
  'prayer_requests_review'
);

-- New audit events must use this finite catalog through append_audit_event.
-- `legacy_imported` preserves pre-P07 rows without pretending that an unknown
-- historic action was one of the reviewed actions below.
create type public.audit_action as enum (
  'legacy_imported',
  'platform_settings_updated',
  'church_provisioned',
  'church_settings_updated',
  'church_status_changed',
  'staff_invited',
  'staff_removed',
  'staff_role_changed',
  'fund_created',
  'fund_updated',
  'fund_archived',
  'campaign_created',
  'campaign_updated',
  'campaign_archived',
  'provider_connection_updated',
  'subscription_updated',
  'report_exported',
  'receipt_issued',
  'prayer_request_reviewed',
  'webhook_processed',
  'email_status_updated'
);

create type public.audit_entity as enum (
  'platform_settings',
  'church',
  'church_membership',
  'fund',
  'campaign',
  'payment_provider_connection',
  'platform_subscription',
  'report',
  'receipt',
  'prayer_request',
  'webhook_event',
  'email_event'
);

comment on type public.church_permission is
  'Provisional P07 church-staff capabilities. Unlisted sensitive actions remain denied pending client approval.';
comment on type public.audit_action is
  'Finite reviewed action catalog for new append-only audit events.';
comment on type public.audit_entity is
  'Finite entity catalog for new append-only audit events.';

-- Return the complete, deterministic permission snapshot for the caller's
-- membership in one church. The function deliberately returns an empty array
-- for every invalid or ineligible state rather than exposing why access failed.
create or replace function public.get_my_church_permissions(
  target_church_id uuid
)
returns public.church_permission[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case membership.role
        when 'owner' then array[
          'workspace_read',
          'funds_read',
          'funds_manage',
          'campaigns_read',
          'campaigns_manage',
          'qr_read',
          'settings_manage',
          'staff_manage',
          'provider_manage',
          'audit_read',
          'billing_manage',
          'financial_read',
          'members_read',
          'reports_read',
          'reports_export',
          'receipts_read',
          'statements_read',
          'provider_status_read',
          'email_status_read',
          'prayer_requests_review'
        ]::public.church_permission[]
        when 'finance_admin' then array[
          'workspace_read',
          'funds_read',
          'campaigns_read',
          'qr_read',
          'financial_read',
          'members_read',
          'reports_read',
          'reports_export',
          'receipts_read',
          'statements_read',
          'provider_status_read',
          'email_status_read'
        ]::public.church_permission[]
        when 'accountant' then array[
          'workspace_read',
          'funds_read',
          'campaigns_read',
          'qr_read',
          'financial_read',
          'members_read',
          'reports_read',
          'reports_export',
          'receipts_read',
          'statements_read'
        ]::public.church_permission[]
        when 'staff' then array[
          'workspace_read',
          'funds_read',
          'campaigns_read',
          'qr_read'
        ]::public.church_permission[]
        else '{}'::public.church_permission[]
      end
      from public.church_memberships membership
      join public.profiles profile
        on profile.id = membership.user_id
       and profile.is_active
      join public.churches church
        on church.id = membership.church_id
       and church.status in ('active', 'onboarding')
      where membership.church_id = target_church_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    ),
    '{}'::public.church_permission[]
  );
$$;

-- A caller may inspect their own membership state only while both their
-- profile and the target church remain eligible. Including membership identity
-- in this helper avoids exposing arbitrary church-status existence checks.
create or replace function public.can_read_own_church_membership(
  target_church_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.church_memberships membership
    join public.profiles profile
      on profile.id = membership.user_id
     and profile.is_active
    join public.churches church
      on church.id = membership.church_id
      and church.status in ('active', 'onboarding')
    where membership.church_id = target_church_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_church_permission(
  target_church_id uuid,
  required_permission public.church_permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    required_permission = any(
      public.get_my_church_permissions(target_church_id)
    ),
    false
  );
$$;

comment on function public.get_my_church_permissions(uuid) is
  'Returns the current active member permissions for an active or onboarding church; every other state returns an empty array.';
comment on function public.has_church_permission(uuid, public.church_permission) is
  'Fail-closed predicate for a named church permission in the current authenticated session.';

-- Function and enum privileges are explicit. The pure role-to-permission map is
-- encapsulated inside get_my_church_permissions and is not exposed separately.
revoke all on type public.church_permission
  from public, anon, authenticated, service_role;
grant usage on type public.church_permission to authenticated;
revoke all on type public.audit_actor_type
  from public, anon, authenticated, service_role;
revoke all on type public.audit_action
  from public, anon, authenticated, service_role;
revoke all on type public.audit_entity
  from public, anon, authenticated, service_role;
grant usage on type public.audit_actor_type, public.audit_action,
  public.audit_entity
  to service_role;

revoke all on function public.get_my_church_permissions(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.has_church_permission(
  uuid,
  public.church_permission
) from public, anon, authenticated, service_role;
revoke all on function public.can_read_own_church_membership(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_church_permissions(uuid)
  to authenticated;
grant execute on function public.has_church_permission(
  uuid,
  public.church_permission
) to authenticated;
grant execute on function public.can_read_own_church_membership(uuid)
  to authenticated;

-- Replace role-list policies with named permissions. Donor self-service and
-- platform-super-admin policies are intentionally unchanged.
drop policy if exists churches_members_read on public.churches;
create policy churches_workspace_read
  on public.churches for select to authenticated
  using (
    (select public.has_church_permission(id, 'workspace_read'))
  );

drop policy if exists church_memberships_read_own_or_owner
  on public.church_memberships;
create policy church_memberships_read_own_or_staff_manager
  on public.church_memberships for select to authenticated
  using (
    (
      user_id = (select auth.uid())
      and (select public.can_read_own_church_membership(church_id))
    )
    or (select public.has_church_permission(church_id, 'staff_manage'))
  );

drop policy if exists funds_members_read on public.funds;
create policy funds_permission_read
  on public.funds for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'funds_read'))
  );

drop policy if exists campaigns_members_read on public.campaigns;
create policy campaigns_permission_read
  on public.campaigns for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'campaigns_read'))
  );

drop policy if exists donors_finance_read on public.donors;
create policy donors_permission_read
  on public.donors for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'members_read'))
  );

drop policy if exists payment_connections_finance_read
  on public.payment_provider_connections;
create policy payment_connections_permission_read
  on public.payment_provider_connections for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'provider_status_read'))
  );

drop policy if exists recurring_gifts_finance_read on public.recurring_gifts;
create policy recurring_gifts_permission_read
  on public.recurring_gifts for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'financial_read'))
  );

drop policy if exists donations_finance_read on public.donations;
create policy donations_permission_read
  on public.donations for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'financial_read'))
  );

drop policy if exists prayer_requests_pastoral_read on public.prayer_requests;
create policy prayer_requests_permission_read
  on public.prayer_requests for select to authenticated
  using (
    deleted_at is null
    and (select public.has_church_permission(
      church_id,
      'prayer_requests_review'
    ))
  );

drop policy if exists receipts_finance_read on public.receipts;
create policy receipts_permission_read
  on public.receipts for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'receipts_read'))
  );

drop policy if exists annual_statements_finance_read
  on public.annual_statements;
create policy annual_statements_permission_read
  on public.annual_statements for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'statements_read'))
  );

drop policy if exists statement_donations_finance_read
  on public.statement_donations;
create policy statement_donations_permission_read
  on public.statement_donations for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'statements_read'))
  );

drop policy if exists platform_subscriptions_owner_read
  on public.platform_subscriptions;
create policy platform_subscriptions_permission_read
  on public.platform_subscriptions for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'billing_manage'))
  );

drop policy if exists qr_links_members_read on public.qr_links;
create policy qr_links_permission_read
  on public.qr_links for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'qr_read'))
  );

drop policy if exists email_events_finance_read on public.email_events;
create policy email_events_permission_read
  on public.email_events for select to authenticated
  using (
    church_id is not null
    and (select public.has_church_permission(church_id, 'email_status_read'))
  );

drop policy if exists audit_logs_church_owner_read on public.audit_logs;
create policy audit_logs_permission_read
  on public.audit_logs for select to authenticated
  using (
    church_id is not null
    and (select public.has_church_permission(church_id, 'audit_read'))
  );

-- The old actor foreign key used ON DELETE SET NULL, which attempted to update
-- an append-only audit row and was rejected by audit_logs_append_only. Actor
-- identity is historical evidence, so retain the UUID and typed labels as
-- immutable snapshots without a lifecycle foreign key to auth.users.
alter table public.audit_logs
  drop constraint if exists audit_logs_actor_user_id_fkey;

alter table public.audit_logs
  add column actor_display_name_snapshot text,
  add column actor_role_snapshot text,
  add column action_code public.audit_action not null default 'legacy_imported',
  add column entity_code public.audit_entity,
  add constraint audit_logs_canonical_action_consistent check (
    action_code = 'legacy_imported'
    or action = action_code::text
  );

-- The one-time snapshot backfill is part of this atomic DDL transaction. Drop
-- and recreate the user trigger around it so the append-only invariant remains
-- continuously true outside the migration transaction.
drop trigger if exists audit_logs_append_only on public.audit_logs;

update public.audit_logs audit
set
  actor_display_name_snapshot = left(coalesce(
    (
      select nullif(btrim(profile.display_name), '')
      from public.profiles profile
      where profile.id = audit.actor_user_id
    ),
    case audit.actor_type
      when 'system' then 'System'
      when 'webhook' then 'Payment webhook'
      when 'support' then 'Platform support'
      else 'Unknown user'
    end
  ), 160),
  actor_role_snapshot = case audit.actor_type
    when 'user' then (
      select membership.role::text
      from public.church_memberships membership
      where membership.church_id = audit.church_id
        and membership.user_id = audit.actor_user_id
      limit 1
    )
    when 'support' then (
      select administrator.role::text
      from public.platform_admins administrator
      where administrator.user_id = audit.actor_user_id
    )
    else null
  end;

alter table public.audit_logs
  alter column actor_display_name_snapshot set not null,
  add constraint audit_logs_actor_display_snapshot_not_blank check (
    btrim(actor_display_name_snapshot) <> ''
    and char_length(actor_display_name_snapshot) <= 160
  ),
  add constraint audit_logs_actor_role_snapshot_not_blank check (
    actor_role_snapshot is null
    or (
      btrim(actor_role_snapshot) <> ''
      and char_length(actor_role_snapshot) <= 64
    )
  );

create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function public.reject_audit_log_mutation();

create or replace function public.capture_audit_actor_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_display_name text;
  resolved_role text;
  request_user_id uuid;
begin
  request_user_id := (select auth.uid());

  if new.actor_type in ('user', 'support') and (
    request_user_id is null
    or request_user_id is distinct from new.actor_user_id
  ) then
    raise exception 'human audit actor must match authenticated request identity';
  end if;

  case new.actor_type
    when 'user' then
      if new.actor_user_id is null or new.church_id is null then
        raise exception 'user audit actor requires a user UUID and church';
      end if;

      select
        coalesce(
          nullif(btrim(profile.display_name), ''),
          'Authenticated church user'
        ),
        membership.role::text
      into resolved_display_name, resolved_role
      from public.profiles profile
      join public.church_memberships membership
        on membership.user_id = profile.id
       and membership.church_id = new.church_id
       and membership.status = 'active'
      join public.churches church
        on church.id = membership.church_id
       and church.status in ('active', 'onboarding')
      where profile.id = new.actor_user_id
        and profile.is_active;

      if not found then
        raise exception 'user audit actor has no active church capacity';
      end if;

    when 'support' then
      if new.actor_user_id is null then
        raise exception 'support audit actor requires a user UUID';
      end if;

      select
        coalesce(
          nullif(btrim(profile.display_name), ''),
          'Platform administrator'
        ),
        administrator.role::text
      into resolved_display_name, resolved_role
      from public.profiles profile
      join public.platform_admins administrator
        on administrator.user_id = profile.id
       and administrator.is_active
      where profile.id = new.actor_user_id
        and profile.is_active;

      if not found then
        raise exception 'support audit actor has no active platform capacity';
      end if;

    when 'system' then
      if new.actor_user_id is not null then
        raise exception 'system audit actor cannot carry a user UUID';
      end if;
      resolved_display_name := 'System';
      resolved_role := null;

    when 'webhook' then
      if new.actor_user_id is not null then
        raise exception 'webhook audit actor cannot carry a user UUID';
      end if;
      resolved_display_name := 'Payment webhook';
      resolved_role := null;
  end case;

  -- Human identity labels are always resolved from current authoritative rows.
  -- Caller-supplied snapshot values are intentionally ignored.
  new.actor_display_name_snapshot := left(resolved_display_name, 160);
  new.actor_role_snapshot := left(resolved_role, 64);

  return new;
end;
$$;

create trigger audit_logs_capture_actor_snapshot
before insert on public.audit_logs
for each row execute function public.capture_audit_actor_snapshot();

-- Even an allowed public label must not look like an access secret, private
-- key, JWT, or payment-card number. Action-specific shapes below prevent
-- callers from hiding arbitrary values beneath generic keys such as data,
-- value, content, credential, apiKey, session, or account_number.
create or replace function public.audit_scalar_is_safe(candidate text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    char_length(candidate) between 1 and 160
    and candidate !~ '[[:cntrl:]]'
    and lower(candidate) !~
      '(bearer[[:space:]]|sk_(live|test)_[a-z0-9]|sb_secret_|-----begin[^-]*private key-----|eyj[a-z0-9_-]*\.[a-z0-9_-]+\.)'
    and not (
      candidate ~ '^[0-9 -]+$'
      and char_length(pg_catalog.regexp_replace(candidate, '[^0-9]', '', 'g'))
        between 12 and 19
    );
$$;

create or replace function public.audit_changes_match_action(
  event_action public.audit_action,
  candidate jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  allowed_keys text[];
  item record;
  scalar_value text;
begin
  if pg_catalog.jsonb_typeof(candidate) <> 'object' then
    return false;
  end if;

  allowed_keys := case event_action
    when 'platform_settings_updated' then array['setting_keys']
    when 'church_provisioned' then array[
      'church_slug', 'currency', 'owner_membership_status',
      'default_fund_id', 'qr_short_code'
    ]
    when 'church_settings_updated' then array['setting_keys']
    when 'church_status_changed' then array[
      'from_status', 'to_status', 'reason_code'
    ]
    when 'staff_invited' then array['membership_id', 'role']
    when 'staff_removed' then array['membership_id', 'previous_role']
    when 'staff_role_changed' then array[
      'membership_id', 'from_role', 'to_role'
    ]
    when 'fund_created' then array['fund_id']
    when 'fund_updated' then array['fund_id', 'field_names']
    when 'fund_archived' then array['fund_id']
    when 'campaign_created' then array['campaign_id']
    when 'campaign_updated' then array['campaign_id', 'field_names']
    when 'campaign_archived' then array['campaign_id']
    when 'provider_connection_updated' then array[
      'connection_id', 'status', 'capability_names'
    ]
    when 'subscription_updated' then array[
      'subscription_id', 'from_status', 'to_status'
    ]
    when 'report_exported' then array['report_type', 'format', 'row_count']
    when 'receipt_issued' then array['receipt_id', 'receipt_number']
    when 'prayer_request_reviewed' then array[
      'prayer_request_id', 'reviewed'
    ]
    when 'webhook_processed' then array[
      'webhook_event_id', 'event_type', 'result'
    ]
    when 'email_status_updated' then array[
      'email_event_id', 'from_status', 'to_status'
    ]
    else array[]::text[]
  end case;

  for item in
    select entry.key, entry.value
    from pg_catalog.jsonb_each(candidate) entry
  loop
    if not (item.key = any(allowed_keys)) then
      return false;
    end if;

    if item.key in (
      'default_fund_id', 'membership_id', 'fund_id',
      'campaign_id', 'connection_id', 'subscription_id', 'receipt_id',
      'prayer_request_id', 'webhook_event_id', 'email_event_id'
    ) then
      if pg_catalog.jsonb_typeof(item.value) <> 'string'
        or (item.value #>> '{}') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then
        return false;
      end if;
    elsif item.key in ('setting_keys', 'field_names', 'capability_names') then
      if pg_catalog.jsonb_typeof(item.value) <> 'array'
        or pg_catalog.jsonb_array_length(item.value) not between 1 and 32
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(item.value) array_item
          where pg_catalog.jsonb_typeof(array_item) <> 'string'
            or (array_item #>> '{}') !~ '^[a-z][a-z0-9_]{0,63}$'
        )
      then
        return false;
      end if;
    elsif item.key = 'row_count' then
      if pg_catalog.jsonb_typeof(item.value) <> 'number'
        or item.value::text !~ '^(0|[1-9][0-9]{0,9})$'
      then
        return false;
      end if;
    elsif item.key = 'reviewed' then
      if item.value not in ('true'::jsonb, 'false'::jsonb) then
        return false;
      end if;
    else
      if pg_catalog.jsonb_typeof(item.value) <> 'string' then
        return false;
      end if;

      scalar_value := item.value #>> '{}';
      if not public.audit_scalar_is_safe(scalar_value) then
        return false;
      end if;

      if item.key = 'church_slug'
        and scalar_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      then
        return false;
      elsif item.key = 'currency' and scalar_value !~ '^[A-Z]{3}$' then
        return false;
      elsif item.key = 'qr_short_code'
        and scalar_value !~ '^[a-z0-9][a-z0-9_-]{6,62}[a-z0-9]$'
      then
        return false;
      elsif item.key not in ('church_slug', 'currency', 'qr_short_code')
        and scalar_value !~ '^[A-Za-z0-9][A-Za-z0-9_.:@+-]{0,159}$'
      then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.append_audit_event(
  target_church_id uuid,
  event_actor_type public.audit_actor_type,
  event_action public.audit_action,
  event_entity public.audit_entity,
  event_entity_id text default null,
  event_actor_user_id uuid default null,
  event_request_id text default null,
  event_ip_hash text default null,
  event_sanitized_changes jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id bigint;
begin
  if event_actor_type is null or event_action is null or event_entity is null then
    raise exception 'audit actor, action, and entity are required';
  end if;

  if event_action = 'legacy_imported' then
    raise exception 'legacy_imported is reserved for pre-P07 history';
  end if;

  if event_action = 'platform_settings_updated' then
    if event_entity <> 'platform_settings' or target_church_id is not null then
      raise exception 'global platform settings audit events cannot have a church';
    end if;
  elsif target_church_id is null then
    raise exception 'church audit event requires a church';
  end if;

  if not (
    (
      event_action = 'platform_settings_updated'
      and event_entity = 'platform_settings'
    )
    or
    (
      event_action in (
        'church_provisioned',
        'church_settings_updated',
        'church_status_changed'
      )
      and event_entity = 'church'
    )
    or (
      event_action in ('staff_invited', 'staff_removed', 'staff_role_changed')
      and event_entity = 'church_membership'
    )
    or (
      event_action in ('fund_created', 'fund_updated', 'fund_archived')
      and event_entity = 'fund'
    )
    or (
      event_action in (
        'campaign_created',
        'campaign_updated',
        'campaign_archived'
      )
      and event_entity = 'campaign'
    )
    or (
      event_action = 'provider_connection_updated'
      and event_entity = 'payment_provider_connection'
    )
    or (
      event_action = 'subscription_updated'
      and event_entity = 'platform_subscription'
    )
    or (event_action = 'report_exported' and event_entity = 'report')
    or (event_action = 'receipt_issued' and event_entity = 'receipt')
    or (
      event_action = 'prayer_request_reviewed'
      and event_entity = 'prayer_request'
    )
    or (event_action = 'webhook_processed' and event_entity = 'webhook_event')
    or (event_action = 'email_status_updated' and event_entity = 'email_event')
  ) then
    raise exception 'audit action and entity do not match';
  end if;

  if event_entity_id is not null and (
    not public.audit_scalar_is_safe(event_entity_id)
    or event_entity_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:@+-]{0,159}$'
  ) then
    raise exception 'audit entity identifier is invalid';
  end if;

  if event_request_id is not null and (
    char_length(event_request_id) > 128
    or not public.audit_scalar_is_safe(event_request_id)
    or event_request_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:@+-]{0,127}$'
  ) then
    raise exception 'audit request identifier is invalid';
  end if;

  if event_ip_hash is not null and event_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'audit IP hash must be a lowercase SHA-256 hex digest';
  end if;

  if event_sanitized_changes is null
    or pg_catalog.jsonb_typeof(event_sanitized_changes) <> 'object'
    or pg_catalog.octet_length(event_sanitized_changes::text) > 16384
    or not public.audit_changes_match_action(
      event_action,
      event_sanitized_changes
    )
  then
    raise exception 'audit changes contain unsafe or invalid data';
  end if;

  insert into public.audit_logs (
    church_id,
    actor_user_id,
    actor_type,
    actor_display_name_snapshot,
    actor_role_snapshot,
    action,
    action_code,
    entity_table,
    entity_code,
    entity_id,
    request_id,
    ip_hash,
    sanitized_changes
  ) values (
    target_church_id,
    event_actor_user_id,
    event_actor_type,
    null,
    null,
    event_action::text,
    event_action,
    event_entity::text,
    event_entity,
    event_entity_id,
    event_request_id,
    event_ip_hash,
    event_sanitized_changes
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on column public.audit_logs.actor_user_id is
  'Immutable historical actor UUID snapshot. Deliberately has no auth.users foreign key so deleting an account cannot rewrite audit history.';
comment on column public.audit_logs.actor_display_name_snapshot is
  'Immutable display-name snapshot captured when the event is inserted.';
comment on column public.audit_logs.actor_role_snapshot is
  'Immutable church or platform role snapshot captured when available.';
comment on column public.audit_logs.action_code is
  'Finite canonical action for P07 and later events; legacy_imported marks pre-P07 history only.';
comment on column public.audit_logs.entity_code is
  'Finite canonical entity for events written through append_audit_event.';

revoke all on function public.capture_audit_actor_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_scalar_is_safe(text)
  from public, anon, authenticated, service_role;
revoke all on function public.audit_changes_match_action(
  public.audit_action,
  jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.append_audit_event(
  uuid,
  public.audit_actor_type,
  public.audit_action,
  public.audit_entity,
  text,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.append_audit_event(
  uuid,
  public.audit_actor_type,
  public.audit_action,
  public.audit_entity,
  text,
  uuid,
  text,
  text,
  jsonb
) to service_role;

-- Reassert the final audit append boundary. Authenticated, anonymous, and
-- service roles cannot insert audit rows directly or access the identity
-- sequence. The SECURITY DEFINER writer is the service role's only append path.
revoke all privileges on sequence public.audit_logs_id_seq
  from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate on public.audit_logs
  from anon, authenticated, service_role;
grant select on public.audit_logs to service_role;

commit;
