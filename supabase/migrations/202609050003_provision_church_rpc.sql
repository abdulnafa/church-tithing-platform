begin;

-- The result intentionally contains only routing and child-record identifiers
-- needed by the onboarding UI. Submitted names and emails are never echoed.
create type public.church_provisioning_result as (
  church_id uuid,
  church_slug text,
  owner_membership_id uuid,
  owner_membership_status public.membership_status,
  default_fund_id uuid,
  qr_short_code text,
  replayed boolean
);

-- Private idempotency ledger. It stores only a canonical payload fingerprint
-- and immutable result references, never onboarding PII or branding copy.
create table public.church_provisioning_requests (
  requested_by_user_id uuid not null,
  request_id uuid not null,
  payload_sha256 text not null,
  provisioning_status text not null default 'completed',
  church_id uuid not null,
  church_slug text not null,
  owner_membership_id uuid not null,
  owner_membership_status public.membership_status not null,
  default_fund_id uuid not null,
  qr_link_id uuid not null,
  qr_short_code text not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  constraint church_provisioning_requests_pkey primary key (
    requested_by_user_id,
    request_id
  ),
  constraint church_provisioning_requests_one_church unique (church_id),
  constraint church_provisioning_requests_one_audit unique (audit_log_id),
  constraint church_provisioning_requests_hash_format check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint church_provisioning_requests_completed_only check (
    provisioning_status = 'completed'
  ),
  constraint church_provisioning_requests_slug_format check (
    char_length(church_slug) between 2 and 63
    and church_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint church_provisioning_requests_owner_status check (
    owner_membership_status in ('active', 'invited')
  ),
  constraint church_provisioning_requests_church_fkey foreign key (church_id)
    references public.churches(id) on delete restrict,
  constraint church_provisioning_requests_fund_fkey foreign key (
    church_id,
    default_fund_id
  ) references public.funds(church_id, id) on delete restrict,
  constraint church_provisioning_requests_qr_fkey foreign key (
    church_id,
    qr_link_id
  ) references public.qr_links(church_id, id) on delete restrict,
  constraint church_provisioning_requests_audit_fkey foreign key (audit_log_id)
    references public.audit_logs(id) on delete restrict
);

comment on table public.church_provisioning_requests is
  'Private append-only idempotency ledger for platform-super-admin church provisioning. Contains no submitted names, emails, or branding copy.';
comment on column public.church_provisioning_requests.owner_membership_id is
  'Immutable provisioning-result UUID snapshot without a membership lifecycle foreign key; Auth account deletion may remove the live membership without rewriting this ledger.';

alter table public.church_provisioning_requests enable row level security;
alter table public.church_provisioning_requests force row level security;

create or replace function public.reject_church_provisioning_request_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'PROVISION_LEDGER_APPEND_ONLY';
end;
$$;

create trigger church_provisioning_requests_append_only
before update or delete on public.church_provisioning_requests
for each row execute function public.reject_church_provisioning_request_mutation();

create trigger church_provisioning_requests_reject_truncate
before truncate on public.church_provisioning_requests
for each statement execute function public.reject_church_provisioning_request_mutation();

create or replace function public.is_valid_provisioning_email(candidate text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    char_length(candidate) between 3 and 254
    and candidate = pg_catalog.lower(pg_catalog.btrim(candidate))
    and candidate not like '%..%'
    and char_length(pg_catalog.split_part(candidate, '@', 1)) between 1 and 64
    and pg_catalog.split_part(candidate, '@', 1) !~ '^\.'
    and pg_catalog.split_part(candidate, '@', 1) !~ '\.$'
    and candidate ~
      '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$';
$$;

create or replace function public.provision_church(
  provisioning_request_id uuid,
  church_display_name text,
  church_legal_name text,
  church_slug text,
  owner_email text,
  church_support_email text,
  church_currency text default 'USD',
  church_timezone text default 'America/Barbados',
  church_primary_color text default null,
  church_secondary_color text default null,
  church_thank_you_message text default null
)
returns public.church_provisioning_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  canonical_display_name text;
  canonical_legal_name text;
  canonical_slug text;
  canonical_owner_email text;
  canonical_support_email text;
  canonical_currency text;
  canonical_timezone text;
  canonical_primary_color text;
  canonical_secondary_color text;
  canonical_thank_you_message text;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.church_provisioning_requests%rowtype;
  owner_profile_id uuid;
  owner_profile_active boolean;
  owner_email_confirmed boolean;
  resolved_owner_user_id uuid;
  resolved_owner_status public.membership_status;
  inserted_church_id uuid;
  inserted_membership_id uuid;
  inserted_default_fund_id uuid;
  inserted_qr_link_id uuid;
  inserted_qr_short_code text;
  inserted_audit_log_id bigint;
  provisioned_result public.church_provisioning_result;
begin
  request_user_id := (select auth.uid());

  if request_user_id is null
    or not (select public.is_platform_super_admin())
  then
    raise exception using errcode = '42501', message = 'PROVISION_FORBIDDEN';
  end if;

  if provisioning_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_REQUEST_ID_REQUIRED';
  end if;

  canonical_display_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(church_display_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if canonical_display_name is null
    or char_length(canonical_display_name) not between 2 and 120
    or church_display_name ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_CHURCH_NAME';
  end if;

  canonical_legal_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(church_legal_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  if canonical_legal_name is null
    or char_length(canonical_legal_name) not between 2 and 160
    or church_legal_name ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_LEGAL_NAME';
  end if;

  canonical_slug := church_slug;
  if canonical_slug is null
    or char_length(canonical_slug) not between 2 and 63
    or canonical_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception using errcode = '22023', message = 'PROVISION_INVALID_SLUG';
  end if;

  canonical_owner_email := pg_catalog.lower(pg_catalog.btrim(owner_email));
  if canonical_owner_email is null
    or not public.is_valid_provisioning_email(canonical_owner_email)
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_OWNER_EMAIL';
  end if;

  canonical_support_email := pg_catalog.lower(
    pg_catalog.btrim(church_support_email)
  );
  if canonical_support_email is null
    or not public.is_valid_provisioning_email(canonical_support_email)
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_SUPPORT_EMAIL';
  end if;

  canonical_currency := pg_catalog.upper(pg_catalog.btrim(church_currency));
  if canonical_currency is null
    or canonical_currency not in ('BBD', 'USD', 'CAD', 'XCD')
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_CURRENCY';
  end if;

  canonical_timezone := pg_catalog.btrim(church_timezone);
  if canonical_timezone is null
    or char_length(canonical_timezone) not between 1 and 64
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names timezone_record
      where timezone_record.name = canonical_timezone
    )
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_TIMEZONE';
  end if;

  canonical_primary_color := nullif(
    pg_catalog.upper(pg_catalog.btrim(church_primary_color)),
    ''
  );
  if canonical_primary_color is not null
    and canonical_primary_color !~ '^#[0-9A-F]{6}$'
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_PRIMARY_COLOR';
  end if;

  canonical_secondary_color := nullif(
    pg_catalog.upper(pg_catalog.btrim(church_secondary_color)),
    ''
  );
  if canonical_secondary_color is not null
    and canonical_secondary_color !~ '^#[0-9A-F]{6}$'
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_SECONDARY_COLOR';
  end if;

  canonical_thank_you_message := nullif(
    pg_catalog.btrim(church_thank_you_message),
    ''
  );
  if canonical_thank_you_message is not null and (
    char_length(canonical_thank_you_message) > 500
    or pg_catalog.regexp_replace(
      church_thank_you_message,
      E'[\t\n\r]',
      '',
      'g'
    ) ~ '[[:cntrl:]]'
  )
  then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_INVALID_THANK_YOU_MESSAGE';
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'church_display_name', canonical_display_name,
    'church_legal_name', canonical_legal_name,
    'church_slug', canonical_slug,
    'owner_email', canonical_owner_email,
    'church_support_email', canonical_support_email,
    'church_currency', canonical_currency,
    'church_timezone', canonical_timezone,
    'church_primary_color', canonical_primary_color,
    'church_secondary_color', canonical_secondary_color,
    'church_thank_you_message', canonical_thank_you_message
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'provision-request:' || request_user_id::text || ':' ||
        provisioning_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.church_provisioning_requests request_record
  where request_record.requested_by_user_id = request_user_id
    and request_record.request_id = provisioning_request_id;

  if found then
    if existing_request.payload_sha256 <> canonical_payload_sha256 then
      raise exception using
        errcode = '22023',
        message = 'PROVISION_IDEMPOTENCY_CONFLICT';
    end if;

    provisioned_result.church_id := existing_request.church_id;
    provisioned_result.church_slug := existing_request.church_slug;
    provisioned_result.owner_membership_id :=
      existing_request.owner_membership_id;
    provisioned_result.owner_membership_status :=
      existing_request.owner_membership_status;
    provisioned_result.default_fund_id := existing_request.default_fund_id;
    provisioned_result.qr_short_code := existing_request.qr_short_code;
    provisioned_result.replayed := true;
    return provisioned_result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('provision-slug:' || canonical_slug, 0)
  );

  if exists (
    select 1
    from public.churches church
    where church.slug = canonical_slug
  ) then
    raise exception using
      errcode = '23505',
      message = 'PROVISION_SLUG_UNAVAILABLE';
  end if;

  select
    profile.id,
    profile.is_active,
    auth_user.email_confirmed_at is not null
  into owner_profile_id, owner_profile_active, owner_email_confirmed
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where pg_catalog.lower(pg_catalog.btrim(auth_user.email)) =
    canonical_owner_email
  limit 1;

  if found and not owner_profile_active then
    raise exception using
      errcode = '22023',
      message = 'PROVISION_OWNER_PROFILE_INACTIVE';
  end if;

  if found and owner_email_confirmed then
    resolved_owner_user_id := owner_profile_id;
    resolved_owner_status := 'active';
  else
    resolved_owner_user_id := null;
    resolved_owner_status := 'invited';
  end if;

  insert into public.churches (
    name,
    legal_name,
    slug,
    status,
    default_currency,
    timezone,
    primary_color,
    secondary_color,
    thank_you_message,
    support_email,
    public_settings,
    created_by
  ) values (
    canonical_display_name,
    canonical_legal_name,
    canonical_slug,
    'onboarding',
    canonical_currency,
    canonical_timezone,
    canonical_primary_color,
    canonical_secondary_color,
    canonical_thank_you_message,
    canonical_support_email,
    '{}'::jsonb,
    request_user_id
  )
  returning id into inserted_church_id;

  if resolved_owner_status = 'active' then
    insert into public.church_memberships (
      church_id,
      user_id,
      invited_email,
      role,
      status,
      invited_by,
      accepted_at
    ) values (
      inserted_church_id,
      resolved_owner_user_id,
      null,
      'owner',
      'active',
      request_user_id,
      now()
    )
    returning id into inserted_membership_id;
  else
    insert into public.church_memberships (
      church_id,
      user_id,
      invited_email,
      role,
      status,
      invited_by,
      accepted_at
    ) values (
      inserted_church_id,
      null,
      canonical_owner_email,
      'owner',
      'invited',
      request_user_id,
      null
    )
    returning id into inserted_membership_id;
  end if;

  select fund.id
    into inserted_default_fund_id
  from public.funds fund
  where fund.church_id = inserted_church_id
    and fund.name = 'Tithes'
    and fund.slug = 'tithes'
    and fund.status = 'active'
    and fund.is_default;

  select qr_link.id, qr_link.short_code
    into inserted_qr_link_id, inserted_qr_short_code
  from public.qr_links qr_link
  where qr_link.church_id = inserted_church_id
    and qr_link.kind = 'church'
    and qr_link.fund_id is null
    and qr_link.campaign_id is null
    and qr_link.is_active;

  if inserted_default_fund_id is null
    or inserted_qr_link_id is null
    or (select count(*) from public.funds where church_id = inserted_church_id)
      <> 1
    or (select count(*) from public.qr_links where church_id = inserted_church_id)
      <> 1
  then
    raise exception using
      errcode = '55000',
      message = 'PROVISION_INTERNAL_CHILD_RECORDS';
  end if;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => inserted_church_id,
    event_actor_type => 'support',
    event_action => 'church_provisioned',
    event_entity => 'church',
    event_entity_id => inserted_church_id::text,
    event_actor_user_id => request_user_id,
    event_request_id => provisioning_request_id::text,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'church_slug', canonical_slug,
      'currency', canonical_currency,
      'owner_membership_status', resolved_owner_status::text,
      'default_fund_id', inserted_default_fund_id::text,
      'qr_short_code', inserted_qr_short_code
    )
  );

  insert into public.church_provisioning_requests (
    requested_by_user_id,
    request_id,
    payload_sha256,
    provisioning_status,
    church_id,
    church_slug,
    owner_membership_id,
    owner_membership_status,
    default_fund_id,
    qr_link_id,
    qr_short_code,
    audit_log_id
  ) values (
    request_user_id,
    provisioning_request_id,
    canonical_payload_sha256,
    'completed',
    inserted_church_id,
    canonical_slug,
    inserted_membership_id,
    resolved_owner_status,
    inserted_default_fund_id,
    inserted_qr_link_id,
    inserted_qr_short_code,
    inserted_audit_log_id
  );

  provisioned_result.church_id := inserted_church_id;
  provisioned_result.church_slug := canonical_slug;
  provisioned_result.owner_membership_id := inserted_membership_id;
  provisioned_result.owner_membership_status := resolved_owner_status;
  provisioned_result.default_fund_id := inserted_default_fund_id;
  provisioned_result.qr_short_code := inserted_qr_short_code;
  provisioned_result.replayed := false;
  return provisioned_result;
end;
$$;

comment on function public.provision_church(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Creates one onboarding church and its owner/default-fund/permanent-QR records through an authenticated platform-super-admin-only, idempotent transaction.';

revoke all on type public.church_provisioning_result
  from public, anon, authenticated, service_role;
grant usage on type public.church_provisioning_result to authenticated;

revoke all privileges on table public.church_provisioning_requests
  from public, anon, authenticated, service_role;

revoke all on function public.reject_church_provisioning_request_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.is_valid_provisioning_email(text)
  from public, anon, authenticated, service_role;
revoke all on function public.provision_church(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.provision_church(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

commit;
