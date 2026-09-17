begin;

-- P18 is deliberately limited to the seeded development-only mock gateway.
-- It persists no raw capability token, card data, prayer text, provider secret,
-- or raw webhook payload. The selected Barbados gateway will replace this
-- simulation rather than inheriting its browser-held capability model.

create type public.mock_giving_checkout_start_result as (
  checkout_id uuid,
  donation_id uuid,
  expires_at timestamptz,
  replayed boolean
);

create type public.mock_giving_checkout_record as (
  checkout_id uuid,
  church_slug text,
  church_name text,
  fund_name text,
  campaign_name text,
  amount_minor_text text,
  currency text,
  frequency text,
  checkout_status text,
  expires_at timestamptz,
  provider_payment_reference text,
  provider_schedule_reference text,
  thank_you_message text
);

create type public.mock_giving_checkout_state_result as (
  checkout_id uuid,
  checkout_status text,
  donation_status text,
  recurring_status text,
  replayed boolean
);

create type public.mock_giving_checkout_completion_result as (
  checkout_id uuid,
  checkout_status text,
  donation_status text,
  recurring_status text,
  replayed boolean
);

create table public.mock_giving_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null,
  connection_id uuid not null,
  donor_id uuid not null,
  donation_id uuid not null,
  recurring_gift_id uuid,
  capability_sha256 text not null,
  payload_hmac_sha256 text not null,
  checkout_reference text not null,
  provider_payment_reference text not null,
  provider_schedule_reference text,
  frequency text not null,
  status text not null default 'open',
  expires_at timestamptz not null,
  completion_payload_sha256 text,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint mock_giving_checkout_sessions_church_fkey
    foreign key (church_id) references public.churches(id) on delete cascade,
  constraint mock_giving_checkout_sessions_connection_tenant_fkey
    foreign key (church_id, connection_id)
    references public.payment_provider_connections(church_id, id)
    on delete restrict,
  constraint mock_giving_checkout_sessions_donor_tenant_fkey
    foreign key (church_id, donor_id)
    references public.donors(church_id, id) on delete restrict,
  constraint mock_giving_checkout_sessions_donation_tenant_fkey
    foreign key (church_id, donation_id, donor_id)
    references public.donations(church_id, id, donor_id) on delete restrict,
  constraint mock_giving_checkout_sessions_recurring_tenant_fkey
    foreign key (church_id, recurring_gift_id, donor_id, connection_id)
    references public.recurring_gifts(church_id, id, donor_id, payment_connection_id)
    on delete restrict,
  constraint mock_giving_checkout_sessions_donation_unique unique (donation_id),
  constraint mock_giving_checkout_sessions_church_capability_unique
    unique (church_id, capability_sha256),
  constraint mock_giving_checkout_sessions_connection_reference_unique
    unique (connection_id, checkout_reference),
  constraint mock_giving_checkout_sessions_capability_hash_check check (
    capability_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint mock_giving_checkout_sessions_payload_hmac_check check (
    payload_hmac_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint mock_giving_checkout_sessions_completion_hash_check check (
    completion_payload_sha256 is null
    or completion_payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint mock_giving_checkout_sessions_reference_check check (
    checkout_reference ~ '^mock_checkout_[0-9a-f]{32}$'
    and provider_payment_reference ~ '^mock_payment_[0-9a-f]{32}$'
    and (
      provider_schedule_reference is null
      or provider_schedule_reference ~ '^mock_schedule_[0-9a-f]{32}$'
    )
  ),
  constraint mock_giving_checkout_sessions_frequency_check check (
    frequency in ('one_time', 'weekly', 'monthly')
  ),
  constraint mock_giving_checkout_sessions_recurring_check check (
    (
      frequency = 'one_time'
      and recurring_gift_id is null
      and provider_schedule_reference is null
    )
    or (
      frequency in ('weekly', 'monthly')
      and recurring_gift_id is not null
      and provider_schedule_reference is not null
    )
  ),
  constraint mock_giving_checkout_sessions_status_check check (
    status in ('open', 'completed', 'canceled', 'expired')
  ),
  constraint mock_giving_checkout_sessions_expiry_check check (
    expires_at > created_at
  ),
  constraint mock_giving_checkout_sessions_terminal_check check (
    (
      status = 'open'
      and completed_at is null
      and canceled_at is null
      and completion_payload_sha256 is null
    )
    or (
      status = 'completed'
      and completed_at is not null
      and canceled_at is null
      and completion_payload_sha256 is not null
    )
    or (
      status in ('canceled', 'expired')
      and completed_at is null
      and canceled_at is not null
      and completion_payload_sha256 is null
    )
  )
);

create index mock_giving_checkout_sessions_expiry_idx
  on public.mock_giving_checkout_sessions (expires_at, id)
  where status = 'open';
create index mock_giving_checkout_sessions_church_created_idx
  on public.mock_giving_checkout_sessions (church_id, created_at desc);
create index mock_giving_checkout_sessions_connection_fk_idx
  on public.mock_giving_checkout_sessions (church_id, connection_id);
create index mock_giving_checkout_sessions_donor_fk_idx
  on public.mock_giving_checkout_sessions (church_id, donor_id);
create index mock_giving_checkout_sessions_recurring_fk_idx
  on public.mock_giving_checkout_sessions (church_id, recurring_gift_id)
  where recurring_gift_id is not null;

comment on table public.mock_giving_checkout_sessions is
  'Private P18 development-only mock checkout ledger. Stores only identifiers, hashes, safe provider references, and lifecycle timestamps; never raw capability tokens, prayer text, card data, secrets, or raw webhook payloads.';

alter table public.mock_giving_checkout_sessions enable row level security;
alter table public.mock_giving_checkout_sessions force row level security;

-- PostgreSQL provides SHA-256 but not HMAC without pgcrypto. Supabase places
-- optional extensions in a deployment-specific schema and PGlite intentionally
-- does not bundle pgcrypto, so this private helper implements standard
-- HMAC-SHA-256 using the built-in SHA-256 primitive.
create or replace function public.mock_hmac_sha256_hex(
  secret_value text,
  message_value text
)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  key_bytes bytea;
  key_block bytea := pg_catalog.decode(pg_catalog.repeat('00', 64), 'hex');
  inner_pad bytea := pg_catalog.decode(pg_catalog.repeat('36', 64), 'hex');
  outer_pad bytea := pg_catalog.decode(pg_catalog.repeat('5c', 64), 'hex');
  byte_index integer;
begin
  key_bytes := pg_catalog.convert_to(secret_value, 'UTF8');
  if pg_catalog.octet_length(key_bytes) > 64 then
    key_bytes := pg_catalog.sha256(key_bytes);
  end if;

  if pg_catalog.octet_length(key_bytes) > 0 then
    for byte_index in 0..pg_catalog.octet_length(key_bytes) - 1 loop
      key_block := pg_catalog.set_byte(
        key_block,
        byte_index,
        pg_catalog.get_byte(key_bytes, byte_index)
      );
    end loop;
  end if;

  for byte_index in 0..63 loop
    inner_pad := pg_catalog.set_byte(
      inner_pad,
      byte_index,
      pg_catalog.get_byte(inner_pad, byte_index)
        # pg_catalog.get_byte(key_block, byte_index)
    );
    outer_pad := pg_catalog.set_byte(
      outer_pad,
      byte_index,
      pg_catalog.get_byte(outer_pad, byte_index)
        # pg_catalog.get_byte(key_block, byte_index)
    );
  end loop;

  return pg_catalog.encode(
    pg_catalog.sha256(
      outer_pad
      || pg_catalog.sha256(
        inner_pad || pg_catalog.convert_to(message_value, 'UTF8')
      )
    ),
    'hex'
  );
end;
$$;

create or replace function public.guard_mock_giving_checkout_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.church_id is distinct from old.church_id
    or new.connection_id is distinct from old.connection_id
    or new.donor_id is distinct from old.donor_id
    or new.donation_id is distinct from old.donation_id
    or new.recurring_gift_id is distinct from old.recurring_gift_id
    or new.capability_sha256 is distinct from old.capability_sha256
    or new.payload_hmac_sha256 is distinct from old.payload_hmac_sha256
    or new.checkout_reference is distinct from old.checkout_reference
    or new.provider_payment_reference is distinct from old.provider_payment_reference
    or new.provider_schedule_reference is distinct from old.provider_schedule_reference
    or new.frequency is distinct from old.frequency
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at then
    raise exception 'MOCK_CHECKOUT_IDENTITY_IMMUTABLE'
      using errcode = '23514';
  end if;

  if old.status <> 'open'
    and (
      new.status is distinct from old.status
      or new.completion_payload_sha256
        is distinct from old.completion_payload_sha256
      or new.completed_at is distinct from old.completed_at
      or new.canceled_at is distinct from old.canceled_at
    ) then
    raise exception 'MOCK_CHECKOUT_TERMINAL_STATE_IMMUTABLE'
      using errcode = '23514';
  end if;
  if old.status = 'open'
    and new.status not in ('open', 'completed', 'canceled', 'expired') then
    raise exception 'MOCK_CHECKOUT_INVALID_STATE'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.reject_mock_giving_checkout_removal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'MOCK_CHECKOUT_HISTORY_IMMUTABLE'
    using errcode = '23514';
end;
$$;

create trigger mock_giving_checkout_sessions_guard_update
  before update on public.mock_giving_checkout_sessions
  for each row execute function public.guard_mock_giving_checkout_update();
create trigger mock_giving_checkout_sessions_set_updated_at
  before update on public.mock_giving_checkout_sessions
  for each row execute function public.set_updated_at();
create trigger mock_giving_checkout_sessions_no_delete
  before delete on public.mock_giving_checkout_sessions
  for each row execute function public.reject_mock_giving_checkout_removal();
create trigger mock_giving_checkout_sessions_no_truncate
  before truncate on public.mock_giving_checkout_sessions
  for each statement execute function public.reject_mock_giving_checkout_removal();

create or replace function public.lock_mock_giving_checkout_connection(
  target_checkout_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_session public.mock_giving_checkout_sessions%rowtype;
  target_donation public.donations%rowtype;
begin
  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = target_checkout_id;

  if not found then
    return false;
  end if;

  select donation.*
  into target_donation
  from public.donations donation
  where donation.church_id = target_session.church_id
    and donation.id = target_session.donation_id
    and donation.donor_id = target_session.donor_id
    and donation.payment_connection_id = target_session.connection_id
  for share;

  if not found then
    return false;
  end if;

  perform 1
  from public.churches church
  join public.payment_provider_connections connection
    on connection.church_id = church.id
    and connection.id = target_session.connection_id
  where church.id = target_session.church_id
    and church.status = 'active'
    and church.default_currency = target_donation.currency
    and church.default_currency in ('BBD', 'USD', 'CAD', 'XCD')
    and connection.provider = 'mock-development-gateway'
    and connection.status = 'active'
    and connection.is_primary
    and connection.charges_enabled
    and connection.payouts_enabled
    and church.default_currency = any(connection.supported_currencies)
    and connection.capabilities ->> 'environment' = 'development'
    and connection.capabilities ->> 'settlement_mode' = 'direct_to_church'
    and (
      target_session.frequency = 'one_time'
      or connection.recurring_enabled
    )
  for share of church, connection;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.close_mock_giving_checkout(
  target_checkout_id uuid,
  target_status text,
  closed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.mock_giving_checkout_sessions%rowtype;
begin
  if target_status not in ('canceled', 'expired') or closed_at is null then
    raise exception 'MOCK_CHECKOUT_INVALID_CLOSE'
      using errcode = '22023';
  end if;

  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = target_checkout_id
  for update;

  if not found or target_session.status <> 'open' then
    return;
  end if;

  update public.donations
  set status = 'canceled'
  where church_id = target_session.church_id
    and id = target_session.donation_id
    and status in ('pending', 'processing');

  if target_session.recurring_gift_id is not null then
    update public.recurring_gifts
    set
      status = 'canceled',
      started_at = coalesce(started_at, closed_at),
      canceled_at = closed_at
    where church_id = target_session.church_id
      and id = target_session.recurring_gift_id
      and status = 'incomplete';
  end if;

  update public.mock_giving_checkout_sessions
  set
    status = target_status,
    canceled_at = closed_at
  where id = target_session.id;

  update public.payment_provider_references
  set sanitized_metadata = jsonb_build_object(
    'environment', 'development',
    'checkout_status', target_status
  )
  where church_id = target_session.church_id
    and connection_id = target_session.connection_id
    and object_type = 'checkout_session'
    and external_reference = target_session.checkout_reference;
end;
$$;

create or replace function public.begin_mock_giving_checkout(
  church_slug text,
  capability_token uuid,
  target_kind text,
  target_id uuid,
  amount_minor bigint,
  frequency text,
  donor_display_name text,
  donor_email text
)
returns public.mock_giving_checkout_start_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_church public.churches%rowtype;
  target_connection public.payment_provider_connections%rowtype;
  selected_fund public.funds%rowtype;
  selected_campaign public.campaigns%rowtype;
  canonical_name text;
  canonical_email text;
  capability_hash text;
  payload_hmac text;
  existing_session public.mock_giving_checkout_sessions%rowtype;
  new_checkout_id uuid := gen_random_uuid();
  new_checkout_reference text;
  new_payment_reference text;
  new_schedule_reference text;
  new_donor_id uuid;
  new_recurring_id uuid;
  new_donation_id uuid;
  new_expires_at timestamptz := statement_timestamp() + interval '30 minutes';
  result_record public.mock_giving_checkout_start_result;
begin
  canonical_name := public.canonicalize_donor_display_name(donor_display_name);
  canonical_email := public.canonicalize_donor_email(donor_email);

  if capability_token is null
    or capability_token::text !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or church_slug is null
    or pg_catalog.char_length(church_slug) not between 2 and 63
    or church_slug <> pg_catalog.lower(church_slug)
    or church_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or target_kind is null
    or target_kind not in ('fund', 'campaign')
    or target_id is null
    or amount_minor is null
    or amount_minor not between 100 and 100000000
    or frequency is null
    or frequency not in ('one_time', 'weekly', 'monthly')
    or canonical_name is null
    or canonical_name is distinct from donor_display_name
    or pg_catalog.char_length(canonical_name) not between 2 and 120
    or public.donor_text_has_unsafe_formatting(canonical_name)
    or canonical_email is null
    or canonical_email is distinct from donor_email
    or not public.is_valid_donor_email(canonical_email) then
    raise exception 'MOCK_CHECKOUT_INVALID_REQUEST'
      using errcode = '22023';
  end if;

  select church.*
  into target_church
  from public.churches church
  where church.slug = church_slug
    and church.status = 'active'
    and church.default_currency in ('BBD', 'USD', 'CAD', 'XCD')
  limit 1
  for share;

  if not found then
    raise exception 'MOCK_CHECKOUT_UNAVAILABLE'
      using errcode = 'P0002';
  end if;

  select connection.*
  into target_connection
  from public.payment_provider_connections connection
  where connection.church_id = target_church.id
    and connection.provider = 'mock-development-gateway'
    and connection.status = 'active'
    and connection.is_primary
    and connection.charges_enabled
    and connection.payouts_enabled
    and target_church.default_currency = any(connection.supported_currencies)
    and connection.capabilities ->> 'environment' = 'development'
    and connection.capabilities ->> 'settlement_mode' = 'direct_to_church'
    and (frequency = 'one_time' or connection.recurring_enabled)
  limit 1
  for share;

  if not found then
    raise exception 'MOCK_CHECKOUT_UNAVAILABLE'
      using errcode = 'P0002';
  end if;

  capability_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(capability_token::text, 'UTF8')
    ),
    'hex'
  );
  payload_hmac := public.mock_hmac_sha256_hex(
    capability_token::text,
    jsonb_build_array(
      target_church.id,
      target_kind,
      target_id,
      amount_minor,
      target_church.default_currency,
      frequency,
      canonical_name,
      canonical_email
    )::text
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_church.id::text || ':' || capability_hash,
      0
    )
  );

  select checkout.*
  into existing_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.church_id = target_church.id
    and checkout.capability_sha256 = capability_hash;

  if found then
    if existing_session.payload_hmac_sha256 <> payload_hmac then
      raise exception 'MOCK_CHECKOUT_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;

    result_record.checkout_id := existing_session.id;
    result_record.donation_id := existing_session.donation_id;
    result_record.expires_at := existing_session.expires_at;
    result_record.replayed := true;
    return result_record;
  end if;

  if target_kind = 'fund' then
    select fund.*
    into selected_fund
    from public.funds fund
    where fund.church_id = target_church.id
      and fund.id = target_id
      and fund.status = 'active'
    limit 1
    for share;
    if not found then
      raise exception 'MOCK_CHECKOUT_UNAVAILABLE'
        using errcode = 'P0002';
    end if;
  else
    select campaign.*
    into selected_campaign
    from public.campaigns campaign
    join public.funds fund
      on fund.church_id = campaign.church_id
      and fund.id = campaign.fund_id
      and fund.status = 'active'
    where campaign.church_id = target_church.id
      and campaign.id = target_id
      and campaign.status = 'active'
      and campaign.currency = target_church.default_currency
      and (campaign.starts_at is null or campaign.starts_at <= statement_timestamp())
      and (campaign.ends_at is null or campaign.ends_at > statement_timestamp())
    limit 1
    for share of campaign, fund;
    if not found then
      raise exception 'MOCK_CHECKOUT_UNAVAILABLE'
        using errcode = 'P0002';
    end if;

    select fund.*
    into selected_fund
    from public.funds fund
    where fund.church_id = selected_campaign.church_id
      and fund.id = selected_campaign.fund_id
    for share;
  end if;

  new_checkout_reference :=
    'mock_checkout_' || pg_catalog.replace(new_checkout_id::text, '-', '');
  new_payment_reference :=
    'mock_payment_' || pg_catalog.replace(new_checkout_id::text, '-', '');
  new_schedule_reference := case
    when frequency = 'one_time' then null
    else 'mock_schedule_' || pg_catalog.replace(new_checkout_id::text, '-', '')
  end;

  insert into public.donors (
    church_id,
    auth_user_id,
    display_name,
    email,
    is_anonymous,
    profile_revision
  ) values (
    target_church.id,
    null,
    canonical_name,
    canonical_email,
    false,
    0
  ) returning id into new_donor_id;

  if frequency <> 'one_time' then
    insert into public.recurring_gifts (
      church_id,
      donor_id,
      fund_id,
      campaign_id,
      payment_connection_id,
      amount_minor,
      currency,
      frequency,
      status,
      provider_subscription_reference
    ) values (
      target_church.id,
      new_donor_id,
      selected_fund.id,
      selected_campaign.id,
      target_connection.id,
      amount_minor,
      target_church.default_currency,
      frequency::public.recurring_frequency,
      'incomplete',
      new_schedule_reference
    ) returning id into new_recurring_id;
  end if;

  insert into public.donations (
    church_id,
    donor_id,
    fund_id,
    campaign_id,
    recurring_gift_id,
    payment_connection_id,
    source,
    status,
    amount_minor,
    currency,
    provider_payment_reference,
    donor_display_name,
    donor_email,
    donor_message,
    external_idempotency_key
  ) values (
    target_church.id,
    new_donor_id,
    selected_fund.id,
    selected_campaign.id,
    new_recurring_id,
    target_connection.id,
    'online',
    'pending',
    amount_minor,
    target_church.default_currency,
    new_payment_reference,
    canonical_name,
    canonical_email,
    null,
    capability_hash
  ) returning id into new_donation_id;

  insert into public.payment_provider_references (
    church_id,
    connection_id,
    provider,
    object_type,
    external_reference,
    donation_id,
    sanitized_metadata
  ) values
    (
      target_church.id,
      target_connection.id,
      target_connection.provider,
      'checkout_session',
      new_checkout_reference,
      new_donation_id,
      jsonb_build_object(
        'environment', 'development',
        'checkout_status', 'open'
      )
    ),
    (
      target_church.id,
      target_connection.id,
      target_connection.provider,
      'payment',
      new_payment_reference,
      new_donation_id,
      jsonb_build_object('environment', 'development')
    );

  if new_recurring_id is not null then
    insert into public.payment_provider_references (
      church_id,
      connection_id,
      provider,
      object_type,
      external_reference,
      recurring_gift_id,
      sanitized_metadata
    ) values (
      target_church.id,
      target_connection.id,
      target_connection.provider,
      'subscription',
      new_schedule_reference,
      new_recurring_id,
      jsonb_build_object('environment', 'development')
    );
  end if;

  insert into public.mock_giving_checkout_sessions (
    id,
    church_id,
    connection_id,
    donor_id,
    donation_id,
    recurring_gift_id,
    capability_sha256,
    payload_hmac_sha256,
    checkout_reference,
    provider_payment_reference,
    provider_schedule_reference,
    frequency,
    expires_at
  ) values (
    new_checkout_id,
    target_church.id,
    target_connection.id,
    new_donor_id,
    new_donation_id,
    new_recurring_id,
    capability_hash,
    payload_hmac,
    new_checkout_reference,
    new_payment_reference,
    new_schedule_reference,
    frequency,
    new_expires_at
  );

  result_record.checkout_id := new_checkout_id;
  result_record.donation_id := new_donation_id;
  result_record.expires_at := new_expires_at;
  result_record.replayed := false;
  return result_record;
end;
$$;

create or replace function public.get_mock_giving_checkout(
  checkout_id uuid,
  capability_token uuid
)
returns setof public.mock_giving_checkout_record
language plpgsql
volatile
security definer
set search_path = ''
rows 1
as $$
declare
  capability_hash text;
  target_session public.mock_giving_checkout_sessions%rowtype;
begin
  if checkout_id is null or capability_token is null then
    return;
  end if;

  capability_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(capability_token::text, 'UTF8')
    ),
    'hex'
  );

  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = checkout_id
    and checkout.capability_sha256 = capability_hash
  for update;

  if not found then
    return;
  end if;

  if target_session.status = 'open'
    and target_session.expires_at <= statement_timestamp() then
    perform public.close_mock_giving_checkout(
      target_session.id,
      'expired',
      statement_timestamp()
    );
  end if;

  return query
  select
    checkout.id,
    church.slug,
    public.canonicalize_public_display_name(church.name),
    public.canonicalize_public_display_name(fund.name),
    case
      when campaign.id is null then null
      else public.canonicalize_public_display_name(campaign.name)
    end,
    donation.amount_minor::text,
    donation.currency,
    checkout.frequency,
    checkout.status,
    checkout.expires_at,
    checkout.provider_payment_reference,
    checkout.provider_schedule_reference,
    public.canonicalize_public_multiline_text(church.thank_you_message)
  from public.mock_giving_checkout_sessions checkout
  join public.churches church
    on church.id = checkout.church_id
  join public.donations donation
    on donation.church_id = checkout.church_id
    and donation.id = checkout.donation_id
  join public.funds fund
    on fund.church_id = donation.church_id
    and fund.id = donation.fund_id
  left join public.campaigns campaign
    on campaign.church_id = donation.church_id
    and campaign.id = donation.campaign_id
  where checkout.id = target_session.id;
end;
$$;

create or replace function public.cancel_mock_giving_checkout(
  checkout_id uuid,
  capability_token uuid
)
returns public.mock_giving_checkout_state_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  capability_hash text;
  target_session public.mock_giving_checkout_sessions%rowtype;
  result_record public.mock_giving_checkout_state_result;
begin
  if checkout_id is null or capability_token is null then
    raise exception 'MOCK_CHECKOUT_FORBIDDEN'
      using errcode = '42501';
  end if;

  capability_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(capability_token::text, 'UTF8')
    ),
    'hex'
  );

  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = checkout_id
    and checkout.capability_sha256 = capability_hash
  for update;

  if not found then
    raise exception 'MOCK_CHECKOUT_FORBIDDEN'
      using errcode = '42501';
  end if;

  if target_session.status = 'completed' then
    raise exception 'MOCK_CHECKOUT_INVALID_STATE'
      using errcode = '55000';
  end if;

  if target_session.status = 'open' then
    perform public.close_mock_giving_checkout(
      target_session.id,
      case
        when target_session.expires_at <= statement_timestamp() then 'expired'
        else 'canceled'
      end,
      statement_timestamp()
    );
    result_record.replayed := false;
  else
    result_record.replayed := true;
  end if;

  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = checkout_id;

  result_record.checkout_id := target_session.id;
  result_record.checkout_status := target_session.status;
  select donation.status::text
  into result_record.donation_status
  from public.donations donation
  where donation.id = target_session.donation_id;
  select recurring.status::text
  into result_record.recurring_status
  from public.recurring_gifts recurring
  where recurring.id = target_session.recurring_gift_id;
  return result_record;
end;
$$;

create or replace function public.complete_mock_giving_checkout(
  checkout_id uuid,
  capability_token uuid,
  raw_body text,
  signature text
)
returns public.mock_giving_checkout_completion_result
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  capability_hash text;
  expected_signature text;
  completion_hash text;
  webhook_payload jsonb;
  webhook_keys text[];
  target_session public.mock_giving_checkout_sessions%rowtype;
  processed_at timestamptz := statement_timestamp();
  processing_fee bigint;
  result_record public.mock_giving_checkout_completion_result;
begin
  if checkout_id is null
    or capability_token is null
    or raw_body is null
    or pg_catalog.octet_length(raw_body) not between 2 and 4096
    or signature is null
    or signature !~ '^[0-9a-f]{64}$' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end if;

  capability_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(capability_token::text, 'UTF8')
    ),
    'hex'
  );
  expected_signature := public.mock_hmac_sha256_hex(
    capability_token::text,
    raw_body
  );
  if signature <> expected_signature then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end if;

  begin
    webhook_payload := raw_body::jsonb;
  exception when others then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end;

  if pg_catalog.jsonb_typeof(webhook_payload) is distinct from 'object' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end if;
  select pg_catalog.array_agg(payload_key order by payload_key)
  into webhook_keys
  from pg_catalog.jsonb_object_keys(webhook_payload) payload_key;
  if webhook_keys is distinct from array[
    'checkoutId', 'eventId', 'paymentReference', 'type'
  ]::text[] then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end if;

  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = checkout_id
    and checkout.capability_sha256 = capability_hash
  for update;

  if not found then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(webhook_payload -> 'type')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'checkoutId')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'eventId')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'paymentReference')
      is distinct from 'string'
    or webhook_payload ->> 'type' is distinct from 'payment.succeeded'
    or webhook_payload ->> 'checkoutId' is distinct from checkout_id::text
    or webhook_payload ->> 'eventId' is distinct from
      'mock_event_' || pg_catalog.replace(checkout_id::text, '-', '')
    or webhook_payload ->> 'paymentReference' is distinct from
      target_session.provider_payment_reference then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
      using errcode = '22023';
  end if;

  completion_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_body, 'UTF8')),
    'hex'
  );

  if target_session.status = 'completed' then
    if target_session.completion_payload_sha256 <> completion_hash then
      raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK'
        using errcode = '22023';
    end if;
    result_record.replayed := true;
  elsif target_session.status in ('canceled', 'expired') then
    result_record.replayed := true;
  elsif target_session.expires_at <= processed_at then
    perform public.close_mock_giving_checkout(
      target_session.id,
      'expired',
      processed_at
    );
    result_record.replayed := false;
  else
    if not public.lock_mock_giving_checkout_connection(target_session.id) then
      raise exception 'MOCK_CHECKOUT_UNAVAILABLE'
        using errcode = 'P0002';
    end if;

    select least(
      donation.amount_minor,
      pg_catalog.round(donation.amount_minor::numeric * 0.029)::bigint + 30
    )
    into processing_fee
    from public.donations donation
    where donation.id = target_session.donation_id;

    update public.donations
    set
      status = 'succeeded',
      processing_fee_minor = processing_fee,
      payment_method_brand = 'Visa',
      payment_method_last4 = '4242',
      donated_at = processed_at
    where church_id = target_session.church_id
      and id = target_session.donation_id
      and status = 'pending';

    if not found then
      raise exception 'MOCK_CHECKOUT_INVALID_STATE'
        using errcode = '55000';
    end if;

    if target_session.recurring_gift_id is not null then
      update public.recurring_gifts
      set
        status = 'active',
        payment_method_brand = 'Visa',
        payment_method_last4 = '4242',
        started_at = processed_at,
        next_charge_at = case frequency
          when 'weekly' then processed_at + interval '7 days'
          else processed_at + interval '1 month'
        end
      where church_id = target_session.church_id
        and id = target_session.recurring_gift_id
        and status = 'incomplete';

      if not found then
        raise exception 'MOCK_CHECKOUT_INVALID_STATE'
          using errcode = '55000';
      end if;
    end if;

    update public.donors
    set last_gave_at = processed_at
    where church_id = target_session.church_id
      and id = target_session.donor_id;

    update public.mock_giving_checkout_sessions
    set
      status = 'completed',
      completion_payload_sha256 = completion_hash,
      completed_at = processed_at
    where id = target_session.id;

    update public.payment_provider_references
    set sanitized_metadata = jsonb_build_object(
      'environment', 'development',
      'checkout_status', 'completed'
    )
    where church_id = target_session.church_id
      and connection_id = target_session.connection_id
      and object_type = 'checkout_session'
      and external_reference = target_session.checkout_reference;

    result_record.replayed := false;
  end if;

  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = checkout_id;

  result_record.checkout_id := target_session.id;
  result_record.checkout_status := target_session.status;
  select donation.status::text
  into result_record.donation_status
  from public.donations donation
  where donation.id = target_session.donation_id;
  select recurring.status::text
  into result_record.recurring_status
  from public.recurring_gifts recurring
  where recurring.id = target_session.recurring_gift_id;
  return result_record;
end;
$$;

comment on function public.begin_mock_giving_checkout(
  text, uuid, text, uuid, bigint, text, text, text
) is
  'Server-only creation of one exact idempotent development mock checkout, guest donor, pending donation, optional incomplete recurring gift, and safe provider references. Prayer data is not accepted.';
comment on function public.get_mock_giving_checkout(uuid, uuid) is
  'Returns the minimum capability-guarded mock checkout snapshot and expires an overdue open simulation.';
comment on function public.cancel_mock_giving_checkout(uuid, uuid) is
  'Capability-guards and idempotently cancels one open development-only mock checkout.';
comment on function public.complete_mock_giving_checkout(
  uuid, uuid, text, text
) is
  'Verifies one capability-keyed HMAC mock webhook and applies the temporary P18 success transition without persisting raw payloads; P19 owns the durable webhook journal.';

revoke all privileges on table public.mock_giving_checkout_sessions
  from public, anon, authenticated, service_role;

revoke all on type
  public.mock_giving_checkout_start_result,
  public.mock_giving_checkout_record,
  public.mock_giving_checkout_state_result,
  public.mock_giving_checkout_completion_result
  from public, anon, authenticated, service_role;
grant usage on type
  public.mock_giving_checkout_start_result
  to service_role;
grant usage on type
  public.mock_giving_checkout_record,
  public.mock_giving_checkout_state_result,
  public.mock_giving_checkout_completion_result
  to anon;

revoke all on function
  public.mock_hmac_sha256_hex(text, text),
  public.guard_mock_giving_checkout_update(),
  public.reject_mock_giving_checkout_removal(),
  public.lock_mock_giving_checkout_connection(uuid),
  public.close_mock_giving_checkout(uuid, text, timestamptz),
  public.begin_mock_giving_checkout(
    text, uuid, text, uuid, bigint, text, text, text
  ),
  public.get_mock_giving_checkout(uuid, uuid),
  public.cancel_mock_giving_checkout(uuid, uuid),
  public.complete_mock_giving_checkout(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.begin_mock_giving_checkout(
    text, uuid, text, uuid, bigint, text, text, text
  )
  to service_role;

grant execute on function
  public.get_mock_giving_checkout(uuid, uuid),
  public.cancel_mock_giving_checkout(uuid, uuid),
  public.complete_mock_giving_checkout(uuid, uuid, text, text)
  to anon;

commit;
