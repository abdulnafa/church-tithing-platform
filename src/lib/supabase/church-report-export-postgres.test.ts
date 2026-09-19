import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "31010000-0000-4000-8000-000000000001",
  finance: "31010000-0000-4000-8000-000000000002",
  accountant: "31010000-0000-4000-8000-000000000003",
  staff: "31010000-0000-4000-8000-000000000004",
  inactiveOwner: "31010000-0000-4000-8000-000000000005",
  otherOwner: "31010000-0000-4000-8000-000000000006",
  suspendedOwner: "31010000-0000-4000-8000-000000000007",
} as const;

const churches = {
  primary: "31020000-0000-4000-8000-000000000001",
  other: "31020000-0000-4000-8000-000000000002",
  suspended: "31020000-0000-4000-8000-000000000003",
} as const;

const connection = "31030000-0000-4000-8000-000000000001";
const funds = {
  missions: "31040000-0000-4000-8000-000000000001",
  other: "31040000-0000-4000-8000-000000000002",
} as const;
const campaign = "31050000-0000-4000-8000-000000000001";
const donors = {
  alpha: "31060000-0000-4000-8000-000000000001",
  beta: "31060000-0000-4000-8000-000000000002",
  other: "31060000-0000-4000-8000-000000000003",
} as const;
const recurring = "31070000-0000-4000-8000-000000000001";

const donations = {
  weeklyBoundary: "31080000-0000-4000-8000-000000000001",
  partiallyRefunded: "31080000-0000-4000-8000-000000000002",
  refunded: "31080000-0000-4000-8000-000000000003",
  disputedUsd: "31080000-0000-4000-8000-000000000004",
  monthOnly: "31080000-0000-4000-8000-000000000005",
  beforeWeekBoundary: "31080000-0000-4000-8000-000000000006",
  yearOnly: "31080000-0000-4000-8000-000000000007",
  historyOnly: "31080000-0000-4000-8000-000000000008",
  afterAsOf: "31080000-0000-4000-8000-000000000009",
  pending: "31080000-0000-4000-8000-000000000010",
  processing: "31080000-0000-4000-8000-000000000011",
  failed: "31080000-0000-4000-8000-000000000012",
  canceled: "31080000-0000-4000-8000-000000000013",
  otherTenant: "31080000-0000-4000-8000-000000000014",
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
  "202609180017_church_transaction_list.sql",
  "202609190018_church_report_export.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type ExportRecord = {
  transaction_id: string;
  donated_at: string;
  donor_name: string;
  fund_name: string;
  campaign_name: string | null;
  source: string;
  frequency: string | null;
  recurring_status: string | null;
  gross_amount_minor: string;
  currency: string;
  processing_fee_minor: string;
  refunded_amount_minor: string;
  recorded_net_amount_minor: string;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_status: string;
};

type ExportResult = {
  church_id: string;
  church_slug: string;
  church_timezone: string;
  report_period: "last_7_days" | "month" | "year" | "all";
  report_as_of_date: string;
  period_start_date: string | null;
  period_end_date: string;
  transactions: ExportRecord[];
};

async function installPlatform(target: PGlite) {
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
  for (const migration of migrations) await target.exec(migration);
}

async function inAuthenticatedTransaction<T>(
  target: PGlite,
  userId: string,
  work: () => Promise<T>,
) {
  await target.exec("begin;");
  try {
    await target.exec(`
      select set_config('request.jwt.claim.sub', '${userId}', true);
      select set_config(
        'request.jwt.claims',
        '{"sub":"${userId}","role":"authenticated"}',
        true
      );
      set local role authenticated;
    `);
    const result = await work();
    await target.exec("rollback;");
    return result;
  } catch (error) {
    await target.exec("rollback;");
    throw error;
  }
}

let requestSequence = 1;

function nextRequestId() {
  const suffix = String(requestSequence).padStart(12, "0");
  requestSequence += 1;
  return `31990000-0000-4000-8000-${suffix}`;
}

function exportSql(
  period: ExportResult["report_period"] = "all",
  options: Readonly<{
    churchId?: string;
    requestId?: string;
    asOfDate?: string;
  }> = {},
) {
  return `select to_jsonb(public.export_church_giving_report(
    target_church_id => '${options.churchId ?? churches.primary}'::uuid,
    report_request_id => '${options.requestId ?? nextRequestId()}'::uuid,
    selected_period => '${period}'::public.church_report_period,
    selected_as_of_date => '${options.asOfDate ?? "2026-09-19"}'::date
  )) export;`;
}

async function getExport(
  userId: string,
  period: ExportResult["report_period"] = "all",
  options: Parameters<typeof exportSql>[1] = {},
) {
  return inAuthenticatedTransaction(db, userId, async () => {
    const result = await db.query<{ export: ExportResult }>(
      exportSql(period, options),
    );
    return result.rows[0]!.export;
  });
}

const db = new PGlite();

describe("P21 church report export behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p21@example.test', now(),
          '{"display_name":"P21 Owner"}'),
        ('${users.finance}', 'finance-p21@example.test', now(),
          '{"display_name":"P21 Finance"}'),
        ('${users.accountant}', 'accountant-p21@example.test', now(),
          '{"display_name":"P21 Accountant"}'),
        ('${users.staff}', 'staff-p21@example.test', now(),
          '{"display_name":"P21 Staff"}'),
        ('${users.inactiveOwner}', 'inactive-p21@example.test', now(),
          '{"display_name":"P21 Inactive"}'),
        ('${users.otherOwner}', 'other-p21@example.test', now(),
          '{"display_name":"P21 Other"}'),
        ('${users.suspendedOwner}', 'suspended-p21@example.test', now(),
          '{"display_name":"P21 Suspended"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at, suspended_at
      ) values
        ('${churches.primary}', 'P21 Primary', 'P21 Primary Inc.',
          'p21-primary', 'active', 'BBD', 'America/Barbados',
          'primary-p21@example.test', statement_timestamp(), null),
        ('${churches.other}', 'P21 Other', 'P21 Other Inc.',
          'p21-other', 'active', 'USD', 'UTC',
          'other-p21@example.test', statement_timestamp(), null),
        ('${churches.suspended}', 'P21 Suspended', 'P21 Suspended Inc.',
          'p21-suspended', 'suspended', 'BBD', 'America/Barbados',
          'suspended-p21@example.test', statement_timestamp(),
          statement_timestamp());

      insert into public.church_memberships (church_id, user_id, role, status)
      values
        ('${churches.primary}', '${users.owner}', 'owner', 'active'),
        ('${churches.primary}', '${users.finance}', 'finance_admin', 'active'),
        ('${churches.primary}', '${users.accountant}', 'accountant', 'active'),
        ('${churches.primary}', '${users.staff}', 'staff', 'active'),
        ('${churches.primary}', '${users.inactiveOwner}', 'owner', 'active'),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active'),
        ('${churches.suspended}', '${users.suspendedOwner}', 'owner', 'active');

      insert into public.funds (
        id, church_id, name, slug, status, is_default, sort_order
      ) values
        ('${funds.missions}', '${churches.primary}', 'Missions', 'missions',
          'active', false, 1),
        ('${funds.other}', '${churches.other}', 'Other Fund', 'other-fund',
          'active', false, 1);

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, status, currency
      ) values (
        '${campaign}', '${churches.primary}', '${funds.missions}',
        'Community Care', 'community-care', 'active', 'BBD'
      );

      insert into public.donors (
        id, church_id, display_name, email, is_anonymous
      ) values
        ('${donors.alpha}', '${churches.primary}', 'Alpha Donor',
          'hidden-alpha-p21@example.test', false),
        ('${donors.beta}', '${churches.primary}', 'Beta Donor',
          'hidden-beta-p21@example.test', false),
        ('${donors.other}', '${churches.other}', 'Other Tenant Secret',
          'other-secret-p21@example.test', false);

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, payouts_enabled,
        supported_currencies, capabilities
      ) values (
        '${connection}', '${churches.primary}', 'mock-development-gateway',
        'p21-primary-development', 'active', true, true, true, true,
        array['BBD','USD'],
        '{"environment":"development","settlement_mode":"direct_to_church"}'
      );

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, payment_connection_id,
        amount_minor, currency, frequency, status,
        provider_subscription_reference, payment_method_brand,
        payment_method_last4, started_at, canceled_at
      ) values (
        '${recurring}', '${churches.primary}', '${donors.alpha}',
        '${funds.missions}', '${connection}', 1000, 'BBD', 'weekly',
        'canceled', 'p21-canceled-plan', 'Visa', '1111',
        '2026-01-01T00:00:00Z', '2026-09-18T00:00:00Z'
      );

      insert into public.donations (
        id, church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
        payment_connection_id, source, status, amount_minor, currency,
        processing_fee_minor, refunded_amount_minor, payment_method_brand,
        payment_method_last4, donor_display_name, donor_email, donor_message,
        external_idempotency_key, donated_at, failed_at, refunded_at,
        created_at, updated_at
      ) values
        ('${donations.weeklyBoundary}', '${churches.primary}',
          '${donors.alpha}', '${funds.missions}', '${campaign}',
          '${recurring}', '${connection}', 'online', 'succeeded', 1000,
          'BBD', 100, 0, 'Visa', '1111', 'Alpha Donor',
          'hidden-alpha-p21@example.test', 'never export this prayer-like note',
          'p21-week-boundary', '2026-09-13T04:00:00Z', null, null,
          '2026-09-01T00:00:00Z', '2026-09-13T04:00:00Z'),
        ('${donations.partiallyRefunded}', '${churches.primary}',
          '${donors.beta}', '${funds.missions}', null, null, null, 'cash',
          'partially_refunded', 2000, 'BBD', 100, 500, null, null,
          'Beta Donor', 'hidden-beta-p21@example.test', null, null,
          '2026-09-15T12:00:00Z', null, '2026-09-18T12:00:00Z',
          '2026-09-15T12:00:00Z', '2026-09-18T12:00:00Z'),
        ('${donations.refunded}', '${churches.primary}', '${donors.beta}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'refunded', 3000,
          'BBD', 100, 3000, null, null, 'Beta Donor',
          'hidden-beta-p21@example.test', null, null,
          '2026-09-16T12:00:00Z', null, '2026-09-18T13:00:00Z',
          '2026-09-16T12:00:00Z', '2026-09-18T13:00:00Z'),
        ('${donations.disputedUsd}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'disputed', 4000,
          'USD', 200, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-18T12:00:00Z', null, null,
          '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
        ('${donations.monthOnly}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'succeeded', 5000,
          'BBD', 100, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-05T12:00:00Z', null, null,
          '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
        ('${donations.beforeWeekBoundary}', '${churches.primary}',
          '${donors.beta}', (select id from public.funds
            where church_id='${churches.primary}' and is_default),
          null, null, null, 'cash', 'succeeded', 5500, 'BBD', 100, 0,
          null, null, 'Beta Donor', 'hidden-beta-p21@example.test', null,
          null, '2026-09-13T03:59:59Z', null, null,
          '2026-09-13T03:59:59Z', '2026-09-13T03:59:59Z'),
        ('${donations.yearOnly}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'succeeded', 6000,
          'BBD', 100, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-03-01T12:00:00Z', null, null,
          '2026-03-01T12:00:00Z', '2026-03-01T12:00:00Z'),
        ('${donations.historyOnly}', '${churches.primary}', '${donors.beta}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'succeeded', 7000,
          'BBD', 100, 0, null, null, 'Beta Donor',
          'hidden-beta-p21@example.test', null, null,
          '2025-12-31T12:00:00Z', null, null,
          '2025-12-31T12:00:00Z', '2025-12-31T12:00:00Z'),
        ('${donations.afterAsOf}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'succeeded', 8000,
          'BBD', 100, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-20T04:00:00Z', null, null,
          '2026-09-20T04:00:00Z', '2026-09-20T04:00:00Z'),
        ('${donations.pending}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'pending', 9000,
          'BBD', 0, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-18T14:00:00Z', null, null,
          '2026-09-18T14:00:00Z', '2026-09-18T14:00:00Z'),
        ('${donations.processing}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'processing', 9100,
          'BBD', 0, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-18T15:00:00Z', null, null,
          '2026-09-18T15:00:00Z', '2026-09-18T15:00:00Z'),
        ('${donations.failed}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'failed', 9200,
          'BBD', 0, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-18T16:00:00Z', '2026-09-18T16:00:00Z', null,
          '2026-09-18T16:00:00Z', '2026-09-18T16:00:00Z'),
        ('${donations.canceled}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, null, 'cash', 'canceled', 9300,
          'BBD', 0, 0, null, null, 'Alpha Donor',
          'hidden-alpha-p21@example.test', null, null,
          '2026-09-18T17:00:00Z', null, null,
          '2026-09-18T17:00:00Z', '2026-09-18T17:00:00Z'),
        ('${donations.otherTenant}', '${churches.other}', '${donors.other}',
          (select id from public.funds where church_id='${churches.other}'
            and is_default), null, null, null, 'cash', 'succeeded', 999999,
          'USD', 0, 0, null, null, 'Other Tenant Secret',
          'other-secret-p21@example.test', 'cross tenant secret', null,
          '2026-09-18T12:00:00Z', null, null,
          '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z');
    `);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates the exact index and authenticated-only RPC/type privileges", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select count(*)::integer from pg_indexes
        where schemaname='public'
          and indexname='donations_church_report_cursor_idx') report_index,
      has_function_privilege('authenticated',
        'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)',
        'EXECUTE') auth_execute,
      has_function_privilege('anon',
        'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)',
        'EXECUTE') anon_execute,
      has_function_privilege('service_role',
        'public.export_church_giving_report(uuid,uuid,public.church_report_period,date)',
        'EXECUTE') service_execute,
      has_type_privilege('authenticated', 'public.church_report_period',
        'USAGE') auth_period_usage,
      has_type_privilege('anon', 'public.church_report_period',
        'USAGE') anon_period_usage,
      has_type_privilege('service_role', 'public.church_report_period',
        'USAGE') service_period_usage;`);
    expect(result.rows[0]).toEqual({
      report_index: 1,
      auth_execute: true,
      anon_execute: false,
      service_execute: false,
      auth_period_usage: true,
      anon_period_usage: false,
      service_period_usage: false,
    });
  });

  it("allows every approved reporting role and denies every ineligible identity", async () => {
    for (const userId of [users.owner, users.finance, users.accountant]) {
      const report = await getExport(userId);
      expect(report.church_id).toBe(churches.primary);
      expect(report.transactions).toHaveLength(8);
    }

    for (const [userId, churchId] of [
      [users.staff, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.otherOwner, churches.primary],
      [users.suspendedOwner, churches.suspended],
    ] as const) {
      await expect(
        getExport(userId, "all", { churchId }),
      ).rejects.toThrow(/CHURCH_REPORT_EXPORT_FORBIDDEN/);
    }
  });

  it("resolves all four periods with Barbados-local half-open boundaries", async () => {
    const weekly = await getExport(users.owner, "last_7_days");
    expect(weekly).toMatchObject({
      church_timezone: "America/Barbados",
      report_period: "last_7_days",
      report_as_of_date: "2026-09-19",
      period_start_date: "2026-09-13",
      period_end_date: "2026-09-19",
    });
    expect(weekly.transactions.map((row) => row.transaction_id)).toEqual([
      donations.disputedUsd,
      donations.refunded,
      donations.partiallyRefunded,
      donations.weeklyBoundary,
    ]);

    const month = await getExport(users.owner, "month");
    expect(month.period_start_date).toBe("2026-09-01");
    expect(month.transactions).toHaveLength(6);
    expect(month.transactions.map((row) => row.transaction_id)).toContain(
      donations.beforeWeekBoundary,
    );
    expect(month.transactions.map((row) => row.transaction_id)).not.toContain(
      donations.yearOnly,
    );

    const year = await getExport(users.owner, "year");
    expect(year.period_start_date).toBe("2026-01-01");
    expect(year.transactions).toHaveLength(7);
    expect(year.transactions.map((row) => row.transaction_id)).toContain(
      donations.yearOnly,
    );
    expect(year.transactions.map((row) => row.transaction_id)).not.toContain(
      donations.historyOnly,
    );

    const all = await getExport(users.owner, "all");
    expect(all.period_start_date).toBeNull();
    expect(all.transactions).toHaveLength(8);
    expect(all.transactions.map((row) => row.transaction_id)).toContain(
      donations.historyOnly,
    );
    expect(all.transactions.map((row) => row.transaction_id)).not.toContain(
      donations.afterAsOf,
    );
  });

  it("includes only captured states and keeps canceled recurrence descriptive", async () => {
    const report = await getExport(users.owner, "last_7_days");
    expect(new Set(report.transactions.map((row) => row.payment_status))).toEqual(
      new Set([
        "succeeded",
        "partially_refunded",
        "refunded",
        "disputed",
      ]),
    );
    for (const excluded of [
      donations.pending,
      donations.processing,
      donations.failed,
      donations.canceled,
    ]) {
      expect(report.transactions.map((row) => row.transaction_id)).not.toContain(
        excluded,
      );
    }
    expect(
      report.transactions.find(
        (row) => row.transaction_id === donations.weeklyBoundary,
      ),
    ).toMatchObject({
      frequency: "weekly",
      recurring_status: "canceled",
      payment_status: "succeeded",
    });
  });

  it("preserves mixed currencies, cumulative refunds, and signed recorded net", async () => {
    const report = await getExport(users.owner, "last_7_days");
    expect(new Set(report.transactions.map((row) => row.currency))).toEqual(
      new Set(["BBD", "USD"]),
    );
    expect(
      report.transactions.find(
        (row) => row.transaction_id === donations.partiallyRefunded,
      ),
    ).toMatchObject({
      gross_amount_minor: "2000",
      processing_fee_minor: "100",
      refunded_amount_minor: "500",
      recorded_net_amount_minor: "1400",
      currency: "BBD",
    });
    expect(
      report.transactions.find(
        (row) => row.transaction_id === donations.refunded,
      ),
    ).toMatchObject({
      gross_amount_minor: "3000",
      processing_fee_minor: "100",
      refunded_amount_minor: "3000",
      recorded_net_amount_minor: "-100",
    });
    expect(
      report.transactions.find(
        (row) => row.transaction_id === donations.disputedUsd,
      ),
    ).toMatchObject({
      gross_amount_minor: "4000",
      currency: "USD",
      payment_status: "disputed",
    });
  });

  it("returns only the minimum projection with zero other-tenant leakage", async () => {
    const report = await getExport(users.owner);
    expect(Object.keys(report.transactions[0] ?? {}).sort()).toEqual(
      [
        "transaction_id",
        "donated_at",
        "donor_name",
        "fund_name",
        "campaign_name",
        "source",
        "frequency",
        "recurring_status",
        "gross_amount_minor",
        "currency",
        "processing_fee_minor",
        "refunded_amount_minor",
        "recorded_net_amount_minor",
        "payment_method_brand",
        "payment_method_last4",
        "payment_status",
      ].sort(),
    );
    const serialized = JSON.stringify(report);
    for (const prohibited of [
      "hidden-alpha-p21@example.test",
      "hidden-beta-p21@example.test",
      "never export this prayer-like note",
      "Other Tenant Secret",
      "other-secret-p21@example.test",
      "cross tenant secret",
      donations.otherTenant,
      "p21-week-boundary",
      "p21-canceled-plan",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("writes exactly one sanitized audit event for an idempotent request", async () => {
    const requestId = nextRequestId();
    await inAuthenticatedTransaction(db, users.owner, async () => {
      const first = await db.query<{ export: ExportResult }>(
        exportSql("last_7_days", { requestId }),
      );
      const replay = await db.query<{ export: ExportResult }>(
        exportSql("last_7_days", { requestId }),
      );
      expect(replay.rows[0]?.export).toEqual(first.rows[0]?.export);

      const audit = await db.query<{
        action_code: string;
        actor_user_id: string;
        entity_id: string;
        request_id: string;
        sanitized_changes: Record<string, unknown>;
      }>(`select action_code::text, actor_user_id, entity_id, request_id,
          sanitized_changes
        from public.audit_logs
        where church_id = '${churches.primary}'
          and action_code = 'report_exported'
          and request_id = '${requestId}'`);
      expect(audit.rows).toEqual([
        {
          action_code: "report_exported",
          actor_user_id: users.owner,
          entity_id: requestId,
          request_id: requestId,
          sanitized_changes: {
            report_type: "giving_last_7_days",
            format: "csv",
            row_count: 4,
          },
        },
      ]);
    });
  });

  it("fails closed for invalid dates and rejects exports above 10,000 rows", async () => {
    await expect(
      getExport(users.owner, "all", { asOfDate: "1999-12-31" }),
    ).rejects.toThrow(/CHURCH_REPORT_EXPORT_INVALID_AS_OF_DATE/);

    await db.exec("begin;");
    try {
      await db.exec(`
        insert into public.donations (
          id, church_id, fund_id, source, status, amount_minor, currency,
          donor_display_name, donated_at, created_at, updated_at
        )
        select
          ('33000000-0000-4000-8000-' ||
            pg_catalog.lpad(series::text, 12, '0'))::uuid,
          '${churches.primary}'::uuid,
          (select id from public.funds
            where church_id='${churches.primary}' and is_default),
          'cash'::public.donation_source,
          'succeeded'::public.donation_status,
          100,
          'BBD',
          'Bounded export fixture',
          '2026-06-01T12:00:00Z'::timestamptz,
          '2026-06-01T12:00:00Z'::timestamptz,
          '2026-06-01T12:00:00Z'::timestamptz
        from pg_catalog.generate_series(1, 10001) series;

        select set_config('request.jwt.claim.sub', '${users.owner}', true);
        select set_config(
          'request.jwt.claims',
          '{"sub":"${users.owner}","role":"authenticated"}',
          true
        );
        set local role authenticated;
      `);
      await expect(
        db.query(exportSql("all", { requestId: nextRequestId() })),
      ).rejects.toThrow(/CHURCH_REPORT_EXPORT_TOO_LARGE/);
    } finally {
      await db.exec("rollback;");
    }
  }, 120_000);
});
