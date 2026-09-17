import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const churches = {
  active: "f2800000-0000-4000-8000-000000000001",
  other: "f2800000-0000-4000-8000-000000000002",
  suspended: "f2800000-0000-4000-8000-000000000003",
} as const;

const campaigns = {
  active: "f2810000-0000-4000-8000-000000000001",
} as const;

const specialFunds = {
  expiring: "f2830000-0000-4000-8000-000000000001",
} as const;

const connections = {
  active: "f2820000-0000-4000-8000-000000000001",
  other: "f2820000-0000-4000-8000-000000000002",
} as const;

const tokens = {
  oneTime: "18111111-1111-4111-8111-111111111111",
  recurring: "18222222-2222-4222-8222-222222222222",
  cancel: "18333333-3333-4333-8333-333333333333",
  complete: "18444444-4444-4444-8444-444444444444",
  revalidate: "18666666-6666-4666-8666-666666666666",
  expire: "18777777-7777-4777-8777-777777777777",
  invalid: "18555555-5555-4555-8555-555555555555",
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

type CheckoutRecord = {
  checkout_id: string;
  church_slug: string;
  church_name: string;
  fund_name: string;
  campaign_name: string | null;
  amount_minor_text: string;
  currency: string;
  frequency: string;
  checkout_status: string;
  expires_at: string;
  provider_payment_reference: string;
  provider_schedule_reference: string | null;
  thank_you_message: string | null;
};

type StateResult = {
  checkout_id: string;
  checkout_status: string;
  donation_status: string;
  recurring_status: string | null;
  replayed: boolean;
};

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

function beginSql(
  token: string,
  targetKind: "fund" | "campaign",
  targetId: string,
  frequency: "one_time" | "weekly" | "monthly" = "one_time",
  amountMinor = 5_000,
  slug = "p18-active",
) {
  return `select * from public.begin_mock_giving_checkout(
    '${slug}', '${token}', '${targetKind}', '${targetId}', ${amountMinor},
    '${frequency}', 'P18 Guest', 'p18-guest@example.test'
  );`;
}

function completionPayload(checkout: StartResult) {
  return JSON.stringify({
    checkoutId: checkout.checkout_id,
    eventId: `mock_event_${checkout.checkout_id.replaceAll("-", "")}`,
    paymentReference: `mock_payment_${checkout.checkout_id.replaceAll("-", "")}`,
    type: "payment.succeeded",
  });
}

const db = new PGlite();
let activeFundId: string;
let otherFundId: string;
let oneTimeCheckout: StartResult;
let recurringCheckout: StartResult;

describe("P18 mock giving checkout behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        thank_you_message, support_email, activated_at, suspended_at
      ) values
        ('${churches.active}', 'P18 Active Church', 'P18 Active Church Inc.',
          'p18-active', 'active', 'BBD', 'America/Barbados',
          'Thank you for giving.', 'active-p18@example.test', now(), null),
        ('${churches.other}', 'P18 Other Church', 'P18 Other Church Inc.',
          'p18-other', 'active', 'BBD', 'America/Barbados',
          null, 'other-p18@example.test', now(), null),
        ('${churches.suspended}', 'P18 Suspended', 'P18 Suspended Inc.',
          'p18-suspended', 'suspended', 'BBD', 'America/Barbados',
          null, 'suspended-p18@example.test', now(), now());

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, payouts_enabled,
        supported_currencies, capabilities
      ) values
        ('${connections.active}', '${churches.active}',
          'mock-development-gateway', 'p18-active-development', 'active',
          true, true, true, true, array['BBD'],
          '{"environment":"development","settlement_mode":"direct_to_church"}'),
        ('${connections.other}', '${churches.other}',
          'mock-development-gateway', 'p18-other-development', 'active',
          true, true, true, true, array['BBD'],
          '{"environment":"development","settlement_mode":"direct_to_church"}');

      insert into public.funds (
        id, church_id, name, slug, status, is_default, sort_order
      ) values (
        '${specialFunds.expiring}', '${churches.active}', 'P18 Expiring Fund',
        'p18-expiring-fund', 'active', false, 10
      );
    `);

    const funds = await db.query<{ church_id: string; id: string }>(`
      select church_id, id from public.funds
      where church_id in ('${churches.active}', '${churches.other}')
        and is_default;
    `);
    activeFundId = funds.rows.find(
      (row) => row.church_id === churches.active,
    )!.id;
    otherFundId = funds.rows.find(
      (row) => row.church_id === churches.other,
    )!.id;

    await db.exec(`
      insert into public.campaigns (
        id, church_id, fund_id, name, slug, status, currency, starts_at
      ) values (
        '${campaigns.active}', '${churches.active}', '${activeFundId}',
        'P18 Outreach', 'p18-outreach', 'active', 'BBD', now() - interval '1 day'
      );
    `);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("applies atomically after the complete historical chain", async () => {
    const preflight = new PGlite();
    try {
      await installPlatform(preflight, migrations.length - 1);
      const absent = await preflight.query<{ checkout: string | null }>(`
        select to_regprocedure(
          'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)'
        )::text checkout;
      `);
      expect(absent.rows[0]?.checkout).toBeNull();
      await preflight.exec(migrations.at(-1)!);
      const installed = await preflight.query<Record<string, unknown>>(`select
        to_regclass('public.mock_giving_checkout_sessions')::text checkout_table,
        to_regprocedure(
          'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)'
        )::text begin_rpc,
        to_regprocedure(
          'public.complete_mock_giving_checkout(uuid,uuid,text,text)'
        )::text complete_rpc;
      `);
      expect(installed.rows[0]).toEqual({
        checkout_table: "mock_giving_checkout_sessions",
        begin_rpc:
          "begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)",
        complete_rpc: "complete_mock_giving_checkout(uuid,uuid,text,text)",
      });
    } finally {
      await preflight.close();
    }
  }, 60_000);

  it("implements standard HMAC-SHA-256 and exact least-privilege ACLs", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      public.mock_hmac_sha256_hex(
        'key', 'The quick brown fox jumps over the lazy dog'
      ) hmac,
      has_function_privilege(
        'anon',
        'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)',
        'EXECUTE'
      ) anon_begin,
      has_function_privilege(
        'authenticated',
        'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)',
        'EXECUTE'
      ) authenticated_begin,
      has_function_privilege(
        'service_role',
        'public.begin_mock_giving_checkout(text,uuid,text,uuid,bigint,text,text,text)',
        'EXECUTE'
      ) service_begin,
      has_function_privilege(
        'service_role',
        'public.complete_mock_giving_checkout(uuid,uuid,text,text)',
        'EXECUTE'
      ) service_complete,
      has_function_privilege(
        'anon', 'public.mock_hmac_sha256_hex(text,text)', 'EXECUTE'
      ) anon_helper,
      has_type_privilege(
        'anon', 'public.mock_giving_checkout_start_result', 'USAGE'
      ) anon_start_type,
      has_type_privilege(
        'service_role', 'public.mock_giving_checkout_start_result', 'USAGE'
      ) service_start_type,
      has_type_privilege(
        'anon', 'public.mock_giving_checkout_record', 'USAGE'
      ) anon_record_type,
      has_table_privilege(
        'anon', 'public.mock_giving_checkout_sessions', 'SELECT'
      ) anon_table,
      has_table_privilege(
        'service_role', 'public.mock_giving_checkout_sessions', 'SELECT'
      ) service_table,
      (select relrowsecurity and relforcerowsecurity
       from pg_catalog.pg_class
       where oid = 'public.mock_giving_checkout_sessions'::regclass) forced_rls;
    `);
    expect(result.rows[0]).toEqual({
      hmac: "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
      anon_begin: false,
      authenticated_begin: false,
      service_begin: true,
      service_complete: false,
      anon_helper: false,
      anon_start_type: false,
      service_start_type: true,
      anon_record_type: true,
      anon_table: false,
      service_table: false,
      forced_rls: true,
    });

    await expect(
      asRole(db, "anon", "select * from public.mock_giving_checkout_sessions;"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(
        db,
        "anon",
        "select public.mock_hmac_sha256_hex('secret', 'body');",
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(
        db,
        "anon",
        beginSql(tokens.invalid, "fund", activeFundId),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("creates one guest donor and pending one-time donation without sensitive data", async () => {
    const started = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.oneTime, "fund", activeFundId),
    );
    expect(started.rows).toHaveLength(1);
    oneTimeCheckout = started.rows[0]!;
    expect(oneTimeCheckout.replayed).toBe(false);

    const stored = await db.query<Record<string, unknown>>(`select
      checkout.frequency,
      checkout.status checkout_status,
      checkout.recurring_gift_id,
      checkout.provider_schedule_reference,
      donor.auth_user_id,
      donor.display_name,
      donor.email,
      donation.status::text donation_status,
      donation.source::text source,
      donation.amount_minor::text amount_minor,
      donation.currency,
      donation.donor_message,
      donation.settled_at,
      donation.external_idempotency_key = checkout.capability_sha256
        idempotency_matches_capability,
      row_to_json(checkout)::text like '%${tokens.oneTime}%'
        contains_raw_capability,
      (select count(*)::integer from public.payment_provider_references ref
       where ref.donation_id = donation.id) provider_reference_count,
      (select count(*)::integer from public.webhook_events) webhook_count
    from public.mock_giving_checkout_sessions checkout
    join public.donors donor on donor.id = checkout.donor_id
    join public.donations donation on donation.id = checkout.donation_id
    where checkout.id = '${oneTimeCheckout.checkout_id}';
    `);
    expect(stored.rows[0]).toEqual({
      frequency: "one_time",
      checkout_status: "open",
      recurring_gift_id: null,
      provider_schedule_reference: null,
      auth_user_id: null,
      display_name: "P18 Guest",
      email: "p18-guest@example.test",
      donation_status: "pending",
      source: "online",
      amount_minor: "5000",
      currency: "BBD",
      donor_message: null,
      settled_at: null,
      idempotency_matches_capability: true,
      contains_raw_capability: false,
      provider_reference_count: 2,
      webhook_count: 0,
    });
  });

  it("replays one exact request without duplicating rows and rejects drift", async () => {
    const before = await db.query<Record<string, unknown>>(`select
      (select count(*)::integer from public.mock_giving_checkout_sessions)
        checkouts,
      (select count(*)::integer from public.donors
       where church_id = '${churches.active}') donors,
      (select count(*)::integer from public.donations
       where church_id = '${churches.active}') donations;
    `);
    const replay = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.oneTime, "fund", activeFundId),
    );
    expect(replay.rows[0]).toEqual({ ...oneTimeCheckout, replayed: true });
    const after = await db.query<Record<string, unknown>>(`select
      (select count(*)::integer from public.mock_giving_checkout_sessions)
        checkouts,
      (select count(*)::integer from public.donors
       where church_id = '${churches.active}') donors,
      (select count(*)::integer from public.donations
       where church_id = '${churches.active}') donations;
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);
    await expect(
      asRole(
        db,
        "service_role",
        beginSql(tokens.oneTime, "fund", activeFundId, "one_time", 5_001),
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_IDEMPOTENCY_CONFLICT/);
  });

  it("fails closed across tenants, unavailable churches, and malformed input", async () => {
    const before = await db.query<{ count: number }>(`
      select count(*)::integer count from public.mock_giving_checkout_sessions;
    `);
    await expect(
      asRole(
        db,
        "service_role",
        beginSql(tokens.invalid, "fund", otherFundId),
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_UNAVAILABLE/);
    await expect(
      asRole(
        db,
        "service_role",
        beginSql(tokens.invalid, "fund", activeFundId, "one_time", 5_000,
          "p18-suspended"),
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_UNAVAILABLE/);
    await expect(
      asRole(
        db,
        "service_role",
        beginSql(tokens.invalid, "fund", activeFundId, "one_time", 99),
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_REQUEST/);
    for (const invalidArguments of [
      `null::text, '${activeFundId}', 5000, 'one_time'`,
      `'fund', '${activeFundId}', null::bigint, 'one_time'`,
      `'fund', '${activeFundId}', 5000, null::text`,
    ]) {
      await expect(
        asRole(
          db,
          "service_role",
          `select * from public.begin_mock_giving_checkout(
            'p18-active', '${tokens.invalid}', ${invalidArguments},
            'P18 Guest', 'p18-guest@example.test'
          );`,
        ),
      ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_REQUEST/);
    }
    const after = await db.query<{ count: number }>(`
      select count(*)::integer count from public.mock_giving_checkout_sessions;
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("creates a separate guest and incomplete recurring schedule", async () => {
    const started = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.recurring, "campaign", campaigns.active, "monthly", 7_500),
    );
    recurringCheckout = started.rows[0]!;
    const stored = await db.query<Record<string, unknown>>(`select
      checkout.frequency,
      checkout.provider_schedule_reference,
      recurring.status::text recurring_status,
      recurring.frequency::text recurring_frequency,
      recurring.amount_minor::text amount_minor,
      recurring.campaign_id,
      donation.status::text donation_status,
      donation.recurring_gift_id = recurring.id recurring_linked,
      donor.auth_user_id,
      (select count(*)::integer from public.payment_provider_references ref
       where ref.recurring_gift_id = recurring.id) schedule_reference_count
    from public.mock_giving_checkout_sessions checkout
    join public.donors donor on donor.id = checkout.donor_id
    join public.donations donation on donation.id = checkout.donation_id
    join public.recurring_gifts recurring
      on recurring.id = checkout.recurring_gift_id
    where checkout.id = '${recurringCheckout.checkout_id}';
    `);
    expect(stored.rows[0]).toEqual({
      frequency: "monthly",
      provider_schedule_reference:
        `mock_schedule_${recurringCheckout.checkout_id.replaceAll("-", "")}`,
      recurring_status: "incomplete",
      recurring_frequency: "monthly",
      amount_minor: "7500",
      campaign_id: campaigns.active,
      donation_status: "pending",
      recurring_linked: true,
      auth_user_id: null,
      schedule_reference_count: 1,
    });
  });

  it("returns only a capability-guarded safe checkout snapshot", async () => {
    const found = await asRole<CheckoutRecord>(
      db,
      "anon",
      `select * from public.get_mock_giving_checkout(
        '${recurringCheckout.checkout_id}', '${tokens.recurring}'
      );`,
    );
    expect(found.rows).toEqual([
      expect.objectContaining({
        checkout_id: recurringCheckout.checkout_id,
        church_slug: "p18-active",
        church_name: "P18 Active Church",
        fund_name: "Tithes",
        campaign_name: "P18 Outreach",
        amount_minor_text: "7500",
        currency: "BBD",
        frequency: "monthly",
        checkout_status: "open",
        provider_payment_reference:
          `mock_payment_${recurringCheckout.checkout_id.replaceAll("-", "")}`,
        provider_schedule_reference:
          `mock_schedule_${recurringCheckout.checkout_id.replaceAll("-", "")}`,
        thank_you_message: "Thank you for giving.",
      }),
    ]);
    const forbidden = await asRole<CheckoutRecord>(
      db,
      "anon",
      `select * from public.get_mock_giving_checkout(
        '${recurringCheckout.checkout_id}', '${tokens.invalid}'
      );`,
    );
    expect(forbidden.rows).toEqual([]);
  });

  it("blocks fresh success after provider disable but still allows read and cancellation", async () => {
    const started = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.revalidate, "fund", activeFundId, "one_time", 3_000),
    );
    const checkout = started.rows[0]!;
    const rawBody = completionPayload(checkout);
    const signature = createHmac("sha256", tokens.revalidate)
      .update(rawBody)
      .digest("hex");

    await db.exec(`update public.payment_provider_connections
      set status = 'disabled' where id = '${connections.active}';`);
    try {
      const visible = await asRole<CheckoutRecord>(
        db,
        "anon",
        `select * from public.get_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.revalidate}'
        );`,
      );
      expect(visible.rows[0]?.checkout_status).toBe("open");
      await expect(
        asRole(
          db,
          "anon",
          `select * from public.complete_mock_giving_checkout(
            '${checkout.checkout_id}', '${tokens.revalidate}',
            '${rawBody}', '${signature}'
          );`,
        ),
      ).rejects.toThrow(/MOCK_CHECKOUT_UNAVAILABLE/);
      const pending = await db.query<{ status: string }>(`
        select status::text from public.donations
        where id = '${checkout.donation_id}';
      `);
      expect(pending.rows).toEqual([{ status: "pending" }]);

      const canceled = await asRole<StateResult>(
        db,
        "anon",
        `select * from public.cancel_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.revalidate}'
        );`,
      );
      expect(canceled.rows[0]).toEqual({
        checkout_id: checkout.checkout_id,
        checkout_status: "canceled",
        donation_status: "canceled",
        recurring_status: null,
        replayed: false,
      });
      const terminalReplay = await asRole<StateResult>(
        db,
        "anon",
        `select * from public.complete_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.revalidate}',
          '${rawBody}', '${signature}'
        );`,
      );
      expect(terminalReplay.rows[0]?.checkout_status).toBe("canceled");
      expect(terminalReplay.rows[0]?.replayed).toBe(true);
    } finally {
      await db.exec(`update public.payment_provider_connections
        set status = 'active' where id = '${connections.active}';`);
    }
  });

  it("expires and closes a pending checkout after target and provider deactivation", async () => {
    const started = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.expire, "fund", specialFunds.expiring, "one_time", 4_000),
    );
    const checkout = started.rows[0]!;
    await db.exec(`
      alter table public.mock_giving_checkout_sessions
        disable trigger mock_giving_checkout_sessions_guard_update;
      update public.mock_giving_checkout_sessions
      set
        created_at = statement_timestamp() - interval '2 hours',
        expires_at = statement_timestamp() - interval '1 hour'
      where id = '${checkout.checkout_id}';
      alter table public.mock_giving_checkout_sessions
        enable trigger mock_giving_checkout_sessions_guard_update;
      update public.funds set status = 'archived'
      where id = '${specialFunds.expiring}';
      update public.payment_provider_connections set status = 'disabled'
      where id = '${connections.active}';
    `);
    try {
      const expired = await asRole<CheckoutRecord>(
        db,
        "anon",
        `select * from public.get_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.expire}'
        );`,
      );
      expect(expired.rows[0]?.checkout_status).toBe("expired");
      const donation = await db.query<{ status: string }>(`
        select status::text from public.donations
        where id = '${checkout.donation_id}';
      `);
      expect(donation.rows).toEqual([{ status: "canceled" }]);
    } finally {
      await db.exec(`
        update public.funds set status = 'active'
        where id = '${specialFunds.expiring}';
        update public.payment_provider_connections set status = 'active'
        where id = '${connections.active}';
      `);
    }
  });

  it("idempotently cancels a pending checkout and its incomplete schedule", async () => {
    const started = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.cancel, "fund", activeFundId, "weekly", 2_500),
    );
    const checkout = started.rows[0]!;
    const canceled = await asRole<StateResult>(
      db,
      "anon",
      `select * from public.cancel_mock_giving_checkout(
        '${checkout.checkout_id}', '${tokens.cancel}'
      );`,
    );
    expect(canceled.rows).toEqual([{
      checkout_id: checkout.checkout_id,
      checkout_status: "canceled",
      donation_status: "canceled",
      recurring_status: "canceled",
      replayed: false,
    }]);
    const replay = await asRole<StateResult>(
      db,
      "anon",
      `select * from public.cancel_mock_giving_checkout(
        '${checkout.checkout_id}', '${tokens.cancel}'
      );`,
    );
    expect(replay.rows[0]).toEqual({ ...canceled.rows[0], replayed: true });
    await expect(
      asRole(
        db,
        "anon",
        `select * from public.cancel_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.invalid}'
        );`,
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_FORBIDDEN/);
  });

  it("verifies a signed mock webhook and completes without claiming settlement", async () => {
    const started = await asRole<StartResult>(
      db,
      "service_role",
      beginSql(tokens.complete, "fund", activeFundId, "one_time", 10_000),
    );
    const checkout = started.rows[0]!;
    const rawBody = completionPayload(checkout);
    const signature = createHmac("sha256", tokens.complete)
      .update(rawBody)
      .digest("hex");
    const escapedBody = rawBody.replaceAll("'", "''");

    const nullTypeBody = JSON.stringify({
      checkoutId: checkout.checkout_id,
      eventId: `mock_event_${checkout.checkout_id.replaceAll("-", "")}`,
      paymentReference:
        `mock_payment_${checkout.checkout_id.replaceAll("-", "")}`,
      type: null,
    });
    const nullTypeSignature = createHmac("sha256", tokens.complete)
      .update(nullTypeBody)
      .digest("hex");
    await expect(
      asRole(
        db,
        "anon",
        `select * from public.complete_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.complete}', '${nullTypeBody}',
          '${nullTypeSignature}'
        );`,
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_WEBHOOK/);

    await expect(
      asRole(
        db,
        "anon",
        `select * from public.complete_mock_giving_checkout(
          '${checkout.checkout_id}', '${tokens.complete}', '${escapedBody}',
          '${"0".repeat(64)}'
        );`,
      ),
    ).rejects.toThrow(/MOCK_CHECKOUT_INVALID_WEBHOOK/);

    const completed = await asRole<StateResult>(
      db,
      "anon",
      `select * from public.complete_mock_giving_checkout(
        '${checkout.checkout_id}', '${tokens.complete}', '${escapedBody}',
        '${signature}'
      );`,
    );
    expect(completed.rows).toEqual([{
      checkout_id: checkout.checkout_id,
      checkout_status: "completed",
      donation_status: "succeeded",
      recurring_status: null,
      replayed: false,
    }]);

    const stored = await db.query<Record<string, unknown>>(`select
      checkout.completion_payload_sha256,
      checkout.completed_at is not null completed,
      row_to_json(checkout)::text like '%${tokens.complete}%'
        contains_raw_capability,
      row_to_json(checkout)::text like '%payment.succeeded%'
        contains_raw_body,
      donation.processing_fee_minor::text processing_fee_minor,
      donation.payment_method_brand,
      donation.payment_method_last4,
      donation.donated_at is not null donated,
      donation.settled_at,
      donor.last_gave_at is not null donor_last_gave,
      (select count(*)::integer from public.webhook_events) webhook_count
    from public.mock_giving_checkout_sessions checkout
    join public.donations donation on donation.id = checkout.donation_id
    join public.donors donor on donor.id = checkout.donor_id
    where checkout.id = '${checkout.checkout_id}';
    `);
    expect(stored.rows[0]).toEqual({
      completion_payload_sha256: createHash("sha256").update(rawBody).digest("hex"),
      completed: true,
      contains_raw_capability: false,
      contains_raw_body: false,
      processing_fee_minor: "320",
      payment_method_brand: "Visa",
      payment_method_last4: "4242",
      donated: true,
      settled_at: null,
      donor_last_gave: true,
      webhook_count: 0,
    });

    const replay = await asRole<StateResult>(
      db,
      "anon",
      `select * from public.complete_mock_giving_checkout(
        '${checkout.checkout_id}', '${tokens.complete}', '${escapedBody}',
        '${signature}'
      );`,
    );
    expect(replay.rows[0]).toEqual({ ...completed.rows[0], replayed: true });
    await expect(
      db.exec(`update public.mock_giving_checkout_sessions
        set completed_at = completed_at + interval '1 second'
        where id = '${checkout.checkout_id}';`),
    ).rejects.toThrow(/MOCK_CHECKOUT_TERMINAL_STATE_IMMUTABLE/);
  });

  it("activates a recurring schedule only after the signed success event", async () => {
    const rawBody = completionPayload(recurringCheckout);
    const signature = createHmac("sha256", tokens.recurring)
      .update(rawBody)
      .digest("hex");
    const completed = await asRole<StateResult>(
      db,
      "anon",
      `select * from public.complete_mock_giving_checkout(
        '${recurringCheckout.checkout_id}', '${tokens.recurring}',
        '${rawBody.replaceAll("'", "''")}', '${signature}'
      );`,
    );
    expect(completed.rows[0]).toEqual({
      checkout_id: recurringCheckout.checkout_id,
      checkout_status: "completed",
      donation_status: "succeeded",
      recurring_status: "active",
      replayed: false,
    });
    const recurring = await db.query<Record<string, unknown>>(`select
      status::text,
      payment_method_brand,
      payment_method_last4,
      started_at is not null started,
      next_charge_at > started_at next_charge_scheduled
    from public.recurring_gifts
    where id = (
      select recurring_gift_id from public.mock_giving_checkout_sessions
      where id = '${recurringCheckout.checkout_id}'
    );
    `);
    expect(recurring.rows[0]).toEqual({
      status: "active",
      payment_method_brand: "Visa",
      payment_method_last4: "4242",
      started: true,
      next_charge_scheduled: true,
    });
  });
});
