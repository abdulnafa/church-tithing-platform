begin;

-- P16 creates a privacy-safe prayer-request foundation without enabling public
-- submission. Prayer text remains outside financial projections and payment
-- providers. Final consent wording and retention/deletion policy are still
-- client and legal decisions, so no timer, purge, redaction, or delete workflow
-- is introduced here.

create or replace function public.canonicalize_prayer_request_body(
  input_value text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.replace(
      pg_catalog.replace(input_value, E'\r\n', E'\n'),
      E'\r',
      E'\n'
    ),
    E' \t\n'
  )
$$;

create or replace function public.prayer_request_body_has_unsafe_formatting(
  input_value text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    pg_catalog.regexp_replace(input_value, E'[\t\n]', '', 'g') ~ '[[:cntrl:]]'
    or exists (
      select 1
      from pg_catalog.generate_series(127, 159) code_point
      where pg_catalog.strpos(input_value, pg_catalog.chr(code_point)) > 0
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        1564, 8206, 8207, 8232, 8233,
        8234, 8235, 8236, 8237, 8238,
        8294, 8295, 8296, 8297
      ]) code_point
      where pg_catalog.strpos(input_value, pg_catalog.chr(code_point)) > 0
    )
$$;

revoke all privileges on function
  public.canonicalize_prayer_request_body(text),
  public.prayer_request_body_has_unsafe_formatting(text)
from public, anon, authenticated, service_role;

-- No approved wording existed before P16 and no prayer submission has been
-- enabled. Refuse to guess consent evidence for any unexpected legacy record.
do $$
begin
  if exists (select 1 from public.prayer_requests) then
    raise exception using
      errcode = '23514',
      message = 'P16_EXISTING_PRAYER_CONSENT_VERSION_REQUIRED';
  end if;
end;
$$;

create table public.prayer_request_consent_versions (
  version_id text primary key,
  wording_sha256 text not null unique,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint prayer_request_consent_versions_id_format check (
    pg_catalog.char_length(version_id) between 1 and 64
    and version_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  constraint prayer_request_consent_versions_digest_format check (
    wording_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint prayer_request_consent_versions_time_order check (
    approved_at <= created_at
  )
);

comment on table public.prayer_request_consent_versions is
  'Private immutable consent-evidence catalog. P16 leaves it empty until approved prayer wording is registered by a reviewed migration; raw wording is not stored here.';

alter table public.prayer_request_consent_versions enable row level security;
alter table public.prayer_request_consent_versions force row level security;

create or replace function public.guard_prayer_request_consent_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') or new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'PRAYER_CONSENT_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger prayer_request_consent_versions_append_only
  before update or delete on public.prayer_request_consent_versions
  for each row execute function public.guard_prayer_request_consent_version();

create trigger prayer_request_consent_versions_no_truncate
  before truncate on public.prayer_request_consent_versions
  for each statement execute function public.guard_prayer_request_consent_version();

alter table public.prayer_requests
  alter column donation_id drop not null,
  add column consent_version_id text not null,
  add column retention_policy_status text not null
    default 'pending_client_approval',
  add column revision bigint not null default 0,
  add constraint prayer_requests_consent_version_fkey
    foreign key (consent_version_id)
    references public.prayer_request_consent_versions(version_id)
    on delete restrict,
  add constraint prayer_requests_retention_policy_pending check (
    retention_policy_status = 'pending_client_approval'
  ),
  add constraint prayer_requests_no_retention_action check (
    deleted_at is null
  ),
  add constraint prayer_requests_donor_requires_donation check (
    donor_id is null or donation_id is not null
  ),
  add constraint prayer_requests_body_canonical check (
    body = public.canonicalize_prayer_request_body(body)
    and pg_catalog.char_length(body) between 1 and 2000
    and not public.prayer_request_body_has_unsafe_formatting(body)
  ),
  add constraint prayer_requests_revision_safe check (
    revision between 0 and 1
  ),
  add constraint prayer_requests_review_state_consistent check (
    (
      reviewed_at is null
      and reviewed_by is null
      and revision = 0
    )
    or (
      reviewed_at is not null
      and reviewed_by is not null
      and revision = 1
    )
  ),
  add constraint prayer_requests_timestamp_order check (
    consented_at <= created_at
    and updated_at >= created_at
    and (reviewed_at is null or reviewed_at >= created_at)
    and (reviewed_at is null or reviewed_at <= updated_at)
    and (deleted_at is null or deleted_at >= created_at)
  );

alter table public.prayer_requests
  drop constraint prayer_requests_church_id_fkey,
  drop constraint prayer_requests_reviewed_by_fkey,
  add constraint prayer_requests_church_id_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  add constraint prayer_requests_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete restrict;

comment on column public.prayer_requests.consent_version_id is
  'Immutable identifier for the approved consent wording accepted by the submitter. P16 registers no version and exposes no create path.';
comment on column public.prayer_requests.retention_policy_status is
  'Fail-closed P16 marker: no automatic timer, purge, redaction, or deletion workflow exists until the client approves a retention policy.';
comment on column public.prayer_requests.revision is
  'Row-level optimistic-concurrency revision for the one-way unreviewed-to-reviewed transition.';

create or replace function public.guard_prayer_request_private_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.church_id is distinct from old.church_id
    or new.donation_id is distinct from old.donation_id
    or new.donor_id is distinct from old.donor_id
    or new.body is distinct from old.body
    or new.consented_at is distinct from old.consented_at
    or new.consent_version_id is distinct from old.consent_version_id
    or new.retention_policy_status is distinct from old.retention_policy_status
    or new.deleted_at is distinct from old.deleted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'PRAYER_REQUEST_PRIVATE_FIELDS_IMMUTABLE';
  end if;

  if old.reviewed_at is null then
    if new.reviewed_at is null then
      if new.reviewed_by is distinct from old.reviewed_by
        or new.revision is distinct from old.revision
      then
        raise exception using
          errcode = '55000',
          message = 'PRAYER_REQUEST_REVIEW_TRANSITION_INVALID';
      end if;
    elsif new.reviewed_by is null or new.revision <> old.revision + 1 then
      raise exception using
        errcode = '55000',
        message = 'PRAYER_REQUEST_REVIEW_TRANSITION_INVALID';
    end if;
  elsif new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.revision is distinct from old.revision
  then
    raise exception using
      errcode = '55000',
      message = 'PRAYER_REQUEST_REVIEW_TRANSITION_INVALID';
  end if;

  return new;
end;
$$;

create trigger prayer_requests_keep_private_fields
  before update on public.prayer_requests
  for each row execute function public.guard_prayer_request_private_fields();

drop index if exists public.prayer_requests_unreviewed_idx;
create index prayer_requests_queue_idx
  on public.prayer_requests (
    church_id,
    ((reviewed_at is not null)),
    ((case when reviewed_at is null then created_at end)) asc,
    ((case when reviewed_at is null then id end)) asc,
    ((case when reviewed_at is not null then reviewed_at end)) desc,
    ((case when reviewed_at is not null then id end)) desc
  )
  where deleted_at is null;
create index prayer_requests_consent_version_fk_idx
  on public.prayer_requests (consent_version_id);

-- Direct prayer-table access could bypass the minimum projection and reveal
-- donor/donation linkage or reviewer identity. All application access is routed
-- through the two functions below. No donor self-read is approved in P16.
drop policy if exists prayer_requests_donor_read on public.prayer_requests;
drop policy if exists prayer_requests_pastoral_read on public.prayer_requests;
drop policy if exists prayer_requests_permission_read on public.prayer_requests;
revoke all privileges on table public.prayer_requests
  from public, anon, authenticated, service_role;
alter table public.prayer_requests force row level security;

create type public.prayer_request_queue_record as (
  prayer_request_id uuid,
  body text,
  is_reviewed boolean,
  consented_at timestamptz,
  created_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz,
  revision bigint
);

create type public.prayer_request_review_result as (
  prayer_request_id uuid,
  reviewed_at timestamptz,
  revision bigint,
  replayed boolean
);

create table public.prayer_request_review_requests (
  church_id uuid not null,
  prayer_request_id uuid not null,
  request_id uuid not null,
  requested_by_user_id uuid not null,
  payload_sha256 text not null,
  result_reviewed_at timestamptz not null,
  result_revision bigint not null,
  audit_log_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (church_id, request_id),
  constraint prayer_request_review_requests_one_review
    unique (church_id, prayer_request_id),
  constraint prayer_request_review_requests_one_audit unique (audit_log_id),
  constraint prayer_request_review_requests_payload_digest check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint prayer_request_review_requests_revision check (
    result_revision = 1
  ),
  constraint prayer_request_review_requests_time_order check (
    result_reviewed_at <= created_at
  ),
  constraint prayer_request_review_requests_church_fkey
    foreign key (church_id) references public.churches(id) on delete restrict,
  constraint prayer_request_review_requests_prayer_fkey
    foreign key (church_id, prayer_request_id)
    references public.prayer_requests(church_id, id) on delete restrict,
  constraint prayer_request_review_requests_audit_fkey
    foreign key (audit_log_id) references public.audit_logs(id) on delete restrict
);

comment on table public.prayer_request_review_requests is
  'Private append-only idempotency ledger for one-way prayer review. It stores only identifiers, an opaque digest, result state, and an audit reference; never prayer text or donor/donation data.';
comment on column public.prayer_request_review_requests.requested_by_user_id is
  'Immutable historical actor UUID snapshot without an Auth lifecycle foreign key.';

alter table public.prayer_request_review_requests enable row level security;
alter table public.prayer_request_review_requests force row level security;

create or replace function public.guard_prayer_request_review_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') or new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'PRAYER_REVIEW_LEDGER_APPEND_ONLY';
  end if;
  return new;
end;
$$;

create trigger prayer_request_review_requests_append_only
  before update or delete on public.prayer_request_review_requests
  for each row execute function public.guard_prayer_request_review_request();

create trigger prayer_request_review_requests_no_truncate
  before truncate on public.prayer_request_review_requests
  for each statement execute function public.guard_prayer_request_review_request();

revoke all privileges on table
  public.prayer_request_consent_versions,
  public.prayer_request_review_requests
from public, anon, authenticated, service_role;

revoke all privileges on type
  public.prayer_request_queue_record,
  public.prayer_request_review_result
from public, anon, authenticated, service_role;
grant usage on type
  public.prayer_request_queue_record,
  public.prayer_request_review_result
to authenticated;

revoke all privileges on function
  public.guard_prayer_request_consent_version(),
  public.guard_prayer_request_private_fields(),
  public.guard_prayer_request_review_request()
from public, anon, authenticated, service_role;

create or replace function public.get_prayer_request_queue(
  target_church_id uuid
)
returns setof public.prayer_request_queue_record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
begin
  request_user_id := (select auth.uid());

  if request_user_id is null
    or target_church_id is null
    or not exists (
      select 1
      from public.churches church
      where church.id = target_church_id
        and church.status in ('active', 'onboarding')
    )
    or not public.has_church_permission(
      target_church_id,
      'prayer_requests_review'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'PRAYER_QUEUE_FORBIDDEN';
  end if;

  return query
    select
      prayer.id,
      prayer.body,
      prayer.reviewed_at is not null,
      prayer.consented_at,
      prayer.created_at,
      prayer.reviewed_at,
      prayer.updated_at,
      prayer.revision
    from public.prayer_requests prayer
    where prayer.church_id = target_church_id
      and prayer.deleted_at is null
    order by
      prayer.reviewed_at is not null,
      case when prayer.reviewed_at is null then prayer.created_at end asc,
      case when prayer.reviewed_at is null then prayer.id end asc,
      case when prayer.reviewed_at is not null then prayer.reviewed_at end desc,
      case when prayer.reviewed_at is not null then prayer.id end desc
    limit 100;
end;
$$;

create or replace function public.review_prayer_request(
  target_church_id uuid,
  target_prayer_request_id uuid,
  review_request_id uuid,
  expected_revision bigint
)
returns public.prayer_request_review_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid;
  locked_church_id uuid;
  canonical_payload jsonb;
  canonical_payload_sha256 text;
  existing_request public.prayer_request_review_requests%rowtype;
  target_prayer public.prayer_requests%rowtype;
  inserted_audit_log_id bigint;
  result_value public.prayer_request_review_result;
begin
  request_user_id := (select auth.uid());

  if request_user_id is null
    or target_church_id is null
    or not public.has_church_permission(
      target_church_id,
      'prayer_requests_review'
    )
  then
    raise exception using
      errcode = '42501',
      message = 'PRAYER_REVIEW_FORBIDDEN';
  end if;

  if review_request_id is null
    or pg_catalog.substr(review_request_id::text, 15, 1) <> '4'
    or pg_catalog.substr(review_request_id::text, 20, 1) !~ '^[89ab]$'
  then
    raise exception using
      errcode = '22023',
      message = 'PRAYER_REVIEW_INVALID_REQUEST_ID';
  end if;

  if expected_revision is null
    or expected_revision < 0
    or expected_revision > 9007199254740991
  then
    raise exception using
      errcode = '22023',
      message = 'PRAYER_REVIEW_INVALID_EXPECTED_REVISION';
  end if;

  if target_prayer_request_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'PRAYER_REVIEW_NOT_FOUND';
  end if;

  canonical_payload := pg_catalog.jsonb_build_object(
    'expected_revision', expected_revision,
    'prayer_request_id', target_prayer_request_id
  );
  canonical_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(canonical_payload::text, 'UTF8')
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'prayer-review-request:' || target_church_id::text || ':' ||
        review_request_id::text,
      0
    )
  );

  -- Lock the active authorization rows in a stable order so suspension,
  -- membership revocation, or profile disable cannot race the review commit.
  select church.id
    into locked_church_id
  from public.churches church
  join public.church_memberships membership
    on membership.church_id = church.id
   and membership.user_id = request_user_id
   and membership.status = 'active'
   and membership.role = 'owner'
  join public.profiles profile
    on profile.id = membership.user_id
   and profile.is_active
  where church.id = target_church_id
    and church.status in ('active', 'onboarding')
    and public.has_church_permission(
      church.id,
      'prayer_requests_review'
    )
  for share of church, membership, profile;

  if locked_church_id is null then
    raise exception using
      errcode = '42501',
      message = 'PRAYER_REVIEW_FORBIDDEN';
  end if;

  select request_record.*
    into existing_request
  from public.prayer_request_review_requests request_record
  where request_record.church_id = target_church_id
    and request_record.request_id = review_request_id;

  if found then
    if existing_request.requested_by_user_id <> request_user_id
      or existing_request.payload_sha256 <> canonical_payload_sha256
    then
      raise exception using
        errcode = '22023',
        message = 'PRAYER_REVIEW_IDEMPOTENCY_CONFLICT';
    end if;

    result_value.prayer_request_id := existing_request.prayer_request_id;
    result_value.reviewed_at := existing_request.result_reviewed_at;
    result_value.revision := existing_request.result_revision;
    result_value.replayed := true;
    return result_value;
  end if;

  select prayer.*
    into target_prayer
  from public.prayer_requests prayer
  where prayer.church_id = target_church_id
    and prayer.id = target_prayer_request_id
    and prayer.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PRAYER_REVIEW_NOT_FOUND';
  end if;

  if target_prayer.revision <> expected_revision then
    raise exception using
      errcode = '40001',
      message = 'PRAYER_REVIEW_REVISION_CONFLICT';
  end if;

  if target_prayer.reviewed_at is not null then
    raise exception using
      errcode = '22023',
      message = 'PRAYER_REVIEW_ALREADY_REVIEWED';
  end if;

  update public.prayer_requests prayer
  set
    reviewed_at = now(),
    reviewed_by = request_user_id,
    revision = prayer.revision + 1
  where prayer.church_id = target_church_id
    and prayer.id = target_prayer_request_id
  returning prayer.* into target_prayer;

  inserted_audit_log_id := public.append_audit_event(
    target_church_id => target_church_id,
    event_actor_type => 'user',
    event_action => 'prayer_request_reviewed',
    event_entity => 'prayer_request',
    event_entity_id => target_prayer.id::text,
    event_actor_user_id => request_user_id,
    event_request_id => review_request_id::text,
    event_sanitized_changes => pg_catalog.jsonb_build_object(
      'prayer_request_id', target_prayer.id::text,
      'reviewed', true
    )
  );

  insert into public.prayer_request_review_requests (
    church_id,
    prayer_request_id,
    request_id,
    requested_by_user_id,
    payload_sha256,
    result_reviewed_at,
    result_revision,
    audit_log_id
  ) values (
    target_church_id,
    target_prayer.id,
    review_request_id,
    request_user_id,
    canonical_payload_sha256,
    target_prayer.reviewed_at,
    target_prayer.revision,
    inserted_audit_log_id
  );

  result_value.prayer_request_id := target_prayer.id;
  result_value.reviewed_at := target_prayer.reviewed_at;
  result_value.revision := target_prayer.revision;
  result_value.replayed := false;
  return result_value;
end;
$$;

revoke all privileges on function
  public.get_prayer_request_queue(uuid),
  public.review_prayer_request(uuid, uuid, uuid, bigint)
from public, anon, authenticated, service_role;

grant execute on function
  public.get_prayer_request_queue(uuid),
  public.review_prayer_request(uuid, uuid, uuid, bigint)
to authenticated;

commit;
