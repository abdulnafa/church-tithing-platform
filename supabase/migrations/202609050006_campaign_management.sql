begin;

-- P11 keeps campaign text canonicalization identical to the ECMAScript
-- boundary used by the application. PostgreSQL char_length counts Unicode
-- code points, including astral characters, which matches Array.from in JS.
create or replace function public.canonicalize_campaign_name(input_value text)
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

create or replace function public.canonicalize_campaign_description(
  input_value text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.replace(input_value, E'\r\n', E'\n'),
        E'\r',
        E'\n'
      ),
      U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$',
      '',
      'g'
    ),
    ''
  )
$$;

revoke all privileges on function public.canonicalize_campaign_name(text)
  from public, anon, authenticated;
revoke all privileges on function public.canonicalize_campaign_description(text)
  from public, anon, authenticated;
grant execute on function public.canonicalize_campaign_name(text)
  to service_role;
grant execute on function public.canonicalize_campaign_description(text)
  to service_role;

alter table public.churches
  add column campaigns_revision bigint not null default 0,
  add constraint churches_campaigns_revision_nonnegative
    check (campaigns_revision >= 0);

-- Refuse ambiguous legacy data rather than silently assigning a route or
-- choosing a duplicate name during migration.
do $$
begin
  if exists (select 1 from public.campaigns where fund_id is null) then
    raise exception using
      errcode = '23502',
      message = 'P11_EXISTING_CAMPAIGN_WITHOUT_FUND';
  end if;

  if exists (
    select 1
    from public.campaigns campaign
    join public.churches church on church.id = campaign.church_id
    where campaign.status in ('draft', 'active')
      and campaign.currency <> church.default_currency
  ) then
    raise exception using
      errcode = '23514',
      message = 'P11_EXISTING_CAMPAIGN_CURRENCY_MISMATCH';
  end if;

  if exists (
    select 1
    from public.campaigns campaign
    join public.funds fund
      on fund.church_id = campaign.church_id
     and fund.id = campaign.fund_id
    where campaign.status in ('draft', 'active')
      and fund.status <> 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'P11_EXISTING_OPEN_CAMPAIGN_INACTIVE_FUND';
  end if;

  if exists (
    select 1
    from public.campaigns campaign
    group by
      campaign.church_id,
      pg_catalog.lower(public.canonicalize_campaign_name(campaign.name))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'P11_EXISTING_CAMPAIGN_NAME_CONFLICT';
  end if;
end;
$$;

update public.campaigns
set
  name = public.canonicalize_campaign_name(name),
  description = public.canonicalize_campaign_description(description)
where name is distinct from public.canonicalize_campaign_name(name)
  or description is distinct from
    public.canonicalize_campaign_description(description);

alter table public.campaigns
  alter column fund_id set not null,
  add constraint campaigns_name_canonical check (
    name = public.canonicalize_campaign_name(name)
    and char_length(name) between 2 and 120
    and name !~ '[[:cntrl:]]'
  ),
  add constraint campaigns_description_canonical check (
    description is null
    or (
      description = public.canonicalize_campaign_description(description)
      and char_length(description) between 1 and 1000
      and pg_catalog.regexp_replace(
        description,
        E'[\t\n\r]',
        '',
        'g'
      ) !~ '[[:cntrl:]]'
    )
  ),
  add constraint campaigns_goal_safe_integer check (
    goal_amount_minor is null
    or goal_amount_minor between 1 and 9007199254740991
  );

create unique index campaigns_name_unique_idx
  on public.campaigns (church_id, pg_catalog.lower(name));

create index donations_campaign_progress_idx
  on public.donations (church_id, campaign_id, currency)
  include (amount_minor, refunded_amount_minor)
  where campaign_id is not null
    and source = 'online'
    and status in ('succeeded', 'partially_refunded');

-- Slug, fund, and currency identify the giving route and never change after
-- creation. Historical donations and receipts therefore retain one meaning.
create or replace function public.prevent_campaign_route_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGN_SLUG_IMMUTABLE';
  end if;
  if new.fund_id is distinct from old.fund_id then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGN_FUND_IMMUTABLE';
  end if;
  if new.currency is distinct from old.currency then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGN_CURRENCY_IMMUTABLE';
  end if;
  if new.image_url is distinct from old.image_url then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGN_IMAGE_IMMUTABLE';
  end if;
  if new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
  then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGN_DATES_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger campaigns_keep_route
  before update of slug, fund_id, currency, image_url, starts_at, ends_at
  on public.campaigns
  for each row execute function public.prevent_campaign_route_change();

-- Trusted direct inserts receive the same route invariant as the RPC. This is
-- intentionally insert-only so a closed campaign may retain an archived fund.
create or replace function public.validate_new_campaign_route()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.churches church
    join public.funds fund
      on fund.church_id = church.id
     and fund.id = new.fund_id
     and fund.status = 'active'
    where church.id = new.church_id
      and church.default_currency = new.currency
  ) then
    raise exception using
      errcode = '23514',
      message = 'CAMPAIGN_ROUTE_INVALID';
  end if;
  return new;
end;
$$;

create trigger campaigns_validate_new_route
  before insert on public.campaigns
  for each row execute function public.validate_new_campaign_route();

-- Once P11 closes a campaign, new recurring plans must not race in behind the
-- close operation. Existing gift-route validation remains unchanged for
-- donations; this extra recurring-only trigger checks campaign lifecycle.
create or replace function public.validate_recurring_campaign_is_active()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campaign_id is not null
    and new.status in ('incomplete', 'active', 'paused', 'past_due')
    and not exists (
    select 1
    from public.campaigns campaign
    where campaign.church_id = new.church_id
      and campaign.id = new.campaign_id
      and campaign.status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'RECURRING_CAMPAIGN_NOT_ACTIVE';
  end if;
  return new;
end;
$$;

create trigger recurring_gifts_require_active_campaign
  before insert or update of church_id, campaign_id, status
  on public.recurring_gifts
  for each row execute function public.validate_recurring_campaign_is_active();

create type public.church_campaign_record as (
  campaign_id uuid,
  fund_id uuid,
  name text,
  slug text,
  description text,
  status public.campaign_status,
  goal_amount_minor_text text,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz
);

create type public.church_campaign_snapshot as (
  church_id uuid,
  campaigns_revision bigint,
  campaigns public.church_campaign_record[]
);

create type public.church_campaign_progress_record as (
  church_id uuid,
  campaign_id uuid,
  currency text,
  raised_amount_minor_text text,
  eligible_donation_count_text text
);

create type public.church_campaign_mutation_result as (
  church_id uuid,
  campaign_id uuid,
  fund_id uuid,
  name text,
  slug text,
  description text,
  status public.campaign_status,
  goal_amount_minor_text text,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  campaigns_revision bigint,
  replayed boolean
);

create table public.church_campaign_mutation_requests (
  church_id uuid not null,
  requested_by_user_id uuid not null,
  request_id uuid not null,
  operation text not null,
  payload_sha256 text not null,
  result_campaigns_revision bigint not null,
  result_campaign_id uuid not null,
  result_fund_id uuid not null,
  result_name text not null,
  result_slug text not null,
  result_description text,
  result_status public.campaign_status not null,
  result_goal_amount_minor bigint,
  result_currency text not null,
  result_starts_at timestamptz,
  result_ends_at timestamptz,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  constraint church_campaign_mutation_requests_pkey primary key (
    church_id,
    requested_by_user_id,
    request_id
  ),
  constraint church_campaign_mutation_requests_church_request_unique unique (
    church_id,
    request_id
  ),
  constraint church_campaign_mutation_requests_church_revision_unique unique (
    church_id,
    result_campaigns_revision
  ),
  constraint church_campaign_mutation_requests_audit_unique unique (audit_log_id),
  constraint church_campaign_mutation_requests_operation_check check (
    operation in ('create', 'update', 'activate', 'close', 'archive', 'restore')
  ),
  constraint church_campaign_mutation_requests_payload_sha256_check check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint church_campaign_mutation_requests_revision_check check (
    result_campaigns_revision > 0
  ),
  constraint church_campaign_mutation_requests_name_check check (
    result_name = public.canonicalize_campaign_name(result_name)
    and char_length(result_name) between 2 and 120
    and result_name !~ '[[:cntrl:]]'
  ),
  constraint church_campaign_mutation_requests_slug_check check (
    char_length(result_slug) between 1 and 80
    and pg_catalog.lower(result_slug) = result_slug
    and result_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint church_campaign_mutation_requests_description_check check (
    result_description is null
    or (
      result_description = public.canonicalize_campaign_description(
        result_description
      )
      and char_length(result_description) between 1 and 1000
      and pg_catalog.regexp_replace(
        result_description,
        E'[\t\n\r]',
        '',
        'g'
      ) !~ '[[:cntrl:]]'
    )
  ),
  constraint church_campaign_mutation_requests_goal_check check (
    result_goal_amount_minor is null
    or result_goal_amount_minor between 1 and 9007199254740991
  ),
  constraint church_campaign_mutation_requests_currency_check check (
    result_currency ~ '^[A-Z]{3}$'
  ),
  constraint church_campaign_mutation_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint church_campaign_mutation_requests_campaign_fkey
    foreign key (church_id, result_campaign_id)
    references public.campaigns(church_id, id) on delete restrict,
  constraint church_campaign_mutation_requests_fund_fkey
    foreign key (church_id, result_fund_id)
    references public.funds(church_id, id) on delete restrict,
  constraint church_campaign_mutation_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

create index church_campaign_mutation_requests_result_campaign_idx
  on public.church_campaign_mutation_requests (church_id, result_campaign_id);
create index church_campaign_mutation_requests_result_fund_idx
  on public.church_campaign_mutation_requests (church_id, result_fund_id);

comment on table public.church_campaign_mutation_requests is
  'Private append-only idempotency ledger for owner-authorized campaign mutations.';
comment on column public.church_campaign_mutation_requests.requested_by_user_id is
  'Immutable historical actor UUID snapshot without an Auth lifecycle foreign key.';

alter table public.church_campaign_mutation_requests enable row level security;
alter table public.church_campaign_mutation_requests force row level security;

create or replace function public.guard_church_campaign_mutation_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGNS_LEDGER_APPEND_ONLY';
  end if;
  if new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'CAMPAIGNS_LEDGER_APPEND_ONLY';
  end if;
  return new;
end;
$$;

create trigger church_campaign_mutation_requests_append_only
  before update or delete on public.church_campaign_mutation_requests
  for each row execute function public.guard_church_campaign_mutation_request();

create trigger church_campaign_mutation_requests_no_truncate
  before truncate on public.church_campaign_mutation_requests
  for each statement execute function public.guard_church_campaign_mutation_request();

create or replace function public.get_church_campaigns(
  target_church_id uuid
)
returns public.church_campaign_snapshot
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  campaign_snapshot public.church_campaign_snapshot;
begin
  if (select auth.uid()) is null
    or not (select public.has_church_permission(
      target_church_id,
      'campaigns_read'
    ))
  then
    raise exception using errcode = '42501', message = 'CAMPAIGNS_FORBIDDEN';
  end if;

  select church.id, church.campaigns_revision
    into campaign_snapshot.church_id, campaign_snapshot.campaigns_revision
  from public.churches church
  where church.id = target_church_id;

  if not found then
    raise exception using errcode = '42501', message = 'CAMPAIGNS_FORBIDDEN';
  end if;

  select coalesce(
    array_agg(
      row(
        campaign.id,
        campaign.fund_id,
        campaign.name,
        campaign.slug,
        campaign.description,
        campaign.status,
        campaign.goal_amount_minor::text,
        campaign.currency,
        campaign.starts_at,
        campaign.ends_at
      )::public.church_campaign_record
      order by
        case campaign.status
          when 'draft' then 0
          when 'active' then 1
          when 'closed' then 2
          else 3
        end,
        pg_catalog.lower(campaign.name),
        campaign.id
    ),
    array[]::public.church_campaign_record[]
  )
    into campaign_snapshot.campaigns
  from public.campaigns campaign
  where campaign.church_id = target_church_id;

  return campaign_snapshot;
end;
$$;

create or replace function public.get_church_campaign_progress(
  target_church_id uuid
)
returns setof public.church_campaign_progress_record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select public.has_church_permission(
      target_church_id,
      'campaigns_read'
    ))
    or not (select public.has_church_permission(
      target_church_id,
      'financial_read'
    ))
  then
    raise exception using errcode = '42501', message = 'CAMPAIGNS_FORBIDDEN';
  end if;

  return query
  select
    campaign.church_id,
    campaign.id,
    campaign.currency,
    coalesce(progress.raised_amount_minor, 0::numeric)::text,
    coalesce(progress.eligible_donation_count, 0::bigint)::text
  from public.campaigns campaign
  left join lateral (
    select
      sum(donation.amount_minor - donation.refunded_amount_minor)
        as raised_amount_minor,
      count(*) as eligible_donation_count
    from public.donations donation
    where donation.church_id = campaign.church_id
      and donation.campaign_id = campaign.id
      and donation.currency = campaign.currency
      and donation.source = 'online'
      and donation.status in ('succeeded', 'partially_refunded')
  ) progress on true
  where campaign.church_id = target_church_id
  order by campaign.id;
end;
$$;

create or replace function public.mutate_church_campaign(
  campaign_request_id uuid,
  target_church_id uuid,
  expected_campaigns_revision bigint,
  campaign_operation text,
  target_campaign_id uuid default null,
  campaign_name text default null,
  campaign_slug text default null,
  campaign_description text default null,
  campaign_fund_id uuid default null,
  campaign_goal_amount_minor_text text default null
)
returns public.church_campaign_mutation_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  canonical_operation text;
  canonical_name text;
  canonical_slug text;
  canonical_description text;
  canonical_goal_amount_minor bigint;
  canonical_goal_amount_minor_text text;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.church_campaign_mutation_requests%rowtype;
  locked_church public.churches%rowtype;
  target_campaign public.campaigns%rowtype;
  target_fund public.funds%rowtype;
  changed_field_names text[] := '{}'::text[];
  sorted_field_names text[];
  audit_action public.audit_action;
  audit_changes jsonb;
  inserted_audit_log_id bigint;
  next_revision bigint;
  mutation_result public.church_campaign_mutation_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'campaigns_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'CAMPAIGNS_FORBIDDEN';
  end if;

  if campaign_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'CAMPAIGNS_INVALID_REQUEST_ID';
  end if;
  if expected_campaigns_revision is null
    or expected_campaigns_revision < 0
  then
    raise exception using
      errcode = '22023',
      message = 'CAMPAIGNS_INVALID_EXPECTED_REVISION';
  end if;

  canonical_operation := pg_catalog.lower(pg_catalog.btrim(campaign_operation));
  if canonical_operation is null
    or canonical_operation not in (
      'create', 'update', 'activate', 'close', 'archive', 'restore'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'CAMPAIGNS_INVALID_OPERATION';
  end if;

  if canonical_operation in ('create', 'update') then
    if (canonical_operation = 'create' and target_campaign_id is not null)
      or (canonical_operation = 'update' and target_campaign_id is null)
      or campaign_fund_id is null
      or (canonical_operation = 'create' and campaign_slug is null)
      or (canonical_operation = 'update' and campaign_slug is not null)
    then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_INVALID_ARGUMENTS';
    end if;

    canonical_name := public.canonicalize_campaign_name(campaign_name);
    if canonical_name is null
      or char_length(canonical_name) not between 2 and 120
      or campaign_name ~ '[[:cntrl:]]'
    then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_INVALID_NAME';
    end if;

    canonical_description := public.canonicalize_campaign_description(
      campaign_description
    );
    if canonical_description is not null and (
      char_length(canonical_description) > 1000
      or pg_catalog.regexp_replace(
        campaign_description,
        E'[\t\n\r]',
        '',
        'g'
      ) ~ '[[:cntrl:]]'
    ) then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_INVALID_DESCRIPTION';
    end if;

    if campaign_goal_amount_minor_text is not null then
      if campaign_goal_amount_minor_text !~ '^[1-9][0-9]{0,15}$'
        or campaign_goal_amount_minor_text::numeric > 9007199254740991
      then
        raise exception using
          errcode = '22023',
          message = 'CAMPAIGNS_INVALID_GOAL';
      end if;
      canonical_goal_amount_minor := campaign_goal_amount_minor_text::bigint;
      canonical_goal_amount_minor_text := canonical_goal_amount_minor::text;
    end if;

    if canonical_operation = 'create' then
      canonical_slug := pg_catalog.btrim(campaign_slug);
      if campaign_slug is distinct from canonical_slug
        or char_length(canonical_slug) not between 1 and 80
        or pg_catalog.lower(canonical_slug) <> canonical_slug
        or canonical_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      then
        raise exception using
          errcode = '22023',
          message = 'CAMPAIGNS_INVALID_SLUG';
      end if;
    end if;
  else
    if target_campaign_id is null
      or campaign_name is not null
      or campaign_slug is not null
      or campaign_description is not null
      or campaign_fund_id is not null
      or campaign_goal_amount_minor_text is not null
    then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_INVALID_ARGUMENTS';
    end if;
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_campaigns_revision', expected_campaigns_revision,
    'campaign_operation', canonical_operation,
    'target_campaign_id', target_campaign_id,
    'campaign_name', canonical_name,
    'campaign_slug', canonical_slug,
    'campaign_description', canonical_description,
    'campaign_fund_id', campaign_fund_id,
    'campaign_goal_amount_minor_text', canonical_goal_amount_minor_text
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'church-campaign-request:' || target_church_id::text || ':' ||
        campaign_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.church_campaign_mutation_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = campaign_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_IDEMPOTENCY_CONFLICT';
    end if;

    mutation_result.church_id := existing_request.church_id;
    mutation_result.campaign_id := existing_request.result_campaign_id;
    mutation_result.fund_id := existing_request.result_fund_id;
    mutation_result.name := existing_request.result_name;
    mutation_result.slug := existing_request.result_slug;
    mutation_result.description := existing_request.result_description;
    mutation_result.status := existing_request.result_status;
    mutation_result.goal_amount_minor_text :=
      existing_request.result_goal_amount_minor::text;
    mutation_result.currency := existing_request.result_currency;
    mutation_result.starts_at := existing_request.result_starts_at;
    mutation_result.ends_at := existing_request.result_ends_at;
    mutation_result.campaigns_revision :=
      existing_request.result_campaigns_revision;
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
      'campaigns_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'CAMPAIGNS_FORBIDDEN';
  end if;

  if locked_church.campaigns_revision <> expected_campaigns_revision then
    raise exception using
      errcode = '40001',
      message = 'CAMPAIGNS_REVISION_CONFLICT';
  end if;

  -- This rare, short-lived lifecycle operation blocks concurrent recurring
  -- inserts. An insert already in flight completes first and is then observed.
  if canonical_operation = 'close' then
    lock table public.recurring_gifts in share row exclusive mode;
  end if;

  if canonical_operation <> 'create' then
    select campaign.*
      into target_campaign
    from public.campaigns campaign
    where campaign.church_id = target_church_id
      and campaign.id = target_campaign_id
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NOT_FOUND';
    end if;
  end if;

  if canonical_operation = 'create' then
    select fund.*
      into target_fund
    from public.funds fund
    where fund.church_id = target_church_id
      and fund.id = campaign_fund_id
      and fund.status = 'active'
    for key share;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_FUND_NOT_ACTIVE';
    end if;

    if exists (
      select 1 from public.campaigns campaign
      where campaign.church_id = target_church_id
        and pg_catalog.lower(campaign.name) = pg_catalog.lower(canonical_name)
    ) then
      raise exception using
        errcode = '23505',
        message = 'CAMPAIGNS_NAME_CONFLICT';
    end if;
    if exists (
      select 1 from public.campaigns campaign
      where campaign.church_id = target_church_id
        and campaign.slug = canonical_slug
    ) then
      raise exception using
        errcode = '23505',
        message = 'CAMPAIGNS_SLUG_CONFLICT';
    end if;

    insert into public.campaigns (
      church_id,
      fund_id,
      name,
      slug,
      description,
      image_url,
      status,
      goal_amount_minor,
      currency,
      starts_at,
      ends_at,
      created_by
    ) values (
      target_church_id,
      campaign_fund_id,
      canonical_name,
      canonical_slug,
      canonical_description,
      null,
      'draft',
      canonical_goal_amount_minor,
      locked_church.default_currency,
      null,
      null,
      request_user_id
    )
    returning * into target_campaign;

    audit_action := 'campaign_created';
  elsif canonical_operation = 'update' then
    if target_campaign.status <> 'draft' then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NOT_DRAFT';
    end if;
    if campaign_fund_id <> target_campaign.fund_id then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_INVALID_ARGUMENTS';
    end if;
    if exists (
      select 1 from public.campaigns campaign
      where campaign.church_id = target_church_id
        and campaign.id <> target_campaign.id
        and pg_catalog.lower(campaign.name) = pg_catalog.lower(canonical_name)
    ) then
      raise exception using
        errcode = '23505',
        message = 'CAMPAIGNS_NAME_CONFLICT';
    end if;

    if target_campaign.name is distinct from canonical_name then
      changed_field_names := array_append(changed_field_names, 'name');
    end if;
    if target_campaign.description is distinct from canonical_description then
      changed_field_names := array_append(changed_field_names, 'description');
    end if;
    if target_campaign.goal_amount_minor is distinct from
      canonical_goal_amount_minor
    then
      changed_field_names := array_append(
        changed_field_names,
        'goal_amount_minor'
      );
    end if;
    if coalesce(array_length(changed_field_names, 1), 0) = 0 then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NO_CHANGES';
    end if;

    update public.campaigns
    set
      name = canonical_name,
      description = canonical_description,
      goal_amount_minor = canonical_goal_amount_minor
    where church_id = target_church_id and id = target_campaign.id
    returning * into target_campaign;

    audit_action := 'campaign_updated';
  elsif canonical_operation = 'activate' then
    if target_campaign.status <> 'draft' then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NOT_DRAFT';
    end if;

    select fund.*
      into target_fund
    from public.funds fund
    where fund.church_id = target_church_id
      and fund.id = target_campaign.fund_id
      and fund.status = 'active'
    for key share;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_FUND_NOT_ACTIVE';
    end if;
    if target_campaign.currency <> locked_church.default_currency then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_CURRENCY_MISMATCH';
    end if;
    if target_campaign.ends_at is not null
      and target_campaign.ends_at <= transaction_timestamp()
    then
      raise exception using
        errcode = '22023',
        message = 'CAMPAIGNS_WINDOW_ENDED';
    end if;

    update public.campaigns
    set status = 'active'
    where church_id = target_church_id and id = target_campaign.id
    returning * into target_campaign;
    changed_field_names := array['status'];
    audit_action := 'campaign_updated';
  elsif canonical_operation = 'close' then
    if target_campaign.status <> 'active' then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NOT_ACTIVE';
    end if;
    if exists (
      select 1
      from public.recurring_gifts recurring
      where recurring.church_id = target_church_id
        and recurring.campaign_id = target_campaign.id
        and recurring.status in ('incomplete', 'active', 'paused', 'past_due')
    ) then
      raise exception using
        errcode = '55000',
        message = 'CAMPAIGNS_ACTIVE_RECURRING_GIFTS';
    end if;

    update public.campaigns
    set status = 'closed'
    where church_id = target_church_id and id = target_campaign.id
    returning * into target_campaign;
    changed_field_names := array['status'];
    audit_action := 'campaign_updated';
  elsif canonical_operation = 'archive' then
    if target_campaign.status <> 'closed' then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NOT_CLOSED';
    end if;
    update public.campaigns
    set status = 'archived'
    where church_id = target_church_id and id = target_campaign.id
    returning * into target_campaign;
    audit_action := 'campaign_archived';
  else
    if target_campaign.status <> 'archived' then
      raise exception using errcode = '22023', message = 'CAMPAIGNS_NOT_ARCHIVED';
    end if;
    update public.campaigns
    set status = 'closed'
    where church_id = target_church_id and id = target_campaign.id
    returning * into target_campaign;
    changed_field_names := array['status'];
    audit_action := 'campaign_updated';
  end if;

  if audit_action = 'campaign_updated' then
    select array_agg(field_name order by field_name)
      into sorted_field_names
    from unnest(changed_field_names) field_name;
    audit_changes := pg_catalog.jsonb_build_object(
      'campaign_id', target_campaign.id,
      'field_names', sorted_field_names
    );
  else
    audit_changes := pg_catalog.jsonb_build_object(
      'campaign_id', target_campaign.id
    );
  end if;

  next_revision := locked_church.campaigns_revision + 1;
  update public.churches
  set campaigns_revision = next_revision
  where id = target_church_id;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => audit_action,
    event_entity => 'campaign',
    event_entity_id => target_campaign.id::text,
    event_actor_user_id => request_user_id,
    event_request_id => campaign_request_id::text,
    event_sanitized_changes => audit_changes
  );

  insert into public.church_campaign_mutation_requests (
    church_id,
    requested_by_user_id,
    request_id,
    operation,
    payload_sha256,
    result_campaigns_revision,
    result_campaign_id,
    result_fund_id,
    result_name,
    result_slug,
    result_description,
    result_status,
    result_goal_amount_minor,
    result_currency,
    result_starts_at,
    result_ends_at,
    audit_log_id
  ) values (
    target_church_id,
    request_user_id,
    campaign_request_id,
    canonical_operation,
    canonical_payload_sha256,
    next_revision,
    target_campaign.id,
    target_campaign.fund_id,
    target_campaign.name,
    target_campaign.slug,
    target_campaign.description,
    target_campaign.status,
    target_campaign.goal_amount_minor,
    target_campaign.currency,
    target_campaign.starts_at,
    target_campaign.ends_at,
    inserted_audit_log_id
  );

  mutation_result.church_id := target_church_id;
  mutation_result.campaign_id := target_campaign.id;
  mutation_result.fund_id := target_campaign.fund_id;
  mutation_result.name := target_campaign.name;
  mutation_result.slug := target_campaign.slug;
  mutation_result.description := target_campaign.description;
  mutation_result.status := target_campaign.status;
  mutation_result.goal_amount_minor_text := target_campaign.goal_amount_minor::text;
  mutation_result.currency := target_campaign.currency;
  mutation_result.starts_at := target_campaign.starts_at;
  mutation_result.ends_at := target_campaign.ends_at;
  mutation_result.campaigns_revision := next_revision;
  mutation_result.replayed := false;
  return mutation_result;
end;
$$;

comment on function public.get_church_campaigns(uuid) is
  'Returns one atomic campaign snapshot, including an empty typed campaign array, after campaigns_read authorization.';
comment on function public.get_church_campaign_progress(uuid) is
  'Returns online settled campaign progress only after independent campaigns_read and financial_read authorization.';
comment on function public.mutate_church_campaign(
  uuid, uuid, bigint, text, uuid, text, text, text, uuid, text
) is
  'Applies one owner-only optimistic and idempotent campaign mutation with an identifiers-only audit event.';

-- Remove the initial broad authenticated table grant. Direct configuration
-- reads retain only reviewed columns; donation-derived progress is RPC-only.
revoke select on table public.campaigns from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.campaigns from anon, authenticated, service_role;
grant select (
  id,
  church_id,
  fund_id,
  name,
  slug,
  description,
  image_url,
  status,
  goal_amount_minor,
  currency,
  starts_at,
  ends_at
) on public.campaigns to authenticated;

revoke all privileges on table public.church_campaign_mutation_requests
  from public, anon, authenticated, service_role;

revoke all on type public.church_campaign_record,
  public.church_campaign_snapshot,
  public.church_campaign_progress_record,
  public.church_campaign_mutation_result
  from public, anon, authenticated, service_role;
grant usage on type public.church_campaign_record,
  public.church_campaign_snapshot,
  public.church_campaign_progress_record,
  public.church_campaign_mutation_result
  to authenticated;

revoke all on function public.prevent_campaign_route_change(),
  public.validate_new_campaign_route(),
  public.validate_recurring_campaign_is_active(),
  public.guard_church_campaign_mutation_request()
  from public, anon, authenticated, service_role;
revoke all on function public.get_church_campaigns(uuid),
  public.get_church_campaign_progress(uuid),
  public.mutate_church_campaign(
    uuid, uuid, bigint, text, uuid, text, text, text, uuid, text
  ) from public, anon, authenticated, service_role;

grant execute on function public.get_church_campaigns(uuid),
  public.get_church_campaign_progress(uuid),
  public.mutate_church_campaign(
    uuid, uuid, bigint, text, uuid, text, text, text, uuid, text
  ) to authenticated;

commit;
