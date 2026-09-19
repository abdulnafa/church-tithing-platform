import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "32010000-0000-4000-8000-000000000001",
  finance: "32010000-0000-4000-8000-000000000002",
  accountant: "32010000-0000-4000-8000-000000000003",
  staff: "32010000-0000-4000-8000-000000000004",
  inactiveOwner: "32010000-0000-4000-8000-000000000005",
  otherOwner: "32010000-0000-4000-8000-000000000006",
  suspendedOwner: "32010000-0000-4000-8000-000000000007",
} as const;

const churches = {
  primary: "32020000-0000-4000-8000-000000000001",
  other: "32020000-0000-4000-8000-000000000002",
  suspended: "32020000-0000-4000-8000-000000000003",
} as const;

const funds = {
  missions: "32030000-0000-4000-8000-000000000001",
  general: "32030000-0000-4000-8000-000000000002",
  other: "32030000-0000-4000-8000-000000000003",
} as const;
const donor = "32040000-0000-4000-8000-000000000001";
const connection = "32050000-0000-4000-8000-000000000001";
const recurring = "32060000-0000-4000-8000-000000000001";

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
  "202609190019_church_giving_reports.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type Aggregate = {
  currency: string;
  gross_amount_minor: string;
  processing_fee_minor: string;
  refunded_amount_minor: string;
  recorded_net_amount_minor: string;
  gift_count: string;
};

type TrendPoint = Aggregate & { bucket_start: string };
type FundSummary = Aggregate & { fund_id: string; fund_name: string };
type GiftTypeSummary = Aggregate & {
  gift_type: "one_time" | "recurring";
};
type GivingReport = {
  church_id: string;
  church_timezone: string;
  report_period: "last_7_days" | "month" | "year" | "all";
  report_as_of_date: string;
  period_start_date: string | null;
  period_end_date: string;
  currency_summaries: Aggregate[];
  trend_points: TrendPoint[];
  fund_summaries: FundSummary[];
  gift_type_summaries: GiftTypeSummary[];
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

function reportSql(
  period: GivingReport["report_period"] = "all",
  options: Readonly<{ churchId?: string; asOfDate?: string }> = {},
) {
  return `select to_jsonb(public.get_church_giving_report(
    target_church_id => '${options.churchId ?? churches.primary}'::uuid,
    selected_period => '${period}'::public.church_report_period,
    selected_as_of_date => '${options.asOfDate ?? "2026-09-19"}'::date
  )) report;`;
}

async function getReport(
  userId: string,
  period: GivingReport["report_period"] = "all",
  options: Parameters<typeof reportSql>[1] = {},
) {
  return inAuthenticatedTransaction(db, userId, async () => {
    const result = await db.query<{ report: GivingReport }>(
      reportSql(period, options),
    );
    return result.rows[0]!.report;
  });
}

const db = new PGlite();

describe("P22 church giving reports behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p22@example.test', now(),
          '{"display_name":"P22 Owner"}'),
        ('${users.finance}', 'finance-p22@example.test', now(),
          '{"display_name":"P22 Finance"}'),
        ('${users.accountant}', 'accountant-p22@example.test', now(),
          '{"display_name":"P22 Accountant"}'),
        ('${users.staff}', 'staff-p22@example.test', now(),
          '{"display_name":"P22 Staff"}'),
        ('${users.inactiveOwner}', 'inactive-p22@example.test', now(),
          '{"display_name":"P22 Inactive"}'),
        ('${users.otherOwner}', 'other-p22@example.test', now(),
          '{"display_name":"P22 Other"}'),
        ('${users.suspendedOwner}', 'suspended-p22@example.test', now(),
          '{"display_name":"P22 Suspended"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at, suspended_at
      ) values
        ('${churches.primary}', 'P22 Primary', 'P22 Primary Inc.',
          'p22-primary', 'active', 'BBD', 'America/Barbados',
          'primary-p22@example.test', statement_timestamp(), null),
        ('${churches.other}', 'P22 Other', 'P22 Other Inc.',
          'p22-other', 'active', 'USD', 'UTC',
          'other-p22@example.test', statement_timestamp(), null),
        ('${churches.suspended}', 'P22 Suspended', 'P22 Suspended Inc.',
          'p22-suspended', 'suspended', 'BBD', 'America/Barbados',
          'suspended-p22@example.test', statement_timestamp(),
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

      update public.funds set id = '${funds.general}'
      where church_id = '${churches.primary}' and is_default;
      update public.funds set id = '${funds.other}'
      where church_id = '${churches.other}' and is_default;
      insert into public.funds (
        id, church_id, name, slug, status, is_default, sort_order
      ) values (
        '${funds.missions}', '${churches.primary}', 'Missions', 'missions',
        'active', false, 1
      );

      insert into public.donors (
        id, church_id, display_name, email, is_anonymous
      ) values (
        '${donor}', '${churches.primary}', 'Private Donor',
        'private-p22@example.test', false
      );

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, payouts_enabled,
        supported_currencies, capabilities
      ) values (
        '${connection}', '${churches.primary}', 'mock-development-gateway',
        'p22-primary-development', 'active', true, true, true, true,
        array['BBD','USD'], '{"environment":"development"}'
      );

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, payment_connection_id,
        amount_minor, currency, frequency, status,
        provider_subscription_reference, started_at, canceled_at
      ) values (
        '${recurring}', '${churches.primary}', '${donor}',
        '${funds.missions}', '${connection}', 1000, 'BBD', 'weekly',
        'canceled', 'p22-canceled-plan', '2026-01-01T00:00:00Z',
        '2026-09-18T00:00:00Z'
      );

      insert into public.donations (
        id, church_id, donor_id, fund_id, recurring_gift_id,
        payment_connection_id, source, status, amount_minor, currency,
        processing_fee_minor, refunded_amount_minor, donor_display_name,
        donor_email, donor_message, external_idempotency_key, donated_at,
        failed_at, refunded_at, created_at, updated_at
      ) values
        ('32070000-0000-4000-8000-000000000001', '${churches.primary}',
          '${donor}', '${funds.missions}', '${recurring}', '${connection}',
          'online', 'succeeded', 1000, 'BBD', 100, 0, 'Private Donor',
          'private-p22@example.test', 'private note', 'p22-week-boundary',
          '2026-09-13T04:00:00Z', null, null,
          '2026-09-13T04:00:00Z', '2026-09-13T04:00:00Z'),
        ('32070000-0000-4000-8000-000000000002', '${churches.primary}',
          '${donor}', '${funds.missions}', null, null, 'cash',
          'partially_refunded', 2000, 'BBD', 100, 500, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-15T12:00:00Z', null, '2026-09-18T12:00:00Z',
          '2026-09-15T12:00:00Z', '2026-09-18T12:00:00Z'),
        ('32070000-0000-4000-8000-000000000003', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'refunded',
          3000, 'BBD', 100, 3000, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-16T12:00:00Z', null, '2026-09-18T13:00:00Z',
          '2026-09-16T12:00:00Z', '2026-09-18T13:00:00Z'),
        ('32070000-0000-4000-8000-000000000004', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'disputed',
          4000, 'USD', 200, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-18T12:00:00Z', null, null,
          '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z'),
        ('32070000-0000-4000-8000-000000000005', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'succeeded',
          5000, 'BBD', 100, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-05T12:00:00Z', null, null,
          '2026-09-05T12:00:00Z', '2026-09-05T12:00:00Z'),
        ('32070000-0000-4000-8000-000000000006', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'succeeded',
          5500, 'BBD', 100, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-13T03:59:59Z', null, null,
          '2026-09-13T03:59:59Z', '2026-09-13T03:59:59Z'),
        ('32070000-0000-4000-8000-000000000007', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'succeeded',
          6000, 'BBD', 100, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-03-01T12:00:00Z', null, null,
          '2026-03-01T12:00:00Z', '2026-03-01T12:00:00Z'),
        ('32070000-0000-4000-8000-000000000008', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'succeeded',
          7000, 'BBD', 100, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2025-12-31T12:00:00Z', null, null,
          '2025-12-31T12:00:00Z', '2025-12-31T12:00:00Z'),
        ('32070000-0000-4000-8000-000000000009', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'succeeded',
          8000, 'BBD', 100, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-20T04:00:00Z', null, null,
          '2026-09-20T04:00:00Z', '2026-09-20T04:00:00Z'),
        ('32070000-0000-4000-8000-000000000010', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'pending',
          9000, 'BBD', 0, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-18T14:00:00Z', null, null,
          '2026-09-18T14:00:00Z', '2026-09-18T14:00:00Z'),
        ('32070000-0000-4000-8000-000000000011', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'processing',
          9100, 'BBD', 0, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-18T15:00:00Z', null, null,
          '2026-09-18T15:00:00Z', '2026-09-18T15:00:00Z'),
        ('32070000-0000-4000-8000-000000000012', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'failed',
          9200, 'BBD', 0, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-18T16:00:00Z', '2026-09-18T16:00:00Z', null,
          '2026-09-18T16:00:00Z', '2026-09-18T16:00:00Z'),
        ('32070000-0000-4000-8000-000000000013', '${churches.primary}',
          '${donor}', '${funds.general}', null, null, 'cash', 'canceled',
          9300, 'BBD', 0, 0, 'Private Donor',
          'private-p22@example.test', null, null,
          '2026-09-18T17:00:00Z', null, null,
          '2026-09-18T17:00:00Z', '2026-09-18T17:00:00Z'),
        ('32070000-0000-4000-8000-000000000014', '${churches.other}',
          null, '${funds.other}', null, null, 'cash', 'succeeded', 999999,
          'USD', 0, 0, 'Other Tenant Secret',
          'other-secret-p22@example.test', 'cross tenant secret', null,
          '2026-09-18T12:00:00Z', null, null,
          '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z');
    `);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("grants RPC and result-type access only to authenticated", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      has_function_privilege('authenticated',
        'public.get_church_giving_report(uuid,public.church_report_period,date)',
        'EXECUTE') auth_execute,
      has_function_privilege('anon',
        'public.get_church_giving_report(uuid,public.church_report_period,date)',
        'EXECUTE') anon_execute,
      has_function_privilege('service_role',
        'public.get_church_giving_report(uuid,public.church_report_period,date)',
        'EXECUTE') service_execute,
      has_type_privilege('authenticated',
        'public.church_giving_report_result', 'USAGE') auth_type_usage,
      has_type_privilege('anon',
        'public.church_giving_report_result', 'USAGE') anon_type_usage,
      has_type_privilege('service_role',
        'public.church_giving_report_result', 'USAGE') service_type_usage;`);
    expect(result.rows[0]).toEqual({
      auth_execute: true,
      anon_execute: false,
      service_execute: false,
      auth_type_usage: true,
      anon_type_usage: false,
      service_type_usage: false,
    });
  });

  it("allows reporting roles and denies every ineligible identity", async () => {
    for (const userId of [users.owner, users.finance, users.accountant]) {
      const report = await getReport(userId);
      expect(report.church_id).toBe(churches.primary);
      expect(report.currency_summaries).toHaveLength(2);
    }

    for (const [userId, churchId] of [
      [users.staff, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.otherOwner, churches.primary],
      [users.suspendedOwner, churches.suspended],
    ] as const) {
      await expect(
        getReport(userId, "all", { churchId }),
      ).rejects.toThrow(/CHURCH_GIVING_REPORT_FORBIDDEN/);
    }

    await expect(getReport("")).rejects.toThrow(
      /CHURCH_GIVING_REPORT_FORBIDDEN/,
    );
  });

  it("resolves all periods with Barbados-local inclusive dates", async () => {
    const cases = [
      ["last_7_days", "2026-09-13", "6000", "3"],
      ["month", "2026-09-01", "16500", "5"],
      ["year", "2026-01-01", "22500", "6"],
      ["all", null, "29500", "7"],
    ] as const;

    for (const [period, startDate, bbdGross, bbdCount] of cases) {
      const report = await getReport(users.owner, period);
      expect(report).toMatchObject({
        church_id: churches.primary,
        church_timezone: "America/Barbados",
        report_period: period,
        report_as_of_date: "2026-09-19",
        period_start_date: startDate,
        period_end_date: "2026-09-19",
      });
      expect(report.currency_summaries).toEqual([
        expect.objectContaining({
          currency: "BBD",
          gross_amount_minor: bbdGross,
          gift_count: bbdCount,
        }),
        expect.objectContaining({
          currency: "USD",
          gross_amount_minor: "4000",
          gift_count: "1",
        }),
      ]);
    }
  });

  it("keeps currencies separate and preserves exact refund and signed-net math", async () => {
    const report = await getReport(users.owner, "last_7_days");
    expect(report.currency_summaries).toEqual([
      {
        currency: "BBD",
        gross_amount_minor: "6000",
        processing_fee_minor: "300",
        refunded_amount_minor: "3500",
        recorded_net_amount_minor: "2200",
        gift_count: "3",
      },
      {
        currency: "USD",
        gross_amount_minor: "4000",
        processing_fee_minor: "200",
        refunded_amount_minor: "0",
        recorded_net_amount_minor: "3800",
        gift_count: "1",
      },
    ]);
    expect(report.fund_summaries).toContainEqual(
      expect.objectContaining({
        fund_id: funds.general,
        currency: "BBD",
        gross_amount_minor: "3000",
        refunded_amount_minor: "3000",
        recorded_net_amount_minor: "-100",
      }),
    );
  });

  it("returns stable daily and monthly trend buckets", async () => {
    const weekly = await getReport(users.owner, "last_7_days");
    expect(weekly.trend_points.map((point) => [
      point.bucket_start,
      point.currency,
      point.gross_amount_minor,
    ])).toEqual([
      ["2026-09-13", "BBD", "1000"],
      ["2026-09-15", "BBD", "2000"],
      ["2026-09-16", "BBD", "3000"],
      ["2026-09-18", "USD", "4000"],
    ]);

    const all = await getReport(users.owner, "all");
    expect(all.trend_points.map((point) => [
      point.bucket_start,
      point.currency,
      point.gross_amount_minor,
    ])).toEqual([
      ["2025-12-01", "BBD", "7000"],
      ["2026-03-01", "BBD", "6000"],
      ["2026-09-01", "BBD", "16500"],
      ["2026-09-01", "USD", "4000"],
    ]);
  });

  it("returns fund and gift-type dimensions in stable order", async () => {
    const report = await getReport(users.owner, "last_7_days");
    expect(report.fund_summaries.map((summary) => [
      summary.currency,
      summary.gross_amount_minor,
      summary.fund_id,
    ])).toEqual([
      ["BBD", "3000", funds.missions],
      ["BBD", "3000", funds.general],
      ["USD", "4000", funds.general],
    ]);
    expect(report.gift_type_summaries.map((summary) => [
      summary.currency,
      summary.gift_type,
      summary.gross_amount_minor,
    ])).toEqual([
      ["BBD", "one_time", "5000"],
      ["BBD", "recurring", "1000"],
      ["USD", "one_time", "4000"],
    ]);
  });

  it("retains a captured recurring gift after its plan was canceled", async () => {
    const report = await getReport(users.owner, "last_7_days");
    expect(report.gift_type_summaries).toContainEqual({
      gift_type: "recurring",
      currency: "BBD",
      gross_amount_minor: "1000",
      processing_fee_minor: "100",
      refunded_amount_minor: "0",
      recorded_net_amount_minor: "900",
      gift_count: "1",
    });
  });

  it("returns minimum aggregates without sensitive or other-tenant data", async () => {
    const report = await getReport(users.owner);
    expect(Object.keys(report).sort()).toEqual([
      "church_id",
      "church_timezone",
      "currency_summaries",
      "fund_summaries",
      "gift_type_summaries",
      "period_end_date",
      "period_start_date",
      "report_as_of_date",
      "report_period",
      "trend_points",
    ]);
    const serialized = JSON.stringify(report);
    for (const prohibited of [
      "private-p22@example.test",
      "private note",
      "p22-canceled-plan",
      "Other Tenant Secret",
      "other-secret-p22@example.test",
      "cross tenant secret",
      "999999",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("returns canonical text above JavaScript's safe integer range", async () => {
    await db.exec("begin;");
    try {
      await db.exec(`
        insert into public.donations (
          id, church_id, fund_id, source, status, amount_minor, currency,
          donated_at, created_at, updated_at
        ) values (
          '32070000-0000-4000-8000-000000000099', '${churches.primary}',
          '${funds.general}', 'cash', 'succeeded', 9007199254740993, 'CAD',
          '2026-09-18T12:00:00Z', '2026-09-18T12:00:00Z',
          '2026-09-18T12:00:00Z'
        );
        select set_config('request.jwt.claim.sub', '${users.owner}', true);
        select set_config(
          'request.jwt.claims',
          '{"sub":"${users.owner}","role":"authenticated"}',
          true
        );
        set local role authenticated;
      `);
      const result = await db.query<{ report: GivingReport }>(
        reportSql("last_7_days"),
      );
      expect(result.rows[0]!.report.currency_summaries).toContainEqual({
        currency: "CAD",
        gross_amount_minor: "9007199254740993",
        processing_fee_minor: "0",
        refunded_amount_minor: "0",
        recorded_net_amount_minor: "9007199254740993",
        gift_count: "1",
      });
    } finally {
      await db.exec("rollback;");
    }
  });

  it("returns typed empty aggregates and rejects invalid inputs", async () => {
    const empty = await getReport(users.owner, "all", {
      asOfDate: "2000-01-01",
    });
    expect(empty.currency_summaries).toEqual([]);
    expect(empty.trend_points).toEqual([]);
    expect(empty.fund_summaries).toEqual([]);
    expect(empty.gift_type_summaries).toEqual([]);

    await expect(
      getReport(users.owner, "all", { asOfDate: "1999-12-31" }),
    ).rejects.toThrow(/CHURCH_GIVING_REPORT_INVALID_AS_OF_DATE/);

    await expect(
      inAuthenticatedTransaction(db, users.owner, () =>
        db.query(`select public.get_church_giving_report(
          '${churches.primary}'::uuid,
          null,
          '2026-09-19'::date
        )`),
      ),
    ).rejects.toThrow(/CHURCH_GIVING_REPORT_INVALID_PERIOD/);
  });
});
