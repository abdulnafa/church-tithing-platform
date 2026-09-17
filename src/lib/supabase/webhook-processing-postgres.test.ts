import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const churchId = "f2900000-0000-4000-8000-000000000001";
const connectionId = "f2910000-0000-4000-8000-000000000001";

const tokens = {
  success: "19111111-1111-4111-8111-111111111111",
  failureThenSuccess: "19222222-2222-4222-8222-222222222222",
  staleSuccess: "19333333-3333-4333-8333-333333333333",
  successThenFailure: "19444444-4444-4444-8444-444444444444",
  handlerRetry: "19555555-5555-4555-8555-555555555555",
  invalid: "19666666-6666-4666-8666-666666666666",
  legacy: "19777777-7777-4777-8777-777777777777",
  constraints: "19888888-8888-4888-8888-888888888888",
  cap: "19999999-9999-4999-8999-999999999999",
} as const;

const migrationFiles = [
  "202608180001_initial_schema.sql",
  "202609050001_harden_active_profile_authorization.sql",
  "202609050002_staff_permissions_and_audit_foundation.sql",
  "202609050003_provision_church_rpc.sql",
  "202609050004_church_settings_and_logo_storage.sql",
  "202609050005_fund_management.sql",
  "202609050006_campaign_management.sql",
  "202609070007_staff_invitation_audit_action.sql",
  "202609070008_staff_management.sql",
  "202609070009_platform_tenant_management.sql",
  "202609080010_public_giving_data.sql",
  "202609090011_donor_profile_audit_catalog.sql",
  "202609090012_donor_profiles.sql",
  "202609100013_prayer_request_privacy.sql",
  "202609110014_qr_resolution.sql",
  "202609170015_mock_giving_checkout.sql",
  "202609170016_webhook_processing.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type StartResult = {
  checkout_id: string;
  donation_id: string;
  expires_at: string;
  replayed: boolean;
};

type CheckoutFixture = StartResult & {
  created_at: string;
  provider_payment_reference: string;
};

type CompletionResult = {
  checkout_id: string;
  checkout_status: string;
  donation_status: string;
  recurring_status: string | null;
  replayed: boolean;
  webhook_event_id: string;
  webhook_status: string;
  webhook_outcome: string;
};

type SignedEvent = Readonly<{
  rawBody: string;
  signature: string;
}>;

async function installPlatform(target: PGlite, through = migrations.length) {
  await target.waitReady;
  await target.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    alter default privileges in schema public
      grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on functions to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid()
    returns uuid language sql stable set search_path = '' as $$
      select nullif(
        pg_catalog.current_setting('request.jwt.claim.sub', true),
        ''
      )::uuid;
    $$;
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null unique,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null,
      owner_id text,
      metadata jsonb,
      constraint storage_objects_bucket_name_unique unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects
      to anon, authenticated, service_role;
    grant select on storage.buckets to anon, authenticated, service_role;
  `);

  for (const migration of migrations.slice(0, through)) {
    await target.exec(migration);
  }
}

async function asRole<T extends Record<string, unknown>>(
  target: PGlite,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
) {
  await target.exec("begin;");
  try {
    await target.exec(`set local role ${role};`);
    const result = await target.query<T>(sql);
    await target.exec("commit;");
    return result;
  } catch (error) {
    await target.exec("rollback;");
    throw error;
  }
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function signedEvent(
  checkout: CheckoutFixture,
  token: string,
  eventId: string,
  type: "payment.succeeded" | "payment.failed",
  offsetMilliseconds = 0,
): SignedEvent {
  const occurredAt = new Date(
    new Date(checkout.created_at).getTime() + offsetMilliseconds,
  ).toISOString();
  const rawBody = JSON.stringify({
    checkoutId: checkout.checkout_id,
    eventId,
    occurredAt,
    paymentReference: checkout.provider_payment_reference,
    type,
  });
  return {
    rawBody,
    signature: createHmac("sha256", token).update(rawBody).digest("hex"),
  };
}

async function complete(
  target: PGlite,
  checkout: CheckoutFixture,
  token: string,
  event: SignedEvent,
  role: "anon" | "service_role" = "service_role",
) {
  const result = await asRole<CompletionResult>(
    target,
    role,
    `select * from public.${
      role === "anon"
        ? "complete_mock_giving_checkout"
        : "process_mock_giving_webhook"
    }(
      '${checkout.checkout_id}', '${token}', ${sqlText(event.rawBody)},
      '${event.signature}'
    );`,
  );
  return result.rows[0]!;
}

const db = new PGlite();
let defaultFundId: string;

async function beginCheckout(token: string, label: string) {
  const started = await asRole<StartResult>(
    db,
    "service_role",
    `select * from public.begin_mock_giving_checkout(
      'p19-active', '${token}', 'fund', '${defaultFundId}', 5000,
      'one_time', 'P19 ${label}', 'p19-${label.toLowerCase()}@example.test'
    );`,
  );
  const checkout = await db.query<{
    created_at: string;
    provider_payment_reference: string;
  }>(`select created_at, provider_payment_reference
      from public.mock_giving_checkout_sessions
      where id = '${started.rows[0]!.checkout_id}';`);
  return { ...started.rows[0]!, ...checkout.rows[0]! };
}

describe("P19 webhook persistence and replay behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at
      ) values (
        '${churchId}', 'P19 Active Church', 'P19 Active Church Inc.',
        'p19-active', 'active', 'BBD', 'America/Barbados',
        'p19-active@example.test', now()
      );

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, payouts_enabled,
        supported_currencies, capabilities
      ) values (
        '${connectionId}', '${churchId}', 'mock-development-gateway',
        'p19-active-development', 'active', true, true, true, true,
        array['BBD'],
        '{"environment":"development","settlement_mode":"direct_to_church"}'
      );
    `);
    const fund = await db.query<{ id: string }>(`
      select id from public.funds
      where church_id = '${churchId}' and is_default;
    `);
    defaultFundId = fund.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("applies after the historical chain and safely backfills a legacy row", async () => {
    const preflight = new PGlite();
    try {
      await installPlatform(preflight, migrations.length - 1);
      const preP19ChurchId = "f3900000-0000-4000-8000-000000000001";
      const preP19ConnectionId = "f3910000-0000-4000-8000-000000000001";
      const preP19Token = "f3920000-0000-4000-8000-000000000001";
      await preflight.exec(`
        insert into public.churches (
          id, name, legal_name, slug, status, default_currency, timezone,
          support_email, activated_at
        ) values (
          '${preP19ChurchId}', 'Pre-P19 Church', 'Pre-P19 Church Inc.',
          'pre-p19', 'active', 'BBD', 'America/Barbados',
          'pre-p19@example.test', now()
        );
        insert into public.payment_provider_connections (
          id, church_id, provider, external_account_reference, status,
          is_primary, charges_enabled, recurring_enabled, payouts_enabled,
          supported_currencies, capabilities
        ) values (
          '${preP19ConnectionId}', '${preP19ChurchId}',
          'mock-development-gateway', 'pre-p19-development', 'active',
          true, true, true, true, array['BBD'],
          '{"environment":"development","settlement_mode":"direct_to_church"}'
        );
      `);
      const preP19Fund = await preflight.query<{ id: string }>(`select id
        from public.funds
        where church_id = '${preP19ChurchId}' and is_default;
      `);
      const preP19Started = await asRole<StartResult>(
        preflight,
        "service_role",
        `select * from public.begin_mock_giving_checkout(
          'pre-p19', '${preP19Token}', 'fund',
          '${preP19Fund.rows[0]!.id}', 4900, 'one_time',
          'Pre P19 Donor', 'pre-p19-donor@example.test'
        );`,
      );
      const preP19CheckoutId = preP19Started.rows[0]!.checkout_id;
      const preP19Body = JSON.stringify({
        checkoutId: preP19CheckoutId,
        eventId: `mock_event_${preP19CheckoutId.replaceAll("-", "")}`,
        paymentReference: `mock_payment_${preP19CheckoutId.replaceAll("-", "")}`,
        type: "payment.succeeded",
      });
      const preP19Signature = createHmac("sha256", preP19Token)
        .update(preP19Body)
        .digest("hex");
      const originalCompletion = await asRole<Record<string, unknown>>(
        preflight,
        "anon",
        `select * from public.complete_mock_giving_checkout(
          '${preP19CheckoutId}', '${preP19Token}',
          ${sqlText(preP19Body)}, '${preP19Signature}'
        );`,
      );
      expect(originalCompletion.rows[0]).toMatchObject({
        checkout_status: "completed",
        donation_status: "succeeded",
        replayed: false,
      });
      await preflight.exec(`
        insert into public.webhook_events (
          provider, external_event_reference, event_type, status,
          sanitized_payload
        ) values
          (
            'legacy-provider', 'legacy-event-p19', 'legacy.received',
            'received', '{}'
          ),
          (
            'Legacy-Provider', 'legacy-failed-p19', 'legacy.failed',
            'failed', '{}'
          );
        update public.webhook_events
        set payload_sha256 = 'MALFORMED',
            last_error = 'unsafe p19-user@example.test error'
        where external_event_reference = 'legacy-failed-p19';
      `);
      await preflight.exec(migrations.at(-1)!);
      const migratedReplay = await asRole<CompletionResult>(
        preflight,
        "anon",
        `select * from public.complete_mock_giving_checkout(
          '${preP19CheckoutId}', '${preP19Token}',
          ${sqlText(preP19Body)}, '${preP19Signature}'
        );`,
      );
      expect(migratedReplay.rows[0]).toMatchObject({
        checkout_status: "completed",
        donation_status: "succeeded",
        webhook_status: "ignored",
        webhook_outcome: "ignored_terminal_state",
        replayed: true,
      });
      const migratedJournal = await preflight.query<Record<string, unknown>>(
        `select count(*)::integer event_count,
          min(payload_sha256) payload_sha256,
          count(audit_log_id)::integer audit_count
         from public.webhook_events
         where external_event_reference =
           'mock_event_${preP19CheckoutId.replaceAll("-", "")}';`,
      );
      expect(migratedJournal.rows[0]).toEqual({
        event_count: 1,
        payload_sha256: createHash("sha256")
          .update(preP19Body)
          .digest("hex"),
        audit_count: 0,
      });
      const changedPreP19Body = JSON.stringify(
        JSON.parse(preP19Body) as Record<string, unknown>,
        null,
        2,
      );
      await expect(
        asRole<Record<string, unknown>>(
          preflight,
          "anon",
          `select * from public.complete_mock_giving_checkout(
            '${preP19CheckoutId}', '${preP19Token}',
            ${sqlText(changedPreP19Body)},
            '${createHmac("sha256", preP19Token)
              .update(changedPreP19Body)
              .digest("hex")}'
          );`,
        ),
      ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_WEBHOOK/);
      const state = await preflight.query<Record<string, unknown>>(`select
        payload_sha256,
        event_occurred_at is not null event_time_present,
        delivery_count,
        last_received_at = received_at delivery_time_backfilled,
        processing_outcome
        from public.webhook_events
        where external_event_reference = 'legacy-event-p19';
      `);
      expect(state.rows[0]).toMatchObject({
        event_time_present: true,
        delivery_count: 1,
        delivery_time_backfilled: true,
        processing_outcome: null,
      });
      expect(state.rows[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
      const failed = await preflight.query<Record<string, unknown>>(`select
        provider,
        payload_sha256,
        processing_outcome,
        last_error,
        event_occurred_at is not null event_time_present,
        delivery_count
        from public.webhook_events
        where external_event_reference = 'legacy-failed-p19';
      `);
      expect(failed.rows[0]).toMatchObject({
        provider: "Legacy-Provider",
        processing_outcome: "handler_failed",
        last_error: "LEGACY_HANDLER_FAILED",
        event_time_present: true,
        delivery_count: 1,
      });
      expect(failed.rows[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await preflight.close();
    }
  }, 60_000);

  it("keeps completion capability-guarded for legacy anon and Preview service use while the processor stays private", async () => {
    const access = await db.query<Record<string, unknown>>(`select
      has_function_privilege(
        'service_role',
        'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
        'EXECUTE'
      ) service_complete,
      has_function_privilege(
        'anon',
        'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
        'EXECUTE'
      ) anon_complete,
      has_function_privilege(
        'authenticated',
        'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
        'EXECUTE'
      ) authenticated_complete,
      has_function_privilege(
        'service_role',
        'public.process_mock_giving_webhook(uuid,uuid,text,text)',
        'EXECUTE'
      ) service_p19,
      has_function_privilege(
        'anon',
        'public.process_mock_giving_webhook(uuid,uuid,text,text)',
        'EXECUTE'
      ) anon_p19,
      has_function_privilege(
        'service_role',
        'public.process_mock_giving_webhook_event(uuid,uuid)',
        'EXECUTE'
      ) service_processor,
      has_function_privilege(
        'service_role',
        'public.process_mock_giving_webhook_core(uuid,uuid,text,text,text)',
        'EXECUTE'
      ) service_core,
      has_type_privilege(
        'service_role', 'public.mock_giving_checkout_completion_result',
        'USAGE'
      ) service_result_type,
      has_type_privilege(
        'anon', 'public.mock_giving_checkout_completion_result', 'USAGE'
      ) anon_result_type,
      has_table_privilege(
        'service_role', 'public.webhook_events', 'SELECT'
      ) service_journal_read,
      has_table_privilege(
        'service_role', 'public.webhook_events', 'INSERT'
      ) service_journal_insert,
      (select relforcerowsecurity from pg_catalog.pg_class
       where oid = 'public.webhook_events'::regclass) forced_rls;
    `);
    expect(access.rows[0]).toEqual({
      service_complete: false,
      anon_complete: true,
      authenticated_complete: false,
      service_p19: true,
      anon_p19: false,
      service_processor: false,
      service_core: false,
      service_result_type: true,
      anon_result_type: true,
      service_journal_read: true,
      service_journal_insert: false,
      forced_rls: true,
    });
  });

  it("totalizes sanitized payload, provider routing, outcome, and donation watermark constraints", async () => {
    const predicate = await db.query<Record<string, unknown>>(`select
      public.webhook_sanitized_payload_is_safe('{}'::jsonb) empty_object,
      public.webhook_sanitized_payload_is_safe(null::jsonb) null_value;
    `);
    expect(predicate.rows[0]).toEqual({
      empty_object: false,
      null_value: false,
    });

    const checkout = await beginCheckout(tokens.constraints, "Constraints");
    await expect(
      db.exec(`insert into public.webhook_events (
        provider, external_event_reference, event_type, payload_sha256,
        sanitized_payload, event_occurred_at
      ) values (
        'MoCk-DeVeLoPmEnT-GaTeWaY', 'mixed-case-route-p19',
        'payment.succeeded', '${"1".repeat(64)}',
        '{"checkout_id":"19888888-8888-4888-8888-888888888888",
          "donation_id":"19888888-8888-4888-8888-888888888889",
          "event_occurred_at":"2026-09-17T00:00:00.000Z",
          "payment_reference":"mock_payment_${"8".repeat(32)}"}',
        now()
      );`),
    ).rejects.toThrow(/webhook_events_mock_route_complete/);
    await expect(
      db.exec(`insert into public.webhook_events (
        church_id, connection_id, donation_id, provider,
        external_event_reference, event_type, payload_sha256,
        sanitized_payload, event_occurred_at
      ) values (
        '${churchId}', '${connectionId}', '${checkout.donation_id}',
        'MoCk-DeVeLoPmEnT-GaTeWaY', 'mixed-case-safe-p19',
        'payment.succeeded', '${"2".repeat(64)}', '{}', now()
      );`),
    ).rejects.toThrow(/webhook_events_sanitized_payload_safe/);
    await expect(
      db.exec(`insert into public.webhook_events (
        provider, external_event_reference, event_type, status,
        payload_sha256, sanitized_payload, event_occurred_at, processed_at
      ) values (
        'constraint-provider', 'null-terminal-outcome-p19', 'test.processed',
        'processed', '${"3".repeat(64)}', '{}', now(), now()
      );`),
    ).rejects.toThrow(/webhook_events_status_outcome_consistent/);
    await expect(
      db.exec(`update public.donations
        set provider_event_reference = 'incomplete-watermark-p19',
            provider_event_type = null,
            provider_event_occurred_at = now()
        where id = '${checkout.donation_id}';`),
    ).rejects.toThrow(/donations_provider_event_watermark_check/);
  });

  it("preserves the exact legacy four-key anon success flow for the shared Development-backed Production demo", async () => {
    const checkout = await beginCheckout(tokens.legacy, "Legacy");
    const rawBody = JSON.stringify({
      checkoutId: checkout.checkout_id,
      eventId: `mock_event_${checkout.checkout_id.replaceAll("-", "")}`,
      paymentReference: checkout.provider_payment_reference,
      type: "payment.succeeded",
    });
    const signature = createHmac("sha256", tokens.legacy)
      .update(rawBody)
      .digest("hex");
    const wrongEventBody = JSON.stringify({
      checkoutId: checkout.checkout_id,
      eventId: `mock_event_${"9".repeat(32)}`,
      paymentReference: checkout.provider_payment_reference,
      type: "payment.succeeded",
    });
    await expect(
      complete(
        db,
        checkout,
        tokens.legacy,
        {
          rawBody: wrongEventBody,
          signature: createHmac("sha256", tokens.legacy)
            .update(wrongEventBody)
            .digest("hex"),
        },
        "anon",
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_WEBHOOK/);
    const formattingDriftBody = JSON.stringify(
      {
        type: "payment.succeeded",
        paymentReference: checkout.provider_payment_reference,
        eventId: `mock_event_${checkout.checkout_id.replaceAll("-", "")}`,
        checkoutId: checkout.checkout_id,
      },
      null,
      2,
    );
    await db.exec(`update public.payment_provider_connections
      set status = 'disabled' where id = '${connectionId}';`);
    try {
      const failed = await complete(
        db,
        checkout,
        tokens.legacy,
        { rawBody, signature },
        "anon",
      );
      expect(failed).toMatchObject({
        checkout_id: null,
        checkout_status: null,
        donation_status: null,
        replayed: null,
        webhook_status: null,
        webhook_outcome: null,
      });
      const durableFailure = await db.query<Record<string, unknown>>(`select
        event.status::text webhook_status,
        event.processing_outcome webhook_outcome,
        donation.status::text donation_status
        from public.webhook_events event
        join public.donations donation on donation.id = event.donation_id
        where event.donation_id = '${checkout.donation_id}';
      `);
      expect(durableFailure.rows[0]).toEqual({
        webhook_status: "failed",
        webhook_outcome: "handler_failed",
        donation_status: "pending",
      });
      await expect(
        complete(
          db,
          checkout,
          tokens.legacy,
          {
            rawBody: formattingDriftBody,
            signature: createHmac("sha256", tokens.legacy)
              .update(formattingDriftBody)
              .digest("hex"),
          },
          "anon",
        ),
      ).rejects.toThrow(/MOCK_WEBHOOK_EVENT_COLLISION/);
    } finally {
      await db.exec(`update public.payment_provider_connections
        set status = 'active' where id = '${connectionId}';`);
    }
    const result = await complete(
      db,
      checkout,
      tokens.legacy,
      { rawBody, signature },
      "anon",
    );
    expect(result).toMatchObject({
      checkout_status: "completed",
      donation_status: "succeeded",
      webhook_status: "processed",
      webhook_outcome: "donation_succeeded",
      replayed: true,
    });
    await expect(
      complete(
        db,
        checkout,
        tokens.legacy,
        {
          rawBody: formattingDriftBody,
          signature: createHmac("sha256", tokens.legacy)
            .update(formattingDriftBody)
            .digest("hex"),
        },
        "anon",
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_WEBHOOK/);
    const rawPayloadHash = createHash("sha256").update(rawBody).digest("hex");
    const stored = await db.query<Record<string, unknown>>(`select
      event.event_occurred_at =
        date_trunc('milliseconds', checkout.created_at)
        derived_from_created_at,
      event.delivery_count,
      event.payload_sha256,
      checkout.completion_payload_sha256,
      donation.settled_at
      from public.webhook_events event
      join public.mock_giving_checkout_sessions checkout
        on checkout.donation_id = event.donation_id
      join public.donations donation on donation.id = event.donation_id
      where event.id = '${result.webhook_event_id}';
    `);
    expect(stored.rows[0]).toEqual({
      derived_from_created_at: true,
      delivery_count: 2,
      payload_sha256: rawPayloadHash,
      completion_payload_sha256: rawPayloadHash,
      settled_at: null,
    });
  });

  it("persists one sanitized success and treats an exact replay as delivery only", async () => {
    const checkout = await beginCheckout(tokens.success, "Success");
    const event = signedEvent(
      checkout,
      tokens.success,
      `mock_event_${"a".repeat(32)}`,
      "payment.succeeded",
      1_000,
    );
    const first = await complete(db, checkout, tokens.success, event);
    const replay = await complete(db, checkout, tokens.success, event);
    expect(first).toMatchObject({
      checkout_status: "completed",
      donation_status: "succeeded",
      webhook_status: "processed",
      webhook_outcome: "donation_succeeded",
      replayed: false,
    });
    expect(replay).toMatchObject({
      webhook_event_id: first.webhook_event_id,
      webhook_status: "processed",
      webhook_outcome: "donation_succeeded",
      replayed: true,
    });

    const evidence = await db.query<Record<string, unknown>>(`select
      event.delivery_count,
      event.attempt_count,
      event.audit_log_id,
      event.sanitized_payload,
      donation.status::text donation_status,
      donation.settled_at,
      donation.provider_event_type,
      donation.provider_terminal_audit_log_id,
      (select count(*)::integer from public.audit_logs audit
       where audit.id = event.audit_log_id) audit_count
      from public.webhook_events event
      join public.donations donation on donation.id = event.donation_id
      where event.id = '${first.webhook_event_id}';
    `);
    expect(evidence.rows[0]).toMatchObject({
      delivery_count: 2,
      attempt_count: 1,
      donation_status: "succeeded",
      settled_at: null,
      provider_event_type: "payment.succeeded",
      audit_count: 1,
    });
    expect(evidence.rows[0]?.audit_log_id).toBe(
      evidence.rows[0]?.provider_terminal_audit_log_id,
    );
    const stored = JSON.stringify(evidence.rows[0]?.sanitized_payload);
    expect(stored).toContain("checkout_id");
    expect(stored).toContain("donation_id");
    expect(stored).not.toMatch(/P19 Success|example\.test|prayer|consent|4242/i);
  });

  it("rejects unsafe JSON keys and normalized timestamps before journaling", async () => {
    const checkout = await beginCheckout(tokens.invalid, "Invalid");
    const valid = signedEvent(
      checkout,
      tokens.invalid,
      `mock_event_${"b".repeat(32)}`,
      "payment.succeeded",
      1_000,
    );
    const withUnexpected = valid.rawBody.replace(
      /}$/, ",\"prayer\":\"must-not-persist\"}",
    );
    const duplicateType = valid.rawBody.replace(
      /}$/, ",\"type\":\"payment.succeeded\"}",
    );
    const escapedDuplicateType = valid.rawBody.replace(
      /}$/, ",\"typ\\u0065\":\"payment.succeeded\"}",
    );
    const noncanonicalTimestamp = JSON.stringify({
      ...(JSON.parse(valid.rawBody) as Record<string, unknown>),
      occurredAt: `${new Date(checkout.created_at)
        .toISOString()
        .slice(0, 17)}60.000Z`,
    });
    for (const rawBody of [
      withUnexpected,
      duplicateType,
      escapedDuplicateType,
      noncanonicalTimestamp,
    ]) {
      const signature = createHmac("sha256", tokens.invalid)
        .update(rawBody)
        .digest("hex");
      await expect(
        complete(db, checkout, tokens.invalid, { rawBody, signature }),
      ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_WEBHOOK/);
    }
    const rows = await db.query<{ count: number }>(`
      select count(*)::integer count from public.webhook_events
      where donation_id = '${checkout.donation_id}';
    `);
    expect(rows.rows[0]?.count).toBe(0);
  });

  it("caps distinct mock identities per checkout while keeping exact replays available", async () => {
    const checkout = await beginCheckout(tokens.cap, "IdentityCap");
    const events = Array.from({ length: 5 }, (_, index) =>
      signedEvent(
        checkout,
        tokens.cap,
        `mock_event_${(index + 1).toString(16).padStart(32, "0")}`,
        "payment.succeeded",
        (index + 1) * 1_000,
      ),
    );
    await db.exec(`update public.payment_provider_connections
      set status = 'disabled' where id = '${connectionId}';`);
    try {
      for (const event of events.slice(0, 4)) {
        const accepted = await complete(db, checkout, tokens.cap, event);
        expect(accepted).toMatchObject({
          checkout_status: "open",
          donation_status: "pending",
          webhook_status: "failed",
          webhook_outcome: "handler_failed",
        });
      }
      await expect(
        complete(db, checkout, tokens.cap, events[4]!),
      ).rejects.toThrow(/MOCK_WEBHOOK_EVENT_LIMIT/);
      const replay = await complete(db, checkout, tokens.cap, events[0]!);
      expect(replay).toMatchObject({
        replayed: true,
        webhook_status: "failed",
        webhook_outcome: "handler_failed",
      });
      const evidence = await db.query<Record<string, unknown>>(`select
        count(event.id)::integer event_count,
        sum(event.delivery_count)::integer delivery_count,
        count(event.audit_log_id)::integer audit_count,
        donation.status::text donation_status,
        donation.provider_event_reference
        from public.donations donation
        left join public.webhook_events event
          on event.donation_id = donation.id
        where donation.id = '${checkout.donation_id}'
        group by donation.id;
      `);
      expect(evidence.rows[0]).toEqual({
        event_count: 4,
        delivery_count: 5,
        audit_count: 0,
        donation_status: "pending",
        provider_event_reference: null,
      });
    } finally {
      await db.exec(`update public.payment_provider_connections
        set status = 'active' where id = '${connectionId}';`);
    }
  });

  it("rejects a reused provider event ID whose exact fingerprint changed", async () => {
    const checkoutRows = await db.query<CheckoutFixture>(`select
      checkout.id checkout_id,
      checkout.donation_id,
      checkout.expires_at,
      false replayed,
      checkout.created_at,
      checkout.provider_payment_reference
      from public.mock_giving_checkout_sessions checkout
      where checkout.capability_sha256 = encode(
        sha256(convert_to('${tokens.success}', 'UTF8')), 'hex'
      );
    `);
    const checkout = checkoutRows.rows[0]!;
    const collision = signedEvent(
      checkout,
      tokens.success,
      `mock_event_${"a".repeat(32)}`,
      "payment.failed",
      1_000,
    );
    await expect(
      complete(db, checkout, tokens.success, collision),
    ).rejects.toThrow(/MOCK_WEBHOOK_EVENT_COLLISION/);
    const delivery = await db.query<{ delivery_count: number }>(`
      select delivery_count from public.webhook_events
      where external_event_reference = 'mock_event_${"a".repeat(32)}';
    `);
    expect(delivery.rows[0]?.delivery_count).toBe(2);
  });

  it("processes provider failure and lets equal-time success win without a second audit", async () => {
    const checkout = await beginCheckout(
      tokens.failureThenSuccess,
      "FailureEqualSuccess",
    );
    const failed = signedEvent(
      checkout,
      tokens.failureThenSuccess,
      `mock_event_${"c".repeat(32)}`,
      "payment.failed",
      2_000,
    );
    const succeeded = signedEvent(
      checkout,
      tokens.failureThenSuccess,
      `mock_event_${"d".repeat(32)}`,
      "payment.succeeded",
      2_000,
    );
    const failedResult = await complete(
      db,
      checkout,
      tokens.failureThenSuccess,
      failed,
    );
    const successResult = await complete(
      db,
      checkout,
      tokens.failureThenSuccess,
      succeeded,
    );
    expect(failedResult).toMatchObject({
      donation_status: "failed",
      checkout_status: "open",
      webhook_status: "processed",
      webhook_outcome: "donation_failed",
    });
    expect(successResult).toMatchObject({
      donation_status: "succeeded",
      checkout_status: "completed",
      webhook_status: "processed",
      webhook_outcome: "donation_succeeded",
    });
    const state = await db.query<Record<string, unknown>>(`select
      donation.status::text,
      donation.failure_code,
      donation.failure_message,
      donation.failed_at,
      donation.settled_at,
      donation.provider_event_type,
      donation.provider_terminal_audit_log_id,
      (select count(*)::integer from public.audit_logs audit
       where audit.church_id = donation.church_id
         and audit.action_code = 'webhook_processed'
         and audit.id = donation.provider_terminal_audit_log_id) audit_count,
      (select audit_log_id from public.webhook_events
       where id = '${failedResult.webhook_event_id}') failed_audit_id,
      (select audit_log_id from public.webhook_events
       where id = '${successResult.webhook_event_id}') success_audit_id
      from public.donations donation
      where donation.id = '${checkout.donation_id}';
    `);
    expect(state.rows[0]).toMatchObject({
      status: "succeeded",
      failure_code: null,
      failure_message: null,
      failed_at: null,
      settled_at: null,
      provider_event_type: "payment.succeeded",
      audit_count: 1,
      success_audit_id: null,
    });
    expect(state.rows[0]?.provider_terminal_audit_log_id).toBe(
      state.rows[0]?.failed_audit_id,
    );
  });

  it("ignores an older success after failure and keeps its event auditable", async () => {
    const checkout = await beginCheckout(tokens.staleSuccess, "StaleSuccess");
    const failed = signedEvent(
      checkout,
      tokens.staleSuccess,
      `mock_event_${"e".repeat(32)}`,
      "payment.failed",
      10_000,
    );
    const staleSuccess = signedEvent(
      checkout,
      tokens.staleSuccess,
      `mock_event_${"f".repeat(32)}`,
      "payment.succeeded",
      5_000,
    );
    await complete(db, checkout, tokens.staleSuccess, failed);
    const ignored = await complete(
      db,
      checkout,
      tokens.staleSuccess,
      staleSuccess,
    );
    expect(ignored).toMatchObject({
      checkout_status: "open",
      donation_status: "failed",
      webhook_status: "ignored",
      webhook_outcome: "ignored_older_event",
    });
  });

  it("never lets equal or newer failure downgrade an applied success", async () => {
    const checkout = await beginCheckout(
      tokens.successThenFailure,
      "SuccessThenFailure",
    );
    const succeeded = signedEvent(
      checkout,
      tokens.successThenFailure,
      `mock_event_${"1".repeat(32)}`,
      "payment.succeeded",
      2_000,
    );
    const applied = await complete(
      db,
      checkout,
      tokens.successThenFailure,
      succeeded,
    );
    for (const [eventId, offset] of [
      [`mock_event_${"2".repeat(32)}`, 2_000],
      [`mock_event_${"3".repeat(32)}`, 5_000],
    ] as const) {
      const failed = signedEvent(
        checkout,
        tokens.successThenFailure,
        eventId,
        "payment.failed",
        offset,
      );
      const ignored = await complete(
        db,
        checkout,
        tokens.successThenFailure,
        failed,
      );
      expect(ignored).toMatchObject({
        donation_status: "succeeded",
        webhook_status: "ignored",
        webhook_outcome: "ignored_terminal_state",
      });
    }
    const audits = await db.query<{ count: number }>(`select count(*)::integer count
      from public.audit_logs where id = (
        select provider_terminal_audit_log_id from public.donations
        where id = '${checkout.donation_id}'
      );`);
    expect(audits.rows[0]?.count).toBe(1);
    expect(applied.webhook_status).toBe("processed");
  });

  it("keeps handler failure durable and safely retries the exact delivery", async () => {
    const checkout = await beginCheckout(tokens.handlerRetry, "HandlerRetry");
    const event = signedEvent(
      checkout,
      tokens.handlerRetry,
      `mock_event_${"4".repeat(32)}`,
      "payment.succeeded",
      1_000,
    );
    await db.exec(`update public.payment_provider_connections
      set status = 'disabled' where id = '${connectionId}';`);
    const failed = await complete(db, checkout, tokens.handlerRetry, event);
    expect(failed).toMatchObject({
      checkout_status: "open",
      donation_status: "pending",
      webhook_status: "failed",
      webhook_outcome: "handler_failed",
      replayed: false,
    });
    const durable = await db.query<Record<string, unknown>>(`select
      status::text,
      processing_outcome,
      last_error,
      delivery_count,
      attempt_count,
      audit_log_id
      from public.webhook_events where id = '${failed.webhook_event_id}';
    `);
    expect(durable.rows[0]).toEqual({
      status: "failed",
      processing_outcome: "handler_failed",
      last_error: "MOCK_CHECKOUT_UNAVAILABLE",
      delivery_count: 1,
      attempt_count: 1,
      audit_log_id: null,
    });

    await db.exec(`update public.payment_provider_connections
      set status = 'active' where id = '${connectionId}';`);
    const retried = await complete(db, checkout, tokens.handlerRetry, event);
    expect(retried).toMatchObject({
      checkout_status: "completed",
      donation_status: "succeeded",
      webhook_status: "processed",
      webhook_outcome: "donation_succeeded",
      replayed: true,
    });
    const recovered = await db.query<Record<string, unknown>>(`select
      status::text,
      processing_outcome,
      last_error,
      delivery_count,
      attempt_count,
      audit_log_id is not null audit_linked
      from public.webhook_events where id = '${failed.webhook_event_id}';
    `);
    expect(recovered.rows[0]).toEqual({
      status: "processed",
      processing_outcome: "donation_succeeded",
      last_error: null,
      delivery_count: 2,
      attempt_count: 2,
      audit_linked: true,
    });
  });

  it("rejects journal identity mutation, terminal rewrite, delete, and truncate", async () => {
    const event = await db.query<{ id: string }>(`select id
      from public.webhook_events
      where external_event_reference = 'mock_event_${"a".repeat(32)}';`);
    await expect(
      db.exec(`update public.webhook_events
        set event_type = 'payment.failed' where id = '${event.rows[0]!.id}';`),
    ).rejects.toThrow(/WEBHOOK_EVENT_IDENTITY_IMMUTABLE/);
    await expect(
      db.exec(`update public.webhook_events
        set status = 'failed' where id = '${event.rows[0]!.id}';`),
    ).rejects.toThrow(/WEBHOOK_EVENT_TERMINAL_STATE_IMMUTABLE/);
    await expect(
      db.exec(`delete from public.webhook_events
        where id = '${event.rows[0]!.id}';`),
    ).rejects.toThrow(/WEBHOOK_EVENT_HISTORY_IMMUTABLE/);
    await expect(db.exec("truncate public.webhook_events;")).rejects.toThrow(
      /WEBHOOK_EVENT_HISTORY_IMMUTABLE/,
    );
  });
});
