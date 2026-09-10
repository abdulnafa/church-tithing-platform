import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "71000000-0000-4000-8000-000000000001",
  finance: "71000000-0000-4000-8000-000000000002",
  staff: "71000000-0000-4000-8000-000000000003",
  otherOwner: "71000000-0000-4000-8000-000000000004",
  inactiveOwner: "71000000-0000-4000-8000-000000000005",
  revokedOwner: "71000000-0000-4000-8000-000000000006",
  onboardingOwner: "71000000-0000-4000-8000-000000000007",
  suspendedOwner: "71000000-0000-4000-8000-000000000008",
} as const;

const churches = {
  primary: "72000000-0000-4000-8000-000000000001",
  other: "72000000-0000-4000-8000-000000000002",
  onboarding: "72000000-0000-4000-8000-000000000003",
  suspended: "72000000-0000-4000-8000-000000000004",
} as const;

const donors = {
  primary: "73000000-0000-4000-8000-000000000001",
  other: "73000000-0000-4000-8000-000000000002",
} as const;

const donations = {
  primary: "74000000-0000-4000-8000-000000000001",
  other: "74000000-0000-4000-8000-000000000002",
} as const;

const prayers = {
  pendingOld: "75000000-0000-4000-8000-000000000001",
  pendingNew: "75000000-0000-4000-8000-000000000002",
  reviewedOld: "75000000-0000-4000-8000-000000000003",
  reviewedNew: "75000000-0000-4000-8000-000000000004",
  other: "75000000-0000-4000-8000-000000000005",
  linked: "75000000-0000-4000-8000-000000000006",
  lateFailure: "75000000-0000-4000-8000-000000000007",
  onboarding: "75000000-0000-4000-8000-000000000008",
  suspended: "75000000-0000-4000-8000-000000000009",
} as const;

const reviewRequests = {
  success: "76000000-0000-4000-8000-000000000001",
  conflict: "76000000-0000-4000-8000-000000000002",
  already: "76000000-0000-4000-8000-000000000003",
  stale: "76000000-0000-4000-8000-000000000004",
  otherTenant: "76000000-0000-4000-8000-000000000005",
  lateFailure: "76000000-0000-4000-8000-000000000006",
  onboarding: "76000000-0000-4000-8000-000000000007",
} as const;

const consentVersion = "p16-test-v1";
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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type QueueRecord = {
  prayer_request_id: string;
  body: string;
  is_reviewed: boolean;
  consented_at: Date;
  created_at: Date;
  reviewed_at: Date | null;
  updated_at: Date;
  revision: number;
};

type ReviewResult = {
  prayer_request_id: string;
  reviewed_at: Date;
  revision: number;
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

async function asAuthenticated<T extends Record<string, unknown>>(
  target: PGlite,
  userId: string,
  sql: string,
  commit = false,
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
    await target.exec(commit ? "commit;" : "rollback;");
    return result;
  } catch (error) {
    await target.exec("rollback;");
    throw error;
  }
}

async function asRole(target: PGlite, role: "anon" | "service_role", sql: string) {
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

function reviewSql(input: {
  churchId?: string;
  prayerId?: string | null;
  requestId?: string;
  revision?: number | null;
}) {
  return `select * from public.review_prayer_request(
    target_church_id => '${input.churchId ?? churches.primary}'::uuid,
    target_prayer_request_id => ${
      input.prayerId === null
        ? "null"
        : `'${input.prayerId ?? prayers.pendingNew}'`
    }::uuid,
    review_request_id => '${input.requestId ?? reviewRequests.success}'::uuid,
    expected_revision => ${input.revision ?? 0}::bigint
  );`;
}

const db = new PGlite();

describe("P16 prayer-request privacy behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p16@example.test', now(),
          '{"display_name":"P16 Owner"}'),
        ('${users.finance}', 'finance-p16@example.test', now(),
          '{"display_name":"P16 Finance"}'),
        ('${users.staff}', 'staff-p16@example.test', now(),
          '{"display_name":"P16 Staff"}'),
        ('${users.otherOwner}', 'other-owner-p16@example.test', now(),
          '{"display_name":"P16 Other Owner"}'),
        ('${users.inactiveOwner}', 'inactive-owner-p16@example.test', now(),
          '{"display_name":"P16 Inactive Owner"}'),
        ('${users.revokedOwner}', 'revoked-owner-p16@example.test', now(),
          '{"display_name":"P16 Revoked Owner"}'),
        ('${users.onboardingOwner}', 'onboarding-owner-p16@example.test', now(),
          '{"display_name":"P16 Onboarding Owner"}'),
        ('${users.suspendedOwner}', 'suspended-owner-p16@example.test', now(),
          '{"display_name":"P16 Suspended Owner"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at, suspended_at
      ) values
        ('${churches.primary}', 'P16 Primary', 'P16 Primary Inc.',
          'p16-primary', 'active', 'BBD', 'America/Barbados',
          'primary-p16@example.test', now(), null),
        ('${churches.other}', 'P16 Other', 'P16 Other Inc.',
          'p16-other', 'active', 'BBD', 'America/Barbados',
          'other-p16@example.test', now(), null),
        ('${churches.onboarding}', 'P16 Onboarding', 'P16 Onboarding Inc.',
          'p16-onboarding', 'onboarding', 'BBD', 'America/Barbados',
          'onboarding-p16@example.test', null, null),
        ('${churches.suspended}', 'P16 Suspended', 'P16 Suspended Inc.',
          'p16-suspended', 'suspended', 'BBD', 'America/Barbados',
          'suspended-p16@example.test', now(), now());

      insert into public.church_memberships (church_id, user_id, role, status)
      values
        ('${churches.primary}', '${users.owner}', 'owner', 'active'),
        ('${churches.primary}', '${users.finance}', 'finance_admin', 'active'),
        ('${churches.primary}', '${users.staff}', 'staff', 'active'),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active'),
        ('${churches.primary}', '${users.inactiveOwner}', 'owner', 'active'),
        ('${churches.primary}', '${users.revokedOwner}', 'owner', 'revoked'),
        ('${churches.onboarding}', '${users.onboardingOwner}', 'owner', 'active'),
        ('${churches.suspended}', '${users.suspendedOwner}', 'owner', 'active');

      insert into public.donors (
        id, church_id, display_name, email, is_anonymous
      ) values
        ('${donors.primary}', '${churches.primary}', 'P16 Donor',
          'donor-p16@example.test', false),
        ('${donors.other}', '${churches.other}', 'P16 Other Donor',
          'other-donor-p16@example.test', false);

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status, amount_minor,
        currency, donor_display_name, donor_email, donated_at
      ) values
        ('${donations.primary}', '${churches.primary}', '${donors.primary}',
          (select id from public.funds
            where church_id='${churches.primary}' and is_default),
          'cash', 'succeeded', 5000, 'BBD', 'P16 Donor',
          'donor-p16@example.test', '2026-01-01T00:00:00Z'),
        ('${donations.other}', '${churches.other}', '${donors.other}',
          (select id from public.funds
            where church_id='${churches.other}' and is_default),
          'cash', 'succeeded', 6000, 'BBD', 'P16 Other Donor',
          'other-donor-p16@example.test', '2026-01-01T00:00:00Z');

      insert into public.prayer_request_consent_versions (
        version_id, wording_sha256, approved_at
      ) values ('${consentVersion}', repeat('a', 64), now());

      insert into public.prayer_requests (
        id, church_id, donation_id, donor_id, body, consented_at,
        consent_version_id, created_at, updated_at,
        reviewed_at, reviewed_by, revision
      ) values
        ('${prayers.pendingOld}', '${churches.primary}', null, null,
          'Oldest pending prayer', '2026-01-01T00:00:00Z',
          '${consentVersion}', '2026-01-01T00:00:00Z',
          '2026-01-01T00:00:00Z', null, null, 0),
        ('${prayers.pendingNew}', '${churches.primary}', null, null,
          'Newer pending prayer', '2026-01-02T00:00:00Z',
          '${consentVersion}', '2026-01-02T00:00:00Z',
          '2026-01-02T00:00:00Z', null, null, 0),
        ('${prayers.reviewedOld}', '${churches.primary}', null, null,
          'Previously reviewed prayer', '2026-01-03T00:00:00Z',
          '${consentVersion}', '2026-01-03T00:00:00Z',
          '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z',
          '${users.owner}', 1),
        ('${prayers.reviewedNew}', '${churches.primary}', null, null,
          'Most recently reviewed prayer', '2026-01-03T00:00:00Z',
          '${consentVersion}', '2026-01-03T00:00:00Z',
          '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z',
          '${users.owner}', 1),
        ('${prayers.other}', '${churches.other}', null, null,
          'Other tenant prayer', '2026-01-01T00:00:00Z',
          '${consentVersion}', '2026-01-01T00:00:00Z',
          '2026-01-01T00:00:00Z', null, null, 0),
        ('${prayers.linked}', '${churches.primary}', '${donations.primary}',
          '${donors.primary}', 'Legacy linked prayer',
          '2026-01-06T00:00:00Z', '${consentVersion}',
          '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z', null, null, 0),
        ('${prayers.lateFailure}', '${churches.primary}', null, null,
          'Late failure prayer', '2026-01-07T00:00:00Z',
          '${consentVersion}', '2026-01-07T00:00:00Z',
          '2026-01-07T00:00:00Z', null, null, 0),
        ('${prayers.onboarding}', '${churches.onboarding}', null, null,
          'Onboarding prayer', '2026-01-01T00:00:00Z',
          '${consentVersion}', '2026-01-01T00:00:00Z',
          '2026-01-01T00:00:00Z', null, null, 0),
        ('${prayers.suspended}', '${churches.suspended}', null, null,
          'Suspended prayer', '2026-01-01T00:00:00Z',
          '${consentVersion}', '2026-01-01T00:00:00Z',
          '2026-01-01T00:00:00Z', null, null, 0);
    `);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("installs forced RLS, exact fields, restrictive FKs, and the queue index", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select is_nullable from information_schema.columns
        where table_schema='public' and table_name='prayer_requests'
          and column_name='donation_id') donation_nullable,
      (select is_nullable from information_schema.columns
        where table_schema='public' and table_name='prayer_requests'
          and column_name='consent_version_id') consent_nullable,
      (select column_default from information_schema.columns
        where table_schema='public' and table_name='prayer_requests'
          and column_name='revision') revision_default,
      (select relrowsecurity from pg_class
        where oid='public.prayer_requests'::regclass) prayer_rls,
      (select relforcerowsecurity from pg_class
        where oid='public.prayer_requests'::regclass) prayer_forced,
      (select relforcerowsecurity from pg_class
        where oid='public.prayer_request_consent_versions'::regclass) consent_forced,
      (select relforcerowsecurity from pg_class
        where oid='public.prayer_request_review_requests'::regclass) ledger_forced,
      (select confdeltype::text from pg_constraint
        where conname='prayer_requests_church_id_fkey') church_delete,
      (select confdeltype::text from pg_constraint
        where conname='prayer_requests_reviewed_by_fkey') reviewer_delete,
      (select count(*)::integer from pg_indexes
        where schemaname='public' and indexname='prayer_requests_queue_idx') queue_index;`);
    expect(result.rows[0]).toEqual({
      donation_nullable: "YES",
      consent_nullable: "NO",
      revision_default: "0",
      prayer_rls: true,
      prayer_forced: true,
      consent_forced: true,
      ledger_forced: true,
      church_delete: "r",
      reviewer_delete: "r",
      queue_index: 1,
    });
  });

  it("normalizes only CR and ASCII edge whitespace", async () => {
    const result = await db.query<{
      canonical: string;
      nbsp: string;
      safe: boolean;
      tab_lf: boolean;
      c0: boolean;
      c1: boolean;
      bidi: boolean;
    }>(`select
      public.canonicalize_prayer_request_body(
        E' \tLine one\r\nLine two\r \n'
      ) canonical,
      public.canonicalize_prayer_request_body(
        chr(160) || 'Prayer' || chr(160)
      ) nbsp,
      public.prayer_request_body_has_unsafe_formatting(E'Line\tA\nLine B') safe,
      public.prayer_request_body_has_unsafe_formatting(E'\t\n') tab_lf,
      public.prayer_request_body_has_unsafe_formatting('A' || chr(11) || 'B') c0,
      public.prayer_request_body_has_unsafe_formatting('A' || chr(133) || 'B') c1,
      public.prayer_request_body_has_unsafe_formatting('A' || chr(8238) || 'B') bidi;`);
    expect(result.rows[0]).toEqual({
      canonical: "Line one\nLine two",
      nbsp: "\u00a0Prayer\u00a0",
      safe: false,
      tab_lf: false,
      c0: true,
      c1: true,
      bidi: true,
    });
  });

  it("enforces 2,000 Unicode code points and canonical storage", async () => {
    await expect(
      db.exec(`begin; insert into public.prayer_requests (
        church_id, body, consented_at, consent_version_id
      ) values (
        '${churches.primary}', repeat('🙏', 2000), now(), '${consentVersion}'
      ); rollback;`),
    ).resolves.toBeDefined();

    for (const bodyExpression of [
      "repeat('🙏', 2001)",
      "E'  not canonical  '",
      "E'only whitespace \\t\\n'",
      "'unsafe' || chr(1564)",
    ]) {
      await expect(
        db.exec(`insert into public.prayer_requests (
          church_id, body, consented_at, consent_version_id
        ) values (
          '${churches.primary}', ${bodyExpression}, now(), '${consentVersion}'
        );`),
      ).rejects.toThrow(/prayer_requests_body|check constraint/i);
    }
  });

  it("requires catalogued immutable consent evidence", async () => {
    await expect(
      db.exec(`insert into public.prayer_requests (
        church_id, body, consented_at, consent_version_id
      ) values (
        '${churches.primary}', 'Unknown consent', now(), 'unknown-v1'
      );`),
    ).rejects.toThrow(/prayer_requests_consent_version_fkey|foreign key/i);
    await expect(
      db.exec(`update public.prayer_request_consent_versions
        set wording_sha256=repeat('b',64)
        where version_id='${consentVersion}';`),
    ).rejects.toThrow(/PRAYER_CONSENT_VERSION_IMMUTABLE/);
    await expect(
      db.exec(`delete from public.prayer_request_consent_versions
        where version_id='${consentVersion}';`),
    ).rejects.toThrow(/PRAYER_CONSENT_VERSION_IMMUTABLE/);
  });

  it("allows independent and same-tenant linked rows but rejects unsafe linkage", async () => {
    await expect(
      db.exec(`begin;
        insert into public.prayer_requests (
          church_id, body, consented_at, consent_version_id
        ) values
          ('${churches.primary}', 'Independent one', now(), '${consentVersion}'),
          ('${churches.primary}', 'Independent two', now(), '${consentVersion}');
        insert into public.prayer_requests (
          church_id, donation_id, donor_id, body, consented_at,
          consent_version_id
        ) values (
          '${churches.other}', '${donations.other}', '${donors.other}',
          'Same tenant linked', now(), '${consentVersion}'
        );
        rollback;`),
    ).resolves.toBeDefined();

    await expect(
      db.exec(`insert into public.prayer_requests (
        church_id, donor_id, body, consented_at, consent_version_id
      ) values (
        '${churches.primary}', '${donors.primary}', 'Donor only', now(),
        '${consentVersion}'
      );`),
    ).rejects.toThrow(/prayer_requests_donor_requires_donation|check constraint/i);

    await expect(
      db.exec(`insert into public.prayer_requests (
        church_id, donation_id, donor_id, body, consented_at,
        consent_version_id
      ) values (
        '${churches.primary}', '${donations.other}', '${donors.other}',
        'Cross tenant', now(), '${consentVersion}'
      );`),
    ).rejects.toThrow(/foreign key/i);

    await expect(
      db.exec(`insert into public.prayer_requests (
        church_id, donation_id, donor_id, body, consented_at,
        consent_version_id
      ) values (
        '${churches.primary}', '${donations.primary}', '${donors.primary}',
        'Duplicate donation link', now(), '${consentVersion}'
      );`),
    ).rejects.toThrow(/prayer_requests_one_per_donation|unique/i);
  });

  it("removes every direct application table and column privilege", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      has_table_privilege('anon', 'public.prayer_requests', 'SELECT') anon_read,
      has_table_privilege('authenticated', 'public.prayer_requests', 'SELECT') auth_read,
      has_table_privilege('service_role', 'public.prayer_requests', 'SELECT') service_read,
      has_table_privilege('authenticated', 'public.prayer_requests', 'UPDATE') auth_update,
      has_table_privilege('service_role', 'public.prayer_requests', 'DELETE') service_delete,
      (select count(*)::integer from information_schema.column_privileges
        where table_schema='public' and table_name='prayer_requests'
          and grantee in ('anon','authenticated','service_role')) column_grants;`);
    expect(result.rows[0]).toEqual({
      anon_read: false,
      auth_read: false,
      service_read: false,
      auth_update: false,
      service_delete: false,
      column_grants: 0,
    });

    for (const role of ["anon", "service_role"] as const) {
      await expect(
        asRole(db, role, "select body from public.prayer_requests;"),
      ).rejects.toThrow(/permission denied/i);
    }
    await expect(
      asAuthenticated(db, users.owner, "select body from public.prayer_requests;"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("exposes only authenticated RPC execution and minimum queue columns", async () => {
    const privileges = await db.query<Record<string, unknown>>(`select
      has_function_privilege('authenticated',
        'public.get_prayer_request_queue(uuid)', 'EXECUTE') auth_queue,
      has_function_privilege('anon',
        'public.get_prayer_request_queue(uuid)', 'EXECUTE') anon_queue,
      has_function_privilege('service_role',
        'public.get_prayer_request_queue(uuid)', 'EXECUTE') service_queue,
      has_function_privilege('authenticated',
        'public.review_prayer_request(uuid,uuid,uuid,bigint)', 'EXECUTE') auth_review,
      has_function_privilege('service_role',
        'public.review_prayer_request(uuid,uuid,uuid,bigint)', 'EXECUTE') service_review;`);
    expect(privileges.rows[0]).toEqual({
      auth_queue: true,
      anon_queue: false,
      service_queue: false,
      auth_review: true,
      service_review: false,
    });

    const result = await asAuthenticated<QueueRecord>(
      db,
      users.owner,
      `select * from public.get_prayer_request_queue('${churches.primary}');`,
    );
    expect(Object.keys(result.rows[0] ?? {})).toEqual([
      "prayer_request_id",
      "body",
      "is_reviewed",
      "consented_at",
      "created_at",
      "reviewed_at",
      "updated_at",
      "revision",
    ]);
    expect(JSON.stringify(result.rows)).not.toContain(donations.primary);
    expect(JSON.stringify(result.rows)).not.toContain(donors.primary);
  });

  it("orders unreviewed oldest-first and reviewed newest-first", async () => {
    const result = await asAuthenticated<QueueRecord>(
      db,
      users.owner,
      `select * from public.get_prayer_request_queue('${churches.primary}');`,
    );
    expect(result.rows.map((row) => row.prayer_request_id)).toEqual([
      prayers.pendingOld,
      prayers.pendingNew,
      prayers.linked,
      prayers.lateFailure,
      prayers.reviewedNew,
      prayers.reviewedOld,
    ]);
  });

  it("caps the anti-starvation queue at 100 rows", async () => {
    await db.exec("begin;");
    try {
      await db.exec(`insert into public.prayer_requests (
        church_id, body, consented_at, consent_version_id, created_at, updated_at
      )
      select '${churches.primary}', 'Generated pending ' || value::text,
        '2026-02-01T00:00:00Z'::timestamptz,
        '${consentVersion}',
        '2026-02-01T00:00:00Z'::timestamptz + value * interval '1 minute',
        '2026-02-01T00:00:00Z'::timestamptz + value * interval '1 minute'
      from generate_series(1, 101) value;`);
      await db.exec(`
        select set_config('request.jwt.claim.sub', '${users.owner}', true);
        set local role authenticated;
      `);
      const result = await db.query<QueueRecord>(
        `select * from public.get_prayer_request_queue('${churches.primary}');`,
      );
      expect(result.rows).toHaveLength(100);
      expect(result.rows[0]?.prayer_request_id).toBe(prayers.pendingOld);
    } finally {
      await db.exec("rollback;");
    }
  });

  it("raises stable forbidden errors for every unauthorized queue caller", async () => {
    for (const userId of [
      users.finance,
      users.staff,
      users.inactiveOwner,
      users.revokedOwner,
      users.suspendedOwner,
    ]) {
      await expect(
        asAuthenticated(
          db,
          userId,
          `select * from public.get_prayer_request_queue('${
            userId === users.suspendedOwner ? churches.suspended : churches.primary
          }');`,
        ),
      ).rejects.toThrow(/PRAYER_QUEUE_FORBIDDEN/);
    }
  });

  it("permits the current owner-only onboarding workspace contract", async () => {
    const queue = await asAuthenticated<QueueRecord>(
      db,
      users.onboardingOwner,
      `select * from public.get_prayer_request_queue('${churches.onboarding}');`,
    );
    expect(queue.rows.map((row) => row.prayer_request_id)).toEqual([
      prayers.onboarding,
    ]);
  });

  it("reviews once with CAS and writes only a body-free audit and ledger", async () => {
    const result = await asAuthenticated<ReviewResult>(
      db,
      users.owner,
      reviewSql({}),
      true,
    );
    expect(result.rows[0]).toMatchObject({
      prayer_request_id: prayers.pendingNew,
      revision: 1,
      replayed: false,
    });

    const state = await db.query<Record<string, unknown>>(`select
      (select reviewed_at <= updated_at from public.prayer_requests
        where id='${prayers.pendingNew}') time_safe,
      (select reviewed_by::text from public.prayer_requests
        where id='${prayers.pendingNew}') reviewed_by,
      (select revision from public.prayer_requests
        where id='${prayers.pendingNew}') revision,
      (select sanitized_changes from public.audit_logs
        where action_code='prayer_request_reviewed'
          and entity_id='${prayers.pendingNew}') audit_changes,
      (select count(*)::integer from public.prayer_request_review_requests
        where prayer_request_id='${prayers.pendingNew}') ledger_rows;`);
    expect(state.rows[0]).toMatchObject({
      time_safe: true,
      reviewed_by: users.owner,
      revision: 1,
      audit_changes: {
        prayer_request_id: prayers.pendingNew,
        reviewed: true,
      },
      ledger_rows: 1,
    });
    expect(JSON.stringify(state.rows[0]?.audit_changes)).not.toContain(
      "Newer pending prayer",
    );
    expect(JSON.stringify(state.rows[0]?.audit_changes)).not.toContain(
      donations.primary,
    );
  });

  it("replays the exact review only after current authorization succeeds", async () => {
    const replay = await asAuthenticated<ReviewResult>(
      db,
      users.owner,
      reviewSql({}),
    );
    expect(replay.rows[0]).toMatchObject({
      prayer_request_id: prayers.pendingNew,
      revision: 1,
      replayed: true,
    });

    await db.exec("begin;");
    try {
      await db.exec(`update public.church_memberships set status='revoked'
        where church_id='${churches.primary}' and user_id='${users.owner}';`);
      await db.exec(`
        select set_config('request.jwt.claim.sub', '${users.owner}', true);
        set local role authenticated;
      `);
      await expect(db.query(reviewSql({}))).rejects.toThrow(
        /PRAYER_REVIEW_FORBIDDEN/,
      );
    } finally {
      await db.exec("rollback;");
    }
  });

  it("returns stable idempotency, revision, already-reviewed, and not-found errors", async () => {
    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({ prayerId: prayers.pendingOld }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_IDEMPOTENCY_CONFLICT/);

    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({
          prayerId: prayers.pendingOld,
          requestId: reviewRequests.stale,
          revision: 1,
        }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_REVISION_CONFLICT/);

    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({
          prayerId: prayers.reviewedOld,
          requestId: reviewRequests.already,
          revision: 1,
        }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_ALREADY_REVIEWED/);

    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({
          prayerId: prayers.other,
          requestId: reviewRequests.otherTenant,
        }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_NOT_FOUND/);
  });

  it("validates request UUIDs/revisions and denies non-owner review", async () => {
    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({ requestId: "76000000-0000-3000-8000-000000000001" }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_INVALID_REQUEST_ID/);
    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({ requestId: reviewRequests.conflict, revision: -1 }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_INVALID_EXPECTED_REVISION/);
    await expect(
      asAuthenticated(
        db,
        users.owner,
        reviewSql({
          prayerId: null,
          requestId: reviewRequests.conflict,
        }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_NOT_FOUND/);
    await expect(
      asAuthenticated(
        db,
        users.finance,
        reviewSql({ requestId: reviewRequests.conflict }),
      ),
    ).rejects.toThrow(/PRAYER_REVIEW_FORBIDDEN/);
  });

  it("prevents body, linkage, consent, retention, tombstone, and reviewed-state rewrites", async () => {
    for (const update of [
      "body='Changed body'",
      `donation_id='${donations.primary}', donor_id='${donors.primary}'`,
      "consent_version_id='p16-other-v1'",
      "retention_policy_status='approved'",
      "deleted_at=now()",
    ]) {
      await expect(
        db.exec(`update public.prayer_requests set ${update}
          where id='${prayers.pendingOld}';`),
      ).rejects.toThrow(/PRAYER_REQUEST_PRIVATE_FIELDS_IMMUTABLE|check constraint/);
    }
    await expect(
      db.exec(`update public.prayer_requests set reviewed_at=now(),
        reviewed_by='${users.owner}', revision=1
        where id='${prayers.reviewedOld}';`),
    ).rejects.toThrow(/PRAYER_REQUEST_REVIEW_TRANSITION_INVALID/);
  });

  it("rolls back the prayer, audit, and ledger after a forced late failure", async () => {
    await db.exec(`
      create function public.fail_p16_review_ledger_insert()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        raise exception 'P16_FORCED_LATE_FAILURE';
      end;
      $$;
      create trigger p16_force_late_failure
        before insert on public.prayer_request_review_requests
        for each row execute function public.fail_p16_review_ledger_insert();
    `);
    try {
      await expect(
        asAuthenticated(
          db,
          users.owner,
          reviewSql({
            prayerId: prayers.lateFailure,
            requestId: reviewRequests.lateFailure,
          }),
          true,
        ),
      ).rejects.toThrow(/P16_FORCED_LATE_FAILURE/);
    } finally {
      await db.exec(`
        drop trigger p16_force_late_failure
          on public.prayer_request_review_requests;
        drop function public.fail_p16_review_ledger_insert();
      `);
    }

    const state = await db.query<Record<string, unknown>>(`select
      (select revision from public.prayer_requests
        where id='${prayers.lateFailure}') revision,
      (select reviewed_at is null from public.prayer_requests
        where id='${prayers.lateFailure}') unreviewed,
      (select count(*)::integer from public.audit_logs
        where entity_id='${prayers.lateFailure}') audits,
      (select count(*)::integer from public.prayer_request_review_requests
        where prayer_request_id='${prayers.lateFailure}') ledger_rows;`);
    expect(state.rows[0]).toEqual({
      revision: 0,
      unreviewed: true,
      audits: 0,
      ledger_rows: 0,
    });
  });

  it("blocks direct deletion, ledger mutation, and church cascade deletion", async () => {
    await expect(
      asAuthenticated(
        db,
        users.owner,
        `delete from public.prayer_requests where id='${prayers.pendingOld}';`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.prayer_request_review_requests
        set payload_sha256=repeat('f',64)
        where prayer_request_id='${prayers.pendingNew}';`),
    ).rejects.toThrow(/PRAYER_REVIEW_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec(`delete from public.churches where id='${churches.primary}';`),
    ).rejects.toThrow(/prayer_requests_church_id_fkey|foreign key/i);
  });

  it("aborts migration atomically when legacy prayer consent cannot be proven", async () => {
    const legacy = new PGlite();
    try {
      await installPlatform(legacy, migrations.length - 1);
      await legacy.exec(`
        insert into auth.users (id, email, email_confirmed_at)
        values ('79000000-0000-4000-8000-000000000001',
          'legacy-p16@example.test', now());
        insert into public.churches (
          id, name, legal_name, slug, status, default_currency, timezone,
          support_email, activated_at
        ) values (
          '79000000-0000-4000-8000-000000000002', 'Legacy P16',
          'Legacy P16 Inc.', 'legacy-p16', 'active', 'BBD',
          'America/Barbados', 'legacy-p16@example.test', now()
        );
        insert into public.donations (
          id, church_id, fund_id, source, status, amount_minor, currency,
          donated_at
        ) values (
          '79000000-0000-4000-8000-000000000003',
          '79000000-0000-4000-8000-000000000002',
          (select id from public.funds
            where church_id='79000000-0000-4000-8000-000000000002'
              and is_default),
          'cash', 'succeeded', 100, 'BBD', now()
        );
        insert into public.prayer_requests (
          church_id, donation_id, body, consented_at
        ) values (
          '79000000-0000-4000-8000-000000000002',
          '79000000-0000-4000-8000-000000000003',
          'Unversioned legacy prayer', now()
        );
      `);
      await expect(legacy.exec(migrations.at(-1)!)).rejects.toThrow(
        /P16_EXISTING_PRAYER_CONSENT_VERSION_REQUIRED/,
      );
      await legacy.exec("rollback;");
      const state = await legacy.query<Record<string, unknown>>(`select
        to_regclass('public.prayer_request_consent_versions') is null catalog_absent,
        (select count(*)::integer from public.prayer_requests) legacy_rows;`);
      expect(state.rows[0]).toEqual({ catalog_absent: true, legacy_rows: 1 });
    } finally {
      await legacy.close();
    }
  }, 60_000);
});
