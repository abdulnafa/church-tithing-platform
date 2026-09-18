import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "20100000-0000-4000-8000-000000000001",
  finance: "20100000-0000-4000-8000-000000000002",
  accountant: "20100000-0000-4000-8000-000000000003",
  staff: "20100000-0000-4000-8000-000000000004",
  inactiveOwner: "20100000-0000-4000-8000-000000000005",
  otherOwner: "20100000-0000-4000-8000-000000000006",
} as const;

const churches = {
  primary: "20200000-0000-4000-8000-000000000001",
  other: "20200000-0000-4000-8000-000000000002",
} as const;

const connection = "20300000-0000-4000-8000-000000000001";
const funds = {
  missions: "20400000-0000-4000-8000-000000000001",
  other: "20400000-0000-4000-8000-000000000002",
} as const;
const campaign = "20500000-0000-4000-8000-000000000001";
const donors = {
  alpha: "20600000-0000-4000-8000-000000000001",
  beta: "20600000-0000-4000-8000-000000000002",
  other: "20600000-0000-4000-8000-000000000003",
} as const;
const recurring = {
  active: "20700000-0000-4000-8000-000000000001",
  canceled: "20700000-0000-4000-8000-000000000002",
} as const;
const donations = {
  newestHigh: "20800000-0000-4000-8000-000000000009",
  newestLow: "20800000-0000-4000-8000-000000000008",
  activeRecurring: "20800000-0000-4000-8000-000000000007",
  recurringCanceled: "20800000-0000-4000-8000-000000000006",
  bothCanceled: "20800000-0000-4000-8000-000000000005",
  paymentCanceled: "20800000-0000-4000-8000-000000000004",
  failedMission: "20800000-0000-4000-8000-000000000003",
  other: "20800000-0000-4000-8000-000000000002",
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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type TransactionRecord = {
  transaction_id: string;
  church_id: string;
  donor_name: string;
  fund_id: string;
  fund_name: string;
  campaign_id: string | null;
  campaign_name: string | null;
  recorded_at: string;
  frequency: string | null;
  recurring_status: string | null;
  amount_minor: number;
  currency: string;
  processing_fee_minor: number;
  refunded_amount_minor: number;
  net_amount_minor: number;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_status: string;
  cancellation_state: string;
};

type FundOption = {
  fund_id: string;
  fund_name: string;
  fund_status: string;
};

type TransactionPage = {
  church_id: string;
  church_timezone: string;
  transactions: TransactionRecord[];
  fund_options: FundOption[];
  next_cursor_created_at: string | null;
  next_cursor_transaction_id: string | null;
  has_more: boolean;
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

async function asAuthenticated<T extends Record<string, unknown>>(
  target: PGlite,
  userId: string,
  sql: string,
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
    const result = await target.query<T>(sql);
    await target.exec("rollback;");
    return result;
  } catch (error) {
    await target.exec("rollback;");
    throw error;
  }
}

async function asRole(
  target: PGlite,
  role: "anon" | "service_role",
  sql: string,
) {
  await target.exec("begin;");
  try {
    await target.exec(`set local role ${role};`);
    const result = await target.query(sql);
    await target.exec("rollback;");
    return result;
  } catch (error) {
    await target.exec("rollback;");
    throw error;
  }
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function pageSql(
  options: Readonly<{
    churchId?: string;
    pageSize?: number;
    cursorCreatedAt?: string;
    cursorId?: string;
    dateFrom?: string;
    dateTo?: string;
    donorQuery?: string;
    minAmount?: number;
    maxAmount?: number;
    fundId?: string;
    recurringState?: string;
    last4?: string;
    paymentStatus?: string;
    cancellationState?: string;
  }> = {},
) {
  const args = [
    `target_church_id => '${options.churchId ?? churches.primary}'::uuid`,
    options.pageSize === undefined
      ? null
      : `transaction_page_size => ${options.pageSize}`,
    options.cursorCreatedAt === undefined
      ? null
      : `transaction_cursor_created_at => ${sqlLiteral(options.cursorCreatedAt)}::timestamptz`,
    options.cursorId === undefined
      ? null
      : `transaction_cursor_id => '${options.cursorId}'::uuid`,
    options.dateFrom === undefined
      ? null
      : `transaction_date_from => '${options.dateFrom}'::date`,
    options.dateTo === undefined
      ? null
      : `transaction_date_to => '${options.dateTo}'::date`,
    options.donorQuery === undefined
      ? null
      : `transaction_donor_query => ${sqlLiteral(options.donorQuery)}`,
    options.minAmount === undefined
      ? null
      : `transaction_min_amount_minor => ${options.minAmount}::bigint`,
    options.maxAmount === undefined
      ? null
      : `transaction_max_amount_minor => ${options.maxAmount}::bigint`,
    options.fundId === undefined
      ? null
      : `transaction_fund_id => '${options.fundId}'::uuid`,
    options.recurringState === undefined
      ? null
      : `transaction_recurring_state => ${sqlLiteral(options.recurringState)}`,
    options.last4 === undefined
      ? null
      : `transaction_last4 => ${sqlLiteral(options.last4)}`,
    options.paymentStatus === undefined
      ? null
      : `transaction_payment_status => '${options.paymentStatus}'::public.donation_status`,
    options.cancellationState === undefined
      ? null
      : `transaction_cancellation_state => ${sqlLiteral(options.cancellationState)}`,
  ].filter((value): value is string => value !== null);
  return `select to_jsonb(public.get_church_transaction_page(
    ${args.join(",\n    ")}
  )) page;`;
}

async function getPage(
  userId: string,
  options: Parameters<typeof pageSql>[0] = {},
) {
  const result = await asAuthenticated<{ page: TransactionPage }>(
    db,
    userId,
    pageSql(options),
  );
  return result.rows[0]!.page;
}

const db = new PGlite();

describe("P20 church transaction list behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p20@example.test', now(), '{"display_name":"P20 Owner"}'),
        ('${users.finance}', 'finance-p20@example.test', now(), '{"display_name":"P20 Finance"}'),
        ('${users.accountant}', 'accountant-p20@example.test', now(), '{"display_name":"P20 Accountant"}'),
        ('${users.staff}', 'staff-p20@example.test', now(), '{"display_name":"P20 Staff"}'),
        ('${users.inactiveOwner}', 'inactive-p20@example.test', now(), '{"display_name":"P20 Inactive"}'),
        ('${users.otherOwner}', 'other-p20@example.test', now(), '{"display_name":"P20 Other"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at
      ) values
        ('${churches.primary}', 'P20 Primary', 'P20 Primary Inc.',
          'p20-primary', 'active', 'BBD', 'America/Barbados',
          'primary-p20@example.test', statement_timestamp()),
        ('${churches.other}', 'P20 Other', 'P20 Other Inc.',
          'p20-other', 'active', 'USD', 'UTC',
          'other-p20@example.test', statement_timestamp());

      insert into public.church_memberships (church_id, user_id, role, status)
      values
        ('${churches.primary}', '${users.owner}', 'owner', 'active'),
        ('${churches.primary}', '${users.finance}', 'finance_admin', 'active'),
        ('${churches.primary}', '${users.accountant}', 'accountant', 'active'),
        ('${churches.primary}', '${users.staff}', 'staff', 'active'),
        ('${churches.primary}', '${users.inactiveOwner}', 'owner', 'active'),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active');

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
          'hidden-alpha@example.test', false),
        ('${donors.beta}', '${churches.primary}', 'Beta Donor',
          'hidden-beta@example.test', false),
        ('${donors.other}', '${churches.other}', 'Other Tenant Secret',
          'other-secret@example.test', false);

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, payouts_enabled,
        supported_currencies, capabilities
      ) values (
        '${connection}', '${churches.primary}', 'mock-development-gateway',
        'p20-primary-development', 'active', true, true, true, true,
        array['BBD'],
        '{"environment":"development","settlement_mode":"direct_to_church"}'
      );

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, payment_connection_id,
        amount_minor, currency, frequency, status,
        provider_subscription_reference, payment_method_brand,
        payment_method_last4, started_at, next_charge_at, canceled_at
      ) values
        ('${recurring.active}', '${churches.primary}', '${donors.alpha}',
          '${funds.missions}', '${connection}', 3000, 'BBD', 'monthly',
          'active', 'p20-active-plan', 'Visa', '1111',
          '2026-01-01T00:00:00Z', '2026-10-01T00:00:00Z', null),
        ('${recurring.canceled}', '${churches.primary}', '${donors.beta}',
          '${funds.missions}', '${connection}', 4000, 'BBD', 'weekly',
          'canceled', 'p20-canceled-plan', 'Mastercard', '2222',
          '2026-01-01T00:00:00Z', null, '2026-09-16T00:00:00Z');

      insert into public.donations (
        id, church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
        payment_connection_id, source, status, amount_minor, currency,
        processing_fee_minor, refunded_amount_minor, payment_method_brand,
        payment_method_last4, donor_display_name, donor_email, donor_message,
        external_idempotency_key, donated_at, failed_at, created_at, updated_at
      ) values
        ('${donations.newestHigh}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, '${connection}', 'online',
          'succeeded', 9000, 'BBD', 300, 0, 'Visa', '4242', 'Alpha Donor',
          'hidden-alpha@example.test', 'never expose this message',
          'p20-newest-high', '2026-09-18T04:30:00Z', null,
          '2026-09-18T04:30:00Z', '2026-09-18T04:30:00Z'),
        ('${donations.newestLow}', '${churches.primary}', '${donors.beta}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, '${connection}', 'online',
          'succeeded', 2000, 'BBD', 80, 0, ' Visa ', null, 'Beta Donor',
          'hidden-beta@example.test', null, 'p20-newest-low',
          '2026-09-18T04:30:00Z', null,
          '2026-09-18T04:30:00Z', '2026-09-18T04:30:00Z'),
        ('${donations.activeRecurring}', '${churches.primary}', '${donors.alpha}',
          '${funds.missions}', '${campaign}', '${recurring.active}',
          '${connection}', 'online', 'succeeded', 3000, 'BBD', 100, 0,
          'Visa', '1111', 'Alpha Donor', 'hidden-alpha@example.test', null,
          'p20-active-recurring', '2026-09-17T15:00:00Z', null,
          '2026-09-17T15:00:00Z', '2026-09-17T15:00:00Z'),
        ('${donations.recurringCanceled}', '${churches.primary}', '${donors.beta}',
          '${funds.missions}', null, '${recurring.canceled}', '${connection}',
          'online', 'succeeded', 4000, 'BBD', 130, 0, 'Mastercard', '2222',
          'Beta Donor', 'hidden-beta@example.test', null,
          'p20-recurring-canceled', '2026-09-16T12:00:00Z', null,
          '2026-09-16T12:00:00Z', '2026-09-16T12:00:00Z'),
        ('${donations.bothCanceled}', '${churches.primary}', '${donors.beta}',
          '${funds.missions}', null, '${recurring.canceled}', '${connection}',
          'online', 'canceled', 4000, 'BBD', 0, 0, 'Mastercard', '2222',
          'Beta Donor', 'hidden-beta@example.test', null,
          'p20-both-canceled', null, null,
          '2026-09-15T12:00:00Z', '2026-09-15T12:00:00Z'),
        ('${donations.paymentCanceled}', '${churches.primary}', '${donors.alpha}',
          (select id from public.funds where church_id='${churches.primary}'
            and is_default), null, null, '${connection}', 'online',
          'canceled', 2500, 'BBD', 0, 0, null, null, 'Alpha Donor',
          'hidden-alpha@example.test', null, 'p20-payment-canceled',
          null, null, '2026-09-14T12:00:00Z', '2026-09-14T12:00:00Z'),
        ('${donations.failedMission}', '${churches.primary}', '${donors.beta}',
          '${funds.missions}', '${campaign}', null, '${connection}', 'online',
          'failed', 1500, 'BBD', 0, 0, 'Visa', '9999', 'Beta Donor',
          'hidden-beta@example.test', null, 'p20-failed-mission', null,
          '2026-09-13T12:00:00Z', '2026-09-13T12:00:00Z',
          '2026-09-13T12:00:00Z'),
        ('${donations.other}', '${churches.other}', '${donors.other}',
          (select id from public.funds where church_id='${churches.other}'
            and is_default), null, null, null, 'cash', 'succeeded', 999999,
          'USD', 0, 0, null, null, 'Other Tenant Secret',
          'other-secret@example.test', 'cross tenant secret', null,
          '2026-09-19T12:00:00Z', null,
          '2026-09-19T12:00:00Z', '2026-09-19T12:00:00Z');
    `);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates the exact cursor index and authenticated-only RPC privileges", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select count(*)::integer from pg_indexes
        where schemaname='public'
          and indexname='donations_church_created_cursor_idx') cursor_index,
      has_function_privilege('authenticated',
        'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)',
        'EXECUTE') auth_execute,
      has_function_privilege('anon',
        'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)',
        'EXECUTE') anon_execute,
      has_function_privilege('service_role',
        'public.get_church_transaction_page(uuid,integer,timestamp with time zone,uuid,date,date,text,bigint,bigint,uuid,text,text,public.donation_status,text)',
        'EXECUTE') service_execute;`);
    expect(result.rows[0]).toEqual({
      cursor_index: 1,
      auth_execute: true,
      anon_execute: false,
      service_execute: false,
    });
  });

  it("returns a minimum tenant-scoped page and all historical fund options", async () => {
    const page = await getPage(users.owner);
    expect(page.church_id).toBe(churches.primary);
    expect(page.church_timezone).toBe("America/Barbados");
    expect(page.transactions).toHaveLength(7);
    expect(page.fund_options.map((fund) => fund.fund_name)).toEqual([
      "Tithes",
      "Missions",
    ]);
    expect(Object.keys(page.transactions[0] ?? {}).sort()).toEqual([
      "transaction_id",
      "church_id",
      "donor_name",
      "fund_id",
      "fund_name",
      "campaign_id",
      "campaign_name",
      "recorded_at",
      "frequency",
      "recurring_status",
      "amount_minor",
      "currency",
      "processing_fee_minor",
      "refunded_amount_minor",
      "net_amount_minor",
      "payment_method_brand",
      "payment_method_last4",
      "payment_status",
      "cancellation_state",
    ].sort());
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain("hidden-alpha@example.test");
    expect(serialized).not.toContain("never expose this message");
    expect(serialized).not.toContain("Other Tenant Secret");
    expect(serialized).not.toContain(donations.other);
    expect(
      page.transactions.find(
        (row) => row.transaction_id === donations.newestLow,
      )?.payment_method_brand,
    ).toBeNull();
  });

  it("uses a deterministic created-at and UUID keyset without overlap", async () => {
    const first = await getPage(users.owner, { pageSize: 2 });
    expect(first.transactions.map((row) => row.transaction_id)).toEqual([
      donations.newestHigh,
      donations.newestLow,
    ]);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor_transaction_id).toBe(donations.newestLow);
    const second = await getPage(users.owner, {
      pageSize: 2,
      cursorCreatedAt: first.next_cursor_created_at!,
      cursorId: first.next_cursor_transaction_id!,
    });
    expect(second.transactions.map((row) => row.transaction_id)).toEqual([
      donations.activeRecurring,
      donations.recurringCanceled,
    ]);
    expect(
      first.transactions.some((left) =>
        second.transactions.some((right) => left.transaction_id === right.transaction_id),
      ),
    ).toBe(false);
  });

  it("uses inclusive church-local date filters", async () => {
    const localSeptember18 = await getPage(users.owner, {
      dateFrom: "2026-09-18",
      dateTo: "2026-09-18",
    });
    expect(localSeptember18.transactions.map((row) => row.transaction_id)).toEqual([
      donations.newestHigh,
      donations.newestLow,
    ]);
    const localSeptember17 = await getPage(users.owner, {
      dateFrom: "2026-09-17",
      dateTo: "2026-09-17",
    });
    expect(localSeptember17.transactions.map((row) => row.transaction_id)).toEqual([
      donations.activeRecurring,
    ]);
  });

  it("searches only the immutable donor display-name snapshot", async () => {
    const byName = await getPage(users.owner, { donorQuery: "  alpha donor " });
    expect(byName.transactions).toHaveLength(3);
    expect(byName.transactions.every((row) => row.donor_name === "Alpha Donor")).toBe(true);
    const byHiddenEmail = await getPage(users.owner, {
      donorQuery: "hidden-alpha@example.test",
    });
    expect(byHiddenEmail.transactions).toHaveLength(0);
  });

  it("filters amount, category, last four, and payment status on the server", async () => {
    const combined = await getPage(users.owner, {
      minAmount: 1000,
      maxAmount: 2000,
      fundId: funds.missions,
      last4: "9999",
      paymentStatus: "failed",
    });
    expect(combined.transactions.map((row) => row.transaction_id)).toEqual([
      donations.failedMission,
    ]);
    expect(combined.transactions[0]).toMatchObject({
      fund_name: "Missions",
      campaign_name: "Community Care",
      amount_minor: 1500,
      payment_method_last4: "9999",
      payment_status: "failed",
    });
  });

  it("separates one-time, any recurring, and exact recurring-plan states", async () => {
    const oneTime = await getPage(users.owner, { recurringState: "one_time" });
    expect(oneTime.transactions.map((row) => row.transaction_id)).toEqual([
      donations.newestHigh,
      donations.newestLow,
      donations.paymentCanceled,
      donations.failedMission,
    ]);
    const allRecurring = await getPage(users.owner, { recurringState: "recurring" });
    expect(allRecurring.transactions).toHaveLength(3);
    const canceled = await getPage(users.owner, { recurringState: "canceled" });
    expect(canceled.transactions.map((row) => row.transaction_id)).toEqual([
      donations.recurringCanceled,
      donations.bothCanceled,
    ]);
  });

  it("keeps payment cancellation and recurring cancellation distinct", async () => {
    const page = await getPage(users.owner);
    const states = new Map(
      page.transactions.map((row) => [row.transaction_id, row.cancellation_state]),
    );
    expect(states.get(donations.newestHigh)).toBe("not_canceled");
    expect(states.get(donations.paymentCanceled)).toBe("payment_canceled");
    expect(states.get(donations.recurringCanceled)).toBe("recurring_canceled");
    expect(states.get(donations.bothCanceled)).toBe(
      "payment_and_recurring_canceled",
    );

    const payment = await getPage(users.owner, {
      cancellationState: "payment_canceled",
    });
    expect(payment.transactions.map((row) => row.transaction_id)).toEqual([
      donations.bothCanceled,
      donations.paymentCanceled,
    ]);
    const recurringRows = await getPage(users.owner, {
      cancellationState: "recurring_canceled",
    });
    expect(recurringRows.transactions.map((row) => row.transaction_id)).toEqual([
      donations.recurringCanceled,
      donations.bothCanceled,
    ]);
    const any = await getPage(users.owner, { cancellationState: "any_canceled" });
    expect(any.transactions).toHaveLength(3);
  });

  it("allows every financial role and denies staff, inactive, cross-tenant, and non-auth callers", async () => {
    for (const userId of [users.owner, users.finance, users.accountant]) {
      await expect(getPage(userId, { pageSize: 1 })).resolves.toMatchObject({
        church_id: churches.primary,
      });
    }
    for (const userId of [users.staff, users.inactiveOwner, users.otherOwner]) {
      await expect(getPage(userId)).rejects.toThrow(
        /CHURCH_TRANSACTIONS_FORBIDDEN/,
      );
    }
    await expect(
      asRole(db, "anon", pageSql()),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(db, "service_role", pageSql()),
    ).rejects.toThrow(/permission denied/i);
  });

  it("fails closed for malformed pagination and filter inputs", async () => {
    const invalidCases = [
      [pageSql({ pageSize: 0 }), /CHURCH_TRANSACTIONS_INVALID_PAGE_SIZE/],
      [
        pageSql({ cursorCreatedAt: "2026-09-18T04:30:00Z" }),
        /CHURCH_TRANSACTIONS_INVALID_CURSOR/,
      ],
      [
        pageSql({ dateFrom: "2026-09-19", dateTo: "2026-09-18" }),
        /CHURCH_TRANSACTIONS_INVALID_DATE_RANGE/,
      ],
      [
        pageSql({ minAmount: 2000, maxAmount: 1000 }),
        /CHURCH_TRANSACTIONS_INVALID_AMOUNT_RANGE/,
      ],
      [
        pageSql({ recurringState: "unknown" }),
        /CHURCH_TRANSACTIONS_INVALID_RECURRING_STATE/,
      ],
      [pageSql({ last4: "42" }), /CHURCH_TRANSACTIONS_INVALID_LAST4/],
      [
        pageSql({ cancellationState: "unknown" }),
        /CHURCH_TRANSACTIONS_INVALID_CANCELLATION_STATE/,
      ],
    ] as const;
    for (const [sql, expected] of invalidCases) {
      await expect(asAuthenticated(db, users.owner, sql)).rejects.toThrow(expected);
    }
  });

  it("returns an empty page with fund options and no cursor for no matches", async () => {
    const page = await getPage(users.owner, { last4: "0000" });
    expect(page.transactions).toEqual([]);
    expect(page.fund_options).toHaveLength(2);
    expect(page.has_more).toBe(false);
    expect(page.next_cursor_created_at).toBeNull();
    expect(page.next_cursor_transaction_id).toBeNull();
  });
});
