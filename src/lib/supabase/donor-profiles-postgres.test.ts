import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  member: "31000000-0000-4000-8000-000000001001",
  other: "31000000-0000-4000-8000-000000001002",
  unverified: "31000000-0000-4000-8000-000000001003",
  inactive: "31000000-0000-4000-8000-000000001004",
  invalidEmail: "31000000-0000-4000-8000-000000001005",
  staff: "31000000-0000-4000-8000-000000001006",
  suspendedMember: "31000000-0000-4000-8000-000000001007",
  dualRole: "31000000-0000-4000-8000-000000001008",
} as const;

const churches = {
  primary: "32000000-0000-4000-8000-000000001001",
  other: "32000000-0000-4000-8000-000000001002",
  suspended: "32000000-0000-4000-8000-000000001003",
} as const;

const donors = {
  guest: "33000000-0000-4000-8000-000000001001",
  otherMember: "33000000-0000-4000-8000-000000001002",
  unverifiedMember: "33000000-0000-4000-8000-000000001003",
  invalidEmailMember: "33000000-0000-4000-8000-000000001004",
  suspendedMember: "33000000-0000-4000-8000-000000001005",
  dualRole: "33000000-0000-4000-8000-000000001006",
} as const;

const requests = {
  create: "34000000-0000-4000-8000-000000001001",
  update: "34000000-0000-4000-8000-000000001002",
  lateFailure: "34000000-0000-4000-8000-000000001003",
  otherCreate: "34000000-0000-4000-8000-000000001004",
  invalid: "34000000-0000-4000-8000-000000001005",
} as const;

const guestDonation = "35000000-0000-4000-8000-000000001001";
const memberDonation = "35000000-0000-4000-8000-000000001005";

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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type MutationResult = {
  church_id: string;
  donor_id: string;
  profile_revision: number;
  operation: "created" | "updated";
  replayed: boolean;
};

function sqlLiteral(value: string | null) {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function mutationSql(input: {
  churchId: string;
  requestId: string | null;
  revision: number | null;
  displayName: string | null;
}) {
  return `select * from public.mutate_my_donor_profile(
    target_church_id => '${input.churchId}'::uuid,
    profile_request_id => ${sqlLiteral(input.requestId)}::uuid,
    expected_profile_revision => ${input.revision ?? "null"}::bigint,
    profile_display_name => ${sqlLiteral(input.displayName)}
  );`;
}

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

const db = new PGlite();

describe("P15 donor profile behavior in PostgreSQL", () => {
  let memberDonorId = "";

  beforeAll(async () => {
    await installPlatform(db);
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.member}', 'member-p15@example.test', now(),
          '{"display_name":"P15 Member"}'),
        ('${users.other}', 'other-p15@example.test', now(),
          '{"display_name":"P15 Other"}'),
        ('${users.unverified}', 'unverified-p15@example.test', null,
          '{"display_name":"P15 Unverified"}'),
        ('${users.inactive}', 'inactive-p15@example.test', now(),
          '{"display_name":"P15 Inactive"}'),
        ('${users.invalidEmail}', 'invalid-email', now(),
          '{"display_name":"P15 Invalid"}'),
        ('${users.staff}', 'staff-p15@example.test', now(),
          '{"display_name":"P15 Staff"}'),
        ('${users.suspendedMember}', 'suspended-member-p15@example.test', now(),
          '{"display_name":"P15 Suspended Member"}'),
        ('${users.dualRole}', 'dual-role-p15@example.test', null,
          '{"display_name":"P15 Dual Role"}');

      update public.profiles set is_active = false
      where id = '${users.inactive}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at, suspended_at
      ) values
        ('${churches.primary}', 'P15 Primary', 'P15 Primary Inc.',
          'p15-primary', 'active', 'BBD', 'America/Barbados',
          'primary-p15@example.test', now(), null),
        ('${churches.other}', 'P15 Other', 'P15 Other Inc.',
          'p15-other', 'active', 'BBD', 'America/Barbados',
          'other-p15@example.test', now(), null),
        ('${churches.suspended}', 'P15 Suspended', 'P15 Suspended Inc.',
          'p15-suspended', 'suspended', 'BBD', 'America/Barbados',
          'suspended-p15@example.test', now(), now());

      insert into public.donors (
        id, church_id, auth_user_id, display_name, email, is_anonymous
      ) values
        ('${donors.guest}', '${churches.primary}', null, 'Prior Guest',
          'member-p15@example.test', false),
        ('${donors.otherMember}', '${churches.primary}', '${users.other}',
          'Other Member',
          'other-p15@example.test', false),
        ('${donors.unverifiedMember}', '${churches.primary}',
          '${users.unverified}', 'Unverified Member',
          'unverified-p15@example.test', false),
        ('${donors.invalidEmailMember}', '${churches.primary}',
          '${users.invalidEmail}', 'Invalid Email Member',
          'placeholder-p15@example.test', false),
        ('${donors.suspendedMember}', '${churches.suspended}',
          '${users.suspendedMember}', 'Suspended Member',
          'suspended-member-p15@example.test', false),
        ('${donors.dualRole}', '${churches.primary}', '${users.dualRole}',
          'Dual Role Member', 'dual-role-p15@example.test', false);

      insert into public.church_memberships (church_id, user_id, role, status)
      values
        ('${churches.primary}', '${users.staff}', 'owner', 'active'),
        ('${churches.primary}', '${users.dualRole}', 'finance_admin', 'active');

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status, amount_minor,
        currency, donor_display_name, donor_email, donated_at
      ) values (
        '${guestDonation}', '${churches.primary}', '${donors.guest}',
        (select id from public.funds
          where church_id = '${churches.primary}' and is_default),
        'cash', 'succeeded', 2500, 'BBD', 'Prior Guest',
        'member-p15@example.test', now()
      );

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status, amount_minor,
        currency, donor_display_name, donor_email, donated_at
      ) values
        (
          '35000000-0000-4000-8000-000000001002', '${churches.primary}',
          '${donors.unverifiedMember}',
          (select id from public.funds
            where church_id='${churches.primary}' and is_default),
          'cash', 'succeeded', 1000, 'BBD', 'Unverified Member',
          'unverified-p15@example.test', now()
        ),
        (
          '35000000-0000-4000-8000-000000001003', '${churches.primary}',
          '${donors.invalidEmailMember}',
          (select id from public.funds
            where church_id='${churches.primary}' and is_default),
          'cash', 'succeeded', 1000, 'BBD', 'Invalid Email Member',
          'placeholder-p15@example.test', now()
        ),
        (
          '35000000-0000-4000-8000-000000001004', '${churches.suspended}',
          '${donors.suspendedMember}',
          (select id from public.funds
            where church_id='${churches.suspended}' and is_default),
          'cash', 'succeeded', 1000, 'BBD', 'Suspended Member',
          'suspended-member-p15@example.test', now()
        );
    `);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it("installs strict profile shape, non-unique email lookup, private RLS ledger, and restrictive Auth FK", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select is_nullable from information_schema.columns
        where table_schema='public' and table_name='donors'
          and column_name='display_name') display_nullable,
      (select is_nullable from information_schema.columns
        where table_schema='public' and table_name='donors'
          and column_name='email') email_nullable,
      (select column_default from information_schema.columns
        where table_schema='public' and table_name='donors'
          and column_name='profile_revision') revision_default,
      (select count(*)::integer from pg_indexes
        where schemaname='public' and indexname='donors_email_unique_idx') old_unique,
      (select count(*)::integer from pg_indexes
        where schemaname='public' and indexname='donors_email_lookup_idx') lookup_index,
      (select count(*)::integer from pg_indexes
        where schemaname='public'
          and indexname='donors_auth_user_global_unique_idx') global_identity,
      (select relrowsecurity from pg_class
        where oid='public.donor_profile_mutation_requests'::regclass) rls,
      (select relforcerowsecurity from pg_class
        where oid='public.donor_profile_mutation_requests'::regclass) forced,
      (select confdeltype::text from pg_constraint
        where conname='donors_auth_user_id_fkey') delete_action;`);
    expect(result.rows[0]).toEqual({
      display_nullable: "NO",
      email_nullable: "NO",
      revision_default: "0",
      old_unique: 0,
      lookup_index: 1,
      global_identity: 1,
      rls: true,
      forced: true,
      delete_action: "r",
    });
  });

  it("canonicalizes Unicode whitespace but rejects unsafe controls and bidi formatting", async () => {
    const result = await db.query<{
      canonical: string;
      safe: boolean;
      newline: boolean;
      c1: boolean;
      bidi: boolean;
    }>(`select
      public.canonicalize_donor_display_name(
        U&'  Mar\\00EDa\\00A0  Jordan  '
      ) canonical,
      public.donor_text_has_unsafe_formatting('María Jordan') safe,
      public.donor_text_has_unsafe_formatting(E'María\nJordan') newline,
      public.donor_text_has_unsafe_formatting('A' || chr(133) || 'B') c1,
      public.donor_text_has_unsafe_formatting('A' || chr(8238) || 'B') bidi;`);
    expect(result.rows[0]).toEqual({
      canonical: "María Jordan",
      safe: false,
      newline: true,
      c1: true,
      bidi: true,
    });
  });

  it.each([
    ["member-p15@example.test", true],
    ["first.last+tag@example.test", true],
    [".leading@example.test", false],
    ["two..dots@example.test", false],
    ["name@example", false],
    ["name@-example.test", false],
    ["Name@example.test", false],
  ])("validates canonical donor email %s", async (email, expected) => {
    const result = await db.query<{ valid: boolean }>(
      `select public.is_valid_donor_email('${email}') valid;`,
    );
    expect(result.rows[0]?.valid).toBe(expected);
  });

  it("fails closed on reads for anonymous, unverified, inactive, and invalid-email callers", async () => {
    const anonymous = await asRole(
      db,
      "anon",
      `select * from public.get_my_donor_profile('${churches.primary}');`,
    ).catch((error: unknown) => error);
    expect(String(anonymous)).toMatch(/permission denied/i);

    for (const userId of [users.unverified, users.inactive, users.invalidEmail]) {
      const result = await asAuthenticated<Record<string, unknown>>(
        db,
        userId,
        `select * from public.get_my_donor_profile('${churches.primary}');`,
      );
      expect(result.rows).toEqual([]);
    }
  });

  it("creates a separate member profile without claiming same-email guest history", async () => {
    const result = await asAuthenticated<MutationResult>(
      db,
      users.member,
      mutationSql({
        churchId: churches.primary,
        requestId: requests.create,
        revision: 0,
        displayName: "  María   Jordan  ",
      }),
      true,
    );
    expect(result.rows[0]).toMatchObject({
      church_id: churches.primary,
      profile_revision: 0,
      operation: "created",
      replayed: false,
    });
    memberDonorId = result.rows[0]!.donor_id;
    expect(memberDonorId).not.toBe(donors.guest);

    const state = await db.query<Record<string, unknown>>(`select
      (select count(*)::integer from public.donors
        where church_id='${churches.primary}'
          and email='member-p15@example.test') same_email_rows,
      (select auth_user_id from public.donors
        where id='${donors.guest}') guest_auth_user_id,
      (select donor_id from public.donations
        where id='${guestDonation}') donation_donor_id,
      (select count(*)::integer from public.donations
        where donor_id='${memberDonorId}') member_history;`);
    expect(state.rows[0]).toEqual({
      same_email_rows: 2,
      guest_auth_user_id: null,
      donation_donor_id: donors.guest,
      member_history: 0,
    });
  });

  it("reads only the caller own selected-tenant minimum profile with Auth-derived email", async () => {
    const own = await asAuthenticated<Record<string, unknown>>(
      db,
      users.member,
      `select * from public.get_my_donor_profile('${churches.primary}');`,
    );
    expect(own.rows).toEqual([
      {
        church_id: churches.primary,
        donor_id: memberDonorId,
        display_name: "María Jordan",
        email: "member-p15@example.test",
        profile_revision: 0,
        updated_at: expect.any(Date),
      },
    ]);

    const otherTenant = await asAuthenticated<Record<string, unknown>>(
      db,
      users.member,
      `select * from public.get_my_donor_profile('${churches.other}');`,
    );
    expect(otherTenant.rows).toEqual([]);

    const otherCaller = await asAuthenticated<Record<string, unknown>>(
      db,
      users.other,
      `select * from public.get_my_donor_profile('${churches.primary}')
       where donor_id='${memberDonorId}';`,
    );
    expect(otherCaller.rows).toEqual([]);
  });

  it("writes PII-free created audit and private exact replay state", async () => {
    const audit = await db.query<{
      action: string;
      entity: string;
      changes: Record<string, unknown>;
      payload: string;
    }>(`select
      action_code::text action,
      entity_code::text entity,
      sanitized_changes changes,
      sanitized_changes::text payload
    from public.audit_logs
    where request_id='${requests.create}';`);
    expect(audit.rows[0]).toMatchObject({
      action: "donor_profile_created",
      entity: "donor",
      changes: {
        donor_id: memberDonorId,
        field_names: ["display_name", "email"],
      },
    });
    expect(audit.rows[0]!.payload).not.toMatch(/María|member-p15|@/i);

    const replay = await asAuthenticated<MutationResult>(
      db,
      users.member,
      mutationSql({
        churchId: churches.primary,
        requestId: requests.create,
        revision: 0,
        displayName: "María Jordan",
      }),
      true,
    );
    expect(replay.rows[0]).toEqual({
      church_id: churches.primary,
      donor_id: memberDonorId,
      profile_revision: 0,
      operation: "created",
      replayed: true,
    });
    const counts = await db.query<{ audits: number; ledgers: number }>(`select
      (select count(*)::integer from public.audit_logs
        where request_id='${requests.create}') audits,
      (select count(*)::integer from public.donor_profile_mutation_requests
        where request_id='${requests.create}') ledgers;`);
    expect(counts.rows[0]).toEqual({ audits: 1, ledgers: 1 });
  });

  it("rejects same-request payload or caller mismatches without mutation", async () => {
    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.create,
          revision: 0,
          displayName: "Changed Replay",
        }),
        true,
      ),
    ).rejects.toThrow(/DONOR_PROFILE_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        db,
        users.other,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.create,
          revision: 0,
          displayName: "María Jordan",
        }),
        true,
      ),
    ).rejects.toThrow(/DONOR_PROFILE_IDEMPOTENCY_CONFLICT/);
  });

  it("updates with exact CAS and records only changed field names", async () => {
    const result = await asAuthenticated<MutationResult>(
      db,
      users.member,
      mutationSql({
        churchId: churches.primary,
        requestId: requests.update,
        revision: 0,
        displayName: "María Clarke",
      }),
      true,
    );
    expect(result.rows[0]).toEqual({
      church_id: churches.primary,
      donor_id: memberDonorId,
      profile_revision: 1,
      operation: "updated",
      replayed: false,
    });

    const state = await db.query<Record<string, unknown>>(`select
      (select display_name from public.donors where id='${memberDonorId}') name,
      (select profile_revision from public.donors where id='${memberDonorId}') revision,
      (select sanitized_changes from public.audit_logs
        where request_id='${requests.update}') changes;`);
    expect(state.rows[0]).toEqual({
      name: "María Clarke",
      revision: 1,
      changes: { donor_id: memberDonorId, field_names: ["display_name"] },
    });
  });

  it("rejects stale revisions and no-op updates", async () => {
    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.invalid,
          revision: 0,
          displayName: "Stale Name",
        }),
        true,
      ),
    ).rejects.toThrow(/DONOR_PROFILE_REVISION_CONFLICT/);

    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.invalid,
          revision: 1,
          displayName: "María Clarke",
        }),
        true,
      ),
    ).rejects.toThrow(/DONOR_PROFILE_NO_CHANGES/);
  });

  it.each([
    [null, /DONOR_PROFILE_INVALID_DISPLAY_NAME/],
    ["A", /DONOR_PROFILE_INVALID_DISPLAY_NAME/],
    ["A".repeat(121), /DONOR_PROFILE_INVALID_DISPLAY_NAME/],
    ["Line\nBreak", /DONOR_PROFILE_INVALID_DISPLAY_NAME/],
    [`Safe${String.fromCodePoint(8238)}Name`, /DONOR_PROFILE_INVALID_DISPLAY_NAME/],
  ])("rejects invalid display-name input", async (displayName, error) => {
    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.invalid,
          revision: 1,
          displayName,
        }),
      ),
    ).rejects.toThrow(error);
  });

  it("rejects invalid request/revision, unavailable church, and ineligible identities", async () => {
    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: null,
          revision: 1,
          displayName: "Valid Name",
        }),
      ),
    ).rejects.toThrow(/DONOR_PROFILE_INVALID_REQUEST_ID/);
    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.invalid,
          revision: null,
          displayName: "Valid Name",
        }),
      ),
    ).rejects.toThrow(/DONOR_PROFILE_INVALID_EXPECTED_REVISION/);
    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.suspended,
          requestId: requests.invalid,
          revision: 0,
          displayName: "Valid Name",
        }),
      ),
    ).rejects.toThrow(/DONOR_PROFILE_FORBIDDEN/);

    for (const userId of [users.unverified, users.inactive, users.invalidEmail]) {
      await expect(
        asAuthenticated(
          db,
          userId,
          mutationSql({
            churchId: churches.primary,
            requestId: requests.invalid,
            revision: 0,
            displayName: "Valid Name",
          }),
        ),
      ).rejects.toThrow(/DONOR_PROFILE_FORBIDDEN/);
    }
  });

  it("enforces one linked donor church per v1 account", async () => {
    await expect(
      asAuthenticated(
        db,
        users.other,
        mutationSql({
          churchId: churches.other,
          requestId: requests.otherCreate,
          revision: 0,
          displayName: "Other Tenant Member",
        }),
        true,
      ),
    ).rejects.toThrow(/DONOR_PROFILE_FORBIDDEN/);
    const memberView = await asAuthenticated<Record<string, unknown>>(
      db,
      users.member,
      `select * from public.get_my_donor_profile('${churches.other}');`,
    );
    expect(memberView.rows).toEqual([]);
  });

  it("fails donor ownership and financial RLS closed when identity or church eligibility changes", async () => {
    await db.exec(`insert into public.donations (
      id, church_id, donor_id, fund_id, source, status, amount_minor,
      currency, donor_display_name, donor_email, donated_at
    ) values (
      '${memberDonation}', '${churches.primary}', '${memberDonorId}',
      (select id from public.funds
        where church_id='${churches.primary}' and is_default),
      'cash', 'succeeded', 1500, 'BBD', 'Member Snapshot',
      'member-p15@example.test', now()
    );`);

    const boundary = async (userId: string, donorId: string) => {
      const result = await asAuthenticated<{
        owns: boolean;
        donations: number;
      }>(
        db,
        userId,
        `select
          public.owns_donor('${donorId}') owns,
          (select count(id)::integer from public.donations) donations;`,
      );
      return result.rows[0];
    };

    await expect(boundary(users.member, memberDonorId)).resolves.toEqual({
      owns: true,
      donations: 1,
    });
    await expect(boundary(users.member, donors.otherMember)).resolves.toEqual({
      owns: false,
      donations: 1,
    });
    await expect(
      boundary(users.unverified, donors.unverifiedMember),
    ).resolves.toEqual({ owns: false, donations: 0 });
    await expect(
      boundary(users.invalidEmail, donors.invalidEmailMember),
    ).resolves.toEqual({ owns: false, donations: 0 });
    await expect(
      boundary(users.suspendedMember, donors.suspendedMember),
    ).resolves.toEqual({ owns: false, donations: 0 });

    await db.exec(`update auth.users set email_confirmed_at=null
      where id='${users.member}';`);
    await expect(boundary(users.member, memberDonorId)).resolves.toEqual({
      owns: false,
      donations: 0,
    });
    await db.exec(`update auth.users set email_confirmed_at=now()
      where id='${users.member}';`);

    await db.exec(`update auth.users set email='changed-p15@example.test'
      where id='${users.member}';`);
    await expect(boundary(users.member, memberDonorId)).resolves.toEqual({
      owns: false,
      donations: 0,
    });
    await db.exec(`update auth.users set email='member-p15@example.test'
      where id='${users.member}';`);

    await db.exec(`update public.churches
      set status='suspended', suspended_at=now()
      where id='${churches.primary}';`);
    await expect(boundary(users.member, memberDonorId)).resolves.toEqual({
      owns: false,
      donations: 0,
    });
    await db.exec(`update public.churches
      set status='active', suspended_at=null
      where id='${churches.primary}';`);

    await expect(boundary(users.member, memberDonorId)).resolves.toEqual({
      owns: true,
      donations: 1,
    });
  });

  it("keeps direct donor reads self-only and column-minimized for members and staff", async () => {
    const ownIdentity = await asAuthenticated<Record<string, unknown>>(
      db,
      users.member,
      "select id,church_id,auth_user_id from public.donors;",
    );
    expect(ownIdentity.rows).toEqual([
      {
        id: memberDonorId,
        church_id: churches.primary,
        auth_user_id: users.member,
      },
    ]);
    const staffRows = await asAuthenticated<{ count: number }>(
      db,
      users.staff,
      "select count(id)::integer count from public.donors;",
    );
    expect(staffRows.rows[0]?.count).toBe(6);

    const dualRoleRows = await asAuthenticated<{ count: number }>(
      db,
      users.dualRole,
      "select count(id)::integer count from public.donors;",
    );
    expect(dualRoleRows.rows[0]?.count).toBe(5);
    const dualRoleOwnRow = await asAuthenticated<{ count: number }>(
      db,
      users.dualRole,
      `select count(id)::integer count from public.donors
        where auth_user_id='${users.dualRole}';`,
    );
    expect(dualRoleOwnRow.rows[0]?.count).toBe(0);
    for (const userId of [users.member, users.staff]) {
      await expect(
        asAuthenticated(
          db,
          userId,
          "select display_name,email,phone from public.donors;",
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("blocks direct mutations, historical linking, Auth deletion, and ledger reads", async () => {
    await expect(
      asAuthenticated(
        db,
        users.member,
        `update public.donors set display_name='Bypass'
          where id='${memberDonorId}' returning id;`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(
        db,
        "service_role",
        `update public.donors set auth_user_id='${users.member}'
          where id='${donors.guest}' returning id;`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.donors set auth_user_id='${users.member}'
        where id='${donors.guest}';`),
    ).rejects.toThrow(/DONOR_AUTH_IDENTITY_IMMUTABLE/);
    await expect(
      db.exec(`delete from auth.users where id='${users.member}';`),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      asAuthenticated(
        db,
        users.member,
        "select * from public.donor_profile_mutation_requests;",
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps the replay ledger append-only", async () => {
    await expect(
      db.exec(`update public.donor_profile_mutation_requests
        set payload_sha256=repeat('a',64)
        where request_id='${requests.create}';`),
    ).rejects.toThrow(/DONOR_PROFILE_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec(`delete from public.donor_profile_mutation_requests
        where request_id='${requests.create}';`),
    ).rejects.toThrow(/DONOR_PROFILE_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec("truncate public.donor_profile_mutation_requests;"),
    ).rejects.toThrow(/DONOR_PROFILE_LEDGER_APPEND_ONLY/);
  });

  it("admits donor audit actors only for their exact linked donor entity", async () => {
    const snapshots = await db.query<{
      display_name: string;
      role: string;
    }>(`select
      actor_display_name_snapshot display_name,
      actor_role_snapshot role
    from public.audit_logs
    where request_id='${requests.create}';`);
    expect(snapshots.rows[0]).toEqual({
      display_name: "Registered donor",
      role: "member",
    });

    await db.exec("begin;");
    try {
      await db.exec(`select set_config(
        'request.jwt.claim.sub', '${users.member}', true
      );`);
      await expect(
        db.exec(`insert into public.audit_logs (
          church_id, actor_user_id, actor_type, action, action_code,
          entity_table, entity_code, entity_id, request_id, sanitized_changes
        ) values (
          '${churches.primary}', '${users.member}', 'user',
          'donor_profile_updated', 'donor_profile_updated', 'donor', 'donor',
          '${donors.guest}', '${requests.invalid}',
          jsonb_build_object(
            'donor_id', '${donors.guest}',
            'field_names', jsonb_build_array('display_name')
          )
        );`),
      ).rejects.toThrow(/user audit actor has no active donor capacity/);
    } finally {
      await db.exec("rollback;");
    }
  });

  it("rolls back profile, audit, and ledger after a forced late failure", async () => {
    await db.exec(`
      create function public.p15_force_late_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'P15_FORCED_LATE_FAILURE'; end;
      $$;
      create trigger p15_force_late_failure
      before insert on public.donor_profile_mutation_requests
      for each row execute function public.p15_force_late_failure();
    `);
    const before = await db.query<Record<string, unknown>>(`select
      (select display_name from public.donors where id='${memberDonorId}') name,
      (select profile_revision from public.donors where id='${memberDonorId}') revision,
      (select count(*)::integer from public.audit_logs
        where church_id='${churches.primary}') audits,
      (select count(*)::integer from public.donor_profile_mutation_requests
        where church_id='${churches.primary}') ledgers;`);

    await expect(
      asAuthenticated(
        db,
        users.member,
        mutationSql({
          churchId: churches.primary,
          requestId: requests.lateFailure,
          revision: 1,
          displayName: "Rolled Back Name",
        }),
        true,
      ),
    ).rejects.toThrow(/P15_FORCED_LATE_FAILURE/);

    const after = await db.query<Record<string, unknown>>(`select
      (select display_name from public.donors where id='${memberDonorId}') name,
      (select profile_revision from public.donors where id='${memberDonorId}') revision,
      (select count(*)::integer from public.audit_logs
        where church_id='${churches.primary}') audits,
      (select count(*)::integer from public.donor_profile_mutation_requests
        where church_id='${churches.primary}') ledgers;`);
    expect(after.rows[0]).toEqual(before.rows[0]);

    await db.exec(`
      drop trigger p15_force_late_failure
        on public.donor_profile_mutation_requests;
      drop function public.p15_force_late_failure();
    `);
  });
});

describe("P15 donor migration preflight", () => {
  it.each([
    {
      setup: `insert into public.churches (id,name,slug,status,activated_at)
        values ('41000000-0000-4000-8000-000000001001','P15 Bad','p15-bad','active',now());
        insert into public.donors(church_id,display_name,email)
        values ('41000000-0000-4000-8000-000000001001',null,'valid@example.test');`,
      error: /P15_EXISTING_DONOR_DISPLAY_NAME_INVALID/,
    },
    {
      setup: `insert into public.churches (id,name,slug,status,activated_at)
        values ('41000000-0000-4000-8000-000000001002','P15 Bad','p15-bad-two','active',now());
        insert into public.donors(church_id,display_name,email)
        values ('41000000-0000-4000-8000-000000001002','Valid Name','invalid-email');`,
      error: /P15_EXISTING_DONOR_EMAIL_INVALID/,
    },
    {
      setup: `insert into auth.users(id,email,email_confirmed_at)
        values ('41000000-0000-4000-8000-000000001099',
          'shared-p15@example.test',now());
        insert into public.churches (id,name,slug,status,activated_at) values
          ('41000000-0000-4000-8000-000000001003','P15 A','p15-shared-a','active',now()),
          ('41000000-0000-4000-8000-000000001004','P15 B','p15-shared-b','active',now());
        insert into public.donors(church_id,auth_user_id,display_name,email) values
          ('41000000-0000-4000-8000-000000001003',
            '41000000-0000-4000-8000-000000001099','Shared Member',
            'shared-p15@example.test'),
          ('41000000-0000-4000-8000-000000001004',
            '41000000-0000-4000-8000-000000001099','Shared Member',
            'shared-p15@example.test');`,
      error: /P15_EXISTING_SHARED_DONOR_ACCOUNT/,
    },
  ])("refuses unsafe existing donor state", async ({ setup, error }) => {
    const preflight = new PGlite();
    try {
      await installPlatform(preflight, migrations.length - 2);
      await preflight.exec(setup);
      await preflight.exec(migrations.at(-2)!);
      await expect(preflight.exec(migrations.at(-1)!)).rejects.toThrow(error);
    } finally {
      await preflight.close();
    }
  }, 60_000);
});
