import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "f2100000-0000-4000-8000-000000000001",
  staff: "f2100000-0000-4000-8000-000000000002",
  otherOwner: "f2100000-0000-4000-8000-000000000003",
  inactiveOwner: "f2100000-0000-4000-8000-000000000004",
  revokedOwner: "f2100000-0000-4000-8000-000000000005",
  onboardingOwner: "f2100000-0000-4000-8000-000000000006",
  suspendedOwner: "f2100000-0000-4000-8000-000000000007",
} as const;

const churches = {
  active: "f2200000-0000-4000-8000-000000000001",
  other: "f2200000-0000-4000-8000-000000000002",
  onboarding: "f2200000-0000-4000-8000-000000000003",
  suspended: "f2200000-0000-4000-8000-000000000004",
  canceled: "f2200000-0000-4000-8000-000000000005",
  archived: "f2200000-0000-4000-8000-000000000006",
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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type QrSnapshot = {
  church_id: string;
  church_slug: string;
  short_code: string;
  is_active: boolean;
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

async function asRole<T extends Record<string, unknown>>(
  target: PGlite,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
) {
  await target.exec("begin;");
  try {
    await target.exec(`set local role ${role};`);
    const result = await target.query<T>(sql);
    await target.exec("rollback;");
    return result;
  } catch (error) {
    await target.exec("rollback;");
    throw error;
  }
}

const db = new PGlite();
let codes: Record<keyof typeof churches, string>;

describe("P17 QR resolution behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p17@example.test', now(),
          '{"display_name":"P17 Owner"}'),
        ('${users.staff}', 'staff-p17@example.test', now(),
          '{"display_name":"P17 Staff"}'),
        ('${users.otherOwner}', 'other-owner-p17@example.test', now(),
          '{"display_name":"P17 Other Owner"}'),
        ('${users.inactiveOwner}', 'inactive-owner-p17@example.test', now(),
          '{"display_name":"P17 Inactive Owner"}'),
        ('${users.revokedOwner}', 'revoked-owner-p17@example.test', now(),
          '{"display_name":"P17 Revoked Owner"}'),
        ('${users.onboardingOwner}', 'onboarding-owner-p17@example.test', now(),
          '{"display_name":"P17 Onboarding Owner"}'),
        ('${users.suspendedOwner}', 'suspended-owner-p17@example.test', now(),
          '{"display_name":"P17 Suspended Owner"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at, suspended_at
      ) values
        ('${churches.active}', 'P17 Active', 'P17 Active Inc.',
          'p17-active', 'active', 'BBD', 'America/Barbados',
          'active-p17@example.test', now(), null),
        ('${churches.other}', 'P17 Other', 'P17 Other Inc.',
          'p17-other', 'active', 'BBD', 'America/Barbados',
          'other-p17@example.test', now(), null),
        ('${churches.onboarding}', 'P17 Onboarding', 'P17 Onboarding Inc.',
          'p17-onboarding', 'onboarding', 'BBD', 'America/Barbados',
          'onboarding-p17@example.test', null, null),
        ('${churches.suspended}', 'P17 Suspended', 'P17 Suspended Inc.',
          'p17-suspended', 'suspended', 'BBD', 'America/Barbados',
          'suspended-p17@example.test', now(), now()),
        ('${churches.canceled}', 'P17 Canceled', 'P17 Canceled Inc.',
          'p17-canceled', 'canceled', 'BBD', 'America/Barbados',
          'canceled-p17@example.test', now(), now()),
        ('${churches.archived}', 'P17 Archived', 'P17 Archived Inc.',
          'p17-archived', 'archived', 'BBD', 'America/Barbados',
          'archived-p17@example.test', now(), now());

      insert into public.church_memberships (church_id, user_id, role, status)
      values
        ('${churches.active}', '${users.owner}', 'owner', 'active'),
        ('${churches.active}', '${users.staff}', 'staff', 'active'),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active'),
        ('${churches.active}', '${users.inactiveOwner}', 'owner', 'active'),
        ('${churches.active}', '${users.revokedOwner}', 'owner', 'revoked'),
        ('${churches.onboarding}', '${users.onboardingOwner}', 'owner', 'active'),
        ('${churches.suspended}', '${users.suspendedOwner}', 'owner', 'active');

      update public.qr_links set is_active = false
      where church_id = '${churches.other}';
    `);

    const codeRows = await db.query<{ church_id: string; short_code: string }>(`
      select church_id, short_code
      from public.qr_links
      where church_id in (
        '${churches.active}', '${churches.other}', '${churches.onboarding}',
        '${churches.suspended}', '${churches.canceled}', '${churches.archived}'
      );
    `);
    const codeByChurch = Object.fromEntries(
      codeRows.rows.map((row) => [row.church_id, row.short_code]),
    );
    codes = {
      active: codeByChurch[churches.active]!,
      other: codeByChurch[churches.other]!,
      onboarding: codeByChurch[churches.onboarding]!,
      suspended: codeByChurch[churches.suspended]!,
      canceled: codeByChurch[churches.canceled]!,
      archived: codeByChurch[churches.archived]!,
    };
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("applies after the complete historical chain without rewriting QR data", async () => {
    const preflight = new PGlite();
    try {
      await installPlatform(preflight, migrations.length - 1);
      await preflight.exec(`
        insert into public.churches (
          id, name, legal_name, slug, status, default_currency, timezone,
          support_email, activated_at
        ) values (
          'f2300000-0000-4000-8000-000000000001', 'P17 Preflight',
          'P17 Preflight Inc.', 'p17-preflight', 'active', 'BBD',
          'America/Barbados', 'preflight-p17@example.test', now()
        );
      `);
      const before = await preflight.query<{ short_code: string }>(`
        select short_code from public.qr_links
        where church_id = 'f2300000-0000-4000-8000-000000000001';
      `);
      const absent = await preflight.query<{ resolver: string | null }>(`
        select to_regprocedure('public.resolve_public_qr(text)')::text resolver;
      `);
      expect(absent.rows[0]?.resolver).toBeNull();

      await preflight.exec(migrations.at(-1)!);
      const after = await preflight.query<{
        short_code: string;
        resolver: string | null;
        snapshot: string | null;
      }>(`
        select
          qr.short_code,
          to_regprocedure('public.resolve_public_qr(text)')::text resolver,
          to_regprocedure('public.get_church_qr_snapshot(uuid)')::text snapshot
        from public.qr_links qr
        where qr.church_id = 'f2300000-0000-4000-8000-000000000001';
      `);
      expect(after.rows[0]).toEqual({
        short_code: before.rows[0]?.short_code,
        resolver: "resolve_public_qr(text)",
        snapshot: "get_church_qr_snapshot(uuid)",
      });
    } finally {
      await preflight.close();
    }
  }, 60_000);

  it("installs exact RPC ACLs while preserving narrow service operations", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      has_function_privilege(
        'anon', 'public.resolve_public_qr(text)', 'EXECUTE'
      ) anon_resolve,
      has_function_privilege(
        'authenticated', 'public.resolve_public_qr(text)', 'EXECUTE'
      ) authenticated_resolve,
      has_function_privilege(
        'service_role', 'public.resolve_public_qr(text)', 'EXECUTE'
      ) service_resolve,
      has_function_privilege(
        'authenticated', 'public.get_church_qr_snapshot(uuid)', 'EXECUTE'
      ) authenticated_snapshot,
      has_function_privilege(
        'anon', 'public.get_church_qr_snapshot(uuid)', 'EXECUTE'
      ) anon_snapshot,
      has_table_privilege('authenticated', 'public.qr_links', 'SELECT')
        authenticated_direct,
      has_table_privilege('service_role', 'public.qr_links', 'SELECT')
        service_select,
      has_column_privilege(
        'service_role', 'public.qr_links', 'is_active', 'UPDATE'
      ) service_active_update,
      has_column_privilege(
        'service_role', 'public.qr_links', 'scan_count', 'UPDATE'
      ) service_scan_update,
      has_column_privilege(
        'service_role', 'public.qr_links', 'short_code', 'UPDATE'
      ) service_code_update,
      has_table_privilege('service_role', 'public.qr_links', 'INSERT')
        service_insert,
      has_table_privilege('service_role', 'public.qr_links', 'DELETE')
        service_delete;
    `);

    expect(result.rows[0]).toEqual({
      anon_resolve: true,
      authenticated_resolve: false,
      service_resolve: false,
      authenticated_snapshot: true,
      anon_snapshot: false,
      authenticated_direct: false,
      service_select: true,
      service_active_update: true,
      service_scan_update: true,
      service_code_update: false,
      service_insert: false,
      service_delete: false,
    });
  });

  it("returns only one canonical slug for one exact active code", async () => {
    const result = await asRole<{ church_slug: string }>(
      db,
      "anon",
      `select * from public.resolve_public_qr('${codes.active}');`,
    );
    expect(result.rows).toEqual([{ church_slug: "p17-active" }]);
    expect(Object.keys(result.rows[0] ?? {})).toEqual(["church_slug"]);
  });

  it("returns zero rows for every malformed or unknown input", async () => {
    const cases = [
      "null",
      "''",
      "'short'",
      `'a${"b".repeat(64)}'`,
      `'${codes.active.toUpperCase()}'`,
      "'-invalid-code'",
      "'invalid-code-'",
      `' ${codes.active}'`,
      "'missing-code-123'",
    ];
    for (const inputSql of cases) {
      const result = await asRole<{ church_slug: string }>(
        db,
        "anon",
        `select * from public.resolve_public_qr(${inputSql});`,
      );
      expect(result.rows).toEqual([]);
    }
  });

  it("makes every unavailable lifecycle indistinguishable from unknown", async () => {
    for (const code of [
      codes.other,
      codes.onboarding,
      codes.suspended,
      codes.canceled,
      codes.archived,
    ]) {
      const result = await asRole<{ church_slug: string }>(
        db,
        "anon",
        `select * from public.resolve_public_qr('${code}');`,
      );
      expect(result.rows).toEqual([]);
    }
  });

  it("does not mutate QR analytics or tenant records during resolution", async () => {
    for (let count = 0; count < 3; count += 1) {
      await asRole(
        db,
        "anon",
        `select * from public.resolve_public_qr('${codes.active}');`,
      );
    }
    const result = await db.query<Record<string, unknown>>(`select
      scan_count,
      last_scanned_at,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.active}') audit_count
      from public.qr_links
      where church_id = '${churches.active}';
    `);
    expect(result.rows[0]).toEqual({
      scan_count: 0,
      last_scanned_at: null,
      audit_count: 0,
    });
  });

  it("returns the exact active-workspace snapshot to owner and staff", async () => {
    for (const userId of [users.owner, users.staff]) {
      const result = await asAuthenticated<QrSnapshot>(
        db,
        userId,
        `select * from public.get_church_qr_snapshot('${churches.active}');`,
      );
      expect(result.rows).toEqual([
        {
          church_id: churches.active,
          church_slug: "p17-active",
          short_code: codes.active,
          is_active: true,
        },
      ]);
      expect(Object.keys(result.rows[0] ?? {}).sort()).toEqual([
        "church_id",
        "church_slug",
        "is_active",
        "short_code",
      ]);
    }
  });

  it("returns inactive availability to its authorized church without hiding the row", async () => {
    const result = await asAuthenticated<QrSnapshot>(
      db,
      users.otherOwner,
      `select * from public.get_church_qr_snapshot('${churches.other}');`,
    );
    expect(result.rows).toEqual([
      {
        church_id: churches.other,
        church_slug: "p17-other",
        short_code: codes.other,
        is_active: false,
      },
    ]);
  });

  it("supports an authorized onboarding workspace without making it public", async () => {
    const snapshot = await asAuthenticated<QrSnapshot>(
      db,
      users.onboardingOwner,
      `select * from public.get_church_qr_snapshot('${churches.onboarding}');`,
    );
    const publicResult = await asRole<{ church_slug: string }>(
      db,
      "anon",
      `select * from public.resolve_public_qr('${codes.onboarding}');`,
    );
    expect(snapshot.rows).toEqual([
      {
        church_id: churches.onboarding,
        church_slug: "p17-onboarding",
        short_code: codes.onboarding,
        is_active: true,
      },
    ]);
    expect(publicResult.rows).toEqual([]);
  });

  it("uses one neutral error for cross-tenant and nonexistent targets", async () => {
    for (const target of [
      churches.other,
      "f2200000-0000-4000-8000-000000000099",
    ]) {
      await expect(
        asAuthenticated(
          db,
          users.owner,
          `select * from public.get_church_qr_snapshot('${target}');`,
        ),
      ).rejects.toThrow(/QR_SNAPSHOT_FORBIDDEN/);
    }
  });

  it.each([
    ["inactive profile", users.inactiveOwner, churches.active],
    ["revoked membership", users.revokedOwner, churches.active],
    ["suspended church", users.suspendedOwner, churches.suspended],
  ])("fails closed for %s", async (_label, userId, churchId) => {
    await expect(
      asAuthenticated(
        db,
        userId,
        `select * from public.get_church_qr_snapshot('${churchId}');`,
      ),
    ).rejects.toThrow(/QR_SNAPSHOT_FORBIDDEN/);
  });

  it("denies all direct browser QR reads and session-bearing resolver calls", async () => {
    await expect(
      asAuthenticated(
        db,
        users.owner,
        "select short_code from public.qr_links limit 1;",
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(
        db,
        "anon",
        "select short_code from public.qr_links limit 1;",
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole(
        db,
        "authenticated",
        `select * from public.resolve_public_qr('${codes.active}');`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps the printed code stable while following a current church slug", async () => {
    await db.exec(`update public.churches set slug = 'p17-renamed'
      where id = '${churches.active}';`);
    const resolved = await asRole<{ church_slug: string }>(
      db,
      "anon",
      `select * from public.resolve_public_qr('${codes.active}');`,
    );
    const stored = await db.query<{ short_code: string }>(`
      select short_code from public.qr_links
      where church_id = '${churches.active}';
    `);
    expect(resolved.rows).toEqual([{ church_slug: "p17-renamed" }]);
    expect(stored.rows).toEqual([{ short_code: codes.active }]);
  });

  it("retains the one immutable code per church invariants", async () => {
    await expect(
      db.exec(`insert into public.qr_links (church_id, kind)
        values ('${churches.active}', 'church');`),
    ).rejects.toThrow(/qr_links_one_church_code_idx/);
    await expect(
      db.exec(`update public.qr_links set short_code = 'changed-code-123'
        where church_id = '${churches.active}';`),
    ).rejects.toThrow(/permanent QR routing fields cannot be changed/);
  });
});
