begin;

-- P15 deliberately implements the conservative guest/member boundary while
-- the historical linking policy remains unapproved. A verified member gets a
-- new church-scoped row even when an unlinked guest row has the same email;
-- no guest row or financial record is searched, claimed, merged, or rewritten.

create or replace function public.canonicalize_donor_display_name(
  input_value text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      input_value,
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '',
      'g'
    ),
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
    ' ',
    'g'
  )
$$;

create or replace function public.donor_text_has_unsafe_formatting(
  input_value text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    input_value ~ '[[:cntrl:]]'
    or exists (
      select 1
      from pg_catalog.generate_series(127, 159) code_point
      where pg_catalog.strpos(
        input_value,
        pg_catalog.chr(code_point)
      ) > 0
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        1564, 8206, 8207, 8232, 8233,
        8234, 8235, 8236, 8237, 8238,
        8294, 8295, 8296, 8297
      ]) code_point
      where pg_catalog.strpos(
        input_value,
        pg_catalog.chr(code_point)
      ) > 0
    )
$$;

create or replace function public.canonicalize_donor_email(input_value text)
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

create or replace function public.is_valid_donor_email(input_value text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  canonical_email text;
  local_part text;
  domain_part text;
  domain_label text;
  at_position integer;
begin
  canonical_email := public.canonicalize_donor_email(input_value);
  at_position := pg_catalog.strpos(canonical_email, '@');

  if canonical_email <> input_value
    or pg_catalog.char_length(canonical_email) > 254
    or at_position not between 2 and 65
    or pg_catalog.strpos(
      pg_catalog.substr(canonical_email, at_position + 1),
      '@'
    ) > 0
  then
    return false;
  end if;

  local_part := pg_catalog.substr(canonical_email, 1, at_position - 1);
  domain_part := pg_catalog.substr(canonical_email, at_position + 1);

  if local_part !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$'
    or local_part ~ '^\.|\.$|\.\.'
    or pg_catalog.char_length(domain_part) > 253
    or pg_catalog.cardinality(pg_catalog.string_to_array(domain_part, '.')) < 2
  then
    return false;
  end if;

  foreach domain_label in array pg_catalog.string_to_array(domain_part, '.')
  loop
    if pg_catalog.char_length(domain_label) not between 1 and 63
      or domain_label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all privileges on function
  public.canonicalize_donor_display_name(text),
  public.donor_text_has_unsafe_formatting(text),
  public.canonicalize_donor_email(text),
  public.is_valid_donor_email(text)
from public, anon, authenticated, service_role;

-- Refuse unsafe legacy identity values rather than guessing or dropping them.
do $$
begin
  if exists (
    select 1
    from public.donors donor
    where donor.display_name is null
      or pg_catalog.char_length(
        public.canonicalize_donor_display_name(donor.display_name)
      ) not between 2 and 120
      or public.donor_text_has_unsafe_formatting(donor.display_name)
  ) then
    raise exception using
      errcode = '23514',
      message = 'P15_EXISTING_DONOR_DISPLAY_NAME_INVALID';
  end if;

  if exists (
    select 1
    from public.donors donor
    where donor.email is null
      or not public.is_valid_donor_email(
        public.canonicalize_donor_email(donor.email)
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'P15_EXISTING_DONOR_EMAIL_INVALID';
  end if;

  if exists (
    select 1
    from public.donors donor
    left join auth.users auth_user on auth_user.id = donor.auth_user_id
    where donor.auth_user_id is not null
      and (
        auth_user.id is null
        or auth_user.email_confirmed_at is null
        or auth_user.email is null
        or not public.is_valid_donor_email(
          public.canonicalize_donor_email(auth_user.email)
        )
        or public.canonicalize_donor_email(donor.email)
          <> public.canonicalize_donor_email(auth_user.email)
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'P15_EXISTING_LINKED_DONOR_IDENTITY_INVALID';
  end if;

  if exists (
    select 1
    from public.donors donor
    where donor.auth_user_id is not null
    group by donor.auth_user_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'P15_EXISTING_SHARED_DONOR_ACCOUNT';
  end if;

  if exists (
    select 1
    from public.donors donor
    where donor.auth_user_id is not null
      and donor.is_anonymous
  ) then
    raise exception using
      errcode = '23514',
      message = 'P15_EXISTING_LINKED_ANONYMOUS_DONOR';
  end if;
end;
$$;

drop index public.donors_email_unique_idx;
drop index public.donors_auth_user_unique_idx;
drop index public.donors_auth_user_fk_idx;

update public.donors
set
  display_name = public.canonicalize_donor_display_name(display_name),
  email = public.canonicalize_donor_email(email)
where display_name is distinct from
    public.canonicalize_donor_display_name(display_name)
  or email is distinct from public.canonicalize_donor_email(email);

alter table public.donors
  add column profile_revision bigint not null default 0,
  alter column display_name set not null,
  alter column email set not null,
  drop constraint donors_email_not_blank,
  add constraint donors_display_name_canonical check (
    display_name = public.canonicalize_donor_display_name(display_name)
  ),
  add constraint donors_display_name_safe check (
    pg_catalog.char_length(display_name) between 2 and 120
    and not public.donor_text_has_unsafe_formatting(display_name)
  ),
  add constraint donors_email_canonical check (
    email = public.canonicalize_donor_email(email)
  ),
  add constraint donors_email_valid check (
    public.is_valid_donor_email(email)
  ),
  add constraint donors_profile_revision_nonnegative check (
    profile_revision >= 0
  ),
  add constraint donors_linked_member_not_anonymous check (
    auth_user_id is null or not is_anonymous
  );

create index donors_email_lookup_idx
  on public.donors (church_id, email);
create unique index donors_auth_user_global_unique_idx
  on public.donors (auth_user_id)
  where auth_user_id is not null;

alter table public.donors
  drop constraint donors_auth_user_id_fkey,
  add constraint donors_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users(id) on delete restrict;

comment on constraint donors_auth_user_id_fkey on public.donors is
  'P15 preserves member and financial attribution by blocking Auth deletion until an approved unlink/account-deletion workflow exists.';
comment on index public.donors_email_lookup_idx is
  'Non-unique tenant lookup only. Matching email never authorizes or automatically links a guest donor to a member account.';
comment on index public.donors_auth_user_global_unique_idx is
  'A v1 member account belongs to one donor profile in one church; unlinked guest rows are unaffected.';
comment on column public.donors.is_anonymous is
  'Future staff-facing attribution preference only; P15 still requires a private name and receipt email for every donor.';

create or replace function public.guard_donor_auth_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception using
      errcode = '55000',
      message = 'DONOR_AUTH_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger donors_keep_auth_identity
  before update of auth_user_id on public.donors
  for each row execute function public.guard_donor_auth_identity();

-- All donor-owned RLS consumers share the same P15 eligibility boundary as the
-- profile RPC: active app identity, confirmed canonical Auth email, exact
-- linked non-anonymous donor, and active church.
create or replace function public.owns_donor(target_donor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.donors donor
    join public.churches church
      on church.id = donor.church_id
     and church.status = 'active'
    join public.profiles profile
      on profile.id = donor.auth_user_id
     and profile.is_active
    join auth.users auth_user
      on auth_user.id = profile.id
     and auth_user.email_confirmed_at is not null
    where donor.id = target_donor_id
      and donor.auth_user_id = (select auth.uid())
      and not donor.is_anonymous
      and auth_user.email is not null
      and public.is_valid_donor_email(
        public.canonicalize_donor_email(auth_user.email)
      )
      and donor.email = public.canonicalize_donor_email(auth_user.email)
  )
$$;

revoke all on function public.owns_donor(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.owns_donor(uuid) to authenticated;

create type public.my_donor_profile_record as (
  church_id uuid,
  donor_id uuid,
  display_name text,
  email text,
  profile_revision bigint,
  updated_at timestamptz
);

create type public.my_donor_profile_mutation_result as (
  church_id uuid,
  donor_id uuid,
  profile_revision bigint,
  operation text,
  replayed boolean
);

create table public.donor_profile_mutation_requests (
  church_id uuid not null,
  requested_by_user_id uuid not null,
  request_id uuid not null,
  payload_sha256 text not null,
  result_donor_id uuid not null,
  result_profile_revision bigint not null,
  result_operation text not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  constraint donor_profile_mutation_requests_pkey primary key (
    church_id,
    requested_by_user_id,
    request_id
  ),
  constraint donor_profile_mutation_requests_church_request_unique unique (
    church_id,
    request_id
  ),
  constraint donor_profile_mutation_requests_payload_sha256_check check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint donor_profile_mutation_requests_revision_check check (
    result_profile_revision >= 0
  ),
  constraint donor_profile_mutation_requests_operation_check check (
    result_operation in ('created', 'updated')
  ),
  constraint donor_profile_mutation_requests_donor_revision_unique unique (
    church_id,
    result_donor_id,
    result_profile_revision
  ),
  constraint donor_profile_mutation_requests_audit_unique unique (audit_log_id),
  constraint donor_profile_mutation_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint donor_profile_mutation_requests_user_fkey
    foreign key (requested_by_user_id) references auth.users(id)
    on delete restrict,
  constraint donor_profile_mutation_requests_donor_fkey
    foreign key (church_id, result_donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint donor_profile_mutation_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id)
    on delete restrict
);

comment on table public.donor_profile_mutation_requests is
  'Private append-only P15 idempotency ledger. It stores only identity keys, an opaque payload digest, result identifiers/revision, and an audit reference; no donor name or email.';

alter table public.donor_profile_mutation_requests enable row level security;
alter table public.donor_profile_mutation_requests force row level security;

create or replace function public.guard_donor_profile_mutation_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') or new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'DONOR_PROFILE_LEDGER_APPEND_ONLY';
  end if;
  return new;
end;
$$;

create trigger donor_profile_mutation_requests_append_only
  before update or delete on public.donor_profile_mutation_requests
  for each row execute function public.guard_donor_profile_mutation_request();

create trigger donor_profile_mutation_requests_no_truncate
  before truncate on public.donor_profile_mutation_requests
  for each statement execute function public.guard_donor_profile_mutation_request();

-- Donor-only accounts have no staff membership. Extend actor capture solely for
-- the two donor-profile actions, and require that the event entity is the exact
-- active linked donor belonging to the authenticated actor. All other human
-- audit events retain the pre-P15 staff/platform capacity checks unchanged.
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

      if new.action_code in (
        'donor_profile_created',
        'donor_profile_updated'
      ) and new.entity_code = 'donor' then
        select 'Registered donor', 'member'
          into resolved_display_name, resolved_role
        from public.profiles profile
        join auth.users auth_user on auth_user.id = profile.id
        join public.donors donor
          on donor.auth_user_id = profile.id
         and donor.church_id = new.church_id
         and donor.id::text = new.entity_id
         and not donor.is_anonymous
        join public.churches church
          on church.id = donor.church_id
         and church.status = 'active'
        where profile.id = new.actor_user_id
          and profile.is_active
          and auth_user.email_confirmed_at is not null
          and auth_user.email is not null
          and public.is_valid_donor_email(
            public.canonicalize_donor_email(auth_user.email)
          );

        if not found then
          raise exception 'user audit actor has no active donor capacity';
        end if;
      else
        select
          coalesce(
            nullif(pg_catalog.btrim(profile.display_name), ''),
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
      end if;

    when 'support' then
      if new.actor_user_id is null then
        raise exception 'support audit actor requires a user UUID';
      end if;

      select
        coalesce(
          nullif(pg_catalog.btrim(profile.display_name), ''),
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

  new.actor_display_name_snapshot := pg_catalog.left(
    resolved_display_name,
    160
  );
  new.actor_role_snapshot := pg_catalog.left(resolved_role, 64);

  return new;
end;
$$;

-- Extend the finite P07 audit boundary with identifier/field-name-only donor
-- profile events. Profile values are never admitted to audit JSON.
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
    when 'donor_profile_created' then array['donor_id', 'field_names']
    when 'donor_profile_updated' then array['donor_id', 'field_names']
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
      'default_fund_id', 'membership_id', 'donor_id', 'fund_id',
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
      event_action in ('donor_profile_created', 'donor_profile_updated')
      and event_entity = 'donor'
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
    pg_catalog.char_length(event_request_id) > 128
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

create or replace function public.get_my_donor_profile(
  target_church_id uuid
)
returns setof public.my_donor_profile_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  verified_email text;
begin
  request_user_id := (select auth.uid());

  select public.canonicalize_donor_email(auth_user.email)
    into verified_email
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = request_user_id
    and profile.is_active
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null
    and public.is_valid_donor_email(
      public.canonicalize_donor_email(auth_user.email)
    );

  if verified_email is null then
    return;
  end if;

  return query
    select
      donor.church_id,
      donor.id,
      donor.display_name,
      verified_email,
      donor.profile_revision,
      donor.updated_at
    from public.donors donor
    join public.churches church on church.id = donor.church_id
    where donor.church_id = target_church_id
      and donor.auth_user_id = request_user_id
      and church.status = 'active';
end;
$$;

create or replace function public.mutate_my_donor_profile(
  target_church_id uuid,
  profile_request_id uuid,
  expected_profile_revision bigint,
  profile_display_name text
)
returns public.my_donor_profile_mutation_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  verified_email text;
  rechecked_email text;
  canonical_display_name text;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.donor_profile_mutation_requests%rowtype;
  locked_church public.churches%rowtype;
  target_donor public.donors%rowtype;
  changed_field_names text[] := '{}'::text[];
  sorted_field_names text[];
  result_operation text;
  result_revision bigint;
  audit_action public.audit_action;
  inserted_audit_log_id bigint;
  mutation_result public.my_donor_profile_mutation_result;
begin
  request_user_id := (select auth.uid());

  select public.canonicalize_donor_email(auth_user.email)
    into verified_email
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = request_user_id
    and profile.is_active
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null
    and public.is_valid_donor_email(
      public.canonicalize_donor_email(auth_user.email)
    );

  if verified_email is null then
    raise exception using
      errcode = '42501',
      message = 'DONOR_PROFILE_FORBIDDEN';
  end if;

  if target_church_id is null then
    raise exception using
      errcode = '42501',
      message = 'DONOR_PROFILE_FORBIDDEN';
  end if;

  if profile_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'DONOR_PROFILE_INVALID_REQUEST_ID';
  end if;

  if expected_profile_revision is null or expected_profile_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'DONOR_PROFILE_INVALID_EXPECTED_REVISION';
  end if;

  canonical_display_name := public.canonicalize_donor_display_name(
    profile_display_name
  );
  if canonical_display_name is null
    or pg_catalog.char_length(canonical_display_name) not between 2 and 120
    or public.donor_text_has_unsafe_formatting(profile_display_name)
  then
    raise exception using
      errcode = '22023',
      message = 'DONOR_PROFILE_INVALID_DISPLAY_NAME';
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_profile_revision', expected_profile_revision,
    'profile_display_name', canonical_display_name
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  -- All P15 mutations acquire locks in this order: exact request, global member
  -- identity, active church, Auth user, and app profile. The global identity
  -- lock serializes concurrent attempts to create the v1 account in different
  -- churches, while the row locks keep eligibility stable through commit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'donor-profile-request:' || target_church_id::text || ':' ||
        profile_request_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'donor-profile-identity:' || request_user_id::text,
      0
    )
  );

  select church.*
    into locked_church
  from public.churches church
  where church.id = target_church_id
    and church.status = 'active'
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'DONOR_PROFILE_FORBIDDEN';
  end if;

  -- Lock both authoritative identity rows so confirmation/email/active status
  -- cannot change between this recheck and transaction commit.
  select public.canonicalize_donor_email(auth_user.email)
    into rechecked_email
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = request_user_id
    and profile.is_active
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null
    and public.is_valid_donor_email(
      public.canonicalize_donor_email(auth_user.email)
    )
  for share of auth_user, profile;

  if rechecked_email is null then
    raise exception using
      errcode = '42501',
      message = 'DONOR_PROFILE_FORBIDDEN';
  end if;
  verified_email := rechecked_email;

  -- Replay is deliberately checked only after current caller and church
  -- eligibility are locked, so a suspended tenant or disabled user cannot
  -- retrieve a formerly successful result.
  select request_record.*
    into existing_request
  from public.donor_profile_mutation_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = profile_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'DONOR_PROFILE_IDEMPOTENCY_CONFLICT';
    end if;

    mutation_result.church_id := existing_request.church_id;
    mutation_result.donor_id := existing_request.result_donor_id;
    mutation_result.profile_revision :=
      existing_request.result_profile_revision;
    mutation_result.operation := existing_request.result_operation;
    mutation_result.replayed := true;
    return mutation_result;
  end if;

  select donor.*
    into target_donor
  from public.donors donor
  where donor.auth_user_id = request_user_id
  for update;

  if found then
    if target_donor.church_id <> target_church_id then
      raise exception using
        errcode = '42501',
        message = 'DONOR_PROFILE_FORBIDDEN';
    end if;

    if target_donor.profile_revision <> expected_profile_revision then
      raise exception using
        errcode = '40001',
        message = 'DONOR_PROFILE_REVISION_CONFLICT';
    end if;

    if target_donor.display_name is distinct from canonical_display_name then
      changed_field_names := pg_catalog.array_append(
        changed_field_names,
        'display_name'
      );
    end if;
    if target_donor.email is distinct from verified_email then
      changed_field_names := pg_catalog.array_append(
        changed_field_names,
        'email'
      );
    end if;

    if pg_catalog.cardinality(changed_field_names) = 0 then
      raise exception using
        errcode = '22023',
        message = 'DONOR_PROFILE_NO_CHANGES';
    end if;

    result_revision := target_donor.profile_revision + 1;
    update public.donors
    set
      display_name = canonical_display_name,
      email = verified_email,
      profile_revision = result_revision
    where church_id = target_church_id
      and id = target_donor.id
    returning * into target_donor;

    result_operation := 'updated';
    audit_action := 'donor_profile_updated';
  else
    if expected_profile_revision <> 0 then
      raise exception using
        errcode = '40001',
        message = 'DONOR_PROFILE_REVISION_CONFLICT';
    end if;

    insert into public.donors (
      church_id,
      auth_user_id,
      display_name,
      email,
      is_anonymous,
      profile_revision
    ) values (
      target_church_id,
      request_user_id,
      canonical_display_name,
      verified_email,
      false,
      0
    )
    returning * into target_donor;

    changed_field_names := array['display_name', 'email'];
    result_revision := 0;
    result_operation := 'created';
    audit_action := 'donor_profile_created';
  end if;

  select pg_catalog.array_agg(field_name order by field_name)
    into sorted_field_names
  from pg_catalog.unnest(changed_field_names) field_name;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => audit_action,
    event_entity => 'donor',
    event_entity_id => target_donor.id::text,
    event_actor_user_id => request_user_id,
    event_request_id => profile_request_id::text,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'donor_id',
      target_donor.id,
      'field_names',
      pg_catalog.to_jsonb(sorted_field_names)
    )
  );

  insert into public.donor_profile_mutation_requests (
    church_id,
    requested_by_user_id,
    request_id,
    payload_sha256,
    result_donor_id,
    result_profile_revision,
    result_operation,
    audit_log_id
  ) values (
    target_church_id,
    request_user_id,
    profile_request_id,
    canonical_payload_sha256,
    target_donor.id,
    result_revision,
    result_operation,
    inserted_audit_log_id
  );

  mutation_result.church_id := target_church_id;
  mutation_result.donor_id := target_donor.id;
  mutation_result.profile_revision := result_revision;
  mutation_result.operation := result_operation;
  mutation_result.replayed := false;
  return mutation_result;
end;
$$;

comment on function public.get_my_donor_profile(uuid) is
  'Returns at most one active church-scoped donor profile for the active, email-verified caller. Email is derived from Auth and phone/address/TIN are deliberately excluded.';
comment on function public.mutate_my_donor_profile(uuid, uuid, bigint, text) is
  'Creates or updates only the verified caller own church-scoped member profile with optimistic concurrency and exact idempotency; never searches or claims same-email guest history.';

revoke all privileges on table public.donor_profile_mutation_requests
  from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.donors from anon, authenticated, service_role;

-- P15 removes the inherited all-column donor projection and the legacy phone
-- leak. Self and members_read RLS semantics remain, but both receive only the
-- three identity columns; member name/email come through the bounded RPC above
-- and P20 can later add an approved staff roster projection.
drop policy if exists donors_permission_read on public.donors;
create policy donors_permission_read
  on public.donors for select to authenticated
  using (
    (select public.has_church_permission(church_id, 'members_read'))
    and (
      auth_user_id is distinct from (select auth.uid())
      or (select public.owns_donor(id))
    )
  );
revoke select on table public.donors from authenticated;
grant select (id, church_id, auth_user_id)
  on public.donors to authenticated;

revoke all on type
  public.my_donor_profile_record,
  public.my_donor_profile_mutation_result
from public, anon, authenticated, service_role;
grant usage on type
  public.my_donor_profile_record,
  public.my_donor_profile_mutation_result
to authenticated;

revoke all on function
  public.guard_donor_auth_identity(),
  public.guard_donor_profile_mutation_request(),
  public.capture_audit_actor_snapshot(),
  public.get_my_donor_profile(uuid),
  public.mutate_my_donor_profile(uuid, uuid, bigint, text)
from public, anon, authenticated, service_role;
grant execute on function
  public.get_my_donor_profile(uuid),
  public.mutate_my_donor_profile(uuid, uuid, bigint, text)
to authenticated;

commit;
