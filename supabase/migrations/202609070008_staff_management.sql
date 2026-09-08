begin;

-- Staff invitations are email reservations, not account-existence probes. The
-- same canonical form is used for storage, duplicate checks, and later claim.
create or replace function public.canonicalize_staff_email(input_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      input_value,
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '',
      'g'
    )
  )
$$;

-- Legacy profile copy is never trusted as presentation-ready roster content.
-- Invalid control-bearing names become null; safe names are single-line,
-- whitespace-canonical, and capped by Unicode code points.
create or replace function public.safe_staff_display_name(input_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when input_value ~ '[[:cntrl:]]' then null
    else nullif(
      pg_catalog.left(public.canonicalize_campaign_name(input_value), 120),
      ''
    )
  end
$$;

revoke all on function public.canonicalize_staff_email(text),
  public.safe_staff_display_name(text)
  from public, anon, authenticated, service_role;

alter table public.churches
  add column staff_revision bigint not null default 0,
  add constraint churches_staff_revision_nonnegative
    check (staff_revision >= 0);

-- Refuse ambiguous legacy identities instead of merging memberships silently.
-- Existing linked users receive an immutable invitation-email snapshot before
-- the stronger invariant and all-lifecycle uniqueness are installed.
do $$
begin
  if exists (
    select 1
    from public.church_memberships membership
    left join auth.users auth_user on auth_user.id = membership.user_id
    where coalesce(membership.invited_email, auth_user.email) is null
      or not public.is_valid_provisioning_email(
        public.canonicalize_staff_email(
          coalesce(membership.invited_email, auth_user.email)
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'P12_EXISTING_MEMBERSHIP_EMAIL_UNAVAILABLE';
  end if;

  if exists (
    select 1
    from public.church_memberships membership
    left join auth.users auth_user on auth_user.id = membership.user_id
    group by
      membership.church_id,
      public.canonicalize_staff_email(
        coalesce(membership.invited_email, auth_user.email)
      )
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'P12_EXISTING_MEMBERSHIP_EMAIL_CONFLICT';
  end if;
end;
$$;

update public.church_memberships membership
set invited_email = public.canonicalize_staff_email(
  coalesce(membership.invited_email, auth_user.email)
)
from auth.users auth_user
where auth_user.id = membership.user_id
  and membership.invited_email is null;

update public.church_memberships
set invited_email = public.canonicalize_staff_email(invited_email)
where invited_email is distinct from
  public.canonicalize_staff_email(invited_email);

drop index public.church_memberships_pending_email_unique_idx;

create unique index church_memberships_email_history_unique_idx
  on public.church_memberships (church_id, invited_email);

alter table public.church_memberships
  alter column invited_email set not null,
  add constraint church_memberships_invited_email_canonical check (
    invited_email = public.canonicalize_staff_email(invited_email)
    and public.is_valid_provisioning_email(invited_email)
  );

-- Future trusted inserts, including P08 owner provisioning, receive the same
-- durable email snapshot without requiring every older writer to send it.
create or replace function public.ensure_church_membership_email_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_email is null and new.user_id is not null then
    select public.canonicalize_staff_email(auth_user.email)
      into new.invited_email
    from auth.users auth_user
    where auth_user.id = new.user_id;
  elsif new.invited_email is not null then
    new.invited_email := public.canonicalize_staff_email(new.invited_email);
  end if;

  if new.invited_email is null
    or not public.is_valid_provisioning_email(new.invited_email)
  then
    raise exception using
      errcode = '22023',
      message = 'MEMBERSHIP_INVALID_EMAIL';
  end if;

  return new;
end;
$$;

create trigger church_memberships_require_email_snapshot
  before insert or update of user_id, invited_email
  on public.church_memberships
  for each row execute function public.ensure_church_membership_email_snapshot();

-- Account deletion is deliberately fail-closed until the client approves an
-- account-deletion/ownership-transfer policy. It can no longer erase staff
-- history through the foundation schema's former ON DELETE CASCADE.
alter table public.church_memberships
  drop constraint church_memberships_user_id_fkey,
  add constraint church_memberships_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete restrict;

comment on constraint church_memberships_user_id_fkey
  on public.church_memberships is
  'P12 preserves membership history by blocking Auth-user deletion until an explicit unlink/ownership-transfer workflow is approved.';

create type public.church_staff_record as (
  membership_id uuid,
  email text,
  display_name text,
  role public.church_member_role,
  status public.membership_status,
  access_enabled boolean,
  is_current_user boolean,
  invited_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create type public.church_staff_snapshot as (
  church_id uuid,
  staff_revision bigint,
  staff public.church_staff_record[]
);

create type public.church_staff_mutation_result as (
  church_id uuid,
  membership_id uuid,
  role public.church_member_role,
  status public.membership_status,
  staff_revision bigint,
  replayed boolean
);

create table public.church_staff_mutation_requests (
  church_id uuid not null,
  requested_by_user_id uuid not null,
  request_id uuid not null,
  operation text not null,
  payload_sha256 text not null,
  result_staff_revision bigint not null,
  result_membership_id uuid not null,
  result_user_id_snapshot uuid,
  result_role public.church_member_role not null,
  result_status public.membership_status not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  constraint church_staff_mutation_requests_pkey primary key (
    church_id,
    requested_by_user_id,
    request_id
  ),
  constraint church_staff_mutation_requests_church_request_unique unique (
    church_id,
    request_id
  ),
  constraint church_staff_mutation_requests_church_revision_unique unique (
    church_id,
    result_staff_revision
  ),
  constraint church_staff_mutation_requests_audit_unique unique (audit_log_id),
  constraint church_staff_mutation_requests_operation_check check (
    operation in ('invite', 'change_role', 'remove')
  ),
  constraint church_staff_mutation_requests_payload_sha256_check check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint church_staff_mutation_requests_revision_check check (
    result_staff_revision > 0
  ),
  constraint church_staff_mutation_requests_managed_role_check check (
    result_role in ('finance_admin', 'accountant', 'staff')
  ),
  constraint church_staff_mutation_requests_status_check check (
    result_status in ('invited', 'active', 'revoked')
  ),
  constraint church_staff_mutation_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint church_staff_mutation_requests_membership_fkey
    foreign key (church_id, result_membership_id)
    references public.church_memberships(church_id, id) on delete restrict,
  constraint church_staff_mutation_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

create index church_staff_mutation_requests_membership_idx
  on public.church_staff_mutation_requests (church_id, result_membership_id);

comment on table public.church_staff_mutation_requests is
  'Private append-only idempotency ledger for owner-authorized staff mutations. It stores no email or display name.';
comment on column public.church_staff_mutation_requests.result_user_id_snapshot is
  'Private immutable target identity snapshot without an Auth foreign key; never returned by a public RPC.';

alter table public.church_staff_mutation_requests enable row level security;
alter table public.church_staff_mutation_requests force row level security;

create or replace function public.guard_church_staff_mutation_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') or new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'STAFF_LEDGER_APPEND_ONLY';
  end if;
  return new;
end;
$$;

create trigger church_staff_mutation_requests_append_only
  before update or delete on public.church_staff_mutation_requests
  for each row execute function public.guard_church_staff_mutation_request();

create trigger church_staff_mutation_requests_no_truncate
  before truncate on public.church_staff_mutation_requests
  for each statement execute function public.guard_church_staff_mutation_request();

-- Extend the finite audit writer for the acceptance value committed by 007.
-- Every staff event remains identifier/role-only: email and copy are forbidden.
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
    when 'staff_invitation_accepted' then array['membership_id', 'role']
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
      event_action in (
        'staff_invited',
        'staff_invitation_accepted',
        'staff_removed',
        'staff_role_changed'
      )
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

create or replace function public.get_church_staff(
  target_church_id uuid
)
returns public.church_staff_snapshot
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  staff_snapshot public.church_staff_snapshot;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'staff_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'STAFF_FORBIDDEN';
  end if;

  select church.id, church.staff_revision
    into staff_snapshot.church_id, staff_snapshot.staff_revision
  from public.churches church
  where church.id = target_church_id;

  if not found then
    raise exception using errcode = '42501', message = 'STAFF_FORBIDDEN';
  end if;

  select coalesce(
    array_agg(
      row(
        membership.id,
        membership.invited_email,
        public.safe_staff_display_name(profile.display_name),
        membership.role,
        membership.status,
        membership.status = 'active'
          and membership.user_id is not null
          and coalesce(profile.is_active, false),
        coalesce(membership.user_id = request_user_id, false),
        membership.invited_at,
        membership.accepted_at,
        membership.revoked_at
      )::public.church_staff_record
      order by
        case membership.role
          when 'owner' then 0
          when 'finance_admin' then 1
          when 'accountant' then 2
          else 3
        end,
        case membership.status
          when 'active' then 0
          when 'invited' then 1
          when 'suspended' then 2
          else 3
        end,
        pg_catalog.lower(
          coalesce(
            public.safe_staff_display_name(profile.display_name),
            membership.invited_email
          )
        ),
        membership.id
    ),
    array[]::public.church_staff_record[]
  ) into staff_snapshot.staff
  from public.church_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  where membership.church_id = target_church_id;

  return staff_snapshot;
end;
$$;

create or replace function public.mutate_church_staff(
  staff_request_id uuid,
  target_church_id uuid,
  expected_staff_revision bigint,
  staff_operation text,
  target_membership_id uuid default null,
  staff_email text default null,
  staff_role text default null
)
returns public.church_staff_mutation_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  request_user_email text;
  canonical_operation text;
  canonical_email text;
  canonical_role public.church_member_role;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.church_staff_mutation_requests%rowtype;
  locked_church public.churches%rowtype;
  target_membership public.church_memberships%rowtype;
  prior_role public.church_member_role;
  audit_action public.audit_action;
  audit_changes jsonb;
  inserted_audit_log_id bigint;
  next_revision bigint;
  mutation_result public.church_staff_mutation_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'staff_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'STAFF_FORBIDDEN';
  end if;

  if staff_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'STAFF_INVALID_REQUEST_ID';
  end if;
  if expected_staff_revision is null or expected_staff_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'STAFF_INVALID_EXPECTED_REVISION';
  end if;

  canonical_operation := pg_catalog.lower(pg_catalog.btrim(staff_operation));
  if canonical_operation is null
    or canonical_operation not in ('invite', 'change_role', 'remove')
  then
    raise exception using
      errcode = '22023',
      message = 'STAFF_INVALID_OPERATION';
  end if;

  if canonical_operation = 'invite' then
    if target_membership_id is not null
      or staff_email is null
      or staff_role is null
    then
      raise exception using
        errcode = '22023',
        message = 'STAFF_INVALID_ARGUMENTS';
    end if;
    canonical_email := public.canonicalize_staff_email(staff_email);
    if not public.is_valid_provisioning_email(canonical_email) then
      raise exception using
        errcode = '22023',
        message = 'STAFF_INVALID_EMAIL';
    end if;
  elsif canonical_operation = 'change_role' then
    if target_membership_id is null
      or staff_email is not null
      or staff_role is null
    then
      raise exception using
        errcode = '22023',
        message = 'STAFF_INVALID_ARGUMENTS';
    end if;
  else
    if target_membership_id is null
      or staff_email is not null
      or staff_role is not null
    then
      raise exception using
        errcode = '22023',
        message = 'STAFF_INVALID_ARGUMENTS';
    end if;
  end if;

  if canonical_operation in ('invite', 'change_role') then
    if pg_catalog.lower(pg_catalog.btrim(staff_role)) not in (
      'finance_admin', 'accountant', 'staff'
    ) then
      raise exception using
        errcode = '22023',
        message = 'STAFF_INVALID_ROLE';
    end if;
    canonical_role := pg_catalog.lower(pg_catalog.btrim(staff_role))::
      public.church_member_role;
  end if;

  -- Checking only the authenticated caller's email prevents self-invitation
  -- without disclosing whether any other submitted email has an Auth account.
  if canonical_operation = 'invite' then
    select public.canonicalize_staff_email(auth_user.email)
      into request_user_email
    from auth.users auth_user
    where auth_user.id = request_user_id;

    if request_user_email is not null
      and canonical_email = request_user_email
    then
      raise exception using
        errcode = '22023',
        message = 'STAFF_SELF_PROTECTED';
    end if;
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_staff_revision', expected_staff_revision,
    'staff_operation', canonical_operation,
    'target_membership_id', target_membership_id,
    'staff_email', canonical_email,
    'staff_role', canonical_role
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'church-staff-request:' || target_church_id::text || ':' ||
        staff_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.church_staff_mutation_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = staff_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'STAFF_IDEMPOTENCY_CONFLICT';
    end if;

    mutation_result.church_id := existing_request.church_id;
    mutation_result.membership_id := existing_request.result_membership_id;
    mutation_result.role := existing_request.result_role;
    mutation_result.status := existing_request.result_status;
    mutation_result.staff_revision := existing_request.result_staff_revision;
    mutation_result.replayed := true;
    return mutation_result;
  end if;

  select church.*
    into locked_church
  from public.churches church
  where church.id = target_church_id
  for update;

  if not found
    or not (select public.has_church_permission(
      target_church_id,
      'staff_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'STAFF_FORBIDDEN';
  end if;

  if locked_church.staff_revision <> expected_staff_revision then
    raise exception using
      errcode = '40001',
      message = 'STAFF_REVISION_CONFLICT';
  end if;

  if canonical_operation = 'invite' then
    select membership.*
      into target_membership
    from public.church_memberships membership
    where membership.church_id = target_church_id
      and membership.invited_email = canonical_email
    for update;

    if found then
      if target_membership.user_id = request_user_id then
        raise exception using
          errcode = '22023',
          message = 'STAFF_SELF_PROTECTED';
      end if;
      if target_membership.role = 'owner' then
        raise exception using
          errcode = '22023',
          message = 'STAFF_OWNER_PROTECTED';
      end if;
      if target_membership.status = 'invited' then
        raise exception using
          errcode = '22023',
          message = 'STAFF_ALREADY_INVITED';
      end if;
      if target_membership.status in ('active', 'suspended') then
        raise exception using
          errcode = '23505',
          message = 'STAFF_EMAIL_CONFLICT';
      end if;

      update public.church_memberships
      set
        user_id = null,
        role = canonical_role,
        status = 'invited',
        invited_by = request_user_id,
        invited_at = transaction_timestamp(),
        accepted_at = null,
        revoked_at = null
      where church_id = target_church_id
        and id = target_membership.id
      returning * into target_membership;
    else
      begin
        insert into public.church_memberships (
          church_id,
          user_id,
          invited_email,
          role,
          status,
          invited_by,
          invited_at,
          accepted_at,
          revoked_at
        ) values (
          target_church_id,
          null,
          canonical_email,
          canonical_role,
          'invited',
          request_user_id,
          transaction_timestamp(),
          null,
          null
        )
        returning * into target_membership;
      exception when unique_violation then
        raise exception using
          errcode = '23505',
          message = 'STAFF_EMAIL_CONFLICT';
      end;
    end if;

    audit_action := 'staff_invited';
    audit_changes := pg_catalog.jsonb_build_object(
      'membership_id', target_membership.id,
      'role', target_membership.role
    );
  else
    select membership.*
      into target_membership
    from public.church_memberships membership
    where membership.church_id = target_church_id
      and membership.id = target_membership_id
    for update;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'STAFF_MEMBERSHIP_NOT_FOUND';
    end if;
    if target_membership.user_id = request_user_id then
      raise exception using
        errcode = '22023',
        message = 'STAFF_SELF_PROTECTED';
    end if;
    if target_membership.role = 'owner' then
      raise exception using
        errcode = '22023',
        message = 'STAFF_OWNER_PROTECTED';
    end if;

    if canonical_operation = 'change_role' then
      if target_membership.status = 'revoked' then
        raise exception using
          errcode = '22023',
          message = 'STAFF_ALREADY_REMOVED';
      end if;
      if target_membership.status = 'suspended' then
        raise exception using
          errcode = '22023',
          message = 'STAFF_MEMBERSHIP_NOT_MANAGEABLE';
      end if;
      if target_membership.role = canonical_role then
        raise exception using
          errcode = '22023',
          message = 'STAFF_NO_CHANGES';
      end if;

      prior_role := target_membership.role;
      update public.church_memberships
      set role = canonical_role
      where church_id = target_church_id
        and id = target_membership.id
      returning * into target_membership;

      audit_action := 'staff_role_changed';
      audit_changes := pg_catalog.jsonb_build_object(
        'membership_id', target_membership.id,
        'from_role', prior_role,
        'to_role', target_membership.role
      );
    else
      if target_membership.status = 'revoked' then
        raise exception using
          errcode = '22023',
          message = 'STAFF_ALREADY_REMOVED';
      end if;

      prior_role := target_membership.role;
      update public.church_memberships
      set
        status = 'revoked',
        revoked_at = transaction_timestamp()
      where church_id = target_church_id
        and id = target_membership.id
      returning * into target_membership;

      audit_action := 'staff_removed';
      audit_changes := pg_catalog.jsonb_build_object(
        'membership_id', target_membership.id,
        'previous_role', prior_role
      );
    end if;
  end if;

  next_revision := locked_church.staff_revision + 1;
  update public.churches
  set staff_revision = next_revision
  where id = target_church_id;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => audit_action,
    event_entity => 'church_membership',
    event_entity_id => target_membership.id::text,
    event_actor_user_id => request_user_id,
    event_request_id => staff_request_id::text,
    event_sanitized_changes => audit_changes
  );

  insert into public.church_staff_mutation_requests (
    church_id,
    requested_by_user_id,
    request_id,
    operation,
    payload_sha256,
    result_staff_revision,
    result_membership_id,
    result_user_id_snapshot,
    result_role,
    result_status,
    audit_log_id
  ) values (
    target_church_id,
    request_user_id,
    staff_request_id,
    canonical_operation,
    canonical_payload_sha256,
    next_revision,
    target_membership.id,
    target_membership.user_id,
    target_membership.role,
    target_membership.status,
    inserted_audit_log_id
  );

  mutation_result.church_id := target_church_id;
  mutation_result.membership_id := target_membership.id;
  mutation_result.role := target_membership.role;
  mutation_result.status := target_membership.status;
  mutation_result.staff_revision := next_revision;
  mutation_result.replayed := false;
  return mutation_result;
end;
$$;

-- Invitation acceptance is a separate authenticated boundary so inviting an
-- address never reveals account existence. A caller can claim only an exact
-- pending reservation for their own currently-confirmed Auth email.
create or replace function public.claim_church_staff_invitation(
  target_membership_id uuid
)
returns public.church_staff_mutation_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  request_user_email text;
  target_church_id uuid;
  locked_church public.churches%rowtype;
  target_membership public.church_memberships%rowtype;
  next_revision bigint;
  mutation_result public.church_staff_mutation_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null or target_membership_id is null then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  select public.canonicalize_staff_email(auth_user.email)
    into request_user_email
  from auth.users auth_user
  join public.profiles profile
    on profile.id = auth_user.id
   and profile.is_active
  where auth_user.id = request_user_id
    and auth_user.email_confirmed_at is not null
  for key share of auth_user, profile;

  if not found
    or request_user_email is null
    or not public.is_valid_provisioning_email(request_user_email)
  then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  select membership.church_id
    into target_church_id
  from public.church_memberships membership
  join public.churches church
    on church.id = membership.church_id
   and church.status in ('active', 'onboarding')
  where membership.id = target_membership_id
    and (
      (
        membership.status = 'invited'
        and membership.invited_email = request_user_email
        and membership.role in ('owner', 'finance_admin', 'accountant', 'staff')
      )
      or (
        membership.status = 'active'
        and membership.user_id = request_user_id
      )
    );

  if not found then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  select church.*
    into locked_church
  from public.churches church
  where church.id = target_church_id
    and church.status in ('active', 'onboarding')
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  select membership.*
    into target_membership
  from public.church_memberships membership
  where membership.church_id = target_church_id
    and membership.id = target_membership_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  if target_membership.status = 'active'
    and target_membership.user_id = request_user_id
  then
    mutation_result.church_id := target_church_id;
    mutation_result.membership_id := target_membership.id;
    mutation_result.role := target_membership.role;
    mutation_result.status := target_membership.status;
    mutation_result.staff_revision := locked_church.staff_revision;
    mutation_result.replayed := true;
    return mutation_result;
  end if;

  if target_membership.status <> 'invited'
    or target_membership.invited_email <> request_user_email
    or target_membership.role not in (
      'owner', 'finance_admin', 'accountant', 'staff'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  perform 1
  from public.church_memberships membership
  where membership.church_id = target_church_id
    and membership.user_id = request_user_id
    and membership.id <> target_membership.id
  order by membership.id
  for update;

  if found then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
  end if;

  update public.church_memberships
  set
    user_id = request_user_id,
    status = 'active',
    accepted_at = transaction_timestamp(),
    revoked_at = null
  where church_id = target_church_id
    and id = target_membership.id
  returning * into target_membership;

  next_revision := locked_church.staff_revision + 1;
  update public.churches
  set staff_revision = next_revision
  where id = target_church_id;

  perform public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => 'staff_invitation_accepted',
    event_entity => 'church_membership',
    event_entity_id => target_membership.id::text,
    event_actor_user_id => request_user_id,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'membership_id', target_membership.id,
      'role', target_membership.role
    )
  );

  mutation_result.church_id := target_church_id;
  mutation_result.membership_id := target_membership.id;
  mutation_result.role := target_membership.role;
  mutation_result.status := target_membership.status;
  mutation_result.staff_revision := next_revision;
  mutation_result.replayed := false;
  return mutation_result;
exception
  when unique_violation then
    raise exception using
      errcode = '42501',
      message = 'STAFF_INVITATION_NOT_AVAILABLE';
end;
$$;

comment on function public.get_church_staff(uuid) is
  'Returns one staff_manage-authorized scalar snapshot with a typed empty-safe roster and minimum presentation-safe identity fields.';
comment on function public.mutate_church_staff(
  uuid, uuid, bigint, text, uuid, text, text
) is
  'Applies one owner-authorized optimistic/idempotent invite, role change, or removal with identifier/role-only audit data.';
comment on function public.claim_church_staff_invitation(uuid) is
  'Claims an exact pending invitation using only the authenticated caller current verified email and records an immutable acceptance audit.';

-- Direct roster identity remains minimum-column and self/RLS constrained. The
-- owner roster uses get_church_staff; email/name/timestamps are RPC-only.
drop policy if exists church_memberships_read_own_or_staff_manager
  on public.church_memberships;
create policy church_memberships_read_own
  on public.church_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.can_read_own_church_membership(church_id))
  );

revoke select on table public.church_memberships from authenticated;
grant select (id, church_id, user_id, role, status)
  on public.church_memberships to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.church_memberships
  from anon, authenticated, service_role;

revoke all privileges on table public.church_staff_mutation_requests
  from public, anon, authenticated, service_role;

revoke all on type public.church_staff_record,
  public.church_staff_snapshot,
  public.church_staff_mutation_result
  from public, anon, authenticated, service_role;
grant usage on type public.church_staff_record,
  public.church_staff_snapshot,
  public.church_staff_mutation_result
  to authenticated;

revoke all on function public.ensure_church_membership_email_snapshot(),
  public.guard_church_staff_mutation_request()
  from public, anon, authenticated, service_role;
revoke all on function public.get_church_staff(uuid),
  public.mutate_church_staff(
    uuid, uuid, bigint, text, uuid, text, text
  ),
  public.claim_church_staff_invitation(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_church_staff(uuid),
  public.mutate_church_staff(
    uuid, uuid, bigint, text, uuid, text, text
  ),
  public.claim_church_staff_invitation(uuid)
  to authenticated;

commit;
