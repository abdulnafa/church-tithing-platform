begin;

create extension if not exists pgtap with schema extensions;

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  support_email, activated_at
) values (
  'f1900000-0000-4000-8000-000000000001',
  'P19 Hosted Church',
  'P19 Hosted Church Inc.',
  'p19-hosted',
  'active',
  'BBD',
  'America/Barbados',
  'hosted-p19@example.test',
  statement_timestamp()
);

select pg_catalog.set_config(
  'p19.fund_id',
  (select id::text from public.funds
   where church_id = 'f1900000-0000-4000-8000-000000000001'
     and is_default),
  true
);

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status, is_primary,
  charges_enabled, recurring_enabled, payouts_enabled, supported_currencies,
  capabilities
) values (
  'f1910000-0000-4000-8000-000000000001',
  'f1900000-0000-4000-8000-000000000001',
  'mock-development-gateway',
  'p19-hosted-development',
  'active',
  true,
  true,
  true,
  true,
  array['BBD'],
  '{"environment":"development","settlement_mode":"direct_to_church"}'
);

create function pg_temp.p19_webhook_body(
  target_checkout_id uuid,
  target_event_id text,
  target_event_type text,
  event_offset interval
)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'checkoutId', checkout.id,
    'eventId', target_event_id,
    'occurredAt', pg_catalog.to_char(
      (checkout.created_at + event_offset) at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'paymentReference', checkout.provider_payment_reference,
    'type', target_event_type
  )::text
  from public.mock_giving_checkout_sessions checkout
  where checkout.id = target_checkout_id;
$$;

select extensions.plan(88);

-- Durable schema, immutable history, and least privilege (1-27).
select extensions.ok(
  to_regclass('public.webhook_events') is not null,
  'durable webhook journal exists'
);
select extensions.has_column(
  'public', 'webhook_events', 'donation_id',
  'journal records the tenant-bound donation'
);
select extensions.has_column(
  'public', 'webhook_events', 'event_occurred_at',
  'journal records provider event time'
);
select extensions.has_column(
  'public', 'webhook_events', 'delivery_count',
  'journal records exact delivery count'
);
select extensions.has_column(
  'public', 'webhook_events', 'last_received_at',
  'journal records last delivery time'
);
select extensions.has_column(
  'public', 'webhook_events', 'processing_outcome',
  'journal distinguishes provider outcomes from handler state'
);
select extensions.has_column(
  'public', 'webhook_events', 'audit_log_id',
  'journal can link its one terminal-transition audit'
);
select extensions.has_column(
  'public', 'donations', 'provider_event_reference',
  'donation records the applied provider event reference'
);
select extensions.has_column(
  'public', 'donations', 'provider_event_type',
  'donation records the applied provider event type'
);
select extensions.has_column(
  'public', 'donations', 'provider_event_occurred_at',
  'donation has a provider event-time watermark'
);
select extensions.has_column(
  'public', 'donations', 'provider_terminal_audit_log_id',
  'donation links exactly one first-terminal audit'
);
select extensions.has_trigger(
  'public', 'webhook_events', 'webhook_events_guard_update',
  'journal has a full immutable-identity guard'
);
select extensions.has_trigger(
  'public', 'webhook_events', 'webhook_events_no_delete',
  'journal rejects deletion'
);
select extensions.has_trigger(
  'public', 'webhook_events', 'webhook_events_no_truncate',
  'journal rejects truncation'
);
select extensions.has_trigger(
  'public', 'donations', 'donations_guard_provider_event_update',
  'donation provider watermark cannot regress'
);
select extensions.has_index(
  'public', 'webhook_events', 'webhook_events_donation_fk_idx',
  'journal donation foreign key is indexed'
);
select extensions.has_index(
  'public', 'webhook_events', 'webhook_events_audit_log_unique_idx',
  'one audit cannot be attached to multiple events'
);
select extensions.has_index(
  'public', 'donations', 'donations_provider_terminal_audit_unique_idx',
  'one audit cannot be attached to multiple donations'
);
select extensions.is(
  (select relforcerowsecurity from pg_catalog.pg_class
   where oid = 'public.webhook_events'::regclass),
  true,
  'webhook journal forces RLS'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  false,
  'service role cannot use the legacy anon-only compatibility wrapper'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'legacy Production anon completion remains capability and HMAC guarded'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot invoke completion directly'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.process_mock_giving_webhook(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  true,
  'trusted Preview server can invoke the P19 webhook boundary'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.process_mock_giving_webhook(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  false,
  'anonymous clients cannot mint P19 provider event identities'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.process_mock_giving_webhook_event(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'even service role cannot bypass verification through the processor'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.process_mock_giving_webhook_core(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  false,
  'even service role cannot bypass the public five-key verification boundary'
);
select extensions.is(
  has_type_privilege(
    'service_role', 'public.mock_giving_checkout_completion_result', 'USAGE'
  ),
  true,
  'service role can consume the completion result'
);
select extensions.is(
  has_type_privilege(
    'anon', 'public.mock_giving_checkout_completion_result', 'USAGE'
  ),
  true,
  'legacy Production anon completion can consume its result type'
);
select extensions.is(
  has_table_privilege('service_role', 'public.webhook_events', 'SELECT'),
  true,
  'service role can inspect operational webhook evidence'
);
select extensions.is(
  has_table_privilege('service_role', 'public.webhook_events', 'INSERT'),
  false,
  'service role cannot insert journal rows outside the verified wrapper'
);

-- Create independent exact-idempotent checkout fixtures.
set local role service_role;
select pg_catalog.set_config('p19.success_checkout', checkout_id::text, true),
       pg_catalog.set_config('p19.success_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p19-hosted', '19111111-1111-4111-8111-111111111111', 'fund',
  pg_catalog.current_setting('p19.fund_id')::uuid, 5000, 'one_time',
  'P19 Success', 'p19-success@example.test'
);
select pg_catalog.set_config('p19.order_checkout', checkout_id::text, true),
       pg_catalog.set_config('p19.order_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p19-hosted', '19222222-2222-4222-8222-222222222222', 'fund',
  pg_catalog.current_setting('p19.fund_id')::uuid, 5100, 'one_time',
  'P19 Order', 'p19-order@example.test'
);
select pg_catalog.set_config('p19.retry_checkout', checkout_id::text, true),
       pg_catalog.set_config('p19.retry_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p19-hosted', '19333333-3333-4333-8333-333333333333', 'fund',
  pg_catalog.current_setting('p19.fund_id')::uuid, 5200, 'one_time',
  'P19 Retry', 'p19-retry@example.test'
);
select pg_catalog.set_config('p19.legacy_checkout', checkout_id::text, true),
       pg_catalog.set_config('p19.legacy_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p19-hosted', '19444444-4444-4444-8444-444444444444', 'fund',
  pg_catalog.current_setting('p19.fund_id')::uuid, 5300, 'one_time',
  'P19 Legacy', 'p19-legacy@example.test'
);
select pg_catalog.set_config('p19.cap_checkout', checkout_id::text, true),
       pg_catalog.set_config('p19.cap_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p19-hosted', '19555555-5555-4555-8555-555555555555', 'fund',
  pg_catalog.current_setting('p19.fund_id')::uuid, 5400, 'one_time',
  'P19 Identity Cap', 'p19-cap@example.test'
);
reset role;

-- Total CHECK predicates and case-insensitive mock-provider enforcement.
select extensions.ok(
  public.webhook_sanitized_payload_is_safe('{}'::jsonb) is false
    and public.webhook_sanitized_payload_is_safe(null::jsonb) is false,
  'sanitized payload predicate returns false instead of SQL null'
);
select extensions.throws_like(
  $$insert into public.webhook_events (
      provider, external_event_reference, event_type, payload_sha256,
      sanitized_payload, event_occurred_at
    ) values (
      'MoCk-DeVeLoPmEnT-GaTeWaY', 'hosted-mixed-route-p19',
      'payment.succeeded',
      '1111111111111111111111111111111111111111111111111111111111111111',
      '{"checkout_id":"f1980000-0000-4000-8000-000000000001",
        "donation_id":"f1980000-0000-4000-8000-000000000002",
        "event_occurred_at":"2026-09-17T00:00:00.000Z",
        "payment_reference":"mock_payment_88888888888888888888888888888888"}',
      statement_timestamp()
    )$$,
  '%webhook_events_mock_route_complete%',
  'mixed-case mock provider cannot bypass complete routing'
);
select extensions.throws_like(
  format(
    $$insert into public.webhook_events (
        church_id, connection_id, donation_id, provider,
        external_event_reference, event_type, payload_sha256,
        sanitized_payload, event_occurred_at
      ) values (
        %L::uuid, %L::uuid, %L::uuid, 'MoCk-DeVeLoPmEnT-GaTeWaY',
        'hosted-mixed-safe-p19', 'payment.succeeded',
        '2222222222222222222222222222222222222222222222222222222222222222',
        '{}'::jsonb, statement_timestamp()
      )$$,
    'f1900000-0000-4000-8000-000000000001',
    'f1910000-0000-4000-8000-000000000001',
    pg_catalog.current_setting('p19.success_donation')
  ),
  '%webhook_events_sanitized_payload_safe%',
  'mixed-case mock provider cannot bypass sanitized payload validation'
);
select extensions.throws_like(
  $$insert into public.webhook_events (
      provider, external_event_reference, event_type, status, payload_sha256,
      sanitized_payload, event_occurred_at, processed_at
    ) values (
      'hosted-constraint-provider', 'hosted-null-outcome-p19',
      'test.processed', 'processed',
      '3333333333333333333333333333333333333333333333333333333333333333',
      '{}', statement_timestamp(), statement_timestamp()
    )$$,
  '%webhook_events_status_outcome_consistent%',
  'terminal journal status cannot carry a null outcome'
);
select extensions.throws_like(
  format(
    $$update public.donations
      set provider_event_reference = 'hosted-incomplete-watermark-p19',
          provider_event_type = null,
          provider_event_occurred_at = statement_timestamp()
      where id = %L::uuid$$,
    pg_catalog.current_setting('p19.success_donation')
  ),
  '%donations_provider_event_watermark_check%',
  'donation provider watermark requires all three identity fields'
);

-- Temporary exact P18 compatibility for the already-deployed shared-backend
-- Production demo. P39 removes it after environment and secret separation.
select pg_catalog.set_config(
  'p19.legacy_body',
  pg_catalog.jsonb_build_object(
    'checkoutId', pg_catalog.current_setting('p19.legacy_checkout'),
    'eventId', 'mock_event_' || pg_catalog.replace(
      pg_catalog.current_setting('p19.legacy_checkout'), '-', ''
    ),
    'paymentReference', 'mock_payment_' || pg_catalog.replace(
      pg_catalog.current_setting('p19.legacy_checkout'), '-', ''
    ),
    'type', 'payment.succeeded'
  )::text,
  true
);
select pg_catalog.set_config(
  'p19.legacy_signature',
  public.mock_hmac_sha256_hex(
    '19444444-4444-4444-8444-444444444444',
    pg_catalog.current_setting('p19.legacy_body')
  ),
  true
);
update public.payment_provider_connections
set status = 'disabled'
where id = 'f1910000-0000-4000-8000-000000000001';
set local role anon;
select extensions.ok(
  checkout_id is null
    and checkout_status is null
    and donation_status is null
    and replayed is null,
  'legacy handler failure fails the old required-field parser closed'
)
from public.complete_mock_giving_checkout(
  pg_catalog.current_setting('p19.legacy_checkout')::uuid,
  '19444444-4444-4444-8444-444444444444',
  pg_catalog.current_setting('p19.legacy_body'),
  pg_catalog.current_setting('p19.legacy_signature')
);
reset role;
select pg_catalog.set_config(
  'p19.legacy_event',
  (select event.id::text
   from public.webhook_events event
   where event.donation_id =
     pg_catalog.current_setting('p19.legacy_donation')::uuid),
  true
);
select extensions.ok(
  (select event.status = 'failed'
      and event.processing_outcome = 'handler_failed'
      and donation.status = 'pending'
   from public.webhook_events event
   join public.donations donation on donation.id = event.donation_id
   where event.id = pg_catalog.current_setting('p19.legacy_event')::uuid),
  'legacy parser failure still preserves the durable handler-failure journal'
);
select extensions.ok(
  (select event.event_occurred_at =
      date_trunc('milliseconds', checkout.created_at)
   from public.webhook_events event
   join public.mock_giving_checkout_sessions checkout
     on checkout.donation_id = event.donation_id
   where event.id = pg_catalog.current_setting('p19.legacy_event')::uuid),
  'legacy event derives a deterministic occurrence time from checkout creation'
);
select extensions.is(
  (select event.payload_sha256
   from public.webhook_events event
   where event.id = pg_catalog.current_setting('p19.legacy_event')::uuid),
  pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.current_setting('p19.legacy_body'), 'UTF8'
      )
    ),
    'hex'
  ),
  'legacy journal identity hashes the exact signed four-key bytes'
);
select pg_catalog.set_config(
  'p19.legacy_drift_body',
  pg_catalog.jsonb_pretty(
    pg_catalog.current_setting('p19.legacy_body')::jsonb
  ),
  true
);
select pg_catalog.set_config(
  'p19.legacy_drift_signature',
  public.mock_hmac_sha256_hex(
    '19444444-4444-4444-8444-444444444444',
    pg_catalog.current_setting('p19.legacy_drift_body')
  ),
  true
);
set local role anon;
select extensions.throws_like(
  format(
    $$select * from public.complete_mock_giving_checkout(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.legacy_checkout'),
    '19444444-4444-4444-8444-444444444444',
    pg_catalog.current_setting('p19.legacy_drift_body'),
    pg_catalog.current_setting('p19.legacy_drift_signature')
  ),
  '%MOCK_WEBHOOK_EVENT_COLLISION%',
  'legacy formatting drift collides instead of replaying the provider event'
);
reset role;
update public.payment_provider_connections
set status = 'active'
where id = 'f1910000-0000-4000-8000-000000000001';
set local role anon;
select extensions.ok(
  replayed
    and webhook_status = 'processed'
    and webhook_outcome = 'donation_succeeded'
    and donation_status = 'succeeded',
  'exact legacy retry recovers and preserves Production completion behavior'
)
from public.complete_mock_giving_checkout(
  pg_catalog.current_setting('p19.legacy_checkout')::uuid,
  '19444444-4444-4444-8444-444444444444',
  pg_catalog.current_setting('p19.legacy_body'),
  pg_catalog.current_setting('p19.legacy_signature')
);
select extensions.throws_like(
  format(
    $$select * from public.complete_mock_giving_checkout(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.legacy_checkout'),
    '19444444-4444-4444-8444-444444444444',
    pg_catalog.current_setting('p19.legacy_drift_body'),
    pg_catalog.current_setting('p19.legacy_drift_signature')
  ),
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'completed legacy checkout rejects a changed exact signed-body hash'
);
reset role;

select pg_catalog.set_config(
  'p19.success_body',
  pg_temp.p19_webhook_body(
    pg_catalog.current_setting('p19.success_checkout')::uuid,
    'mock_event_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'payment.succeeded',
    interval '1 second'
  ),
  true
);
select pg_catalog.set_config(
  'p19.success_signature',
  public.mock_hmac_sha256_hex(
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.success_body')
  ),
  true
);

-- Strict raw-body validation (28-29).
select pg_catalog.set_config(
  'p19.unexpected_body',
  pg_catalog.regexp_replace(
    pg_catalog.current_setting('p19.success_body'),
    '}$',
    ', "prayer": "must-not-persist"}'
  ),
  true
);
select pg_catalog.set_config(
  'p19.duplicate_body',
  pg_catalog.regexp_replace(
    pg_catalog.current_setting('p19.success_body'),
    '}$',
    ', "type": "payment.succeeded"}'
  ),
  true
);
select pg_catalog.set_config(
  'p19.escaped_duplicate_body',
  pg_catalog.regexp_replace(
    pg_catalog.current_setting('p19.success_body'),
    '}$',
    ', "typ\u0065": "payment.succeeded"}'
  ),
  true
);
select pg_catalog.set_config(
  'p19.noncanonical_time_body',
  pg_catalog.jsonb_set(
    pg_catalog.current_setting('p19.success_body')::jsonb,
    '{occurredAt}',
    pg_catalog.to_jsonb(
      (select pg_catalog.to_char(
          checkout.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:'
        ) || '60.000Z'
       from public.mock_giving_checkout_sessions checkout
       where checkout.id =
         pg_catalog.current_setting('p19.success_checkout')::uuid)
    )
  )::text,
  true
);
select pg_catalog.set_config(
  'p19.unexpected_signature',
  public.mock_hmac_sha256_hex(
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.unexpected_body')
  ),
  true
);
select pg_catalog.set_config(
  'p19.duplicate_signature',
  public.mock_hmac_sha256_hex(
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.duplicate_body')
  ),
  true
);
select pg_catalog.set_config(
  'p19.escaped_duplicate_signature',
  public.mock_hmac_sha256_hex(
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.escaped_duplicate_body')
  ),
  true
);
select pg_catalog.set_config(
  'p19.noncanonical_time_signature',
  public.mock_hmac_sha256_hex(
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.noncanonical_time_body')
  ),
  true
);
set local role service_role;
select extensions.throws_like(
  format(
    $$select * from public.process_mock_giving_webhook(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.success_checkout'),
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.unexpected_body'),
    pg_catalog.current_setting('p19.unexpected_signature')
  ),
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'unexpected JSON keys are rejected before journaling'
);
select extensions.throws_like(
  format(
    $$select * from public.process_mock_giving_webhook(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.success_checkout'),
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.duplicate_body'),
    pg_catalog.current_setting('p19.duplicate_signature')
  ),
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'duplicate raw JSON keys are rejected before journaling'
);
select extensions.throws_like(
  format(
    $$select * from public.process_mock_giving_webhook(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.success_checkout'),
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.escaped_duplicate_body'),
    pg_catalog.current_setting('p19.escaped_duplicate_signature')
  ),
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'escaped duplicate JSON keys are rejected before journaling'
);
select extensions.throws_like(
  format(
    $$select * from public.process_mock_giving_webhook(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.success_checkout'),
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.noncanonical_time_body'),
    pg_catalog.current_setting('p19.noncanonical_time_signature')
  ),
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'timestamp normalization aliases are rejected before journaling'
);
reset role;

-- Successful processing, exact replay, collision resistance, and audit (30-45).
set local role service_role;
select pg_catalog.set_config('p19.success_event', webhook_event_id::text, true),
       extensions.is(webhook_status, 'processed',
         'success event is processed rather than merely received'),
       extensions.is(webhook_outcome, 'donation_succeeded',
         'success event records its provider outcome')
from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.success_checkout')::uuid,
  '19111111-1111-4111-8111-111111111111',
  pg_catalog.current_setting('p19.success_body'),
  pg_catalog.current_setting('p19.success_signature')
);
reset role;
select extensions.is(
  (select status::text from public.donations
   where id = pg_catalog.current_setting('p19.success_donation')::uuid),
  'succeeded',
  'verified success transitions the pending donation'
);
select extensions.ok(
  (select settled_at is null from public.donations
   where id = pg_catalog.current_setting('p19.success_donation')::uuid),
  'provider success never claims settlement'
);
select extensions.is(
  (select count(*) from public.webhook_events
   where donation_id = pg_catalog.current_setting('p19.success_donation')::uuid),
  1::bigint,
  'first delivery creates exactly one journal row'
);
select extensions.set_eq(
  $$select key from public.webhook_events event
    cross join lateral pg_catalog.jsonb_object_keys(
      event.sanitized_payload
    ) key
    where event.id = pg_catalog.current_setting('p19.success_event')::uuid$$,
  array['checkout_id', 'donation_id', 'event_occurred_at', 'payment_reference'],
  'persisted payload contains exactly the safe allowlist'
);
select extensions.ok(
  (select sanitized_payload::text not like '%p19-success@example.test%'
   from public.webhook_events
   where id = pg_catalog.current_setting('p19.success_event')::uuid),
  'journal does not persist donor email'
);
select extensions.ok(
  (select sanitized_payload::text not like '%prayer%'
   from public.webhook_events
   where id = pg_catalog.current_setting('p19.success_event')::uuid),
  'journal does not persist prayer data'
);
select extensions.ok(
  (select event.audit_log_id is not null
     and event.audit_log_id = donation.provider_terminal_audit_log_id
   from public.webhook_events event
   join public.donations donation on donation.id = event.donation_id
   where event.id = pg_catalog.current_setting('p19.success_event')::uuid),
  'first terminal transition links one audit to event and donation'
);
select extensions.is(
  (select count(*) from public.audit_logs audit
   where audit.id = (
     select audit_log_id from public.webhook_events
     where id = pg_catalog.current_setting('p19.success_event')::uuid
   )),
  1::bigint,
  'one append-only audit row exists for the applied transition'
);
set local role service_role;
select extensions.is(
  (select replayed from public.process_mock_giving_webhook(
    pg_catalog.current_setting('p19.success_checkout')::uuid,
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.success_body'),
    pg_catalog.current_setting('p19.success_signature')
  )),
  true,
  'exact processed delivery is reported as replayed'
);
reset role;
select extensions.is(
  (select delivery_count from public.webhook_events
   where id = pg_catalog.current_setting('p19.success_event')::uuid),
  2,
  'exact replay increments only delivery count'
);
select extensions.is(
  (select attempt_count from public.webhook_events
   where id = pg_catalog.current_setting('p19.success_event')::uuid),
  1,
  'exact processed replay does not run the handler again'
);
select extensions.is(
  (select count(*) from public.audit_logs audit
   where audit.id = (
     select audit_log_id from public.webhook_events
     where id = pg_catalog.current_setting('p19.success_event')::uuid
   )),
  1::bigint,
  'exact replay does not duplicate audit evidence'
);

select pg_catalog.set_config(
  'p19.collision_body',
  pg_temp.p19_webhook_body(
    pg_catalog.current_setting('p19.success_checkout')::uuid,
    'mock_event_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'payment.failed',
    interval '1 second'
  ),
  true
);
select pg_catalog.set_config(
  'p19.collision_signature',
  public.mock_hmac_sha256_hex(
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.collision_body')
  ),
  true
);
set local role service_role;
select extensions.throws_like(
  format(
    $$select * from public.process_mock_giving_webhook(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.success_checkout'),
    '19111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p19.collision_body'),
    pg_catalog.current_setting('p19.collision_signature')
  ),
  '%MOCK_WEBHOOK_EVENT_COLLISION%',
  'same provider event ID with a changed fingerprint is rejected'
);
reset role;
select extensions.is(
  (select delivery_count from public.webhook_events
   where id = pg_catalog.current_setting('p19.success_event')::uuid),
  2,
  'collision rejection does not alter delivery evidence'
);
select extensions.is(
  (select provider_event_type from public.donations
   where id = pg_catalog.current_setting('p19.success_donation')::uuid),
  'payment.succeeded',
  'collision cannot downgrade the applied provider state'
);

-- Provider failure is processed, and equal-time success wins once (46-53).
select pg_catalog.set_config(
  'p19.failure_body',
  pg_temp.p19_webhook_body(
    pg_catalog.current_setting('p19.order_checkout')::uuid,
    'mock_event_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'payment.failed',
    interval '2 seconds'
  ),
  true
);
select pg_catalog.set_config(
  'p19.equal_success_body',
  pg_temp.p19_webhook_body(
    pg_catalog.current_setting('p19.order_checkout')::uuid,
    'mock_event_cccccccccccccccccccccccccccccccc',
    'payment.succeeded',
    interval '2 seconds'
  ),
  true
);
select pg_catalog.set_config(
  'p19.failure_signature',
  public.mock_hmac_sha256_hex(
    '19222222-2222-4222-8222-222222222222',
    pg_catalog.current_setting('p19.failure_body')
  ),
  true
);
select pg_catalog.set_config(
  'p19.equal_success_signature',
  public.mock_hmac_sha256_hex(
    '19222222-2222-4222-8222-222222222222',
    pg_catalog.current_setting('p19.equal_success_body')
  ),
  true
);
set local role service_role;
select pg_catalog.set_config('p19.failure_event', webhook_event_id::text, true),
       extensions.is(webhook_status, 'processed',
         'provider payment.failed is a processed provider outcome'),
       extensions.is(webhook_outcome, 'donation_failed',
         'provider failure is distinct from handler failure')
from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.order_checkout')::uuid,
  '19222222-2222-4222-8222-222222222222',
  pg_catalog.current_setting('p19.failure_body'),
  pg_catalog.current_setting('p19.failure_signature')
);
select pg_catalog.set_config('p19.equal_success_event', webhook_event_id::text, true),
       extensions.is(webhook_outcome, 'donation_succeeded',
         'equal-time success has precedence over failure')
from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.order_checkout')::uuid,
  '19222222-2222-4222-8222-222222222222',
  pg_catalog.current_setting('p19.equal_success_body'),
  pg_catalog.current_setting('p19.equal_success_signature')
);
reset role;
select extensions.is(
  (select status::text from public.donations
   where id = pg_catalog.current_setting('p19.order_donation')::uuid),
  'succeeded',
  'failed donation can advance to equal-time success'
);
select extensions.ok(
  (select failure_code is null and failure_message is null and failed_at is null
   from public.donations
   where id = pg_catalog.current_setting('p19.order_donation')::uuid),
  'success after failure clears obsolete failure state'
);
select extensions.ok(
  (select failed.audit_log_id is not null
     and succeeded.audit_log_id is null
     and failed.audit_log_id = donation.provider_terminal_audit_log_id
   from public.webhook_events failed
   join public.webhook_events succeeded on true
   join public.donations donation on donation.id = failed.donation_id
   where failed.id = pg_catalog.current_setting('p19.failure_event')::uuid
     and succeeded.id =
       pg_catalog.current_setting('p19.equal_success_event')::uuid),
  'audit link remains on the first terminal transition only'
);
select extensions.is(
  (select count(*) from public.audit_logs
   where id = (
     select provider_terminal_audit_log_id from public.donations
     where id = pg_catalog.current_setting('p19.order_donation')::uuid
   )),
  1::bigint,
  'failure then success still has exactly one terminal audit'
);

select pg_catalog.set_config(
  'p19.newer_failure_body',
  pg_temp.p19_webhook_body(
    pg_catalog.current_setting('p19.order_checkout')::uuid,
    'mock_event_dddddddddddddddddddddddddddddddd',
    'payment.failed',
    interval '5 seconds'
  ),
  true
);
select pg_catalog.set_config(
  'p19.newer_failure_signature',
  public.mock_hmac_sha256_hex(
    '19222222-2222-4222-8222-222222222222',
    pg_catalog.current_setting('p19.newer_failure_body')
  ),
  true
);
set local role service_role;
select extensions.is(
  (select webhook_outcome from public.process_mock_giving_webhook(
    pg_catalog.current_setting('p19.order_checkout')::uuid,
    '19222222-2222-4222-8222-222222222222',
    pg_catalog.current_setting('p19.newer_failure_body'),
    pg_catalog.current_setting('p19.newer_failure_signature')
  )),
  'ignored_terminal_state',
  'newer failure cannot downgrade applied success'
);
reset role;
select extensions.is(
  (select status::text from public.donations
   where id = pg_catalog.current_setting('p19.order_donation')::uuid),
  'succeeded',
  'donation remains succeeded after later provider failure'
);

-- Handler failure persists outside its subtransaction and exact retry recovers
-- without duplicate mutation or audit (54-59).
update public.payment_provider_connections
set status = 'disabled'
where id = 'f1910000-0000-4000-8000-000000000001';
select pg_catalog.set_config(
  'p19.retry_body',
  pg_temp.p19_webhook_body(
    pg_catalog.current_setting('p19.retry_checkout')::uuid,
    'mock_event_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    'payment.succeeded',
    interval '1 second'
  ),
  true
);
select pg_catalog.set_config(
  'p19.retry_signature',
  public.mock_hmac_sha256_hex(
    '19333333-3333-4333-8333-333333333333',
    pg_catalog.current_setting('p19.retry_body')
  ),
  true
);
set local role service_role;
select pg_catalog.set_config('p19.retry_event', webhook_event_id::text, true),
       extensions.is(webhook_status, 'failed',
         'handler error returns a durable failed journal status'),
       extensions.is(webhook_outcome, 'handler_failed',
         'handler error is not confused with provider payment.failed')
from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.retry_checkout')::uuid,
  '19333333-3333-4333-8333-333333333333',
  pg_catalog.current_setting('p19.retry_body'),
  pg_catalog.current_setting('p19.retry_signature')
);
reset role;
select extensions.is(
  (select last_error from public.webhook_events
   where id = pg_catalog.current_setting('p19.retry_event')::uuid),
  'MOCK_CHECKOUT_UNAVAILABLE',
  'failed handler stores only a bounded safe error code'
);
update public.payment_provider_connections
set status = 'active'
where id = 'f1910000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.ok(
  (select replayed and webhook_status = 'processed'
     and webhook_outcome = 'donation_succeeded'
   from public.process_mock_giving_webhook(
    pg_catalog.current_setting('p19.retry_checkout')::uuid,
    '19333333-3333-4333-8333-333333333333',
    pg_catalog.current_setting('p19.retry_body'),
    pg_catalog.current_setting('p19.retry_signature')
  )),
  'exact failed delivery can retry and recover safely'
);
reset role;
select extensions.is(
  (select delivery_count from public.webhook_events
   where id = pg_catalog.current_setting('p19.retry_event')::uuid),
  2,
  'failed-delivery retry increments delivery count once'
);
select extensions.is(
  (select attempt_count from public.webhook_events
   where id = pg_catalog.current_setting('p19.retry_event')::uuid),
  2,
  'failed-delivery retry records a second isolated handler attempt'
);

-- Bound distinct mock identities per checkout while preserving exact replay.
select
  pg_catalog.set_config(
    'p19.cap_body_1',
    pg_temp.p19_webhook_body(
      pg_catalog.current_setting('p19.cap_checkout')::uuid,
      'mock_event_00000000000000000000000000000001',
      'payment.succeeded', interval '1 second'
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_body_2',
    pg_temp.p19_webhook_body(
      pg_catalog.current_setting('p19.cap_checkout')::uuid,
      'mock_event_00000000000000000000000000000002',
      'payment.succeeded', interval '2 seconds'
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_body_3',
    pg_temp.p19_webhook_body(
      pg_catalog.current_setting('p19.cap_checkout')::uuid,
      'mock_event_00000000000000000000000000000003',
      'payment.succeeded', interval '3 seconds'
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_body_4',
    pg_temp.p19_webhook_body(
      pg_catalog.current_setting('p19.cap_checkout')::uuid,
      'mock_event_00000000000000000000000000000004',
      'payment.succeeded', interval '4 seconds'
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_body_5',
    pg_temp.p19_webhook_body(
      pg_catalog.current_setting('p19.cap_checkout')::uuid,
      'mock_event_00000000000000000000000000000005',
      'payment.succeeded', interval '5 seconds'
    ), true
  );
select
  pg_catalog.set_config(
    'p19.cap_signature_1',
    public.mock_hmac_sha256_hex(
      '19555555-5555-4555-8555-555555555555',
      pg_catalog.current_setting('p19.cap_body_1')
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_signature_2',
    public.mock_hmac_sha256_hex(
      '19555555-5555-4555-8555-555555555555',
      pg_catalog.current_setting('p19.cap_body_2')
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_signature_3',
    public.mock_hmac_sha256_hex(
      '19555555-5555-4555-8555-555555555555',
      pg_catalog.current_setting('p19.cap_body_3')
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_signature_4',
    public.mock_hmac_sha256_hex(
      '19555555-5555-4555-8555-555555555555',
      pg_catalog.current_setting('p19.cap_body_4')
    ), true
  ),
  pg_catalog.set_config(
    'p19.cap_signature_5',
    public.mock_hmac_sha256_hex(
      '19555555-5555-4555-8555-555555555555',
      pg_catalog.current_setting('p19.cap_body_5')
    ), true
  );
update public.payment_provider_connections
set status = 'disabled'
where id = 'f1910000-0000-4000-8000-000000000001';
set local role service_role;
select pg_catalog.set_config('p19.cap_event_1', webhook_event_id::text, true)
from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.cap_checkout')::uuid,
  '19555555-5555-4555-8555-555555555555',
  pg_catalog.current_setting('p19.cap_body_1'),
  pg_catalog.current_setting('p19.cap_signature_1')
);
select webhook_event_id from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.cap_checkout')::uuid,
  '19555555-5555-4555-8555-555555555555',
  pg_catalog.current_setting('p19.cap_body_2'),
  pg_catalog.current_setting('p19.cap_signature_2')
);
select webhook_event_id from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.cap_checkout')::uuid,
  '19555555-5555-4555-8555-555555555555',
  pg_catalog.current_setting('p19.cap_body_3'),
  pg_catalog.current_setting('p19.cap_signature_3')
);
select webhook_event_id from public.process_mock_giving_webhook(
  pg_catalog.current_setting('p19.cap_checkout')::uuid,
  '19555555-5555-4555-8555-555555555555',
  pg_catalog.current_setting('p19.cap_body_4'),
  pg_catalog.current_setting('p19.cap_signature_4')
);
reset role;
select extensions.is(
  (select count(*) from public.webhook_events
   where donation_id = pg_catalog.current_setting('p19.cap_donation')::uuid),
  4::bigint,
  'first four distinct identities are journaled for one checkout'
);
select extensions.is(
  (select count(*) from public.webhook_events
   where donation_id = pg_catalog.current_setting('p19.cap_donation')::uuid
     and status = 'failed' and processing_outcome = 'handler_failed'),
  4::bigint,
  'all four accepted identities preserve isolated handler failures'
);
set local role service_role;
select extensions.throws_like(
  format(
    $$select * from public.process_mock_giving_webhook(
      %L::uuid, %L::uuid, %L, %L
    )$$,
    pg_catalog.current_setting('p19.cap_checkout'),
    '19555555-5555-4555-8555-555555555555',
    pg_catalog.current_setting('p19.cap_body_5'),
    pg_catalog.current_setting('p19.cap_signature_5')
  ),
  '%MOCK_WEBHOOK_EVENT_LIMIT%',
  'fifth distinct identity is rejected at the database boundary'
);
select extensions.ok(
  (select replayed and webhook_status = 'failed'
     and webhook_outcome = 'handler_failed'
   from public.process_mock_giving_webhook(
    pg_catalog.current_setting('p19.cap_checkout')::uuid,
    '19555555-5555-4555-8555-555555555555',
    pg_catalog.current_setting('p19.cap_body_1'),
    pg_catalog.current_setting('p19.cap_signature_1')
  )),
  'exact identity remains replayable after the distinct-event cap'
);
reset role;
select extensions.ok(
  (select count(event.id) = 4
      and sum(event.delivery_count) = 5
      and count(event.audit_log_id) = 0
      and donation.status = 'pending'
      and donation.provider_event_reference is null
   from public.donations donation
   left join public.webhook_events event on event.donation_id = donation.id
   where donation.id = pg_catalog.current_setting('p19.cap_donation')::uuid
   group by donation.id),
  'limit rejection leaves journal cardinality, audit, and donation state intact'
);
update public.payment_provider_connections
set status = 'active'
where id = 'f1910000-0000-4000-8000-000000000001';

-- Full immutability boundaries (60-64).
select extensions.throws_like(
  $$update public.webhook_events set event_type = 'payment.failed'
    where id = pg_catalog.current_setting('p19.success_event')::uuid$$,
  '%WEBHOOK_EVENT_IDENTITY_IMMUTABLE%',
  'journal identity fields cannot be changed'
);
select extensions.throws_like(
  $$update public.webhook_events set status = 'failed'
    where id = pg_catalog.current_setting('p19.success_event')::uuid$$,
  '%WEBHOOK_EVENT_TERMINAL_STATE_IMMUTABLE%',
  'processed journal outcome cannot be rewritten'
);
select extensions.throws_like(
  $$delete from public.webhook_events
    where id = pg_catalog.current_setting('p19.success_event')::uuid$$,
  '%WEBHOOK_EVENT_HISTORY_IMMUTABLE%',
  'journal rows cannot be deleted'
);
select extensions.throws_like(
  $$truncate public.webhook_events$$,
  '%WEBHOOK_EVENT_HISTORY_IMMUTABLE%',
  'journal history cannot be truncated'
);
select extensions.is(
  (select count(*) from public.audit_logs audit
   where audit.action_code = 'webhook_processed'
     and audit.church_id = 'f1900000-0000-4000-8000-000000000001'),
  4::bigint,
  'only the four first applied terminal transitions created audits'
);

select * from extensions.finish();
rollback;
