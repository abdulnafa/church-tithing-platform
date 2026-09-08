begin;

-- Match ECMAScript String.trim()/\s so the database and TypeScript boundary
-- canonicalize all edge whitespace identically, including NBSP and Unicode Zs.
create or replace function public.canonicalize_fund_name(input_value text)
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

create or replace function public.canonicalize_fund_description(input_value text)
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

revoke all privileges on function public.canonicalize_fund_name(text)
  from public, anon, authenticated;
revoke all privileges on function public.canonicalize_fund_description(text)
  from public, anon, authenticated;
grant execute on function public.canonicalize_fund_name(text) to service_role;
grant execute on function public.canonicalize_fund_description(text) to service_role;

alter table public.churches
  add column funds_revision bigint not null default 0,
  add constraint churches_funds_revision_nonnegative
    check (funds_revision >= 0);

-- Refuse ambiguous legacy names or active order collisions rather than
-- silently choosing a winner during the production migration.
do $$
begin
  if exists (
    select 1
    from public.funds fund
    group by
      fund.church_id,
      pg_catalog.lower(public.canonicalize_fund_name(fund.name))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'P10_EXISTING_FUND_NAME_CONFLICT';
  end if;

  if exists (
    select 1
    from public.funds fund
    where fund.status = 'active'
    group by fund.church_id, fund.sort_order
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'P10_EXISTING_ACTIVE_FUND_ORDER_CONFLICT';
  end if;
end;
$$;

-- Canonicalize only whitespace that has no business meaning. Existing sparse
-- sort positions are deliberately left unchanged for seed compatibility.
update public.funds
set
  name = public.canonicalize_fund_name(name),
  description = public.canonicalize_fund_description(description)
where name is distinct from public.canonicalize_fund_name(name)
  or description is distinct from public.canonicalize_fund_description(description);

alter table public.funds
  add constraint funds_name_canonical check (
    name = public.canonicalize_fund_name(name)
    and char_length(name) between 2 and 120
    and name !~ '[[:cntrl:]]'
  ),
  add constraint funds_description_canonical check (
    description is null
    or (
      description = public.canonicalize_fund_description(description)
      and char_length(description) between 1 and 500
      and pg_catalog.regexp_replace(
        description,
        E'[\t\n\r]',
        '',
        'g'
      ) !~ '[[:cntrl:]]'
    )
  ),
  add constraint funds_sort_order_nonnegative check (sort_order >= 0);

create unique index funds_name_unique_idx
  on public.funds (church_id, pg_catalog.lower(name));

create unique index funds_active_sort_order_unique_idx
  on public.funds (church_id, sort_order)
  where status = 'active';

create index funds_management_order_idx
  on public.funds (
    church_id,
    status,
    sort_order,
    pg_catalog.lower(name),
    id
  );

create or replace function public.prevent_fund_slug_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception using
      errcode = '55000',
      message = 'FUND_SLUG_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger funds_keep_slug
  before update of slug on public.funds
  for each row execute function public.prevent_fund_slug_change();

create type public.church_fund_record as (
  church_id uuid,
  fund_id uuid,
  name text,
  slug text,
  description text,
  status public.fund_status,
  is_default boolean,
  sort_order integer,
  funds_revision bigint
);

create type public.church_fund_mutation_result as (
  church_id uuid,
  fund_id uuid,
  name text,
  slug text,
  description text,
  status public.fund_status,
  is_default boolean,
  sort_order integer,
  funds_revision bigint,
  replayed boolean
);

create table public.church_fund_mutation_requests (
  church_id uuid not null,
  requested_by_user_id uuid not null,
  request_id uuid not null,
  operation text not null,
  payload_sha256 text not null,
  result_funds_revision bigint not null,
  result_fund_id uuid not null,
  result_name text not null,
  result_slug text not null,
  result_description text,
  result_status public.fund_status not null,
  result_is_default boolean not null,
  result_sort_order integer not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  constraint church_fund_mutation_requests_pkey primary key (
    church_id,
    requested_by_user_id,
    request_id
  ),
  constraint church_fund_mutation_requests_church_request_unique unique (
    church_id,
    request_id
  ),
  constraint church_fund_mutation_requests_church_revision_unique unique (
    church_id,
    result_funds_revision
  ),
  constraint church_fund_mutation_requests_audit_unique unique (audit_log_id),
  constraint church_fund_mutation_requests_operation_check check (
    operation in (
      'create',
      'update',
      'set_default',
      'move_up',
      'move_down',
      'archive',
      'restore'
    )
  ),
  constraint church_fund_mutation_requests_payload_sha256_check check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint church_fund_mutation_requests_revision_check check (
    result_funds_revision > 0
  ),
  constraint church_fund_mutation_requests_name_check check (
    result_name = public.canonicalize_fund_name(result_name)
    and char_length(result_name) between 2 and 120
    and result_name !~ '[[:cntrl:]]'
  ),
  constraint church_fund_mutation_requests_slug_check check (
    char_length(result_slug) between 1 and 80
    and pg_catalog.lower(result_slug) = result_slug
    and result_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint church_fund_mutation_requests_description_check check (
    result_description is null
    or (
      result_description = public.canonicalize_fund_description(
        result_description
      )
      and char_length(result_description) between 1 and 500
      and pg_catalog.regexp_replace(
        result_description,
        E'[\t\n\r]',
        '',
        'g'
      ) !~ '[[:cntrl:]]'
    )
  ),
  constraint church_fund_mutation_requests_default_active_check check (
    not result_is_default or result_status = 'active'
  ),
  constraint church_fund_mutation_requests_order_check check (
    result_sort_order >= 0
  ),
  constraint church_fund_mutation_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint church_fund_mutation_requests_fund_fkey
    foreign key (church_id, result_fund_id)
    references public.funds(church_id, id) on delete restrict,
  constraint church_fund_mutation_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

create index church_fund_mutation_requests_result_fund_idx
  on public.church_fund_mutation_requests (church_id, result_fund_id);

comment on table public.church_fund_mutation_requests is
  'Private append-only idempotency ledger for owner-authorized fund mutations.';
comment on column public.church_fund_mutation_requests.requested_by_user_id is
  'Immutable historical actor UUID snapshot without an Auth lifecycle foreign key.';

alter table public.church_fund_mutation_requests enable row level security;
alter table public.church_fund_mutation_requests force row level security;

create or replace function public.guard_church_fund_mutation_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using
      errcode = '55000',
      message = 'FUNDS_LEDGER_APPEND_ONLY';
  end if;

  if new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'FUNDS_LEDGER_APPEND_ONLY';
  end if;

  return new;
end;
$$;

create trigger church_fund_mutation_requests_append_only
  before update or delete on public.church_fund_mutation_requests
  for each row execute function public.guard_church_fund_mutation_request();

create trigger church_fund_mutation_requests_no_truncate
  before truncate on public.church_fund_mutation_requests
  for each statement execute function public.guard_church_fund_mutation_request();

create or replace function public.get_church_funds(
  target_church_id uuid
)
returns setof public.church_fund_record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select public.has_church_permission(
      target_church_id,
      'funds_read'
    ))
  then
    raise exception using errcode = '42501', message = 'FUNDS_FORBIDDEN';
  end if;

  return query
  select
    fund.church_id,
    fund.id,
    fund.name,
    fund.slug,
    fund.description,
    fund.status,
    fund.is_default,
    fund.sort_order,
    church.funds_revision
  from public.funds fund
  join public.churches church on church.id = fund.church_id
  where fund.church_id = target_church_id
  order by
    case when fund.status = 'active' then 0 else 1 end,
    case when fund.status = 'active' then fund.sort_order end nulls last,
    pg_catalog.lower(fund.name),
    fund.id;
end;
$$;

create or replace function public.mutate_church_fund(
  fund_request_id uuid,
  target_church_id uuid,
  expected_funds_revision bigint,
  fund_operation text,
  target_fund_id uuid default null,
  fund_name text default null,
  fund_slug text default null,
  fund_description text default null
)
returns public.church_fund_mutation_result
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
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.church_fund_mutation_requests%rowtype;
  locked_church public.churches%rowtype;
  target_fund public.funds%rowtype;
  neighbor_fund public.funds%rowtype;
  max_active_sort_order integer;
  target_original_sort_order integer;
  neighbor_original_sort_order integer;
  next_sort_order integer;
  changed_field_names text[] := '{}'::text[];
  sorted_field_names text[];
  audit_action public.audit_action;
  audit_changes jsonb;
  inserted_audit_log_id bigint;
  next_revision bigint;
  mutation_result public.church_fund_mutation_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'funds_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'FUNDS_FORBIDDEN';
  end if;

  if fund_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'FUNDS_INVALID_REQUEST_ID';
  end if;

  if expected_funds_revision is null or expected_funds_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'FUNDS_INVALID_EXPECTED_REVISION';
  end if;

  canonical_operation := pg_catalog.lower(pg_catalog.btrim(fund_operation));
  if canonical_operation is null
    or canonical_operation not in (
      'create',
      'update',
      'set_default',
      'move_up',
      'move_down',
      'archive',
      'restore'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'FUNDS_INVALID_OPERATION';
  end if;

  if canonical_operation in ('create', 'update') then
    if (canonical_operation = 'create' and target_fund_id is not null)
      or (canonical_operation = 'update' and target_fund_id is null)
    then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_INVALID_ARGUMENTS';
    end if;

    canonical_name := public.canonicalize_fund_name(fund_name);
    if canonical_name is null
      or char_length(canonical_name) not between 2 and 120
      or fund_name ~ '[[:cntrl:]]'
    then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_INVALID_NAME';
    end if;

    canonical_description := public.canonicalize_fund_description(
      fund_description
    );
    if canonical_description is not null and (
      char_length(canonical_description) > 500
      or pg_catalog.regexp_replace(
        fund_description,
        E'[\t\n\r]',
        '',
        'g'
      ) ~ '[[:cntrl:]]'
    ) then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_INVALID_DESCRIPTION';
    end if;

    if canonical_operation = 'create' then
      canonical_slug := pg_catalog.btrim(fund_slug);
      if canonical_slug is null
        or fund_slug is distinct from canonical_slug
        or char_length(canonical_slug) not between 1 and 80
        or pg_catalog.lower(canonical_slug) <> canonical_slug
        or canonical_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      then
        raise exception using
          errcode = '22023',
          message = 'FUNDS_INVALID_SLUG';
      end if;
    elsif fund_slug is not null then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_INVALID_ARGUMENTS';
    else
      canonical_slug := null;
    end if;
  else
    if target_fund_id is null
      or fund_name is not null
      or fund_slug is not null
      or fund_description is not null
    then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_INVALID_ARGUMENTS';
    end if;
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_funds_revision', expected_funds_revision,
    'fund_operation', canonical_operation,
    'target_fund_id', target_fund_id,
    'fund_name', canonical_name,
    'fund_slug', canonical_slug,
    'fund_description', canonical_description
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'church-fund-request:' || target_church_id::text || ':' ||
        fund_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.church_fund_mutation_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = fund_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_IDEMPOTENCY_CONFLICT';
    end if;

    mutation_result.church_id := existing_request.church_id;
    mutation_result.fund_id := existing_request.result_fund_id;
    mutation_result.name := existing_request.result_name;
    mutation_result.slug := existing_request.result_slug;
    mutation_result.description := existing_request.result_description;
    mutation_result.status := existing_request.result_status;
    mutation_result.is_default := existing_request.result_is_default;
    mutation_result.sort_order := existing_request.result_sort_order;
    mutation_result.funds_revision :=
      existing_request.result_funds_revision;
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
      'funds_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'FUNDS_FORBIDDEN';
  end if;

  if locked_church.funds_revision <> expected_funds_revision then
    raise exception using
      errcode = '40001',
      message = 'FUNDS_REVISION_CONFLICT';
  end if;

  if canonical_operation <> 'create' then
    select fund.*
      into target_fund
    from public.funds fund
    where fund.church_id = target_church_id
      and fund.id = target_fund_id
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'FUNDS_NOT_FOUND';
    end if;
  end if;

  if canonical_operation = 'create' then
    if exists (
      select 1 from public.funds fund
      where fund.church_id = target_church_id
        and pg_catalog.lower(fund.name) = pg_catalog.lower(canonical_name)
    ) then
      raise exception using errcode = '23505', message = 'FUNDS_NAME_CONFLICT';
    end if;

    if exists (
      select 1 from public.funds fund
      where fund.church_id = target_church_id
        and fund.slug = canonical_slug
    ) then
      raise exception using errcode = '23505', message = 'FUNDS_SLUG_CONFLICT';
    end if;

    select coalesce(max(fund.sort_order), -1)
      into max_active_sort_order
    from public.funds fund
    where fund.church_id = target_church_id
      and fund.status = 'active';

    if max_active_sort_order = 2147483647 then
      raise exception using
        errcode = '22003',
        message = 'FUNDS_ORDER_EXHAUSTED';
    end if;

    insert into public.funds (
      church_id,
      name,
      slug,
      description,
      status,
      is_default,
      sort_order,
      created_by
    ) values (
      target_church_id,
      canonical_name,
      canonical_slug,
      canonical_description,
      'active',
      false,
      max_active_sort_order + 1,
      request_user_id
    )
    returning * into target_fund;

    audit_action := 'fund_created';
  elsif canonical_operation = 'update' then
    if exists (
      select 1 from public.funds fund
      where fund.church_id = target_church_id
        and fund.id <> target_fund.id
        and pg_catalog.lower(fund.name) = pg_catalog.lower(canonical_name)
    ) then
      raise exception using errcode = '23505', message = 'FUNDS_NAME_CONFLICT';
    end if;

    if target_fund.name is distinct from canonical_name then
      changed_field_names := array_append(changed_field_names, 'name');
    end if;
    if target_fund.description is distinct from canonical_description then
      changed_field_names := array_append(changed_field_names, 'description');
    end if;

    if coalesce(array_length(changed_field_names, 1), 0) = 0 then
      raise exception using errcode = '22023', message = 'FUNDS_NO_CHANGES';
    end if;

    update public.funds
    set name = canonical_name, description = canonical_description
    where church_id = target_church_id and id = target_fund.id
    returning * into target_fund;

    audit_action := 'fund_updated';
  elsif canonical_operation = 'set_default' then
    if target_fund.status <> 'active' then
      raise exception using errcode = '22023', message = 'FUNDS_NOT_ACTIVE';
    end if;
    if target_fund.is_default then
      raise exception using errcode = '22023', message = 'FUNDS_NO_CHANGES';
    end if;

    update public.funds
    set is_default = false
    where church_id = target_church_id
      and is_default
      and status = 'active';

    update public.funds
    set is_default = true
    where church_id = target_church_id and id = target_fund.id
    returning * into target_fund;

    changed_field_names := array['is_default'];
    audit_action := 'fund_updated';
  elsif canonical_operation in ('move_up', 'move_down') then
    if target_fund.status <> 'active' then
      raise exception using errcode = '22023', message = 'FUNDS_NOT_ACTIVE';
    end if;

    if canonical_operation = 'move_up' then
      select fund.*
        into neighbor_fund
      from public.funds fund
      where fund.church_id = target_church_id
        and fund.status = 'active'
        and fund.sort_order < target_fund.sort_order
      order by fund.sort_order desc, pg_catalog.lower(fund.name) desc, fund.id desc
      limit 1
      for update;
    else
      select fund.*
        into neighbor_fund
      from public.funds fund
      where fund.church_id = target_church_id
        and fund.status = 'active'
        and fund.sort_order > target_fund.sort_order
      order by fund.sort_order, pg_catalog.lower(fund.name), fund.id
      limit 1
      for update;
    end if;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'FUNDS_ORDER_BOUNDARY';
    end if;

    select max(fund.sort_order)
      into max_active_sort_order
    from public.funds fund
    where fund.church_id = target_church_id
      and fund.status = 'active';

    if max_active_sort_order = 2147483647 then
      raise exception using
        errcode = '22003',
        message = 'FUNDS_ORDER_EXHAUSTED';
    end if;

    target_original_sort_order := target_fund.sort_order;
    neighbor_original_sort_order := neighbor_fund.sort_order;

    update public.funds
    set sort_order = max_active_sort_order + 1
    where church_id = target_church_id and id = target_fund.id;

    update public.funds
    set sort_order = target_original_sort_order
    where church_id = target_church_id and id = neighbor_fund.id;

    update public.funds
    set sort_order = neighbor_original_sort_order
    where church_id = target_church_id and id = target_fund.id
    returning * into target_fund;

    changed_field_names := array['sort_order'];
    audit_action := 'fund_updated';
  elsif canonical_operation = 'archive' then
    if target_fund.status <> 'active' then
      raise exception using errcode = '22023', message = 'FUNDS_NOT_ACTIVE';
    end if;
    if target_fund.is_default then
      raise exception using
        errcode = '55000',
        message = 'FUNDS_DEFAULT_REQUIRED';
    end if;
    if exists (
      select 1 from public.campaigns campaign
      where campaign.church_id = target_church_id
        and campaign.fund_id = target_fund.id
        and campaign.status in ('draft', 'active')
    ) then
      raise exception using
        errcode = '55000',
        message = 'FUNDS_OPEN_CAMPAIGNS';
    end if;
    if exists (
      select 1 from public.recurring_gifts recurring
      where recurring.church_id = target_church_id
        and recurring.fund_id = target_fund.id
        and recurring.status in ('incomplete', 'active', 'paused', 'past_due')
    ) then
      raise exception using
        errcode = '55000',
        message = 'FUNDS_ACTIVE_RECURRING_GIFTS';
    end if;

    update public.funds
    set status = 'archived', is_default = false
    where church_id = target_church_id and id = target_fund.id
    returning * into target_fund;

    audit_action := 'fund_archived';
  else
    if target_fund.status <> 'archived' then
      raise exception using errcode = '22023', message = 'FUNDS_NOT_ARCHIVED';
    end if;

    select coalesce(max(fund.sort_order), -1)
      into max_active_sort_order
    from public.funds fund
    where fund.church_id = target_church_id
      and fund.status = 'active';

    if max_active_sort_order = 2147483647 then
      raise exception using
        errcode = '22003',
        message = 'FUNDS_ORDER_EXHAUSTED';
    end if;
    next_sort_order := max_active_sort_order + 1;

    changed_field_names := array['status'];
    if target_fund.sort_order is distinct from next_sort_order then
      changed_field_names := array_append(changed_field_names, 'sort_order');
    end if;

    update public.funds
    set status = 'active', is_default = false, sort_order = next_sort_order
    where church_id = target_church_id and id = target_fund.id
    returning * into target_fund;

    audit_action := 'fund_updated';
  end if;

  if audit_action = 'fund_updated' then
    select array_agg(field_name order by field_name)
      into sorted_field_names
    from unnest(changed_field_names) field_name;

    audit_changes := pg_catalog.jsonb_build_object(
      'fund_id', target_fund.id,
      'field_names', sorted_field_names
    );
  else
    audit_changes := pg_catalog.jsonb_build_object(
      'fund_id', target_fund.id
    );
  end if;

  next_revision := locked_church.funds_revision + 1;
  update public.churches
  set funds_revision = next_revision
  where id = target_church_id;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => audit_action,
    event_entity => 'fund',
    event_entity_id => target_fund.id::text,
    event_actor_user_id => request_user_id,
    event_request_id => fund_request_id::text,
    event_sanitized_changes => audit_changes
  );

  insert into public.church_fund_mutation_requests (
    church_id,
    requested_by_user_id,
    request_id,
    operation,
    payload_sha256,
    result_funds_revision,
    result_fund_id,
    result_name,
    result_slug,
    result_description,
    result_status,
    result_is_default,
    result_sort_order,
    audit_log_id
  ) values (
    target_church_id,
    request_user_id,
    fund_request_id,
    canonical_operation,
    canonical_payload_sha256,
    next_revision,
    target_fund.id,
    target_fund.name,
    target_fund.slug,
    target_fund.description,
    target_fund.status,
    target_fund.is_default,
    target_fund.sort_order,
    inserted_audit_log_id
  );

  mutation_result.church_id := target_church_id;
  mutation_result.fund_id := target_fund.id;
  mutation_result.name := target_fund.name;
  mutation_result.slug := target_fund.slug;
  mutation_result.description := target_fund.description;
  mutation_result.status := target_fund.status;
  mutation_result.is_default := target_fund.is_default;
  mutation_result.sort_order := target_fund.sort_order;
  mutation_result.funds_revision := next_revision;
  mutation_result.replayed := false;
  return mutation_result;
end;
$$;

comment on function public.get_church_funds(uuid) is
  'Returns all active and archived church funds in deterministic staff order after a funds_read check.';
comment on function public.mutate_church_fund(
  uuid,
  uuid,
  bigint,
  text,
  uuid,
  text,
  text,
  text
) is
  'Applies one owner-only, optimistic, idempotent fund mutation and appends an identifiers-only audit event.';

revoke all privileges on table public.church_fund_mutation_requests
  from public, anon, authenticated, service_role;

revoke all on type public.church_fund_record,
  public.church_fund_mutation_result
  from public, anon, authenticated, service_role;
grant usage on type public.church_fund_record,
  public.church_fund_mutation_result
  to authenticated;

revoke all on function public.prevent_fund_slug_change()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_church_fund_mutation_request()
  from public, anon, authenticated, service_role;
revoke all on function public.get_church_funds(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mutate_church_fund(
  uuid,
  uuid,
  bigint,
  text,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.get_church_funds(uuid)
  to authenticated;
grant execute on function public.mutate_church_fund(
  uuid,
  uuid,
  bigint,
  text,
  uuid,
  text,
  text,
  text
) to authenticated;

commit;
