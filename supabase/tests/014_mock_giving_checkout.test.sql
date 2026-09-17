begin;

create extension if not exists pgtap with schema extensions;

insert into public.churches (
  id, name, legal_name, slug, status, default_currency, timezone,
  thank_you_message, support_email, activated_at, suspended_at
) values
  ('f1800000-0000-4000-8000-000000000001', 'P18 Active Church',
    'P18 Active Church Inc.', 'p18-hosted-active', 'active', 'BBD',
    'America/Barbados', 'Thank you for giving.',
    'active-hosted-p18@example.test', now(), null),
  ('f1800000-0000-4000-8000-000000000002', 'P18 Other Church',
    'P18 Other Church Inc.', 'p18-hosted-other', 'active', 'BBD',
    'America/Barbados', null, 'other-hosted-p18@example.test', now(), null),
  ('f1800000-0000-4000-8000-000000000003', 'P18 Suspended Church',
    'P18 Suspended Church Inc.', 'p18-hosted-suspended', 'suspended', 'BBD',
    'America/Barbados', null, 'suspended-hosted-p18@example.test',
    now(), now());

select pg_catalog.set_config(
  'p18.active_fund',
  (select id::text from public.funds
   where church_id = 'f1800000-0000-4000-8000-000000000001'
     and is_default),
  true
);
select pg_catalog.set_config(
  'p18.other_fund',
  (select id::text from public.funds
   where church_id = 'f1800000-0000-4000-8000-000000000002'
     and is_default),
  true
);

insert into public.payment_provider_connections (
  id, church_id, provider, external_account_reference, status, is_primary,
  charges_enabled, recurring_enabled, payouts_enabled, supported_currencies,
  capabilities
) values
  ('f1810000-0000-4000-8000-000000000001',
    'f1800000-0000-4000-8000-000000000001',
    'mock-development-gateway', 'p18-hosted-active-development', 'active',
    true, true, true, true, array['BBD'],
    '{"environment":"development","settlement_mode":"direct_to_church"}'),
  ('f1810000-0000-4000-8000-000000000002',
    'f1800000-0000-4000-8000-000000000002',
    'mock-development-gateway', 'p18-hosted-other-development', 'active',
    true, true, true, true, array['BBD'],
    '{"environment":"development","settlement_mode":"direct_to_church"}');

select extensions.plan(56);

-- Migration shape, forced privacy, cryptography, and ACLs (1-16).
select extensions.ok(
  to_regclass('public.mock_giving_checkout_sessions') is not null,
  'private mock checkout ledger exists'
);
select extensions.ok(
  to_regprocedure(
    'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)'
  ) is not null,
  'begin checkout RPC exists with its exact signature'
);
select extensions.ok(
  to_regprocedure('public.get_mock_giving_checkout(uuid,uuid)') is not null,
  'capability-guarded checkout reader exists'
);
select extensions.ok(
  to_regprocedure('public.cancel_mock_giving_checkout(uuid,uuid)') is not null,
  'capability-guarded cancellation RPC exists'
);
select extensions.ok(
  to_regprocedure(
    'public.complete_mock_giving_checkout(uuid,uuid,text,text)'
  ) is not null,
  'temporary signed mock completion RPC exists'
);
select extensions.is(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.mock_giving_checkout_sessions'::regclass),
  true,
  'checkout ledger has RLS enabled'
);
select extensions.is(
  (select relforcerowsecurity from pg_catalog.pg_class
   where oid = 'public.mock_giving_checkout_sessions'::regclass),
  true,
  'checkout ledger forces RLS'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)',
    'EXECUTE'
  ),
  false,
  'anon cannot bypass server rate limits through PostgREST begin'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated sessions cannot call the anonymous checkout RPC'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)',
    'EXECUTE'
  ),
  true,
  'only the trusted server role may begin a checkout'
);
select extensions.is(
  has_function_privilege(
    'service_role',
    'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
    'EXECUTE'
  ),
  false,
  'service role cannot call the legacy browser capability completion RPC'
);
select extensions.is(
  has_function_privilege(
    'anon', 'public.mock_hmac_sha256_hex(text,text)', 'EXECUTE'
  ),
  false,
  'anon cannot call the private HMAC helper directly'
);
select extensions.is(
  has_type_privilege(
    'anon', 'public.mock_giving_checkout_start_result', 'USAGE'
  ),
  false,
  'anon cannot use the server-only begin result type'
);
select extensions.is(
  has_type_privilege(
    'service_role', 'public.mock_giving_checkout_start_result', 'USAGE'
  ),
  true,
  'service role can use the server-only begin result type'
);
select extensions.is(
  has_type_privilege(
    'anon', 'public.mock_giving_checkout_record', 'USAGE'
  ),
  true,
  'anon can use only the capability-guarded public snapshot type'
);
select extensions.is(
  has_table_privilege('anon', 'public.mock_giving_checkout_sessions', 'SELECT'),
  false,
  'anon cannot enumerate private checkout rows'
);
select extensions.is(
  has_table_privilege(
    'service_role', 'public.mock_giving_checkout_sessions', 'SELECT'
  ),
  false,
  'service role has no direct checkout-ledger bypass'
);
select extensions.is(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'mock_giving_checkout_sessions'
     and column_name in (
       'prayer', 'prayer_request', 'capability_token', 'raw_body',
       'raw_payload', 'card_number', 'cvv', 'cvc', 'provider_secret'
     )),
  0::bigint,
  'ledger has no prayer, raw token, raw payload, card, or secret columns'
);
select extensions.is(
  public.mock_hmac_sha256_hex(
    'key', 'The quick brown fox jumps over the lazy dog'
  ),
  'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  'private helper implements standard HMAC-SHA-256'
);
set local role anon;
select extensions.throws_like(
  $$select * from public.mock_giving_checkout_sessions limit 1$$,
  '%permission denied%',
  'anon direct ledger reads fail at the privilege boundary'
);
reset role;

-- One-time creation, exact idempotency, tenant isolation, and safe reads
-- (17-30).
set local role service_role;
select pg_catalog.set_config('p18.one_checkout', checkout_id::text, true),
       pg_catalog.set_config('p18.one_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p18-hosted-active', '18111111-1111-4111-8111-111111111111',
  'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
  5000, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
);
reset role;

select extensions.ok(
  pg_catalog.current_setting('p18.one_checkout')::uuid is not null,
  'begin returns an opaque checkout UUID'
);
select extensions.is(
  (select status::text from public.donations
   where id = pg_catalog.current_setting('p18.one_donation')::uuid),
  'pending',
  'begin persists a pending donation before hosted checkout'
);
select extensions.ok(
  (select donor.auth_user_id is null
   from public.mock_giving_checkout_sessions checkout
   join public.donors donor on donor.id = checkout.donor_id
   where checkout.id = pg_catalog.current_setting('p18.one_checkout')::uuid),
  'checkout uses a separate unlinked guest donor'
);
select extensions.ok(
  (select donor_message is null from public.donations
   where id = pg_catalog.current_setting('p18.one_donation')::uuid),
  'checkout cannot persist a prayer or donor message'
);
select extensions.ok(
  (select settled_at is null from public.donations
   where id = pg_catalog.current_setting('p18.one_donation')::uuid),
  'pending checkout is not represented as settled'
);
select extensions.is(
  (select row_to_json(checkout)::text like
      '%18111111-1111-4111-8111-111111111111%'
   from public.mock_giving_checkout_sessions checkout
   where checkout.id = pg_catalog.current_setting('p18.one_checkout')::uuid),
  false,
  'raw capability token is never stored'
);
select extensions.is(
  (select count(*) from public.payment_provider_references
   where donation_id = pg_catalog.current_setting('p18.one_donation')::uuid),
  2::bigint,
  'checkout creates only sanitized checkout and payment references'
);
select extensions.is(
  (select count(*) from public.webhook_events),
  0::bigint,
  'P18 begin does not invent webhook journal entries'
);

set local role service_role;
select extensions.is(
  (select replayed from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18111111-1111-4111-8111-111111111111',
    'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
    5000, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
  )),
  true,
  'an exact repeated start returns its original checkout'
);
reset role;
select extensions.is(
  (select count(*) from public.mock_giving_checkout_sessions),
  1::bigint,
  'exact replay does not duplicate checkout state'
);

set local role service_role;
select extensions.throws_like(
  $$select * from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18111111-1111-4111-8111-111111111111',
    'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
    5001, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
  )$$,
  '%MOCK_CHECKOUT_IDEMPOTENCY_CONFLICT%',
  'same capability with changed payload is rejected'
);
select extensions.throws_like(
  $$select * from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18999999-9999-4999-8999-999999999999',
    'fund', pg_catalog.current_setting('p18.other_fund')::uuid,
    5000, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
  )$$,
  '%MOCK_CHECKOUT_UNAVAILABLE%',
  'cross-tenant fund targeting fails closed'
);
select extensions.throws_like(
  $$select * from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18999999-9999-4999-8999-999999999999',
    'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
    99, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
  )$$,
  '%MOCK_CHECKOUT_INVALID_REQUEST%',
  'amount below the reviewed minimum is rejected'
);
select extensions.throws_like(
  $$select * from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18999999-9999-4999-8999-999999999999',
    null::text, pg_catalog.current_setting('p18.active_fund')::uuid,
    5000, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
  )$$,
  '%MOCK_CHECKOUT_INVALID_REQUEST%',
  'null target kind is rejected explicitly'
);
select extensions.throws_like(
  $$select * from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18999999-9999-4999-8999-999999999999',
    'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
    null::bigint, 'one_time', 'P18 Hosted Guest', 'p18-hosted@example.test'
  )$$,
  '%MOCK_CHECKOUT_INVALID_REQUEST%',
  'null amount is rejected explicitly'
);
select extensions.throws_like(
  $$select * from public.begin_mock_giving_checkout(
    'p18-hosted-active', '18999999-9999-4999-8999-999999999999',
    'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
    5000, null::text, 'P18 Hosted Guest', 'p18-hosted@example.test'
  )$$,
  '%MOCK_CHECKOUT_INVALID_REQUEST%',
  'null frequency is rejected explicitly'
);
reset role;
set local role anon;
select extensions.is(
  (select checkout_status from public.get_mock_giving_checkout(
    pg_catalog.current_setting('p18.one_checkout')::uuid,
    '18111111-1111-4111-8111-111111111111'
  )),
  'open',
  'correct capability returns the safe open checkout snapshot'
);
select extensions.is(
  (select count(*) from public.get_mock_giving_checkout(
    pg_catalog.current_setting('p18.one_checkout')::uuid,
    '18999999-9999-4999-8999-999999999999'
  )),
  0::bigint,
  'wrong capability reveals no checkout row'
);
reset role;

-- Recurring creation and idempotent cancellation (31-36).
set local role service_role;
select pg_catalog.set_config('p18.cancel_checkout', checkout_id::text, true),
       pg_catalog.set_config('p18.cancel_donation', donation_id::text, true)
from public.begin_mock_giving_checkout(
  'p18-hosted-active', '18222222-2222-4222-8222-222222222222',
  'fund', pg_catalog.current_setting('p18.active_fund')::uuid,
  2500, 'weekly', 'P18 Cancel Guest', 'p18-cancel@example.test'
);
reset role;
select extensions.is(
  (select recurring.status::text
   from public.mock_giving_checkout_sessions checkout
   join public.recurring_gifts recurring
     on recurring.id = checkout.recurring_gift_id
   where checkout.id = pg_catalog.current_setting('p18.cancel_checkout')::uuid),
  'incomplete',
  'recurring checkout starts with an incomplete schedule'
);
select extensions.ok(
  coalesce(
    (select provider_schedule_reference like 'mock_schedule_%'
     from public.mock_giving_checkout_sessions
     where id = pg_catalog.current_setting('p18.cancel_checkout')::uuid),
    false
  ),
  'recurring checkout has a safe mock schedule reference'
);
set local role anon;
select extensions.is(
  (select checkout_status from public.cancel_mock_giving_checkout(
    pg_catalog.current_setting('p18.cancel_checkout')::uuid,
    '18222222-2222-4222-8222-222222222222'
  )),
  'canceled',
  'capability holder can cancel the pending checkout'
);
reset role;
select extensions.is(
  (select status::text from public.donations
   where id = pg_catalog.current_setting('p18.cancel_donation')::uuid),
  'canceled',
  'cancellation closes the pending donation'
);
select extensions.is(
  (select recurring.status::text
   from public.mock_giving_checkout_sessions checkout
   join public.recurring_gifts recurring
     on recurring.id = checkout.recurring_gift_id
   where checkout.id = pg_catalog.current_setting('p18.cancel_checkout')::uuid),
  'canceled',
  'cancellation closes the incomplete recurring schedule'
);
set local role anon;
select extensions.is(
  (select replayed from public.cancel_mock_giving_checkout(
    pg_catalog.current_setting('p18.cancel_checkout')::uuid,
    '18222222-2222-4222-8222-222222222222'
  )),
  true,
  'repeated cancellation is an idempotent replay'
);
reset role;

-- Signed mock completion, no settlement claim, and no raw webhook storage
-- (37-46).
select pg_catalog.set_config(
  'p18.raw_body',
  jsonb_build_object(
    'checkoutId', pg_catalog.current_setting('p18.one_checkout'),
    'eventId', 'mock_event_' || pg_catalog.replace(
      pg_catalog.current_setting('p18.one_checkout'), '-', ''
    ),
    'paymentReference', 'mock_payment_' || pg_catalog.replace(
      pg_catalog.current_setting('p18.one_checkout'), '-', ''
    ),
    'type', 'payment.succeeded'
  )::text,
  true
);
select pg_catalog.set_config(
  'p18.signature',
  public.mock_hmac_sha256_hex(
    '18111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p18.raw_body')
  ),
  true
);
select pg_catalog.set_config(
  'p18.null_body',
  jsonb_build_object(
    'checkoutId', pg_catalog.current_setting('p18.one_checkout'),
    'eventId', 'mock_event_' || pg_catalog.replace(
      pg_catalog.current_setting('p18.one_checkout'), '-', ''
    ),
    'paymentReference', 'mock_payment_' || pg_catalog.replace(
      pg_catalog.current_setting('p18.one_checkout'), '-', ''
    ),
    'type', null
  )::text,
  true
);
select pg_catalog.set_config(
  'p18.null_signature',
  public.mock_hmac_sha256_hex(
    '18111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p18.null_body')
  ),
  true
);
set local role anon;
select extensions.throws_like(
  $$select * from public.complete_mock_giving_checkout(
    pg_catalog.current_setting('p18.one_checkout')::uuid,
    '18111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p18.null_body'),
    pg_catalog.current_setting('p18.null_signature')
  )$$,
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'signed JSON null cannot bypass required string webhook fields'
);
select extensions.throws_like(
  $$select * from public.complete_mock_giving_checkout(
    pg_catalog.current_setting('p18.one_checkout')::uuid,
    '18111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p18.raw_body'),
    repeat('0', 64)
  )$$,
  '%MOCK_CHECKOUT_INVALID_WEBHOOK%',
  'invalid HMAC cannot complete a donation'
);
select extensions.is(
  (select checkout_status from public.complete_mock_giving_checkout(
    pg_catalog.current_setting('p18.one_checkout')::uuid,
    '18111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p18.raw_body'),
    pg_catalog.current_setting('p18.signature')
  )),
  'completed',
  'valid exact-body HMAC completes the mock checkout'
);
reset role;
select extensions.is(
  (select status::text from public.donations
   where id = pg_catalog.current_setting('p18.one_donation')::uuid),
  'succeeded',
  'valid completion marks the donation succeeded'
);
select extensions.is(
  (select processing_fee_minor from public.donations
   where id = pg_catalog.current_setting('p18.one_donation')::uuid),
  175::bigint,
  'mock completion records the deterministic development fee'
);
select extensions.ok(
  (select settled_at is null from public.donations
   where id = pg_catalog.current_setting('p18.one_donation')::uuid),
  'provider success does not falsely claim settlement'
);
select extensions.ok(
  (select donor.last_gave_at is not null
   from public.mock_giving_checkout_sessions checkout
   join public.donors donor on donor.id = checkout.donor_id
   where checkout.id = pg_catalog.current_setting('p18.one_checkout')::uuid),
  'successful giving updates the guest donor last-gave timestamp'
);
select extensions.is(
  (select row_to_json(checkout)::text like '%payment.succeeded%'
   from public.mock_giving_checkout_sessions checkout
   where checkout.id = pg_catalog.current_setting('p18.one_checkout')::uuid),
  false,
  'raw webhook body is not persisted in checkout storage'
);
select extensions.is(
  (select count(*) from public.webhook_events),
  1::bigint,
  'P18 completion now creates one durable P19 webhook journal row'
);
set local role anon;
select extensions.is(
  (select replayed from public.complete_mock_giving_checkout(
    pg_catalog.current_setting('p18.one_checkout')::uuid,
    '18111111-1111-4111-8111-111111111111',
    pg_catalog.current_setting('p18.raw_body'),
    pg_catalog.current_setting('p18.signature')
  )),
  true,
  'exact signed completion replay is idempotent'
);
reset role;
set local role anon;
select extensions.set_eq(
  $$select key
    from public.get_mock_giving_checkout(
      pg_catalog.current_setting('p18.one_checkout')::uuid,
      '18111111-1111-4111-8111-111111111111'
    ) checkout
    cross join lateral jsonb_object_keys(to_jsonb(checkout)) key$$,
  array[
    'checkout_id', 'church_slug', 'church_name', 'fund_name', 'campaign_name',
    'amount_minor_text', 'currency', 'frequency', 'checkout_status',
    'expires_at', 'provider_payment_reference', 'provider_schedule_reference',
    'thank_you_message', 'created_at'
  ],
  'public snapshot exposes exactly the reviewed safe fields'
);
reset role;

select extensions.throws_like(
  $$update public.mock_giving_checkout_sessions
    set completed_at = completed_at + interval '1 second'
    where id = pg_catalog.current_setting('p18.one_checkout')::uuid$$,
  '%MOCK_CHECKOUT_TERMINAL_STATE_IMMUTABLE%',
  'terminal completion evidence is immutable'
);

select * from extensions.finish();
rollback;
