import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  superAdmin: "51000000-0000-4000-8000-000000001001",
  otherSuperAdmin: "51000000-0000-4000-8000-000000001002",
  support: "51000000-0000-4000-8000-000000001003",
  owner: "51000000-0000-4000-8000-000000001004",
  inactiveOwner: "51000000-0000-4000-8000-000000001005",
  unconfirmedOwner: "51000000-0000-4000-8000-000000001006",
  reservedOwner: "51000000-0000-4000-8000-000000001007",
} as const;

const churches = {
  ready: "52000000-0000-4000-8000-000000001001",
  incomplete: "52000000-0000-4000-8000-000000001002",
  active: "52000000-0000-4000-8000-000000001003",
  suspended: "52000000-0000-4000-8000-000000001004",
  malformed: "52000000-0000-4000-8000-000000001005",
} as const;

const memberships = {
  readyOwner: "53000000-0000-4000-8000-000000001001",
  activeOwner: "53000000-0000-4000-8000-000000001002",
  suspendedOwner: "53000000-0000-4000-8000-000000001003",
  malformedOwner: "53000000-0000-4000-8000-000000001004",
  inactiveOwner: "53000000-0000-4000-8000-000000001005",
  unconfirmedOwner: "53000000-0000-4000-8000-000000001006",
} as const;

const requests = {
  activate: "54000000-0000-4000-8000-000000001001",
  suspend: "54000000-0000-4000-8000-000000001002",
  restore: "54000000-0000-4000-8000-000000001003",
  defaults: "54000000-0000-4000-8000-000000001004",
  defaultsTwo: "54000000-0000-4000-8000-000000001005",
  lateLifecycle: "54000000-0000-4000-8000-000000001006",
  lateDefaults: "54000000-0000-4000-8000-000000001007",
  provision: "54000000-0000-4000-8000-000000001008",
  invalid: "54000000-0000-4000-8000-000000001099",
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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type LifecycleResult = {
  church_id: string;
  status: "onboarding" | "active" | "suspended" | "canceled" | "archived";
  lifecycle_revision: number;
  activated_at: Date | string | null;
  suspended_at: Date | string | null;
  replayed: boolean;
};

type DefaultsResult = {
  default_currency: string;
  default_timezone: string;
  default_primary_color: string;
  default_secondary_color: string;
  settings_revision: number;
  updated_at: Date | string;
  replayed?: boolean;
};

const db = new PGlite();

function sqlLiteral(value: string | null | undefined) {
  return value == null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function lifecycleSql(input: {
  requestId: string | null;
  churchId: string | null;
  expectedRevision: number | null;
  operation: string | null;
  reason?: string | null;
}) {
  return `select * from public.mutate_platform_tenant_lifecycle(
    lifecycle_request_id => ${sqlLiteral(input.requestId)}::uuid,
    target_church_id => ${sqlLiteral(input.churchId)}::uuid,
    expected_lifecycle_revision => ${input.expectedRevision ?? "null"}::bigint,
    lifecycle_operation => ${sqlLiteral(input.operation)},
    suspension_reason_code => ${sqlLiteral(input.reason)}
  );`;
}

function defaultsSql(input: {
  requestId: string | null;
  expectedRevision: number | null;
  currency: string | null;
  timezone: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}) {
  return `select * from public.update_platform_onboarding_defaults(
    settings_request_id => ${sqlLiteral(input.requestId)}::uuid,
    expected_settings_revision => ${input.expectedRevision ?? "null"}::bigint,
    default_currency => ${sqlLiteral(input.currency)},
    default_timezone => ${sqlLiteral(input.timezone)},
    default_primary_color => ${sqlLiteral(input.primaryColor)},
    default_secondary_color => ${sqlLiteral(input.secondaryColor)}
  );`;
}

async function installFoundation(target: PGlite, through = migrations.length) {
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

async function asAuthenticated<T extends Record<string, unknown>>(
  userId: string,
  sql: string,
  commit = false,
) {
  await db.exec("begin;");
  try {
    await db.exec(`
      select set_config('request.jwt.claim.sub', '${userId}', true);
      select set_config(
        'request.jwt.claims',
        '{"sub":"${userId}","role":"authenticated"}',
        true
      );
      set local role authenticated;
    `);
    const result = await db.query<T>(sql);
    await db.exec(commit ? "commit;" : "rollback;");
    return result;
  } catch (error) {
    await db.exec("rollback;");
    throw error;
  }
}

async function asRole<T extends Record<string, unknown>>(
  role: "anon" | "service_role",
  sql: string,
) {
  await db.exec("begin;");
  try {
    await db.exec(`set local role ${role};`);
    const result = await db.query<T>(sql);
    await db.exec("rollback;");
    return result;
  } catch (error) {
    await db.exec("rollback;");
    throw error;
  }
}

async function asRootIdentity<T extends Record<string, unknown>>(
  userId: string,
  beforeQuery: string,
  sql: string,
) {
  await db.exec("begin;");
  try {
    await db.exec(`
      select set_config('request.jwt.claim.sub', '${userId}', true);
      ${beforeQuery}
    `);
    const result = await db.query<T>(sql);
    await db.exec("rollback;");
    return result;
  } catch (error) {
    await db.exec("rollback;");
    throw error;
  }
}

describe("P13 platform tenant management behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await db.waitReady;
    await installFoundation(db);

    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.superAdmin}', 'super-p13@example.test', now(),
          '{"display_name":"P13 Super"}'),
        ('${users.otherSuperAdmin}', 'other-super-p13@example.test', now(),
          '{"display_name":"Other P13 Super"}'),
        ('${users.support}', 'support-p13@example.test', now(),
          '{"display_name":"P13 Support"}'),
        ('${users.owner}', 'owner-p13@example.test', now(),
          '{"display_name":"P13 Owner"}'),
        ('${users.inactiveOwner}', 'inactive-owner-p13@example.test', now(),
          '{"display_name":"Inactive P13 Owner"}'),
        ('${users.unconfirmedOwner}', 'unconfirmed-owner-p13@example.test', null,
          '{"display_name":"Unconfirmed P13 Owner"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.platform_admins (user_id, role, is_active)
      values
        ('${users.superAdmin}', 'super_admin', true),
        ('${users.otherSuperAdmin}', 'super_admin', true),
        ('${users.support}', 'support', true);

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        primary_color, secondary_color, support_email, activated_at,
        suspended_at, created_at, updated_at
      ) values
        ('${churches.ready}', 'Ready Church', 'Ready Church Inc.',
          'p13-ready', 'onboarding', 'BBD', 'America/Barbados', null, null,
          'ready-p13@example.test', null, null,
          '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('${churches.incomplete}', 'Incomplete Church', null,
          'p13-incomplete', 'onboarding', 'BBD', 'America/Barbados', null, null,
          null, null, null,
          '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'),
        ('${churches.active}', 'Active Church', 'Active Church Inc.',
          'p13-active', 'active', 'BBD', 'America/Barbados', null, null,
          'active-p13@example.test', '2026-01-03T00:00:00Z', null,
          '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z'),
        ('${churches.suspended}', 'Suspended Church', 'Suspended Church Inc.',
          'p13-suspended', 'suspended', 'BBD', 'America/Barbados', null, null,
          'suspended-p13@example.test', '2026-01-04T00:00:00Z',
          '2026-01-05T00:00:00Z', '2026-01-04T00:00:00Z',
          '2026-01-05T00:00:00Z'),
        ('${churches.malformed}', E'Bad\\001Name', 'Malformed Church Inc.',
          'p13-malformed', 'onboarding', 'EUR', E'Bad\\001Zone', null, null,
          'malformed-p13@example.test', null, null,
          '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z');

      insert into public.church_memberships (
        id, church_id, user_id, role, status
      ) values
        ('${memberships.readyOwner}', '${churches.ready}', '${users.owner}',
          'owner', 'active'),
        ('${memberships.activeOwner}', '${churches.active}', '${users.owner}',
          'owner', 'active'),
        ('${memberships.suspendedOwner}', '${churches.suspended}', '${users.owner}',
          'owner', 'active'),
        ('${memberships.malformedOwner}', '${churches.malformed}', '${users.owner}',
          'owner', 'active'),
        ('${memberships.inactiveOwner}', '${churches.incomplete}',
          '${users.inactiveOwner}', 'owner', 'active'),
        ('${memberships.unconfirmedOwner}', '${churches.incomplete}',
          '${users.unconfirmedOwner}', 'owner', 'revoked');

      update public.qr_links set is_active = false
      where church_id = '${churches.incomplete}';

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, supported_currencies, capabilities
      ) values (
        '55000000-0000-4000-8000-000000001001', '${churches.ready}',
        'p13-test-adapter', 'acct_p13_opaque', 'pending', true, false,
        array['BBD'], '{"mode":"test"}'::jsonb
      );
      insert into public.platform_subscriptions (
        id, church_id, provider, status, plan_code, amount_minor, currency
      ) values (
        '55000000-0000-4000-8000-000000001002', '${churches.ready}',
        'stripe', 'incomplete', 'p13-test-plan', 9900, 'USD'
      );
    `);
  }, 70_000);

  afterAll(async () => {
    await db.close();
  });

  it("installs the revision, singleton, private ledgers, locks, and narrow ACLs", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select column_default from information_schema.columns
       where table_schema='public' and table_name='churches'
         and column_name='lifecycle_revision') revision_default,
      (select count(*)::integer from public.platform_onboarding_defaults)
        singleton_rows,
      (select relrowsecurity and relforcerowsecurity from pg_class
       where oid='public.platform_tenant_lifecycle_requests'::regclass)
        lifecycle_private,
      (select relrowsecurity and relforcerowsecurity from pg_class
       where oid='public.platform_onboarding_default_requests'::regclass)
        defaults_private,
      (select count(*)::integer from pg_indexes where schemaname='public'
       and indexname='churches_platform_keyset_idx') keyset_index,
      has_table_privilege('service_role','public.platform_admins','SELECT')
        service_admin_read,
      has_table_privilege('service_role','public.platform_admins','UPDATE')
        service_admin_update,
      has_table_privilege('service_role','public.churches','UPDATE')
        service_church_update;`);
    expect(result.rows[0]).toEqual({
      revision_default: "0",
      singleton_rows: 1,
      lifecycle_private: true,
      defaults_private: true,
      keyset_index: 1,
      service_admin_read: false,
      service_admin_update: false,
      service_church_update: false,
    });
  });

  it("returns a safe deterministic keyset page and status-only aggregates", async () => {
    const first = await asAuthenticated<{
      tenants: Array<Record<string, unknown>>;
      total_tenant_count: number;
      onboarding_count: number;
      active_count: number;
      suspended_count: number;
      next_cursor_created_at: string;
      next_cursor_church_id: string;
      has_more: boolean;
    }>(users.superAdmin, `select
      to_jsonb((page).tenants) tenants,
      (page).total_tenant_count,
      (page).onboarding_count,
      (page).active_count,
      (page).suspended_count,
      (page).next_cursor_created_at::text,
      (page).next_cursor_church_id,
      (page).has_more
    from (select public.get_platform_tenants(2, null, null) page) query;`);

    expect(first.rows[0]).toMatchObject({
      total_tenant_count: 5,
      onboarding_count: 3,
      active_count: 1,
      suspended_count: 1,
      has_more: true,
      next_cursor_church_id: churches.suspended,
    });
    expect(first.rows[0]!.tenants.map((tenant) => tenant.church_id)).toEqual([
      churches.malformed,
      churches.suspended,
    ]);
    expect(first.rows[0]!.tenants[0]).toMatchObject({
      display_name: "Church workspace",
      default_currency: null,
      timezone: null,
      foundation_ready: false,
      missing_readiness_codes: ["church_profile"],
    });

    const second = await asAuthenticated<{ tenants: Array<Record<string, unknown>> }>(
      users.superAdmin,
      `select to_jsonb((page).tenants) tenants
       from (select public.get_platform_tenants(
         2,
         '${first.rows[0]!.next_cursor_created_at}'::timestamptz,
         '${first.rows[0]!.next_cursor_church_id}'::uuid
       ) page) query;`,
    );
    expect(second.rows[0]!.tenants.map((tenant) => tenant.church_id)).toEqual([
      churches.active,
      churches.incomplete,
    ]);
    expect(
      new Set([
        ...first.rows[0]!.tenants.map((tenant) => tenant.church_id),
        ...second.rows[0]!.tenants.map((tenant) => tenant.church_id),
      ]).size,
    ).toBe(4);
    expect(JSON.stringify(first.rows[0]!.tenants)).not.toMatch(
      /email|owner|subscription|provider|donation|amount/i,
    );
  });

  it("reports only four approved readiness codes and keeps colours optional", async () => {
    const page = await asAuthenticated<{ tenants: Array<Record<string, unknown>> }>(
      users.superAdmin,
      `select to_jsonb((page).tenants) tenants
       from (select public.get_platform_tenants(50, null, null) page) query;`,
    );
    const ready = page.rows[0]!.tenants.find(
      (tenant) => tenant.church_id === churches.ready,
    );
    const incomplete = page.rows[0]!.tenants.find(
      (tenant) => tenant.church_id === churches.incomplete,
    );
    expect(ready).toMatchObject({
      display_name: "Ready Church",
      foundation_ready: true,
      missing_readiness_codes: [],
    });
    expect(incomplete).toMatchObject({
      foundation_ready: false,
      missing_readiness_codes: [
        "active_owner",
        "church_profile",
        "permanent_qr",
      ],
    });

    const missingDefault = await asRootIdentity<{ codes: string[] }>(
      users.superAdmin,
      `update public.funds set is_default=false
       where church_id='${churches.ready}' and is_default;`,
      `select public.platform_tenant_missing_readiness('${churches.ready}') codes;`,
    );
    expect(missingDefault.rows[0]?.codes).toEqual(["default_fund"]);
  });

  it("rejects unauthorised list/default/lifecycle access and malformed cursors", async () => {
    for (const userId of [users.support, users.owner]) {
      await expect(
        asAuthenticated(userId, "select public.get_platform_tenants();"),
      ).rejects.toThrow(/PLATFORM_TENANTS_FORBIDDEN/);
      await expect(
        asAuthenticated(userId, "select public.get_platform_onboarding_defaults();"),
      ).rejects.toThrow(/PLATFORM_DEFAULTS_FORBIDDEN/);
      await expect(
        asAuthenticated(
          userId,
          lifecycleSql({
            requestId: requests.invalid,
            churchId: churches.ready,
            expectedRevision: 0,
            operation: "activate",
          }),
        ),
      ).rejects.toThrow(/PLATFORM_LIFECYCLE_FORBIDDEN/);
    }
    await expect(
      asRole("anon", "select public.get_platform_tenants();"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(users.superAdmin, "select public.get_platform_tenants(0);"),
    ).rejects.toThrow(/PLATFORM_TENANTS_INVALID_PAGE_SIZE/);
    await expect(
      asAuthenticated(
        users.superAdmin,
        "select public.get_platform_tenants(20, now(), null);",
      ),
    ).rejects.toThrow(/PLATFORM_TENANTS_INVALID_CURSOR/);
  });

  it("removes broad direct Super Admin identity and tenant data reads", async () => {
    const result = await asAuthenticated<Record<string, number>>(
      users.superAdmin,
      `select
        (select count(*)::integer from public.platform_admins) admin_rows,
        (select count(*)::integer from public.churches) churches,
        (select count(*)::integer from public.funds) funds,
        (select count(*)::integer from public.campaigns) campaigns,
        (select count(*)::integer from public.qr_links) qr_links,
        (select count(*)::integer from public.platform_subscriptions)
          subscriptions,
        (select count(*)::integer from public.payment_provider_connections)
          providers,
        (select count(*)::integer from public.donations) donations;`,
    );
    expect(result.rows[0]).toEqual({
      admin_rows: 1,
      churches: 0,
      funds: 0,
      campaigns: 0,
      qr_links: 0,
      subscriptions: 0,
      providers: 0,
      donations: 0,
    });
    await expect(
      asAuthenticated(users.superAdmin, "select created_by from public.platform_admins;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(
        users.superAdmin,
        `update public.churches set status='archived'
         where id='${churches.ready}';`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.platform_admins;"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("validates lifecycle request, revision, operation, and reason shapes", async () => {
    const cases: Array<[
      Parameters<typeof lifecycleSql>[0],
      RegExp,
    ]> = [
      [{ requestId: null, churchId: churches.ready, expectedRevision: 0,
        operation: "activate" }, /PLATFORM_LIFECYCLE_INVALID_REQUEST/],
      [{ requestId: requests.invalid, churchId: churches.ready,
        expectedRevision: -1, operation: "activate" },
      /PLATFORM_LIFECYCLE_INVALID_EXPECTED_REVISION/],
      [{ requestId: requests.invalid, churchId: churches.ready,
        expectedRevision: 0, operation: "archive" },
      /PLATFORM_LIFECYCLE_INVALID_OPERATION/],
      [{ requestId: requests.invalid, churchId: churches.active,
        expectedRevision: 0, operation: "suspend" },
      /PLATFORM_LIFECYCLE_INVALID_REASON/],
      [{ requestId: requests.invalid, churchId: churches.active,
        expectedRevision: 0, operation: "suspend", reason: "billing_failure" },
      /PLATFORM_LIFECYCLE_INVALID_REASON/],
      [{ requestId: requests.invalid, churchId: churches.ready,
        expectedRevision: 0, operation: "activate", reason: "church_request" },
      /PLATFORM_LIFECYCLE_INVALID_ARGUMENTS/],
    ];
    for (const [input, expected] of cases) {
      await expect(
        asAuthenticated(users.superAdmin, lifecycleSql(input), true),
      ).rejects.toThrow(expected);
    }
  });

  it("recomputes QR/profile readiness and keeps failed activation atomic", async () => {
    await db.exec(`update public.qr_links set is_active=false
      where church_id='${churches.ready}';`);
    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.activate,
          churchId: churches.ready,
          expectedRevision: 0,
          operation: "activate",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_TENANT_NOT_READY/);
    await db.exec(`update public.qr_links set is_active=true
      where church_id='${churches.ready}';`);

    await db.exec(`update public.profiles set is_active=false
      where id='${users.owner}';`);
    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.activate,
          churchId: churches.ready,
          expectedRevision: 0,
          operation: "activate",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_TENANT_NOT_READY/);
    await db.exec(`update public.profiles set is_active=true
      where id='${users.owner}';`);

    const state = await db.query<Record<string, unknown>>(`select
      status::text, lifecycle_revision,
      (select count(*)::integer from public.platform_tenant_lifecycle_requests
       where church_id='${churches.ready}') ledgers,
      (select count(*)::integer from public.audit_logs
       where church_id='${churches.ready}'
         and action_code='church_status_changed') audits
      from public.churches where id='${churches.ready}';`);
    expect(state.rows[0]).toEqual({
      status: "onboarding",
      lifecycle_revision: 0,
      ledgers: 0,
      audits: 0,
    });
  });

  it("activates only a ready onboarding tenant and audits identifiers/status", async () => {
    const activated = await asAuthenticated<LifecycleResult>(
      users.superAdmin,
      lifecycleSql({
        requestId: requests.activate,
        churchId: churches.ready,
        expectedRevision: 0,
        operation: " ACTIVATE ",
      }),
      true,
    );
    expect(activated.rows[0]).toMatchObject({
      church_id: churches.ready,
      status: "active",
      lifecycle_revision: 1,
      suspended_at: null,
      replayed: false,
    });
    expect(activated.rows[0]?.activated_at).not.toBeNull();
    const activationTimes = await db.query<{ valid: boolean }>(`select
      activated_at >= created_at valid from public.churches
      where id='${churches.ready}';`);
    expect(activationTimes.rows[0]?.valid).toBe(true);

    const audit = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id='${requests.activate}';`);
    expect(JSON.parse(audit.rows[0]!.changes)).toEqual({
      from_status: "onboarding",
      reason_code: "foundation_ready",
      to_status: "active",
    });
    expect(audit.rows[0]!.changes).not.toMatch(/name|email|provider|subscription/i);
  });

  it("replays exactly before CAS and rejects changed or stale requests", async () => {
    const replay = await asAuthenticated<LifecycleResult>(
      users.superAdmin,
      lifecycleSql({
        requestId: requests.activate,
        churchId: churches.ready,
        expectedRevision: 0,
        operation: "activate",
      }),
      true,
    );
    expect(replay.rows[0]).toMatchObject({ lifecycle_revision: 1, replayed: true });

    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.activate,
          churchId: churches.ready,
          expectedRevision: 0,
          operation: "suspend",
          reason: "church_request",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        users.otherSuperAdmin,
        lifecycleSql({
          requestId: requests.activate,
          churchId: churches.ready,
          expectedRevision: 0,
          operation: "activate",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.invalid,
          churchId: churches.ready,
          expectedRevision: 0,
          operation: "suspend",
          reason: "church_request",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_REVISION_CONFLICT/);
  });

  it("suspends and restores manually without touching billing/provider records", async () => {
    const lifecycleBefore = await db.query<{ activated_at: Date | string }>(`select
      activated_at from public.churches where id='${churches.ready}';`);
    const externalBefore = await db.query<{ snapshot: Record<string, unknown> }>(
      `select jsonb_build_object(
        'provider', (select to_jsonb(connection) - 'updated_at'
          from public.payment_provider_connections connection
          where connection.id='55000000-0000-4000-8000-000000001001'),
        'subscription', (select to_jsonb(subscription) - 'updated_at'
          from public.platform_subscriptions subscription
          where subscription.id='55000000-0000-4000-8000-000000001002')
      ) snapshot;`,
    );
    const suspended = await asAuthenticated<LifecycleResult>(
      users.superAdmin,
      lifecycleSql({
        requestId: requests.suspend,
        churchId: churches.ready,
        expectedRevision: 1,
        operation: "suspend",
        reason: " COMPLIANCE_REVIEW ",
      }),
      true,
    );
    expect(suspended.rows[0]).toMatchObject({
      status: "suspended",
      lifecycle_revision: 2,
      replayed: false,
    });
    expect(suspended.rows[0]?.suspended_at).not.toBeNull();
    expect(suspended.rows[0]?.activated_at).toEqual(
      lifecycleBefore.rows[0]?.activated_at,
    );
    expect(
      new Date(suspended.rows[0]!.suspended_at!).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(suspended.rows[0]!.activated_at!).getTime(),
    );

    const ownerWhileSuspended = await asAuthenticated<{ permissions: string[] }>(
      users.owner,
      `select public.get_my_church_permissions('${churches.ready}')::text[]
        permissions;`,
    );
    expect(ownerWhileSuspended.rows[0]?.permissions).toEqual([]);
    const publicWhileSuspended = await asRole<Record<string, number>>(
      "anon",
      `select
        (select count(*)::integer from public.churches
          where id='${churches.ready}') churches,
        (select count(*)::integer from public.funds
          where church_id='${churches.ready}') funds,
        (select count(*)::integer from public.qr_links
          where church_id='${churches.ready}') qr_links;`,
    );
    expect(publicWhileSuspended.rows[0]).toEqual({
      churches: 0,
      funds: 0,
      qr_links: 0,
    });

    await db.exec(`update public.profiles set is_active=false
      where id='${users.owner}';`);
    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.restore,
          churchId: churches.ready,
          expectedRevision: 2,
          operation: "restore",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_TENANT_NOT_READY/);
    await db.exec(`update public.profiles set is_active=true
      where id='${users.owner}';`);

    const restored = await asAuthenticated<LifecycleResult>(
      users.superAdmin,
      lifecycleSql({
        requestId: requests.restore,
        churchId: churches.ready,
        expectedRevision: 2,
        operation: "restore",
      }),
      true,
    );
    expect(restored.rows[0]).toMatchObject({
      status: "active",
      lifecycle_revision: 3,
      suspended_at: null,
      replayed: false,
    });
    expect(restored.rows[0]?.activated_at).toEqual(
      lifecycleBefore.rows[0]?.activated_at,
    );

    const ownerAfterRestore = await asAuthenticated<{ allowed: boolean }>(
      users.owner,
      `select cardinality(public.get_my_church_permissions(
        '${churches.ready}'
      )) > 0 allowed;`,
    );
    expect(ownerAfterRestore.rows[0]?.allowed).toBe(true);
    const publicAfterRestore = await asRole<Record<string, number>>(
      "anon",
      `select
        (select count(*)::integer from public.churches
          where id='${churches.ready}') churches,
        (select count(*)::integer from public.funds
          where church_id='${churches.ready}') funds,
        (select count(*)::integer from public.qr_links
          where church_id='${churches.ready}') qr_links;`,
    );
    expect(publicAfterRestore.rows[0]).toEqual({
      churches: 1,
      funds: 1,
      qr_links: 1,
    });

    const externalAfter = await db.query<{ snapshot: Record<string, unknown> }>(
      `select jsonb_build_object(
        'provider', (select to_jsonb(connection) - 'updated_at'
          from public.payment_provider_connections connection
          where connection.id='55000000-0000-4000-8000-000000001001'),
        'subscription', (select to_jsonb(subscription) - 'updated_at'
          from public.platform_subscriptions subscription
          where subscription.id='55000000-0000-4000-8000-000000001002')
      ) snapshot;`,
    );
    expect(externalAfter.rows[0]?.snapshot).toEqual(
      externalBefore.rows[0]?.snapshot,
    );
  });

  it("blocks incomplete activation and every unapproved lifecycle edge", async () => {
    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.invalid,
          churchId: churches.incomplete,
          expectedRevision: 0,
          operation: "activate",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_LIFECYCLE_TENANT_NOT_READY/);

    for (const [churchId, operation, reason] of [
      [churches.active, "activate", null],
      [churches.active, "restore", null],
      [churches.suspended, "suspend", "administrative_hold"],
      [churches.incomplete, "suspend", "church_request"],
    ] as const) {
      await expect(
        asAuthenticated(
          users.superAdmin,
          lifecycleSql({
            requestId: requests.invalid,
            churchId,
            expectedRevision: 0,
            operation,
            reason,
          }),
          true,
        ),
      ).rejects.toThrow(/PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED/);
    }
  });

  it("returns and updates canonical future defaults with exact replay/audit", async () => {
    const churchBefore = await db.query<{ snapshot: Record<string, unknown> }>(
      `select to_jsonb(church) - 'updated_at' snapshot
       from public.churches church where id='${churches.ready}';`,
    );
    const initial = await asAuthenticated<DefaultsResult>(
      users.superAdmin,
      "select * from public.get_platform_onboarding_defaults();",
    );
    expect(initial.rows[0]).toMatchObject({
      default_currency: "BBD",
      default_timezone: "America/Barbados",
      default_primary_color: "#1F6D60",
      default_secondary_color: "#E1B85A",
      settings_revision: 0,
    });

    const input = {
      requestId: requests.defaults,
      expectedRevision: 0,
      currency: " usd ",
      timezone: " Factory ",
      primaryColor: " #123abc ",
      secondaryColor: " #fedcba ",
    };
    const updated = await asAuthenticated<DefaultsResult>(
      users.superAdmin,
      defaultsSql(input),
      true,
    );
    expect(updated.rows[0]).toMatchObject({
      default_currency: "USD",
      default_timezone: "Factory",
      default_primary_color: "#123ABC",
      default_secondary_color: "#FEDCBA",
      settings_revision: 1,
      replayed: false,
    });

    const replay = await asAuthenticated<DefaultsResult>(
      users.superAdmin,
      defaultsSql(input),
      true,
    );
    expect(replay.rows[0]).toMatchObject({ settings_revision: 1, replayed: true });

    const audit = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id='${requests.defaults}';`);
    expect(JSON.parse(audit.rows[0]!.changes)).toEqual({
      setting_keys: [
        "default_currency",
        "default_timezone",
        "default_primary_color",
        "default_secondary_color",
      ],
    });
    const churchAfter = await db.query<{ snapshot: Record<string, unknown> }>(
      `select to_jsonb(church) - 'updated_at' snapshot
       from public.churches church where id='${churches.ready}';`,
    );
    expect(churchAfter.rows[0]?.snapshot).toEqual(churchBefore.rows[0]?.snapshot);
  });

  it("rejects invalid defaults, no-op, stale CAS, and cross-actor request reuse", async () => {
    const base = {
      requestId: requests.invalid,
      expectedRevision: 1,
      currency: "BBD",
      timezone: "America/Barbados",
      primaryColor: "#1F6D60",
      secondaryColor: "#E1B85A",
    };
    for (const [change, expected] of [
      [{ requestId: null }, /PLATFORM_DEFAULTS_INVALID_REQUEST_ID/],
      [{ expectedRevision: -1 }, /PLATFORM_DEFAULTS_INVALID_EXPECTED_REVISION/],
      [{ currency: "EUR" }, /PLATFORM_DEFAULTS_INVALID_CURRENCY/],
      [{ timezone: "Not/A_Zone" }, /PLATFORM_DEFAULTS_INVALID_TIMEZONE/],
      [{ primaryColor: "red" }, /PLATFORM_DEFAULTS_INVALID_PRIMARY_COLOR/],
      [{ secondaryColor: "#12345Z" },
        /PLATFORM_DEFAULTS_INVALID_SECONDARY_COLOR/],
    ] as const) {
      await expect(
        asAuthenticated(
          users.superAdmin,
          defaultsSql({ ...base, ...change }),
          true,
        ),
      ).rejects.toThrow(expected);
    }

    await expect(
      asAuthenticated(
        users.superAdmin,
        defaultsSql({
          ...base,
          currency: "USD",
          timezone: "Factory",
          primaryColor: "#123ABC",
          secondaryColor: "#FEDCBA",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_DEFAULTS_NO_CHANGES/);
    await expect(
      asAuthenticated(
        users.superAdmin,
        defaultsSql({ ...base, expectedRevision: 0 }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_DEFAULTS_REVISION_CONFLICT/);
    await expect(
      asAuthenticated(
        users.otherSuperAdmin,
        defaultsSql({
          requestId: requests.defaults,
          expectedRevision: 0,
          currency: "USD",
          timezone: "Factory",
          primaryColor: "#123ABC",
          secondaryColor: "#FEDCBA",
        }),
        true,
      ),
    ).rejects.toThrow(/PLATFORM_DEFAULTS_IDEMPOTENCY_CONFLICT/);
  });

  it("protects the singleton and validates timezone at the table boundary", async () => {
    await expect(
      db.exec("delete from public.platform_onboarding_defaults;"),
    ).rejects.toThrow(/PLATFORM_DEFAULTS_SINGLETON_PROTECTED/);
    await expect(
      db.exec("truncate public.platform_onboarding_defaults;"),
    ).rejects.toThrow(/PLATFORM_DEFAULTS_SINGLETON_PROTECTED/);
    await expect(
      db.exec(`update public.platform_onboarding_defaults
        set default_timezone='Not/A_Zone';`),
    ).rejects.toThrow(/PLATFORM_DEFAULTS_INVALID_TIMEZONE/);
    const rows = await db.query<{ count: number }>(`select count(*)::integer count
      from public.platform_onboarding_defaults;`);
    expect(rows.rows[0]?.count).toBe(1);
  });

  it("keeps lifecycle/default ledgers private and append-only", async () => {
    await expect(
      asAuthenticated(
        users.superAdmin,
        "select * from public.platform_tenant_lifecycle_requests;",
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(
        "service_role",
        "select * from public.platform_onboarding_default_requests;",
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.platform_tenant_lifecycle_requests
        set payload_sha256=repeat('a',64)
        where request_id='${requests.activate}';`),
    ).rejects.toThrow(/PLATFORM_MANAGEMENT_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec("truncate public.platform_onboarding_default_requests;"),
    ).rejects.toThrow(/PLATFORM_MANAGEMENT_LEDGER_APPEND_ONLY/);
  });

  it("keeps P08 provisioning and P12 owner-reservation claiming compatible", async () => {
    const provisioned = await asAuthenticated<{
      church_id: string;
      owner_membership_id: string;
      owner_membership_status: string;
    }>(users.superAdmin, `select * from public.provision_church(
      provisioning_request_id => '${requests.provision}',
      church_display_name => 'P13 Provisioned Church',
      church_legal_name => 'P13 Provisioned Church Inc.',
      church_slug => 'p13-provisioned',
      owner_email => 'reserved-owner-p13@example.test',
      church_support_email => 'support-provisioned-p13@example.test',
      church_currency => 'BBD',
      church_timezone => 'America/Barbados',
      church_primary_color => '#1F6D60',
      church_secondary_color => '#E1B85A',
      church_thank_you_message => null
    );`, true);
    expect(provisioned.rows[0]?.owner_membership_status).toBe("invited");

    const beforeClaim = await db.query<{ codes: string[] }>(`select
      public.platform_tenant_missing_readiness(
        '${provisioned.rows[0]!.church_id}'
      ) codes;`);
    expect(beforeClaim.rows[0]?.codes).toEqual(["active_owner"]);

    await db.exec(`insert into auth.users (
      id, email, email_confirmed_at, raw_user_meta_data
    ) values (
      '${users.reservedOwner}', 'reserved-owner-p13@example.test', now(),
      '{"display_name":"Reserved P13 Owner"}'
    );`);
    const claimed = await asAuthenticated<{
      church_id: string;
      membership_id: string;
      role: string;
      status: string;
      replayed: boolean;
    }>(users.reservedOwner, `select *
      from public.claim_church_staff_invitation(
        '${provisioned.rows[0]!.owner_membership_id}'
      );`, true);
    expect(claimed.rows[0]).toMatchObject({
      church_id: provisioned.rows[0]!.church_id,
      membership_id: provisioned.rows[0]!.owner_membership_id,
      role: "owner",
      status: "active",
      replayed: false,
    });

    const afterClaim = await db.query<{ codes: string[] }>(`select
      public.platform_tenant_missing_readiness(
        '${provisioned.rows[0]!.church_id}'
      ) codes;`);
    expect(afterClaim.rows[0]?.codes).toEqual([]);
  });

  it("rolls lifecycle, revision, audit, and ledger back on a late failure", async () => {
    await db.exec(`
      create function public.p13_force_lifecycle_failure()
      returns trigger language plpgsql set search_path='' as $$
      begin raise exception 'P13_FORCED_LIFECYCLE_FAILURE'; end;
      $$;
      create trigger p13_force_lifecycle_failure
      before insert on public.platform_tenant_lifecycle_requests
      for each row execute function public.p13_force_lifecycle_failure();
    `);
    const before = await db.query<Record<string, unknown>>(`select
      status::text, lifecycle_revision,
      (select count(*)::integer from public.audit_logs
       where church_id='${churches.active}') audits,
      (select count(*)::integer from public.platform_tenant_lifecycle_requests
       where church_id='${churches.active}') ledgers
      from public.churches where id='${churches.active}';`);
    await expect(
      asAuthenticated(
        users.superAdmin,
        lifecycleSql({
          requestId: requests.lateLifecycle,
          churchId: churches.active,
          expectedRevision: 0,
          operation: "suspend",
          reason: "administrative_hold",
        }),
        true,
      ),
    ).rejects.toThrow(/P13_FORCED_LIFECYCLE_FAILURE/);
    const after = await db.query<Record<string, unknown>>(`select
      status::text, lifecycle_revision,
      (select count(*)::integer from public.audit_logs
       where church_id='${churches.active}') audits,
      (select count(*)::integer from public.platform_tenant_lifecycle_requests
       where church_id='${churches.active}') ledgers
      from public.churches where id='${churches.active}';`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    await db.exec(`
      drop trigger p13_force_lifecycle_failure
        on public.platform_tenant_lifecycle_requests;
      drop function public.p13_force_lifecycle_failure();
    `);
  });

  it("rolls settings, revision, audit, and ledger back on a late failure", async () => {
    await db.exec(`
      create function public.p13_force_defaults_failure()
      returns trigger language plpgsql set search_path='' as $$
      begin raise exception 'P13_FORCED_DEFAULTS_FAILURE'; end;
      $$;
      create trigger p13_force_defaults_failure
      before insert on public.platform_onboarding_default_requests
      for each row execute function public.p13_force_defaults_failure();
    `);
    const before = await db.query<Record<string, unknown>>(`select
      defaults.settings_revision, defaults.default_currency,
      (select count(*)::integer from public.audit_logs
       where action_code='platform_settings_updated') audits,
      (select count(*)::integer from public.platform_onboarding_default_requests)
        ledgers
      from public.platform_onboarding_defaults defaults;`);
    await expect(
      asAuthenticated(
        users.superAdmin,
        defaultsSql({
          requestId: requests.lateDefaults,
          expectedRevision: 1,
          currency: "CAD",
          timezone: "America/Barbados",
          primaryColor: "#112233",
          secondaryColor: "#445566",
        }),
        true,
      ),
    ).rejects.toThrow(/P13_FORCED_DEFAULTS_FAILURE/);
    const after = await db.query<Record<string, unknown>>(`select
      defaults.settings_revision, defaults.default_currency,
      (select count(*)::integer from public.audit_logs
       where action_code='platform_settings_updated') audits,
      (select count(*)::integer from public.platform_onboarding_default_requests)
        ledgers
      from public.platform_onboarding_defaults defaults;`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    await db.exec(`
      drop trigger p13_force_defaults_failure
        on public.platform_onboarding_default_requests;
      drop function public.p13_force_defaults_failure();
    `);
  });
});

describe("P13 lifecycle migration preflight", () => {
  it("rejects inconsistent existing status timestamps without rewriting them", async () => {
    const preflight = new PGlite();
    await preflight.waitReady;
    try {
      await installFoundation(preflight, migrations.length - 1);
      await preflight.exec(`insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at
      ) values (
        '62000000-0000-4000-8000-000000001001', 'Invalid Active',
        'Invalid Active Inc.', 'p13-invalid-active', 'active', 'BBD',
        'America/Barbados', 'invalid-p13@example.test', null
      );`);
      await expect(preflight.exec(migrations.at(-1)!)).rejects.toThrow(
        /P13_EXISTING_LIFECYCLE_TIMESTAMPS_INVALID/,
      );
      await preflight.exec("rollback;");
      const state = await preflight.query<{ activated_at: null }>(`select
        activated_at from public.churches
        where id='62000000-0000-4000-8000-000000001001';`);
      expect(state.rows[0]?.activated_at).toBeNull();
    } finally {
      await preflight.close();
    }
  }, 50_000);
});
