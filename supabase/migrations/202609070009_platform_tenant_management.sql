begin;

-- P13 intentionally owns only the manual database/public workspace lifecycle.
-- Billing, provider connectivity, and live-giving readiness remain separate
-- workflows and are not consulted or changed by this migration.
do $$
begin
  if exists (
    select 1
    from public.churches church
    where (
        church.status = 'onboarding'
        and (church.activated_at is not null or church.suspended_at is not null)
      )
      or (
        church.status = 'active'
        and (
          church.activated_at is null
          or church.suspended_at is not null
          or church.activated_at < church.created_at
        )
      )
      or (
        church.status = 'suspended'
        and (
          church.activated_at is null
          or church.suspended_at is null
          or church.activated_at < church.created_at
          or church.suspended_at < church.activated_at
        )
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'P13_EXISTING_LIFECYCLE_TIMESTAMPS_INVALID';
  end if;
end;
$$;

alter table public.churches
  add column lifecycle_revision bigint not null default 0;

alter table public.churches
  add constraint churches_lifecycle_revision_nonnegative
    check (lifecycle_revision >= 0),
  add constraint churches_lifecycle_timestamps_consistent
    check (
      (
        status = 'onboarding'
        and activated_at is null
        and suspended_at is null
      )
      or (
        status = 'active'
        and activated_at is not null
        and suspended_at is null
        and activated_at >= created_at
      )
      or (
        status = 'suspended'
        and activated_at is not null
        and suspended_at is not null
        and activated_at >= created_at
        and suspended_at >= activated_at
      )
      -- P13 does not assign semantics to legacy/future terminal states.
      or status in ('canceled', 'archived')
    );

comment on column public.churches.lifecycle_revision is
  'Monotonic optimistic-concurrency token for manual platform tenant lifecycle changes. It does not represent billing or provider state.';

create index churches_platform_keyset_idx
  on public.churches (created_at desc, id desc);

-- Singleton defaults are only future onboarding-form prefill values. They do
-- not rewrite existing churches and do not make live giving available.
create table public.platform_onboarding_defaults (
  singleton_key boolean primary key default true,
  default_currency text not null default 'BBD',
  default_timezone text not null default 'America/Barbados',
  default_primary_color text not null default '#1F6D60',
  default_secondary_color text not null default '#E1B85A',
  settings_revision bigint not null default 0,
  updated_at timestamptz not null default transaction_timestamp(),
  constraint platform_onboarding_defaults_singleton check (singleton_key),
  constraint platform_onboarding_defaults_currency check (
    default_currency in ('BBD', 'USD', 'CAD', 'XCD')
  ),
  constraint platform_onboarding_defaults_timezone check (
    char_length(default_timezone) between 1 and 64
    and default_timezone = pg_catalog.btrim(default_timezone)
  ),
  constraint platform_onboarding_defaults_primary_color check (
    default_primary_color ~ '^#[0-9A-F]{6}$'
  ),
  constraint platform_onboarding_defaults_secondary_color check (
    default_secondary_color ~ '^#[0-9A-F]{6}$'
  ),
  constraint platform_onboarding_defaults_revision_nonnegative check (
    settings_revision >= 0
  )
);

insert into public.platform_onboarding_defaults (singleton_key) values (true);

comment on table public.platform_onboarding_defaults is
  'Private singleton containing non-sensitive future church-onboarding form defaults. Existing churches are never rewritten.';

alter table public.platform_onboarding_defaults enable row level security;
alter table public.platform_onboarding_defaults force row level security;

create or replace function public.guard_platform_onboarding_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using
      errcode = '55000',
      message = 'PLATFORM_DEFAULTS_SINGLETON_PROTECTED';
  end if;

  if tg_op = 'UPDATE' and new.singleton_key is distinct from old.singleton_key then
    raise exception using
      errcode = '55000',
      message = 'PLATFORM_DEFAULTS_SINGLETON_PROTECTED';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_record
    where timezone_record.name = new.default_timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_INVALID_TIMEZONE';
  end if;

  return new;
end;
$$;

create trigger platform_onboarding_defaults_guard_write
before insert or update on public.platform_onboarding_defaults
for each row execute function public.guard_platform_onboarding_defaults();

create trigger platform_onboarding_defaults_guard_delete
before delete on public.platform_onboarding_defaults
for each row execute function public.guard_platform_onboarding_defaults();

create trigger platform_onboarding_defaults_guard_truncate
before truncate on public.platform_onboarding_defaults
for each statement execute function public.guard_platform_onboarding_defaults();

create type public.platform_tenant_record as (
  church_id uuid,
  display_name text,
  slug text,
  status public.church_status,
  default_currency text,
  timezone text,
  foundation_ready boolean,
  missing_readiness_codes text[],
  lifecycle_revision bigint,
  created_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz
);

create type public.platform_tenant_page as (
  tenants public.platform_tenant_record[],
  total_tenant_count bigint,
  onboarding_count bigint,
  active_count bigint,
  suspended_count bigint,
  next_cursor_created_at timestamptz,
  next_cursor_church_id uuid,
  has_more boolean
);

create type public.platform_tenant_lifecycle_result as (
  church_id uuid,
  status public.church_status,
  lifecycle_revision bigint,
  activated_at timestamptz,
  suspended_at timestamptz,
  replayed boolean
);

create type public.platform_onboarding_defaults_snapshot as (
  default_currency text,
  default_timezone text,
  default_primary_color text,
  default_secondary_color text,
  settings_revision bigint,
  updated_at timestamptz
);

create type public.platform_onboarding_defaults_update_result as (
  default_currency text,
  default_timezone text,
  default_primary_color text,
  default_secondary_color text,
  settings_revision bigint,
  updated_at timestamptz,
  replayed boolean
);

-- The lifecycle ledger contains only request/result identifiers, a payload
-- digest, finite control values, and timestamps. It contains no church copy,
-- staff identity, donor data, billing state, or provider state.
create table public.platform_tenant_lifecycle_requests (
  church_id uuid not null,
  request_id uuid not null,
  requested_by_user_id uuid not null,
  operation text not null,
  suspension_reason_code text,
  payload_sha256 text not null,
  result_status public.church_status not null,
  result_lifecycle_revision bigint not null,
  result_activated_at timestamptz not null,
  result_suspended_at timestamptz,
  audit_log_id bigint not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint platform_tenant_lifecycle_requests_pkey primary key (
    church_id,
    request_id
  ),
  constraint platform_tenant_lifecycle_requests_revision_unique unique (
    church_id,
    result_lifecycle_revision
  ),
  constraint platform_tenant_lifecycle_requests_audit_unique unique (
    audit_log_id
  ),
  constraint platform_tenant_lifecycle_requests_operation check (
    operation in ('activate', 'suspend', 'restore')
  ),
  constraint platform_tenant_lifecycle_requests_reason check (
    (
      operation = 'suspend'
      and suspension_reason_code in (
        'administrative_hold',
        'compliance_review',
        'security_review',
        'church_request'
      )
    )
    or (operation in ('activate', 'restore') and suspension_reason_code is null)
  ),
  constraint platform_tenant_lifecycle_requests_hash_format check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint platform_tenant_lifecycle_requests_result check (
    result_lifecycle_revision > 0
    and (
      (
        operation in ('activate', 'restore')
        and result_status = 'active'
        and result_suspended_at is null
      )
      or (
        operation = 'suspend'
        and result_status = 'suspended'
        and result_suspended_at is not null
      )
    )
    and result_activated_at <= coalesce(result_suspended_at, created_at)
  ),
  constraint platform_tenant_lifecycle_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint platform_tenant_lifecycle_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

comment on table public.platform_tenant_lifecycle_requests is
  'Private append-only idempotency ledger for manual Super Admin workspace lifecycle changes; billing/provider state is excluded.';
comment on column public.platform_tenant_lifecycle_requests.requested_by_user_id is
  'Immutable historical actor UUID snapshot without an Auth lifecycle foreign key.';

create index platform_tenant_lifecycle_requests_actor_idx
  on public.platform_tenant_lifecycle_requests (
    requested_by_user_id,
    created_at desc,
    request_id
  );

alter table public.platform_tenant_lifecycle_requests enable row level security;
alter table public.platform_tenant_lifecycle_requests force row level security;

-- This second private ledger allows exact settings replay without storing an
-- unbounded request body. All result values are themselves non-sensitive form
-- defaults and no tenant row is changed by this workflow.
create table public.platform_onboarding_default_requests (
  request_id uuid primary key,
  requested_by_user_id uuid not null,
  payload_sha256 text not null,
  result_default_currency text not null,
  result_default_timezone text not null,
  result_default_primary_color text not null,
  result_default_secondary_color text not null,
  result_settings_revision bigint not null,
  result_updated_at timestamptz not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint platform_onboarding_default_requests_revision_unique unique (
    result_settings_revision
  ),
  constraint platform_onboarding_default_requests_audit_unique unique (
    audit_log_id
  ),
  constraint platform_onboarding_default_requests_hash_format check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint platform_onboarding_default_requests_currency check (
    result_default_currency in ('BBD', 'USD', 'CAD', 'XCD')
  ),
  constraint platform_onboarding_default_requests_timezone check (
    char_length(result_default_timezone) between 1 and 64
    and result_default_timezone = pg_catalog.btrim(result_default_timezone)
  ),
  constraint platform_onboarding_default_requests_primary_color check (
    result_default_primary_color ~ '^#[0-9A-F]{6}$'
  ),
  constraint platform_onboarding_default_requests_secondary_color check (
    result_default_secondary_color ~ '^#[0-9A-F]{6}$'
  ),
  constraint platform_onboarding_default_requests_revision_positive check (
    result_settings_revision > 0
  ),
  constraint platform_onboarding_default_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

comment on table public.platform_onboarding_default_requests is
  'Private append-only idempotency ledger for future onboarding defaults.';
comment on column public.platform_onboarding_default_requests.requested_by_user_id is
  'Immutable historical actor UUID snapshot without an Auth lifecycle foreign key.';

create index platform_onboarding_default_requests_actor_idx
  on public.platform_onboarding_default_requests (
    requested_by_user_id,
    created_at desc,
    request_id
  );

alter table public.platform_onboarding_default_requests enable row level security;
alter table public.platform_onboarding_default_requests force row level security;

create or replace function public.reject_platform_management_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'PLATFORM_MANAGEMENT_LEDGER_APPEND_ONLY';
end;
$$;

create trigger platform_tenant_lifecycle_requests_append_only
before update or delete on public.platform_tenant_lifecycle_requests
for each row execute function public.reject_platform_management_ledger_mutation();

create trigger platform_tenant_lifecycle_requests_reject_truncate
before truncate on public.platform_tenant_lifecycle_requests
for each statement execute function public.reject_platform_management_ledger_mutation();

create trigger platform_onboarding_default_requests_append_only
before update or delete on public.platform_onboarding_default_requests
for each row execute function public.reject_platform_management_ledger_mutation();

create trigger platform_onboarding_default_requests_reject_truncate
before truncate on public.platform_onboarding_default_requests
for each statement execute function public.reject_platform_management_ledger_mutation();

-- A malformed trusted legacy name must neither poison the complete tenant page
-- nor expose control text. Readiness still reports church_profile until the
-- church is corrected through its reviewed settings workflow.
create or replace function public.safe_platform_tenant_display_name(
  candidate text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when candidate is not null
      and candidate !~ '[[:cntrl:]]'
      and char_length(
        pg_catalog.regexp_replace(
          pg_catalog.btrim(candidate),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ) between 2 and 120
    then pg_catalog.regexp_replace(
      pg_catalog.btrim(candidate),
      '[[:space:]]+',
      ' ',
      'g'
    )
    else 'Church workspace'
  end;
$$;

-- The returned codes reveal only whether the four non-financial provisioning
-- foundations exist. Colours and logos are optional by P09 and never gate an
-- activation. Subscription, provider, donation, and donor tables are absent.
create or replace function public.platform_tenant_missing_readiness(
  target_church_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.array_remove(array[
    case when not exists (
      select 1
      from public.church_memberships membership
      join public.profiles profile
        on profile.id = membership.user_id
       and profile.is_active
      join auth.users auth_user
        on auth_user.id = membership.user_id
       and auth_user.email_confirmed_at is not null
      where membership.church_id = target_church_id
        and membership.role = 'owner'
        and membership.status = 'active'
        and membership.user_id is not null
    ) then 'active_owner' end,
    case when not exists (
      select 1
      from public.churches church
      where church.id = target_church_id
        and church.name = pg_catalog.regexp_replace(
          pg_catalog.btrim(church.name),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and char_length(church.name) between 2 and 120
        and church.name !~ '[[:cntrl:]]'
        and church.legal_name is not null
        and church.legal_name = pg_catalog.regexp_replace(
          pg_catalog.btrim(church.legal_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and char_length(church.legal_name) between 2 and 160
        and church.legal_name !~ '[[:cntrl:]]'
        and church.support_email is not null
        and church.support_email = pg_catalog.lower(
          pg_catalog.btrim(church.support_email)
        )
        and public.is_valid_provisioning_email(church.support_email)
        and church.default_currency in ('BBD', 'USD', 'CAD', 'XCD')
        and char_length(church.timezone) between 1 and 64
        and church.timezone = pg_catalog.btrim(church.timezone)
        and exists (
          select 1
          from pg_catalog.pg_timezone_names timezone_record
          where timezone_record.name = church.timezone
        )
    ) then 'church_profile' end,
    case when (
      select count(*)
      from public.funds fund
      where fund.church_id = target_church_id
        and fund.status = 'active'
        and fund.is_default
    ) <> 1 then 'default_fund' end,
    case when (
      select count(*)
      from public.qr_links qr_link
      where qr_link.church_id = target_church_id
        and qr_link.kind = 'church'
        and qr_link.fund_id is null
        and qr_link.campaign_id is null
        and qr_link.is_active
    ) <> 1 then 'permanent_qr' end
  ], null)::text[];
$$;

create or replace function public.get_platform_tenants(
  tenant_page_size integer default 20,
  tenant_cursor_created_at timestamptz default null,
  tenant_cursor_church_id uuid default null
)
returns public.platform_tenant_page
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tenant_page public.platform_tenant_page;
begin
  if (select auth.uid()) is null
    or not (select public.is_platform_super_admin())
  then
    raise exception using
      errcode = '42501',
      message = 'PLATFORM_TENANTS_FORBIDDEN';
  end if;

  if tenant_page_size is null or tenant_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_TENANTS_INVALID_PAGE_SIZE';
  end if;

  if (tenant_cursor_created_at is null) <>
    (tenant_cursor_church_id is null)
  then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_TENANTS_INVALID_CURSOR';
  end if;

  with candidates as materialized (
    select
      church.*,
      public.platform_tenant_missing_readiness(church.id) as missing_codes
    from public.churches church
    where tenant_cursor_created_at is null
      or (church.created_at, church.id) < (
        tenant_cursor_created_at,
        tenant_cursor_church_id
      )
    order by church.created_at desc, church.id desc
    limit tenant_page_size + 1
  ), page_candidates as (
    select candidate.*
    from candidates candidate
    order by candidate.created_at desc, candidate.id desc
    limit tenant_page_size
  )
  select
    coalesce(
      array_agg(
        row(
          candidate.id,
          public.safe_platform_tenant_display_name(candidate.name),
          candidate.slug,
          candidate.status,
          case
            when candidate.default_currency in ('BBD', 'USD', 'CAD', 'XCD')
            then candidate.default_currency
            else null
          end,
          case
            when candidate.timezone is not null
              and candidate.timezone = pg_catalog.btrim(candidate.timezone)
              and candidate.timezone !~ '[[:cntrl:]]'
              and char_length(candidate.timezone) between 1 and 64
              and exists (
                select 1
                from pg_catalog.pg_timezone_names timezone_record
                where timezone_record.name = candidate.timezone
              )
            then candidate.timezone
            else null
          end,
          cardinality(candidate.missing_codes) = 0,
          candidate.missing_codes,
          candidate.lifecycle_revision,
          candidate.created_at,
          candidate.activated_at,
          candidate.suspended_at
        )::public.platform_tenant_record
        order by candidate.created_at desc, candidate.id desc
      ),
      array[]::public.platform_tenant_record[]
    ),
    (select count(*) > tenant_page_size from candidates)
  into tenant_page.tenants, tenant_page.has_more
  from page_candidates candidate;

  select
    count(*),
    count(*) filter (where church.status = 'onboarding'),
    count(*) filter (where church.status = 'active'),
    count(*) filter (where church.status = 'suspended')
  into
    tenant_page.total_tenant_count,
    tenant_page.onboarding_count,
    tenant_page.active_count,
    tenant_page.suspended_count
  from public.churches church;

  if tenant_page.has_more then
    select church.created_at, church.id
      into
        tenant_page.next_cursor_created_at,
        tenant_page.next_cursor_church_id
    from public.churches church
    where tenant_cursor_created_at is null
      or (church.created_at, church.id) < (
        tenant_cursor_created_at,
        tenant_cursor_church_id
      )
    order by church.created_at desc, church.id desc
    offset tenant_page_size - 1
    limit 1;
  else
    tenant_page.next_cursor_created_at := null;
    tenant_page.next_cursor_church_id := null;
  end if;

  return tenant_page;
end;
$$;

create or replace function public.mutate_platform_tenant_lifecycle(
  lifecycle_request_id uuid,
  target_church_id uuid,
  expected_lifecycle_revision bigint,
  lifecycle_operation text,
  suspension_reason_code text default null
)
returns public.platform_tenant_lifecycle_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  canonical_operation text;
  canonical_reason_code text;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.platform_tenant_lifecycle_requests%rowtype;
  locked_church public.churches%rowtype;
  prior_status public.church_status;
  next_status public.church_status;
  next_revision bigint;
  next_activated_at timestamptz;
  next_suspended_at timestamptz;
  readiness_codes text[];
  audit_reason_code text;
  inserted_audit_log_id bigint;
  lifecycle_result public.platform_tenant_lifecycle_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.is_platform_super_admin())
  then
    raise exception using
      errcode = '42501',
      message = 'PLATFORM_LIFECYCLE_FORBIDDEN';
  end if;

  if lifecycle_request_id is null or target_church_id is null then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_LIFECYCLE_INVALID_REQUEST';
  end if;
  if expected_lifecycle_revision is null
    or expected_lifecycle_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_LIFECYCLE_INVALID_EXPECTED_REVISION';
  end if;

  canonical_operation := pg_catalog.lower(pg_catalog.btrim(lifecycle_operation));
  if canonical_operation is null
    or canonical_operation not in ('activate', 'suspend', 'restore')
  then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_LIFECYCLE_INVALID_OPERATION';
  end if;

  canonical_reason_code := nullif(
    pg_catalog.lower(pg_catalog.btrim(suspension_reason_code)),
    ''
  );
  if canonical_operation = 'suspend' then
    if canonical_reason_code is null
      or canonical_reason_code not in (
        'administrative_hold',
        'compliance_review',
        'security_review',
        'church_request'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_LIFECYCLE_INVALID_REASON';
    end if;
  elsif suspension_reason_code is not null then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_LIFECYCLE_INVALID_ARGUMENTS';
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_lifecycle_revision', expected_lifecycle_revision,
    'lifecycle_operation', canonical_operation,
    'suspension_reason_code', canonical_reason_code
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform-lifecycle-request:' || target_church_id::text || ':' ||
        lifecycle_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.platform_tenant_lifecycle_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = lifecycle_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT';
    end if;

    lifecycle_result.church_id := existing_request.church_id;
    lifecycle_result.status := existing_request.result_status;
    lifecycle_result.lifecycle_revision :=
      existing_request.result_lifecycle_revision;
    lifecycle_result.activated_at := existing_request.result_activated_at;
    lifecycle_result.suspended_at := existing_request.result_suspended_at;
    lifecycle_result.replayed := true;
    return lifecycle_result;
  end if;

  select church.*
    into locked_church
  from public.churches church
  where church.id = target_church_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_LIFECYCLE_TENANT_NOT_FOUND';
  end if;
  if not (select public.is_platform_super_admin()) then
    raise exception using
      errcode = '42501',
      message = 'PLATFORM_LIFECYCLE_FORBIDDEN';
  end if;
  if locked_church.lifecycle_revision <> expected_lifecycle_revision then
    raise exception using
      errcode = '40001',
      message = 'PLATFORM_LIFECYCLE_REVISION_CONFLICT';
  end if;

  prior_status := locked_church.status;
  next_revision := locked_church.lifecycle_revision + 1;

  if canonical_operation = 'activate' then
    if prior_status <> 'onboarding' then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED';
    end if;
    next_status := 'active';
    next_activated_at := transaction_timestamp();
    next_suspended_at := null;
    audit_reason_code := 'foundation_ready';
  elsif canonical_operation = 'suspend' then
    if prior_status <> 'active' then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED';
    end if;
    next_status := 'suspended';
    next_activated_at := locked_church.activated_at;
    next_suspended_at := transaction_timestamp();
    audit_reason_code := canonical_reason_code;
  else
    if prior_status <> 'suspended' then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED';
    end if;
    next_status := 'active';
    next_activated_at := locked_church.activated_at;
    next_suspended_at := null;
    audit_reason_code := 'manual_restore';
  end if;

  if canonical_operation in ('activate', 'restore') then
    -- Take exclusive, stable-order locks before the readiness decision. A KEY
    -- SHARE lock would still allow non-key status/is_active updates.
    perform 1
    from public.church_memberships membership
    where membership.church_id = target_church_id
    order by membership.id
    for update;

    perform 1
    from public.funds fund
    where fund.church_id = target_church_id
    order by fund.id
    for update;

    perform 1
    from public.qr_links qr_link
    where qr_link.church_id = target_church_id
    order by qr_link.id
    for update;

    -- Auth invitation replay locks Auth/profile rows before the church. NOWAIT
    -- prevents an inverted wait cycle: a concurrent identity change wins, this
    -- activation fails closed, and a retry recomputes readiness.
    begin
      perform 1
      from auth.users auth_user
      join public.church_memberships membership
        on membership.user_id = auth_user.id
       and membership.church_id = target_church_id
       and membership.role = 'owner'
       and membership.status = 'active'
      order by auth_user.id
      for update of auth_user nowait;

      perform 1
      from public.profiles profile
      join public.church_memberships membership
        on membership.user_id = profile.id
       and membership.church_id = target_church_id
       and membership.role = 'owner'
       and membership.status = 'active'
      order by profile.id
      for update of profile nowait;
    exception when lock_not_available then
      raise exception using
        errcode = '40001',
        message = 'PLATFORM_LIFECYCLE_TENANT_NOT_READY';
    end;

    readiness_codes := public.platform_tenant_missing_readiness(
      target_church_id
    );
    if cardinality(readiness_codes) <> 0 then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_LIFECYCLE_TENANT_NOT_READY';
    end if;
  end if;

  update public.churches
  set
    status = next_status,
    lifecycle_revision = next_revision,
    activated_at = next_activated_at,
    suspended_at = next_suspended_at
  where id = target_church_id;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'support',
    event_action => 'church_status_changed',
    event_entity => 'church',
    event_entity_id => target_church_id::text,
    event_actor_user_id => request_user_id,
    event_request_id => lifecycle_request_id::text,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'from_status', prior_status::text,
      'to_status', next_status::text,
      'reason_code', audit_reason_code
    )
  );

  insert into public.platform_tenant_lifecycle_requests (
    church_id,
    request_id,
    requested_by_user_id,
    operation,
    suspension_reason_code,
    payload_sha256,
    result_status,
    result_lifecycle_revision,
    result_activated_at,
    result_suspended_at,
    audit_log_id
  ) values (
    target_church_id,
    lifecycle_request_id,
    request_user_id,
    canonical_operation,
    canonical_reason_code,
    canonical_payload_sha256,
    next_status,
    next_revision,
    next_activated_at,
    next_suspended_at,
    inserted_audit_log_id
  );

  lifecycle_result.church_id := target_church_id;
  lifecycle_result.status := next_status;
  lifecycle_result.lifecycle_revision := next_revision;
  lifecycle_result.activated_at := next_activated_at;
  lifecycle_result.suspended_at := next_suspended_at;
  lifecycle_result.replayed := false;
  return lifecycle_result;
end;
$$;

create or replace function public.get_platform_onboarding_defaults()
returns public.platform_onboarding_defaults_snapshot
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  defaults_snapshot public.platform_onboarding_defaults_snapshot;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.is_platform_super_admin())
  then
    raise exception using
      errcode = '42501',
      message = 'PLATFORM_DEFAULTS_FORBIDDEN';
  end if;

  select
    defaults.default_currency,
    defaults.default_timezone,
    defaults.default_primary_color,
    defaults.default_secondary_color,
    defaults.settings_revision,
    defaults.updated_at
  into defaults_snapshot
  from public.platform_onboarding_defaults defaults
  where defaults.singleton_key;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'PLATFORM_DEFAULTS_UNAVAILABLE';
  end if;

  return defaults_snapshot;
end;
$$;

create or replace function public.update_platform_onboarding_defaults(
  settings_request_id uuid,
  expected_settings_revision bigint,
  default_currency text,
  default_timezone text,
  default_primary_color text,
  default_secondary_color text
)
returns public.platform_onboarding_defaults_update_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  canonical_currency text;
  canonical_timezone text;
  canonical_primary_color text;
  canonical_secondary_color text;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.platform_onboarding_default_requests%rowtype;
  locked_defaults public.platform_onboarding_defaults%rowtype;
  changed_setting_keys text[];
  next_revision bigint;
  next_updated_at timestamptz;
  inserted_audit_log_id bigint;
  update_result public.platform_onboarding_defaults_update_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.is_platform_super_admin())
  then
    raise exception using
      errcode = '42501',
      message = 'PLATFORM_DEFAULTS_FORBIDDEN';
  end if;

  if settings_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_INVALID_REQUEST_ID';
  end if;
  if expected_settings_revision is null or expected_settings_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_INVALID_EXPECTED_REVISION';
  end if;

  canonical_currency := pg_catalog.upper(pg_catalog.btrim(default_currency));
  if canonical_currency is null
    or canonical_currency not in ('BBD', 'USD', 'CAD', 'XCD')
  then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_INVALID_CURRENCY';
  end if;

  canonical_timezone := pg_catalog.btrim(default_timezone);
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
      message = 'PLATFORM_DEFAULTS_INVALID_TIMEZONE';
  end if;

  canonical_primary_color := pg_catalog.upper(
    pg_catalog.btrim(default_primary_color)
  );
  if canonical_primary_color is null
    or canonical_primary_color !~ '^#[0-9A-F]{6}$'
  then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_INVALID_PRIMARY_COLOR';
  end if;

  canonical_secondary_color := pg_catalog.upper(
    pg_catalog.btrim(default_secondary_color)
  );
  if canonical_secondary_color is null
    or canonical_secondary_color !~ '^#[0-9A-F]{6}$'
  then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_INVALID_SECONDARY_COLOR';
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_settings_revision', expected_settings_revision,
    'default_currency', canonical_currency,
    'default_timezone', canonical_timezone,
    'default_primary_color', canonical_primary_color,
    'default_secondary_color', canonical_secondary_color
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform-defaults-request:' || settings_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.platform_onboarding_default_requests request_record
  where request_record.request_id = settings_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'PLATFORM_DEFAULTS_IDEMPOTENCY_CONFLICT';
    end if;

    update_result.default_currency :=
      existing_request.result_default_currency;
    update_result.default_timezone :=
      existing_request.result_default_timezone;
    update_result.default_primary_color :=
      existing_request.result_default_primary_color;
    update_result.default_secondary_color :=
      existing_request.result_default_secondary_color;
    update_result.settings_revision :=
      existing_request.result_settings_revision;
    update_result.updated_at := existing_request.result_updated_at;
    update_result.replayed := true;
    return update_result;
  end if;

  select defaults.*
    into locked_defaults
  from public.platform_onboarding_defaults defaults
  where defaults.singleton_key
  for update;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'PLATFORM_DEFAULTS_UNAVAILABLE';
  end if;
  if not (select public.is_platform_super_admin()) then
    raise exception using
      errcode = '42501',
      message = 'PLATFORM_DEFAULTS_FORBIDDEN';
  end if;
  if locked_defaults.settings_revision <> expected_settings_revision then
    raise exception using
      errcode = '40001',
      message = 'PLATFORM_DEFAULTS_REVISION_CONFLICT';
  end if;

  changed_setting_keys := pg_catalog.array_remove(array[
    case when locked_defaults.default_currency is distinct from
      canonical_currency then 'default_currency' end,
    case when locked_defaults.default_timezone is distinct from
      canonical_timezone then 'default_timezone' end,
    case when locked_defaults.default_primary_color is distinct from
      canonical_primary_color then 'default_primary_color' end,
    case when locked_defaults.default_secondary_color is distinct from
      canonical_secondary_color then 'default_secondary_color' end
  ], null)::text[];

  if cardinality(changed_setting_keys) = 0 then
    raise exception using
      errcode = '22023',
      message = 'PLATFORM_DEFAULTS_NO_CHANGES';
  end if;

  next_revision := locked_defaults.settings_revision + 1;
  next_updated_at := transaction_timestamp();

  update public.platform_onboarding_defaults
  set
    default_currency = canonical_currency,
    default_timezone = canonical_timezone,
    default_primary_color = canonical_primary_color,
    default_secondary_color = canonical_secondary_color,
    settings_revision = next_revision,
    updated_at = next_updated_at
  where singleton_key;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => null,
    event_actor_type => 'support',
    event_action => 'platform_settings_updated',
    event_entity => 'platform_settings',
    event_entity_id => 'onboarding_defaults',
    event_actor_user_id => request_user_id,
    event_request_id => settings_request_id::text,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'setting_keys', to_jsonb(changed_setting_keys)
    )
  );

  insert into public.platform_onboarding_default_requests (
    request_id,
    requested_by_user_id,
    payload_sha256,
    result_default_currency,
    result_default_timezone,
    result_default_primary_color,
    result_default_secondary_color,
    result_settings_revision,
    result_updated_at,
    audit_log_id
  ) values (
    settings_request_id,
    request_user_id,
    canonical_payload_sha256,
    canonical_currency,
    canonical_timezone,
    canonical_primary_color,
    canonical_secondary_color,
    next_revision,
    next_updated_at,
    inserted_audit_log_id
  );

  update_result.default_currency := canonical_currency;
  update_result.default_timezone := canonical_timezone;
  update_result.default_primary_color := canonical_primary_color;
  update_result.default_secondary_color := canonical_secondary_color;
  update_result.settings_revision := next_revision;
  update_result.updated_at := next_updated_at;
  update_result.replayed := false;
  return update_result;
end;
$$;

comment on function public.get_platform_tenants(integer, timestamptz, uuid) is
  'Returns a keyset-paginated, identity-free Super Admin tenant summary and non-financial foundation readiness.';
comment on function public.mutate_platform_tenant_lifecycle(
  uuid, uuid, bigint, text, text
) is
  'Changes only manual database/public workspace status through reviewed onboarding activation, suspension, and restoration transitions.';
comment on function public.get_platform_onboarding_defaults() is
  'Returns the private singleton of non-sensitive future onboarding form defaults to an active Super Admin.';
comment on function public.update_platform_onboarding_defaults(
  uuid, bigint, text, text, text, text
) is
  'Idempotently updates only future onboarding form defaults without rewriting existing churches.';

-- Earlier foundation policies exposed broad platform rows before the final
-- Super Admin authority had been approved. P13 replaces that provisional
-- access with minimum RPC projections: an administrator can still read only
-- their own role row for request identity, while cross-tenant data flows only
-- through the explicitly shaped functions above.
drop policy if exists platform_admins_read on public.platform_admins;
create policy platform_admins_read_self
  on public.platform_admins for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.is_active_authenticated_user())
  );

revoke select on table public.platform_admins from authenticated;
revoke select (
  user_id,
  role,
  is_active,
  created_by,
  created_at,
  updated_at
) on public.platform_admins from authenticated;
grant select (user_id, role, is_active)
  on public.platform_admins to authenticated;

drop policy if exists churches_platform_admin_read on public.churches;
drop policy if exists funds_platform_admin_read on public.funds;
drop policy if exists campaigns_platform_admin_read on public.campaigns;
drop policy if exists qr_links_platform_admin_read on public.qr_links;
drop policy if exists platform_subscriptions_platform_admin_read
  on public.platform_subscriptions;

-- No application role can directly mutate a church lifecycle or the private
-- settings/ledgers. All reviewed writes flow through the authenticated,
-- independently authorized security-definer RPCs below.
revoke insert, update, delete, truncate, references, trigger
  on table public.churches
  from anon, authenticated, service_role;

-- Platform role assignment has no reviewed application workflow yet. Trusted
-- bootstrap remains migration/Management-SQL owned; even service_role receives
-- no direct privilege on this escalation table.
revoke all privileges on table public.platform_admins from service_role;

revoke all privileges on table
  public.platform_onboarding_defaults,
  public.platform_tenant_lifecycle_requests,
  public.platform_onboarding_default_requests
  from public, anon, authenticated, service_role;

revoke all on type
  public.platform_tenant_record,
  public.platform_tenant_page,
  public.platform_tenant_lifecycle_result,
  public.platform_onboarding_defaults_snapshot,
  public.platform_onboarding_defaults_update_result
  from public, anon, authenticated, service_role;
grant usage on type
  public.platform_tenant_record,
  public.platform_tenant_page,
  public.platform_tenant_lifecycle_result,
  public.platform_onboarding_defaults_snapshot,
  public.platform_onboarding_defaults_update_result
  to authenticated;

revoke all on function
  public.guard_platform_onboarding_defaults(),
  public.reject_platform_management_ledger_mutation(),
  public.safe_platform_tenant_display_name(text),
  public.platform_tenant_missing_readiness(uuid)
  from public, anon, authenticated, service_role;

revoke all on function
  public.get_platform_tenants(integer, timestamptz, uuid),
  public.mutate_platform_tenant_lifecycle(uuid, uuid, bigint, text, text),
  public.get_platform_onboarding_defaults(),
  public.update_platform_onboarding_defaults(
    uuid, bigint, text, text, text, text
  )
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_platform_tenants(integer, timestamptz, uuid),
  public.mutate_platform_tenant_lifecycle(uuid, uuid, bigint, text, text),
  public.get_platform_onboarding_defaults(),
  public.update_platform_onboarding_defaults(
    uuid, bigint, text, text, text, text
  )
  to authenticated;

commit;
