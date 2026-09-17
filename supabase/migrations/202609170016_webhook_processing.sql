begin;

-- P19 turns the P18 signed mock callback into a durable, replay-safe webhook
-- boundary. Raw request bodies, donor identity, prayer text, and payment secrets
-- are never persisted. Live payment processing remains disabled.

alter type public.mock_giving_checkout_record
  add attribute created_at timestamptz;

alter type public.mock_giving_checkout_completion_result
  add attribute webhook_event_id uuid,
  add attribute webhook_status text,
  add attribute webhook_outcome text;

alter table public.webhook_events
  add column donation_id uuid,
  add column event_occurred_at timestamptz,
  add column delivery_count integer,
  add column last_received_at timestamptz,
  add column processing_outcome text,
  add column audit_log_id bigint;

-- Preserve any pre-P19 operational rows without claiming that their historic
-- payload hash or outcome came from a verified provider delivery.
update public.webhook_events
set
  payload_sha256 = case
    when payload_sha256 ~ '^[0-9a-f]{64}$' then payload_sha256
    else pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(sanitized_payload::text, 'UTF8')
      ),
      'hex'
    )
  end,
  event_occurred_at = coalesce(event_occurred_at, received_at),
  delivery_count = coalesce(delivery_count, 1),
  last_received_at = coalesce(last_received_at, received_at),
  processing_started_at = case
    when status in ('processing', 'processed', 'failed', 'ignored')
      then coalesce(processing_started_at, received_at)
    else processing_started_at
  end,
  processed_at = case
    when status in ('processed', 'ignored')
      then coalesce(processed_at, updated_at, received_at)
    else processed_at
  end,
  processing_outcome = case status
    when 'processed' then coalesce(processing_outcome, 'legacy_processed')
    when 'ignored' then coalesce(processing_outcome, 'legacy_ignored')
    when 'failed' then coalesce(processing_outcome, 'handler_failed')
    else processing_outcome
  end,
  last_error = case
    when status = 'failed' then 'LEGACY_HANDLER_FAILED'
    when last_error ~ '^[A-Z][A-Z0-9_]{0,95}$' then last_error
    else null
  end;

alter table public.webhook_events
  alter column payload_sha256 set not null,
  alter column event_occurred_at set not null,
  alter column delivery_count set default 1,
  alter column delivery_count set not null,
  alter column last_received_at set default statement_timestamp(),
  alter column last_received_at set not null,
  add constraint webhook_events_donation_tenant_fkey
    foreign key (church_id, donation_id)
    references public.donations(church_id, id) on delete restrict,
  add constraint webhook_events_payload_hash_check check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add constraint webhook_events_delivery_positive check (
    delivery_count >= 1
  ),
  add constraint webhook_events_delivery_times_valid check (
    last_received_at >= received_at
  ),
  add constraint webhook_events_mock_route_complete check (
    lower(provider) <> 'mock-development-gateway'
    or (
      church_id is not null
      and connection_id is not null
      and donation_id is not null
    )
  ),
  add constraint webhook_events_outcome_check check (
    processing_outcome is null
    or processing_outcome in (
      'donation_succeeded',
      'donation_failed',
      'ignored_older_event',
      'ignored_terminal_state',
      'handler_failed',
      'legacy_processed',
      'legacy_ignored'
    )
  ),
  add constraint webhook_events_status_outcome_consistent check ((
    (status in ('received', 'processing') and processing_outcome is null)
    or (
      status = 'processed'
      and processing_outcome in (
        'donation_succeeded', 'donation_failed', 'legacy_processed'
      )
      and processed_at is not null
    )
    or (
      status = 'ignored'
      and processing_outcome in (
        'ignored_older_event', 'ignored_terminal_state', 'legacy_ignored'
      )
      and processed_at is not null
    )
    or (
      status = 'failed'
      and processing_outcome = 'handler_failed'
      and last_error is not null
    )
  ) is true),
  add constraint webhook_events_last_error_safe check (
    last_error is null or last_error ~ '^[A-Z][A-Z0-9_]{0,95}$'
  ),
  add constraint webhook_events_audit_log_fkey
    foreign key (audit_log_id) references public.audit_logs(id)
    on delete restrict;

create index webhook_events_donation_fk_idx
  on public.webhook_events (church_id, donation_id, event_occurred_at desc)
  where donation_id is not null;
create unique index webhook_events_audit_log_unique_idx
  on public.webhook_events (audit_log_id)
  where audit_log_id is not null;

alter table public.donations
  add column provider_event_reference text,
  add column provider_event_type text,
  add column provider_event_occurred_at timestamptz,
  add column provider_terminal_audit_log_id bigint,
  add constraint donations_provider_event_watermark_check check ((
    (
      provider_event_reference is null
      and provider_event_type is null
      and provider_event_occurred_at is null
    )
    or (
      nullif(btrim(provider_event_reference), '') is not null
      and provider_event_type is not null
      and provider_event_type in ('payment.succeeded', 'payment.failed')
      and provider_event_occurred_at is not null
    )
  ) is true),
  add constraint donations_provider_terminal_audit_fkey
    foreign key (provider_terminal_audit_log_id)
    references public.audit_logs(id) on delete restrict,
  add constraint donations_provider_terminal_audit_has_event check (
    provider_terminal_audit_log_id is null
    or provider_event_reference is not null
  );

create unique index donations_provider_terminal_audit_unique_idx
  on public.donations (provider_terminal_audit_log_id)
  where provider_terminal_audit_log_id is not null;

comment on column public.webhook_events.sanitized_payload is
  'Allowlisted identifiers and provider-state fields only. Raw bodies, donor identity, prayer text, card data, and secrets are prohibited.';
comment on column public.webhook_events.delivery_count is
  'Number of byte-identical deliveries observed for this immutable provider event identity.';
comment on column public.webhook_events.audit_log_id is
  'The single append-only audit row created only when this event caused the donation first to enter a terminal provider state.';
comment on column public.donations.provider_event_occurred_at is
  'Provider event-time watermark used to reject stale transitions. Equal timestamps prefer success over failure.';
comment on column public.donations.provider_terminal_audit_log_id is
  'The one audit row recorded on the donation first entering succeeded or failed through verified webhook processing.';

alter table public.webhook_events force row level security;

create or replace function public.webhook_sanitized_payload_is_safe(
  candidate jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    pg_catalog.jsonb_typeof(candidate) = 'object'
    and (
      select pg_catalog.array_agg(entry.key order by entry.key)
      from pg_catalog.jsonb_each(candidate) entry
    ) = array[
      'checkout_id',
      'donation_id',
      'event_occurred_at',
      'payment_reference'
    ]::text[]
    and pg_catalog.jsonb_typeof(candidate -> 'checkout_id') = 'string'
    and pg_catalog.jsonb_typeof(candidate -> 'donation_id') = 'string'
    and pg_catalog.jsonb_typeof(candidate -> 'event_occurred_at') = 'string'
    and pg_catalog.jsonb_typeof(candidate -> 'payment_reference') = 'string'
    and (candidate ->> 'checkout_id') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'donation_id') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (candidate ->> 'event_occurred_at') ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    and (candidate ->> 'payment_reference') ~
      '^mock_payment_[0-9a-f]{32}$'
    and pg_catalog.octet_length(candidate::text) <= 1024
  ), false);
$$;

alter table public.webhook_events
  add constraint webhook_events_sanitized_payload_safe check (
    lower(provider) <> 'mock-development-gateway'
    or public.webhook_sanitized_payload_is_safe(sanitized_payload) is true
  );

create or replace function public.guard_webhook_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.church_id is distinct from old.church_id
    or new.connection_id is distinct from old.connection_id
    or new.donation_id is distinct from old.donation_id
    or new.provider is distinct from old.provider
    or new.external_event_reference is distinct from old.external_event_reference
    or new.event_type is distinct from old.event_type
    or new.payload_sha256 is distinct from old.payload_sha256
    or new.sanitized_payload is distinct from old.sanitized_payload
    or new.event_occurred_at is distinct from old.event_occurred_at
    or new.received_at is distinct from old.received_at
    or new.created_at is distinct from old.created_at then
    raise exception 'WEBHOOK_EVENT_IDENTITY_IMMUTABLE'
      using errcode = '23514';
  end if;

  if new.delivery_count < old.delivery_count
    or new.last_received_at < old.last_received_at
    or new.attempt_count < old.attempt_count then
    raise exception 'WEBHOOK_EVENT_COUNTERS_CANNOT_REGRESS'
      using errcode = '23514';
  end if;

  if old.audit_log_id is not null
    and new.audit_log_id is distinct from old.audit_log_id then
    raise exception 'WEBHOOK_EVENT_AUDIT_IMMUTABLE'
      using errcode = '23514';
  end if;

  if old.status in ('processed', 'ignored') and (
    new.status is distinct from old.status
    or new.processing_outcome is distinct from old.processing_outcome
    or new.processing_started_at is distinct from old.processing_started_at
    or new.processed_at is distinct from old.processed_at
    or new.next_retry_at is distinct from old.next_retry_at
    or new.last_error is distinct from old.last_error
    or new.audit_log_id is distinct from old.audit_log_id
  ) then
    raise exception 'WEBHOOK_EVENT_TERMINAL_STATE_IMMUTABLE'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.reject_webhook_event_removal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WEBHOOK_EVENT_HISTORY_IMMUTABLE'
    using errcode = '23514';
end;
$$;

create or replace function public.guard_donation_provider_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.provider_event_occurred_at is not null then
    if new.provider_event_occurred_at is null
      or new.provider_event_occurred_at < old.provider_event_occurred_at then
      raise exception 'DONATION_PROVIDER_EVENT_WATERMARK_CANNOT_REGRESS'
        using errcode = '23514';
    end if;

    if new.provider_event_occurred_at = old.provider_event_occurred_at
      and old.provider_event_type = 'payment.succeeded'
      and new.provider_event_type is distinct from old.provider_event_type then
      raise exception 'DONATION_PROVIDER_SUCCESS_CANNOT_BE_DOWNGRADED'
        using errcode = '23514';
    end if;
  end if;

  if old.provider_terminal_audit_log_id is not null
    and new.provider_terminal_audit_log_id
      is distinct from old.provider_terminal_audit_log_id then
    raise exception 'DONATION_PROVIDER_TERMINAL_AUDIT_IMMUTABLE'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists webhook_events_keep_routing on public.webhook_events;
drop trigger if exists webhook_events_guard_update on public.webhook_events;
drop trigger if exists webhook_events_no_delete on public.webhook_events;
drop trigger if exists webhook_events_no_truncate on public.webhook_events;

create trigger webhook_events_guard_update
  before update on public.webhook_events
  for each row execute function public.guard_webhook_event_update();
create trigger webhook_events_no_delete
  before delete on public.webhook_events
  for each row execute function public.reject_webhook_event_removal();
create trigger webhook_events_no_truncate
  before truncate on public.webhook_events
  for each statement execute function public.reject_webhook_event_removal();
create trigger donations_guard_provider_event_update
  before update on public.donations
  for each row execute function public.guard_donation_provider_event_update();

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
    public.canonicalize_public_multiline_text(church.thank_you_message),
    checkout.created_at
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

-- This routine is intentionally not an API RPC. The granted completion wrapper
-- owns verification, event insertion, and the checkout -> event lock before
-- this processor takes the donation (then optional recurring-gift) lock.
create or replace function public.process_mock_giving_webhook_event(
  target_checkout_id uuid,
  target_webhook_event_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_session public.mock_giving_checkout_sessions%rowtype;
  target_event public.webhook_events%rowtype;
  target_donation public.donations%rowtype;
  processing_fee bigint;
  inserted_audit_log_id bigint;
  should_record_terminal_audit boolean := false;
  event_result text;
begin
  -- Required global lock order: checkout -> webhook event -> donation ->
  -- recurring gift. Re-locking rows already held by the wrapper is harmless.
  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = target_checkout_id
  for update;

  if not found then
    raise exception 'MOCK_CHECKOUT_INVALID_STATE' using errcode = '55000';
  end if;

  select event.*
  into target_event
  from public.webhook_events event
  where event.id = target_webhook_event_id
    and event.church_id = target_session.church_id
    and event.connection_id = target_session.connection_id
    and event.donation_id = target_session.donation_id
    and event.status = 'processing'
  for update;

  if not found then
    raise exception 'MOCK_CHECKOUT_INVALID_STATE' using errcode = '55000';
  end if;

  select donation.*
  into target_donation
  from public.donations donation
  where donation.church_id = target_session.church_id
    and donation.id = target_session.donation_id
    and donation.donor_id = target_session.donor_id
    and donation.payment_connection_id = target_session.connection_id
  for update;

  if not found then
    raise exception 'MOCK_CHECKOUT_INVALID_STATE' using errcode = '55000';
  end if;

  if target_session.status in ('completed', 'canceled', 'expired')
    or target_donation.status in (
      'succeeded', 'partially_refunded', 'refunded', 'disputed', 'canceled'
    ) then
    return 'ignored_terminal_state';
  end if;

  if target_session.expires_at <= statement_timestamp() then
    perform public.close_mock_giving_checkout(
      target_session.id,
      'expired',
      statement_timestamp()
    );
    return 'ignored_terminal_state';
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
    and lower(connection.provider) = 'mock-development-gateway'
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
    raise exception 'MOCK_CHECKOUT_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if target_donation.provider_event_occurred_at is not null and (
    target_event.event_occurred_at
      < target_donation.provider_event_occurred_at
    or (
      target_event.event_occurred_at
        = target_donation.provider_event_occurred_at
      and target_event.event_type = 'payment.failed'
      and target_donation.provider_event_type = 'payment.succeeded'
    )
    or (
      target_event.event_occurred_at
        = target_donation.provider_event_occurred_at
      and target_event.event_type = target_donation.provider_event_type
    )
  ) then
    return 'ignored_older_event';
  end if;

  if target_event.event_type = 'payment.failed' then
    if target_donation.status not in ('pending', 'processing', 'failed') then
      return 'ignored_terminal_state';
    end if;

    should_record_terminal_audit :=
      target_donation.status in ('pending', 'processing')
      and target_donation.provider_terminal_audit_log_id is null;

    if should_record_terminal_audit then
      inserted_audit_log_id := public.append_audit_event(
        target_session.church_id,
        'webhook',
        'webhook_processed',
        'webhook_event',
        target_event.id::text,
        null,
        null,
        null,
        pg_catalog.jsonb_build_object(
          'webhook_event_id', target_event.id,
          'event_type', target_event.event_type,
          'result', 'donation_failed'
        )
      );
    end if;

    update public.donations
    set
      status = 'failed',
      failure_code = 'mock_payment_failed',
      failure_message = 'Mock development payment failed.',
      failed_at = target_event.event_occurred_at,
      provider_event_reference = target_event.external_event_reference,
      provider_event_type = target_event.event_type,
      provider_event_occurred_at = target_event.event_occurred_at,
      provider_terminal_audit_log_id = coalesce(
        provider_terminal_audit_log_id,
        inserted_audit_log_id
      )
    where id = target_donation.id;

    event_result := 'donation_failed';
  elsif target_event.event_type = 'payment.succeeded' then
    if target_donation.status not in ('pending', 'processing', 'failed') then
      return 'ignored_terminal_state';
    end if;

    should_record_terminal_audit :=
      target_donation.status in ('pending', 'processing')
      and target_donation.provider_terminal_audit_log_id is null;

    if should_record_terminal_audit then
      inserted_audit_log_id := public.append_audit_event(
        target_session.church_id,
        'webhook',
        'webhook_processed',
        'webhook_event',
        target_event.id::text,
        null,
        null,
        null,
        pg_catalog.jsonb_build_object(
          'webhook_event_id', target_event.id,
          'event_type', target_event.event_type,
          'result', 'donation_succeeded'
        )
      );
    end if;

    select least(
      target_donation.amount_minor,
      pg_catalog.round(target_donation.amount_minor::numeric * 0.029)::bigint
        + 30
    )
    into processing_fee;

    update public.donations
    set
      status = 'succeeded',
      processing_fee_minor = processing_fee,
      payment_method_brand = 'Visa',
      payment_method_last4 = '4242',
      failure_code = null,
      failure_message = null,
      failed_at = null,
      donated_at = target_event.event_occurred_at,
      provider_event_reference = target_event.external_event_reference,
      provider_event_type = target_event.event_type,
      provider_event_occurred_at = target_event.event_occurred_at,
      provider_terminal_audit_log_id = coalesce(
        provider_terminal_audit_log_id,
        inserted_audit_log_id
      )
    where id = target_donation.id;

    if target_session.recurring_gift_id is not null then
      perform 1
      from public.recurring_gifts recurring
      where recurring.church_id = target_session.church_id
        and recurring.id = target_session.recurring_gift_id
      for update;

      update public.recurring_gifts
      set
        status = 'active',
        payment_method_brand = 'Visa',
        payment_method_last4 = '4242',
        started_at = target_event.event_occurred_at,
        next_charge_at = case frequency
          when 'weekly' then target_event.event_occurred_at + interval '7 days'
          else target_event.event_occurred_at + interval '1 month'
        end
      where church_id = target_session.church_id
        and id = target_session.recurring_gift_id
        and status = 'incomplete';

      if not found then
        raise exception 'MOCK_CHECKOUT_INVALID_STATE' using errcode = '55000';
      end if;
    end if;

    update public.donors
    set last_gave_at = case
      when last_gave_at is null then target_event.event_occurred_at
      else greatest(last_gave_at, target_event.event_occurred_at)
    end
    where church_id = target_session.church_id
      and id = target_session.donor_id;

    update public.mock_giving_checkout_sessions
    set
      status = 'completed',
      completion_payload_sha256 = target_event.payload_sha256,
      completed_at = statement_timestamp()
    where id = target_session.id
      and status = 'open';

    if not found then
      raise exception 'MOCK_CHECKOUT_INVALID_STATE' using errcode = '55000';
    end if;

    update public.payment_provider_references
    set sanitized_metadata = pg_catalog.jsonb_build_object(
      'environment', 'development',
      'checkout_status', 'completed'
    )
    where church_id = target_session.church_id
      and connection_id = target_session.connection_id
      and object_type = 'checkout_session'
      and external_reference = target_session.checkout_reference;

    event_result := 'donation_succeeded';
  else
    raise exception 'MOCK_CHECKOUT_INVALID_STATE' using errcode = '55000';
  end if;

  if inserted_audit_log_id is not null then
    update public.webhook_events
    set audit_log_id = inserted_audit_log_id
    where id = target_event.id;
  end if;

  return event_result;
end;
$$;

create or replace function public.process_mock_giving_webhook_core(
  checkout_id uuid,
  capability_token uuid,
  raw_body text,
  signature text,
  verified_payload_sha256 text
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
  payload_hash text;
  webhook_payload jsonb;
  webhook_keys text[];
  raw_key_count integer;
  event_occurred_at timestamptz;
  safe_payload jsonb;
  target_session public.mock_giving_checkout_sessions%rowtype;
  target_event public.webhook_events%rowtype;
  event_was_inserted boolean := false;
  event_was_replayed boolean := false;
  event_identity_count integer;
  processing_result text;
  safe_handler_error text;
  result_record public.mock_giving_checkout_completion_result;
begin
  if checkout_id is null
    or capability_token is null
    or raw_body is null
    or pg_catalog.octet_length(raw_body) not between 2 and 4096
    or signature is null
    or signature !~ '^[0-9a-f]{64}$'
    or (
      verified_payload_sha256 is not null
      and verified_payload_sha256 !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
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
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  begin
    webhook_payload := raw_body::jsonb;
  exception when others then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end;

  if pg_catalog.jsonb_typeof(webhook_payload) is distinct from 'object' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;
  -- Enumerate the original json value, rather than jsonb, so duplicate keys
  -- remain visible even when a key uses an escaped spelling such as typ\u0065.
  select
    count(*)::integer,
    pg_catalog.array_agg(raw_entry.key order by raw_entry.key)
  into raw_key_count, webhook_keys
  from pg_catalog.json_each(raw_body::json) raw_entry;
  if raw_key_count <> 5 or webhook_keys is distinct from array[
    'checkoutId', 'eventId', 'occurredAt', 'paymentReference', 'type'
  ]::text[] then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(webhook_payload -> 'type')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'checkoutId')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'eventId')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'occurredAt')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(webhook_payload -> 'paymentReference')
      is distinct from 'string'
    or webhook_payload ->> 'type' not in (
      'payment.succeeded', 'payment.failed'
    )
    or webhook_payload ->> 'checkoutId' is distinct from checkout_id::text
    or webhook_payload ->> 'eventId' !~ '^mock_event_[0-9a-f]{32}$'
    or webhook_payload ->> 'occurredAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or webhook_payload ->> 'paymentReference' !~
      '^mock_payment_[0-9a-f]{32}$' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  begin
    event_occurred_at := (webhook_payload ->> 'occurredAt')::timestamptz;
  exception when others then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end;

  if pg_catalog.to_char(
      event_occurred_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) is distinct from webhook_payload ->> 'occurredAt' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  -- First lock: checkout. Every webhook path follows this same order.
  select checkout.*
  into target_session
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = checkout_id
    and checkout.capability_sha256 = capability_hash
  for update;

  if not found or webhook_payload ->> 'paymentReference'
      is distinct from target_session.provider_payment_reference then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  if event_occurred_at < pg_catalog.date_trunc(
      'milliseconds', target_session.created_at
    )
    or event_occurred_at > target_session.expires_at then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  payload_hash := coalesce(
    verified_payload_sha256,
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(raw_body, 'UTF8')),
      'hex'
    )
  );
  safe_payload := pg_catalog.jsonb_build_object(
    'checkout_id', target_session.id,
    'donation_id', target_session.donation_id,
    'event_occurred_at',
      pg_catalog.to_char(
        event_occurred_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
    'payment_reference', target_session.provider_payment_reference
  );

  -- Second lock: an existing provider identity. Exact-ID deliveries bypass
  -- the per-checkout identity cap and proceed to fingerprint comparison.
  select event.*
  into target_event
  from public.webhook_events event
  where lower(event.provider) = 'mock-development-gateway'
    and event.external_event_reference = webhook_payload ->> 'eventId'
  for update;

  if found then
    event_was_inserted := false;
  else
    -- The checkout row lock serializes new identities for this checkout. Bound
    -- the mock-only journal before insertion so a leaked capability cannot
    -- create unbounded immutable history. Existing exact IDs remain replayable.
    select count(*)::integer
    into event_identity_count
    from public.webhook_events event
    where event.church_id = target_session.church_id
      and event.connection_id = target_session.connection_id
      and event.donation_id = target_session.donation_id
      and lower(event.provider) = 'mock-development-gateway'
      and event.sanitized_payload ->> 'checkout_id' = target_session.id::text;

    if event_identity_count >= 4 then
      raise exception 'MOCK_WEBHOOK_EVENT_LIMIT' using errcode = '54000';
    end if;

    insert into public.webhook_events (
      church_id,
      connection_id,
      donation_id,
      provider,
      external_event_reference,
      event_type,
      status,
      payload_sha256,
      sanitized_payload,
      attempt_count,
      received_at,
      event_occurred_at,
      delivery_count,
      last_received_at
    ) values (
      target_session.church_id,
      target_session.connection_id,
      target_session.donation_id,
      'mock-development-gateway',
      webhook_payload ->> 'eventId',
      webhook_payload ->> 'type',
      'received',
      payload_hash,
      safe_payload,
      0,
      statement_timestamp(),
      event_occurred_at,
      1,
      statement_timestamp()
    )
    on conflict do nothing
    returning * into target_event;

    event_was_inserted := found;
    if not event_was_inserted then
      -- A cross-checkout race can still claim the global provider identity.
      select event.*
      into target_event
      from public.webhook_events event
      where lower(event.provider) = 'mock-development-gateway'
        and event.external_event_reference = webhook_payload ->> 'eventId'
      for update;
    end if;
  end if;

  if not event_was_inserted then
    -- Compare the complete immutable fingerprint before changing even a
    -- delivery counter.
    if target_event.id is null
      or target_event.church_id is distinct from target_session.church_id
      or target_event.connection_id is distinct from target_session.connection_id
      or target_event.donation_id is distinct from target_session.donation_id
      or target_event.event_type is distinct from webhook_payload ->> 'type'
      or target_event.event_occurred_at is distinct from event_occurred_at
      or target_event.payload_sha256 is distinct from payload_hash
      or target_event.sanitized_payload is distinct from safe_payload then
      raise exception 'MOCK_WEBHOOK_EVENT_COLLISION' using errcode = '23505';
    end if;

    update public.webhook_events
    set
      delivery_count = delivery_count + 1,
      last_received_at = statement_timestamp()
    where id = target_event.id
    returning * into target_event;
    event_was_replayed := true;

    if target_event.status in ('processed', 'ignored') then
      result_record.checkout_id := target_session.id;
      result_record.webhook_event_id := target_event.id;
      result_record.webhook_status := target_event.status::text;
      result_record.webhook_outcome := target_event.processing_outcome;
      result_record.replayed := true;

      select checkout.status
      into result_record.checkout_status
      from public.mock_giving_checkout_sessions checkout
      where checkout.id = target_session.id;
      select donation.status::text
      into result_record.donation_status
      from public.donations donation
      where donation.id = target_session.donation_id;
      select recurring.status::text
      into result_record.recurring_status
      from public.recurring_gifts recurring
      where recurring.id = target_session.recurring_gift_id;
      return result_record;
    end if;
  end if;

  update public.webhook_events
  set
    status = 'processing',
    processing_outcome = null,
    attempt_count = attempt_count + 1,
    processing_started_at = statement_timestamp(),
    processed_at = null,
    next_retry_at = null,
    last_error = null
  where id = target_event.id
  returning * into target_event;

  -- The nested block is a PostgreSQL subtransaction. Any donation, recurring,
  -- checkout, or audit mutation is rolled back on handler error while the
  -- already-verified outer journal row remains available to mark as failed.
  begin
    processing_result := public.process_mock_giving_webhook_event(
      target_session.id,
      target_event.id
    );

    update public.webhook_events
    set
      status = case
        when processing_result like 'ignored_%'
          then 'ignored'::public.webhook_processing_status
        else 'processed'::public.webhook_processing_status
      end,
      processing_outcome = processing_result,
      processed_at = statement_timestamp(),
      next_retry_at = null,
      last_error = null
    where id = target_event.id
    returning * into target_event;
  exception when others then
    safe_handler_error := case sqlerrm
      when 'MOCK_CHECKOUT_UNAVAILABLE' then 'MOCK_CHECKOUT_UNAVAILABLE'
      when 'MOCK_CHECKOUT_INVALID_STATE' then 'MOCK_CHECKOUT_INVALID_STATE'
      else 'MOCK_WEBHOOK_HANDLER_FAILED'
    end;

    update public.webhook_events
    set
      status = 'failed',
      processing_outcome = 'handler_failed',
      processed_at = null,
      next_retry_at = null,
      last_error = safe_handler_error
    where id = target_event.id
    returning * into target_event;
  end;

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
  result_record.webhook_event_id := target_event.id;
  result_record.webhook_status := target_event.status::text;
  result_record.webhook_outcome := target_event.processing_outcome;
  result_record.replayed := event_was_replayed;
  return result_record;
end;
$$;

-- The P19 API boundary accepts only the five-key provider envelope. The
-- private core derives the immutable identity hash from these exact bytes.
create or replace function public.process_mock_giving_webhook(
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
begin
  return public.process_mock_giving_webhook_core(
    checkout_id,
    capability_token,
    raw_body,
    signature,
    null
  );
end;
$$;

-- Keep the already-deployed P18 Production demo operational while it shares
-- the Development backend. This compatibility wrapper accepts only the exact
-- deterministic four-key P18 success event. The P19 Preview path uses the
-- separately granted service-role RPC above. P39 removes this wrapper after
-- Production and Preview have separate backends and secrets.
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
  legacy_payload jsonb;
  legacy_keys text[];
  raw_key_count integer;
  target_session public.mock_giving_checkout_sessions%rowtype;
  p19_body text;
  legacy_payload_hash text;
  legacy_was_terminal boolean := false;
  result_record public.mock_giving_checkout_completion_result;
begin
  if checkout_id is null
    or capability_token is null
    or raw_body is null
    or pg_catalog.octet_length(raw_body) not between 2 and 4096
    or signature is null
    or signature !~ '^[0-9a-f]{64}$' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  expected_signature := public.mock_hmac_sha256_hex(
    capability_token::text,
    raw_body
  );
  if signature <> expected_signature then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  -- Preserve the exact signed P18 bytes as the immutable event identity even
  -- though processing uses the derived five-key P19 envelope below.
  legacy_payload_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_body, 'UTF8')),
    'hex'
  );

  begin
    legacy_payload := raw_body::jsonb;
  exception when others then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end;

  if pg_catalog.jsonb_typeof(legacy_payload) is distinct from 'object' then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;
  select
    count(*)::integer,
    pg_catalog.array_agg(raw_entry.key order by raw_entry.key)
  into raw_key_count, legacy_keys
  from pg_catalog.json_each(raw_body::json) raw_entry;
  if raw_key_count <> 4 or legacy_keys is distinct from array[
    'checkoutId', 'eventId', 'paymentReference', 'type'
  ]::text[] then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(legacy_payload -> 'type')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(legacy_payload -> 'checkoutId')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(legacy_payload -> 'eventId')
      is distinct from 'string'
    or pg_catalog.jsonb_typeof(legacy_payload -> 'paymentReference')
      is distinct from 'string'
    or legacy_payload ->> 'type' is distinct from 'payment.succeeded'
    or legacy_payload ->> 'checkoutId' is distinct from checkout_id::text then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
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

  if not found
    or legacy_payload ->> 'eventId' is distinct from
      'mock_event_' || pg_catalog.replace(checkout_id::text, '-', '')
    or legacy_payload ->> 'paymentReference'
      is distinct from target_session.provider_payment_reference then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;

  -- A checkout completed by the pre-P19 function has no journal row yet, but
  -- its exact signed body hash is already authoritative. Never journal an
  -- altered representation as a replay of that completed payment.
  if target_session.status = 'completed'
    and target_session.completion_payload_sha256
      is distinct from legacy_payload_hash then
    raise exception 'MOCK_CHECKOUT_INVALID_WEBHOOK' using errcode = '22023';
  end if;
  legacy_was_terminal := target_session.status in (
    'completed', 'canceled', 'expired'
  );

  p19_body := pg_catalog.jsonb_build_object(
    'checkoutId', target_session.id,
    'eventId', legacy_payload ->> 'eventId',
    'occurredAt', pg_catalog.to_char(
      target_session.created_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'paymentReference', target_session.provider_payment_reference,
    'type', 'payment.succeeded'
  )::text;

  result_record := public.process_mock_giving_webhook_core(
    target_session.id,
    capability_token,
    p19_body,
    public.mock_hmac_sha256_hex(capability_token::text, p19_body),
    legacy_payload_hash
  );

  -- The already-deployed P18 caller does not know the appended webhook fields.
  -- Return a malformed legacy shape on durable handler failure so its old
  -- required-field parser fails closed (503) without rolling back the journal.
  if result_record.webhook_status = 'failed' then
    return null;
  end if;

  if legacy_was_terminal then
    result_record.replayed := true;
  end if;
  return result_record;
end;
$$;

comment on function public.get_mock_giving_checkout(uuid, uuid) is
  'Returns the minimum capability-guarded mock checkout snapshot, including its stable creation timestamp for deterministic signed mock events.';
comment on function public.process_mock_giving_webhook_event(uuid, uuid) is
  'Private P19 processor. Requires the verified wrapper lock order and has no API execution grant.';
comment on function public.process_mock_giving_webhook_core(
  uuid, uuid, text, text, text
) is
  'Private P19 verifier, exact-byte journal, and processor. The optional hash override preserves the already-verified legacy P18 envelope identity.';
comment on function public.process_mock_giving_webhook(
  uuid, uuid, text, text
) is
  'Server-only P19 verified mock webhook journal and processor. Exact retries are deduplicated; collisions are rejected; raw payloads are never stored.';
comment on function public.complete_mock_giving_checkout(
  uuid, uuid, text, text
) is
  'Temporary exact P18 four-key anon success wrapper for the shared Development-backed Production demo. P39 removes it after environment separation.';

revoke all privileges on table public.webhook_events
  from public, anon, authenticated, service_role;
grant select on table public.webhook_events to service_role;

revoke all on type public.mock_giving_checkout_completion_result
  from public, anon, authenticated, service_role;
grant usage on type public.mock_giving_checkout_completion_result
  to anon, service_role;

revoke all on function
  public.webhook_sanitized_payload_is_safe(jsonb),
  public.guard_webhook_event_update(),
  public.reject_webhook_event_removal(),
  public.guard_donation_provider_event_update(),
  public.process_mock_giving_webhook_event(uuid, uuid),
  public.process_mock_giving_webhook_core(uuid, uuid, text, text, text),
  public.process_mock_giving_webhook(uuid, uuid, text, text),
  public.complete_mock_giving_checkout(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.complete_mock_giving_checkout(uuid, uuid, text, text)
  to anon;
grant execute on function
  public.process_mock_giving_webhook(uuid, uuid, text, text)
  to service_role;

commit;
