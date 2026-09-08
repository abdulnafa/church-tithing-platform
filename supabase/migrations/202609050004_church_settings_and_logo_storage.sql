begin;

-- Church settings use a monotonic revision rather than updated_at. PostgreSQL's
-- now() is transaction-stable, so timestamps alone are not a safe optimistic
-- concurrency token for multiple saves in one transaction.
alter table public.churches
  add column settings_revision bigint not null default 0,
  add column logo_storage_path text;

alter table public.churches
  add constraint churches_settings_revision_nonnegative
    check (settings_revision >= 0),
  add constraint churches_logo_storage_path_format
    check (
      logo_storage_path is null
      or (
        logo_storage_path ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
        and pg_catalog.split_part(logo_storage_path, '/', 1) = id::text
      )
    );

comment on column public.churches.settings_revision is
  'Monotonic optimistic-concurrency token for the audited Church Settings workflow.';
comment on column public.churches.logo_storage_path is
  'Relative object path in the public church-logos bucket. Only sanitized WebP derivatives are accepted.';

create type public.church_settings_snapshot as (
  church_id uuid,
  display_name text,
  legal_name text,
  slug text,
  status public.church_status,
  default_currency text,
  support_email text,
  timezone text,
  primary_color text,
  secondary_color text,
  thank_you_message text,
  logo_storage_path text,
  settings_revision bigint
);

create type public.church_settings_update_result as (
  church_id uuid,
  settings_revision bigint,
  logo_storage_path text,
  logo_cleanup_path text,
  logo_cleanup_status text,
  replayed boolean
);

-- This private ledger provides idempotent updates and durable old-logo cleanup
-- work without duplicating church names, emails, or thank-you copy.
create table public.church_settings_update_requests (
  church_id uuid not null,
  requested_by_user_id uuid not null,
  request_id uuid not null,
  payload_sha256 text not null,
  result_settings_revision bigint not null,
  result_logo_storage_path text,
  logo_cleanup_path text,
  logo_cleanup_status text not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  cleanup_completed_at timestamptz,
  constraint church_settings_update_requests_pkey primary key (
    church_id,
    requested_by_user_id,
    request_id
  ),
  constraint church_settings_update_requests_church_request_unique unique (
    church_id,
    request_id
  ),
  constraint church_settings_update_requests_revision_unique unique (
    church_id,
    result_settings_revision
  ),
  constraint church_settings_update_requests_audit_unique unique (audit_log_id),
  constraint church_settings_update_requests_hash_format check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint church_settings_update_requests_revision_positive check (
    result_settings_revision > 0
  ),
  constraint church_settings_update_requests_result_logo_format check (
    result_logo_storage_path is null
    or (
      result_logo_storage_path ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
      and pg_catalog.split_part(result_logo_storage_path, '/', 1) =
        church_id::text
    )
  ),
  constraint church_settings_update_requests_cleanup_logo_format check (
    logo_cleanup_path is null
    or (
      logo_cleanup_path ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
      and pg_catalog.split_part(logo_cleanup_path, '/', 1) = church_id::text
    )
  ),
  constraint church_settings_update_requests_cleanup_state check (
    (
      logo_cleanup_status = 'not_required'
      and logo_cleanup_path is null
      and cleanup_completed_at is null
    )
    or (
      logo_cleanup_status = 'pending'
      and logo_cleanup_path is not null
      and cleanup_completed_at is null
    )
    or (
      logo_cleanup_status = 'completed'
      and logo_cleanup_path is not null
      and cleanup_completed_at is not null
    )
  ),
  constraint church_settings_update_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint church_settings_update_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

create index church_settings_update_requests_pending_cleanup_idx
  on public.church_settings_update_requests (
    church_id,
    created_at,
    request_id
  )
  where logo_cleanup_status = 'pending';

comment on table public.church_settings_update_requests is
  'Private settings idempotency and logo-cleanup ledger. Payload values are represented only by a SHA-256 fingerprint.';
comment on column public.church_settings_update_requests.requested_by_user_id is
  'Immutable historical actor UUID snapshot without an Auth lifecycle foreign key.';

alter table public.church_settings_update_requests enable row level security;
alter table public.church_settings_update_requests force row level security;

create or replace function public.guard_church_settings_update_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using
      errcode = '55000',
      message = 'SETTINGS_LEDGER_APPEND_ONLY';
  end if;

  if new.church_id is distinct from old.church_id
    or new.requested_by_user_id is distinct from old.requested_by_user_id
    or new.request_id is distinct from old.request_id
    or new.payload_sha256 is distinct from old.payload_sha256
    or new.result_settings_revision is distinct from old.result_settings_revision
    or new.result_logo_storage_path is distinct from old.result_logo_storage_path
    or new.logo_cleanup_path is distinct from old.logo_cleanup_path
    or new.audit_log_id is distinct from old.audit_log_id
    or new.created_at is distinct from old.created_at
    or old.logo_cleanup_status <> 'pending'
    or new.logo_cleanup_status <> 'completed'
    or old.cleanup_completed_at is not null
    or new.cleanup_completed_at is null
  then
    raise exception using
      errcode = '55000',
      message = 'SETTINGS_LEDGER_APPEND_ONLY';
  end if;

  return new;
end;
$$;

create trigger church_settings_update_requests_guard_update
before update on public.church_settings_update_requests
for each row execute function public.guard_church_settings_update_request();

create trigger church_settings_update_requests_guard_delete
before delete on public.church_settings_update_requests
for each row execute function public.guard_church_settings_update_request();

create trigger church_settings_update_requests_guard_truncate
before truncate on public.church_settings_update_requests
for each statement execute function public.guard_church_settings_update_request();

-- Fail rather than silently changing a pre-existing bucket with incompatible
-- settings. The application accepts common image inputs but uploads only a
-- metadata-stripped, resized WebP derivative.
do $$
declare
  existing_bucket storage.buckets%rowtype;
begin
  select bucket.* into existing_bucket
  from storage.buckets bucket
  where bucket.id = 'church-logos';

  if found then
    if existing_bucket.name is distinct from 'church-logos'
      or existing_bucket.public is distinct from true
      or existing_bucket.file_size_limit is distinct from 768000
      or existing_bucket.allowed_mime_types is distinct from
        array['image/webp']::text[]
    then
      raise exception using
        errcode = '55000',
        message = 'SETTINGS_LOGO_BUCKET_CONFIG_CONFLICT';
    end if;
  else
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) values (
      'church-logos',
      'church-logos',
      true,
      768000,
      array['image/webp']::text[]
    );
  end if;
end;
$$;

create or replace function public.can_upload_church_logo(
  candidate_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_church_id uuid;
begin
  if candidate_path is null
    or candidate_path !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  then
    return false;
  end if;

  target_church_id := pg_catalog.split_part(candidate_path, '/', 1)::uuid;
  return (select public.has_church_permission(
    target_church_id,
    'settings_manage'
  ));
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Lock the church row before deciding whether a Storage object can be deleted.
-- This gives logo-pointer updates and Storage deletes the same lock order and
-- prevents a concurrent delete from removing the object being made active.
create or replace function public.can_delete_church_logo(
  candidate_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_church_id uuid;
  active_logo_path text;
begin
  if candidate_path is null
    or candidate_path !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  then
    return false;
  end if;

  target_church_id := pg_catalog.split_part(candidate_path, '/', 1)::uuid;
  if not (select public.has_church_permission(
    target_church_id,
    'settings_manage'
  )) then
    return false;
  end if;

  select church.logo_storage_path
    into active_logo_path
  from public.churches church
  where church.id = target_church_id
  for share;

  return found and active_logo_path is distinct from candidate_path;
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Public buckets bypass RLS only for serving objects by public URL. Object
-- creation/listing/deletion remains policy-controlled. No permissive UPDATE
-- policy is created, so Storage upsert/overwrite is unavailable.
create policy church_logos_tenant_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'church-logos'
    and (select public.can_upload_church_logo(name))
  );

create policy church_logos_tenant_metadata_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'church-logos'
    and (select public.can_upload_church_logo(name))
  );

create policy church_logos_tenant_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'church-logos'
    and (select public.can_delete_church_logo(name))
  );

create policy church_logos_no_update
  on storage.objects as restrictive for update to authenticated
  using (false)
  with check (false);

create or replace function public.get_church_settings(
  target_church_id uuid
)
returns public.church_settings_snapshot
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings_result public.church_settings_snapshot;
begin
  if (select auth.uid()) is null
    or not (select public.has_church_permission(
      target_church_id,
      'settings_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'SETTINGS_FORBIDDEN';
  end if;

  select
    church.id,
    church.name,
    church.legal_name,
    church.slug,
    church.status,
    church.default_currency,
    church.support_email,
    church.timezone,
    church.primary_color,
    church.secondary_color,
    church.thank_you_message,
    church.logo_storage_path,
    church.settings_revision
  into settings_result
  from public.churches church
  where church.id = target_church_id;

  if not found then
    raise exception using errcode = '42501', message = 'SETTINGS_FORBIDDEN';
  end if;

  return settings_result;
end;
$$;

create or replace function public.update_church_settings(
  settings_request_id uuid,
  target_church_id uuid,
  expected_settings_revision bigint,
  church_display_name text,
  church_legal_name text,
  church_support_email text,
  church_timezone text,
  church_primary_color text,
  church_secondary_color text,
  church_thank_you_message text,
  church_logo_action text,
  church_logo_storage_path text
)
returns public.church_settings_update_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  canonical_display_name text;
  canonical_legal_name text;
  canonical_support_email text;
  canonical_timezone text;
  canonical_primary_color text;
  canonical_secondary_color text;
  canonical_thank_you_message text;
  canonical_logo_action text;
  canonical_logo_path text;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.church_settings_update_requests%rowtype;
  locked_church public.churches%rowtype;
  next_logo_path text;
  cleanup_path text;
  cleanup_status text;
  changed_setting_keys text[] := '{}'::text[];
  sorted_setting_keys text[];
  inserted_audit_log_id bigint;
  updated_result public.church_settings_update_result;
begin
  request_user_id := (select auth.uid());
  if request_user_id is null
    or not (select public.has_church_permission(
      target_church_id,
      'settings_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'SETTINGS_FORBIDDEN';
  end if;

  if settings_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_REQUEST_ID_REQUIRED';
  end if;

  if expected_settings_revision is null or expected_settings_revision < 0 then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_INVALID_EXPECTED_REVISION';
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
      message = 'SETTINGS_INVALID_CHURCH_NAME';
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
      message = 'SETTINGS_INVALID_LEGAL_NAME';
  end if;

  canonical_support_email := pg_catalog.lower(
    pg_catalog.btrim(church_support_email)
  );
  if canonical_support_email is null
    or not public.is_valid_provisioning_email(canonical_support_email)
  then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_INVALID_SUPPORT_EMAIL';
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
      message = 'SETTINGS_INVALID_TIMEZONE';
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
      message = 'SETTINGS_INVALID_PRIMARY_COLOR';
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
      message = 'SETTINGS_INVALID_SECONDARY_COLOR';
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
  ) then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_INVALID_THANK_YOU_MESSAGE';
  end if;

  canonical_logo_action := pg_catalog.lower(
    pg_catalog.btrim(church_logo_action)
  );
  if canonical_logo_action is null
    or canonical_logo_action not in ('keep', 'replace', 'remove')
  then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_INVALID_LOGO_ACTION';
  end if;

  if canonical_logo_action in ('keep', 'remove') then
    if church_logo_storage_path is not null then
      raise exception using
        errcode = '22023',
        message = 'SETTINGS_INVALID_LOGO_PATH';
    end if;
    canonical_logo_path := null;
  else
    canonical_logo_path := church_logo_storage_path;
    if canonical_logo_path is null
      or canonical_logo_path !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
      or pg_catalog.split_part(canonical_logo_path, '/', 1) <> target_church_id::text
      or pg_catalog.split_part(
        pg_catalog.split_part(canonical_logo_path, '/', 2),
        '.',
        1
      ) <> settings_request_id::text
    then
      raise exception using
        errcode = '22023',
        message = 'SETTINGS_INVALID_LOGO_PATH';
    end if;
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_settings_revision', expected_settings_revision,
    'church_display_name', canonical_display_name,
    'church_legal_name', canonical_legal_name,
    'church_support_email', canonical_support_email,
    'church_timezone', canonical_timezone,
    'church_primary_color', canonical_primary_color,
    'church_secondary_color', canonical_secondary_color,
    'church_thank_you_message', canonical_thank_you_message,
    'church_logo_action', canonical_logo_action,
    'church_logo_storage_path', canonical_logo_path
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'church-settings-request:' || target_church_id::text || ':' ||
        settings_request_id::text,
      0
    )
  );

  select request_record.*
    into existing_request
  from public.church_settings_update_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = settings_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'SETTINGS_IDEMPOTENCY_CONFLICT';
    end if;

    updated_result.church_id := existing_request.church_id;
    updated_result.settings_revision :=
      existing_request.result_settings_revision;
    updated_result.logo_storage_path :=
      existing_request.result_logo_storage_path;
    updated_result.logo_cleanup_path := existing_request.logo_cleanup_path;
    updated_result.logo_cleanup_status :=
      existing_request.logo_cleanup_status;
    updated_result.replayed := true;
    return updated_result;
  end if;

  select church.*
    into locked_church
  from public.churches church
  where church.id = target_church_id
  for update;

  if not found
    or not (select public.has_church_permission(
      target_church_id,
      'settings_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'SETTINGS_FORBIDDEN';
  end if;

  if locked_church.settings_revision <> expected_settings_revision then
    raise exception using
      errcode = '40001',
      message = 'SETTINGS_REVISION_CONFLICT';
  end if;

  if canonical_logo_action = 'replace' then
    perform 1
    from storage.objects object_record
    where object_record.bucket_id = 'church-logos'
      and object_record.name = canonical_logo_path
      and object_record.metadata ->> 'mimetype' = 'image/webp'
      and case
        when coalesce(object_record.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (object_record.metadata ->> 'size')::bigint between 1 and 768000
        else false
      end
    for share;

    if not found then
      raise exception using
        errcode = '55000',
        message = 'SETTINGS_LOGO_OBJECT_NOT_READY';
    end if;
    next_logo_path := canonical_logo_path;
  elsif canonical_logo_action = 'remove' then
    next_logo_path := null;
  else
    next_logo_path := locked_church.logo_storage_path;
  end if;

  if locked_church.name is distinct from canonical_display_name then
    changed_setting_keys := array_append(changed_setting_keys, 'name');
  end if;
  if locked_church.legal_name is distinct from canonical_legal_name then
    changed_setting_keys := array_append(changed_setting_keys, 'legal_name');
  end if;
  if locked_church.support_email is distinct from canonical_support_email then
    changed_setting_keys := array_append(changed_setting_keys, 'support_email');
  end if;
  if locked_church.timezone is distinct from canonical_timezone then
    changed_setting_keys := array_append(changed_setting_keys, 'timezone');
  end if;
  if locked_church.primary_color is distinct from canonical_primary_color then
    changed_setting_keys := array_append(changed_setting_keys, 'primary_color');
  end if;
  if locked_church.secondary_color is distinct from canonical_secondary_color then
    changed_setting_keys := array_append(changed_setting_keys, 'secondary_color');
  end if;
  if locked_church.thank_you_message is distinct from
    canonical_thank_you_message
  then
    changed_setting_keys := array_append(
      changed_setting_keys,
      'thank_you_message'
    );
  end if;
  if locked_church.logo_storage_path is distinct from next_logo_path then
    changed_setting_keys := array_append(
      changed_setting_keys,
      'logo_storage_path'
    );
  end if;

  if coalesce(array_length(changed_setting_keys, 1), 0) = 0 then
    raise exception using errcode = '22023', message = 'SETTINGS_NO_CHANGES';
  end if;

  select array_agg(setting_key order by setting_key)
    into sorted_setting_keys
  from unnest(changed_setting_keys) setting_key;

  if locked_church.logo_storage_path is not null
    and locked_church.logo_storage_path is distinct from next_logo_path
  then
    cleanup_path := locked_church.logo_storage_path;
    cleanup_status := 'pending';
  else
    cleanup_path := null;
    cleanup_status := 'not_required';
  end if;

  update public.churches
  set
    name = canonical_display_name,
    legal_name = canonical_legal_name,
    support_email = canonical_support_email,
    timezone = canonical_timezone,
    primary_color = canonical_primary_color,
    secondary_color = canonical_secondary_color,
    thank_you_message = canonical_thank_you_message,
    logo_storage_path = next_logo_path,
    logo_url = case
      when canonical_logo_action in ('replace', 'remove') then null
      else logo_url
    end,
    settings_revision = settings_revision + 1
  where id = target_church_id;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => 'church_settings_updated',
    event_entity => 'church',
    event_entity_id => target_church_id::text,
    event_actor_user_id => request_user_id,
    event_request_id => settings_request_id::text,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'setting_keys', sorted_setting_keys
    )
  );

  insert into public.church_settings_update_requests (
    church_id,
    requested_by_user_id,
    request_id,
    payload_sha256,
    result_settings_revision,
    result_logo_storage_path,
    logo_cleanup_path,
    logo_cleanup_status,
    audit_log_id
  ) values (
    target_church_id,
    request_user_id,
    settings_request_id,
    canonical_payload_sha256,
    locked_church.settings_revision + 1,
    next_logo_path,
    cleanup_path,
    cleanup_status,
    inserted_audit_log_id
  );

  updated_result.church_id := target_church_id;
  updated_result.settings_revision := locked_church.settings_revision + 1;
  updated_result.logo_storage_path := next_logo_path;
  updated_result.logo_cleanup_path := cleanup_path;
  updated_result.logo_cleanup_status := cleanup_status;
  updated_result.replayed := false;
  return updated_result;
end;
$$;

create or replace function public.get_pending_church_logo_cleanups(
  target_church_id uuid
)
returns table (
  settings_request_id uuid,
  logo_storage_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select public.has_church_permission(
      target_church_id,
      'settings_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'SETTINGS_FORBIDDEN';
  end if;

  return query
  select request_record.request_id, request_record.logo_cleanup_path
  from public.church_settings_update_requests request_record
  where request_record.church_id = target_church_id
    and request_record.logo_cleanup_status = 'pending'
  order by request_record.created_at, request_record.request_id
  limit 100;
end;
$$;

create or replace function public.complete_church_logo_cleanup(
  target_church_id uuid,
  settings_request_id uuid,
  logo_cleanup_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleanup_request public.church_settings_update_requests%rowtype;
begin
  if (select auth.uid()) is null
    or not (select public.has_church_permission(
      target_church_id,
      'settings_manage'
    ))
  then
    raise exception using errcode = '42501', message = 'SETTINGS_FORBIDDEN';
  end if;

  select request_record.*
    into cleanup_request
  from public.church_settings_update_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = settings_request_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_CLEANUP_NOT_FOUND';
  end if;

  if cleanup_request.logo_cleanup_path is distinct from logo_cleanup_path then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_CLEANUP_PATH_MISMATCH';
  end if;

  if cleanup_request.logo_cleanup_status = 'not_required' then
    raise exception using
      errcode = '22023',
      message = 'SETTINGS_CLEANUP_NOT_FOUND';
  end if;

  if cleanup_request.logo_cleanup_status = 'completed' then
    return true;
  end if;

  if exists (
    select 1
    from storage.objects object_record
    where object_record.bucket_id = 'church-logos'
      and object_record.name = logo_cleanup_path
  ) then
    raise exception using
      errcode = '55000',
      message = 'SETTINGS_CLEANUP_OBJECT_EXISTS';
  end if;

  update public.church_settings_update_requests
  set
    logo_cleanup_status = 'completed',
    cleanup_completed_at = now()
  where church_id = target_church_id
    and request_id = settings_request_id;

  return true;
end;
$$;

comment on function public.get_church_settings(uuid) is
  'Returns the owner-only editable church settings snapshot and revision for an active or onboarding church.';
comment on function public.update_church_settings(
  uuid,
  uuid,
  bigint,
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
  'Applies one owner-only, optimistic, idempotent church-settings update and appends a value-free audit event.';
comment on function public.get_pending_church_logo_cleanups(uuid) is
  'Returns owner-only old-logo paths that should be removed through the Storage API.';
comment on function public.complete_church_logo_cleanup(uuid, uuid, text) is
  'Marks one pending old-logo cleanup complete only after its Storage metadata row is absent.';

-- The private ledger has no direct client or service-role data path. Cleanup
-- state changes only through the validated SECURITY DEFINER acknowledgement.
revoke all privileges on table public.church_settings_update_requests
  from public, anon, authenticated, service_role;

revoke all on type public.church_settings_snapshot
  from public, anon, authenticated, service_role;
revoke all on type public.church_settings_update_result
  from public, anon, authenticated, service_role;
grant usage on type public.church_settings_snapshot,
  public.church_settings_update_result
  to authenticated;

revoke all on function public.guard_church_settings_update_request()
  from public, anon, authenticated, service_role;
revoke all on function public.can_upload_church_logo(text)
  from public, anon, authenticated, service_role;
revoke all on function public.can_delete_church_logo(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_church_settings(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.update_church_settings(
  uuid,
  uuid,
  bigint,
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
revoke all on function public.get_pending_church_logo_cleanups(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_church_logo_cleanup(uuid, uuid, text)
  from public, anon, authenticated, service_role;

-- Policy helpers need EXECUTE for authenticated Storage statements. They reveal
-- only whether the caller already has settings_manage for the encoded tenant.
grant execute on function public.can_upload_church_logo(text)
  to authenticated;
grant execute on function public.can_delete_church_logo(text)
  to authenticated;
grant execute on function public.get_church_settings(uuid)
  to authenticated;
grant execute on function public.update_church_settings(
  uuid,
  uuid,
  bigint,
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
grant execute on function public.get_pending_church_logo_cleanups(uuid)
  to authenticated;
grant execute on function public.complete_church_logo_cleanup(uuid, uuid, text)
  to authenticated;

-- Existing application identity queries use exactly these four columns. All
-- private profile/branding fields now flow through the owner-only settings RPC;
-- P14 may later add a separately reviewed public branding projection.
revoke select on public.churches from anon, authenticated;
-- Column ACLs are independent of table ACLs. Explicitly remove the legacy
-- anonymous giving projection before granting the minimal identity projection.
revoke select (
  id,
  name,
  legal_name,
  slug,
  status,
  default_currency,
  timezone,
  logo_url,
  primary_color,
  secondary_color,
  thank_you_message,
  support_email,
  public_settings,
  activated_at,
  suspended_at,
  created_by,
  created_at,
  updated_at,
  settings_revision,
  logo_storage_path
) on public.churches from anon, authenticated;
grant select (id, name, slug, status) on public.churches to anon, authenticated;

commit;
