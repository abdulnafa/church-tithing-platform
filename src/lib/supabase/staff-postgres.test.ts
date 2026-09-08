import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "31000000-0000-4000-8000-000000001001",
  ownerTwo: "31000000-0000-4000-8000-000000001002",
  finance: "31000000-0000-4000-8000-000000001003",
  staff: "31000000-0000-4000-8000-000000001004",
  suspendedStaff: "31000000-0000-4000-8000-000000001005",
  otherOwner: "31000000-0000-4000-8000-000000001006",
  claimant: "31000000-0000-4000-8000-000000001007",
  unconfirmed: "31000000-0000-4000-8000-000000001008",
  inactive: "31000000-0000-4000-8000-000000001009",
  wrongClaimant: "31000000-0000-4000-8000-000000001010",
  invitedOwner: "31000000-0000-4000-8000-000000001011",
  duplicateClaimant: "31000000-0000-4000-8000-000000001012",
  lateClaimant: "31000000-0000-4000-8000-000000001013",
} as const;

const churches = {
  primary: "32000000-0000-4000-8000-000000001001",
  other: "32000000-0000-4000-8000-000000001002",
  suspended: "32000000-0000-4000-8000-000000001003",
} as const;

const memberships = {
  owner: "34000000-0000-4000-8000-000000001001",
  ownerTwo: "34000000-0000-4000-8000-000000001002",
  finance: "34000000-0000-4000-8000-000000001003",
  staff: "34000000-0000-4000-8000-000000001004",
  suspended: "34000000-0000-4000-8000-000000001005",
  revoked: "34000000-0000-4000-8000-000000001006",
  otherOwner: "34000000-0000-4000-8000-000000001007",
  suspendedOwner: "34000000-0000-4000-8000-000000001008",
  duplicatePrior: "34000000-0000-4000-8000-000000001009",
} as const;

const requests = {
  claimant: "33000000-0000-4000-8000-000000001001",
  unknown: "33000000-0000-4000-8000-000000001002",
  unconfirmed: "33000000-0000-4000-8000-000000001003",
  inactive: "33000000-0000-4000-8000-000000001004",
  rehire: "33000000-0000-4000-8000-000000001005",
  role: "33000000-0000-4000-8000-000000001006",
  remove: "33000000-0000-4000-8000-000000001007",
  removePending: "33000000-0000-4000-8000-000000001008",
  removeSuspended: "33000000-0000-4000-8000-000000001009",
  invitedOwner: "33000000-0000-4000-8000-000000001010",
  duplicate: "33000000-0000-4000-8000-000000001011",
  lateMutation: "33000000-0000-4000-8000-000000001012",
  lateClaim: "33000000-0000-4000-8000-000000001013",
  invalid: "33000000-0000-4000-8000-000000001099",
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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type StaffMutationInput = {
  requestId: string | null;
  churchId: string;
  expectedRevision: number | null;
  operation: string | null;
  membershipId?: string | null;
  email?: string | null;
  role?: string | null;
};

type StaffResult = {
  church_id: string;
  membership_id: string;
  role: "owner" | "finance_admin" | "accountant" | "staff";
  status: "invited" | "active" | "suspended" | "revoked";
  staff_revision: number;
  replayed: boolean;
};

const db = new PGlite();

function sqlLiteral(value: string | null | undefined) {
  return value == null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function mutateStaffSql(input: StaffMutationInput) {
  return `select * from public.mutate_church_staff(
    staff_request_id => ${sqlLiteral(input.requestId)}::uuid,
    target_church_id => '${input.churchId}'::uuid,
    expected_staff_revision => ${input.expectedRevision ?? "null"}::bigint,
    staff_operation => ${sqlLiteral(input.operation)},
    target_membership_id => ${sqlLiteral(input.membershipId)}::uuid,
    staff_email => ${sqlLiteral(input.email)},
    staff_role => ${sqlLiteral(input.role)}
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

describe("P12 staff management behavior in PostgreSQL", () => {
  const createdMemberships: Record<string, string> = {};

  beforeAll(async () => {
    await db.waitReady;
    await installFoundation(db);

    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p12@example.test', now(), '{"display_name":"  P12   Owner  "}'),
        ('${users.ownerTwo}', 'owner-two-p12@example.test', now(), '{"display_name":"Second Owner"}'),
        ('${users.finance}', 'finance-p12@example.test', now(), '{"display_name":"Finance Admin"}'),
        ('${users.staff}', 'staff-p12@example.test', now(), '{"display_name":"Unsafe\\u0001Name"}'),
        ('${users.suspendedStaff}', 'suspended-p12@example.test', now(), '{"display_name":"Suspended Staff"}'),
        ('${users.otherOwner}', 'other-owner-p12@example.test', now(), '{"display_name":"Other Owner"}'),
        ('${users.claimant}', 'claim-p12@example.test', now(), '{"display_name":"Claimed User"}'),
        ('${users.unconfirmed}', 'unconfirmed-p12@example.test', null, '{"display_name":"Unconfirmed"}'),
        ('${users.inactive}', 'inactive-p12@example.test', now(), '{"display_name":"Inactive"}'),
        ('${users.wrongClaimant}', 'wrong-p12@example.test', now(), '{"display_name":"Wrong"}'),
        ('${users.invitedOwner}', 'invited-owner-p12@example.test', now(), '{"display_name":"Invited Owner"}'),
        ('${users.duplicateClaimant}', 'duplicate-p12@example.test', now(), '{"display_name":"Duplicate"}'),
        ('${users.lateClaimant}', 'late-claim-p12@example.test', now(), '{"display_name":"Late Claim"}');

      update public.profiles set is_active = false where id = '${users.inactive}';
      update public.profiles set display_name = E'Unsafe\\001Name'
        where id = '${users.staff}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at
      ) values
        ('${churches.primary}', 'P12 Primary', 'P12 Primary Inc.',
         'p12-primary', 'active', 'BBD', 'America/Barbados',
         'primary-p12@example.test', now()),
        ('${churches.other}', 'P12 Other', 'P12 Other Inc.',
         'p12-other', 'onboarding', 'USD', 'America/New_York',
         'other-p12@example.test', null),
        ('${churches.suspended}', 'P12 Suspended', 'P12 Suspended Inc.',
         'p12-suspended', 'suspended', 'BBD', 'America/Barbados',
         'suspended-p12@example.test', now());

      insert into public.church_memberships (
        id, church_id, user_id, role, status, revoked_at
      ) values
        ('${memberships.owner}', '${churches.primary}', '${users.owner}', 'owner', 'active', null),
        ('${memberships.ownerTwo}', '${churches.primary}', '${users.ownerTwo}', 'owner', 'active', null),
        ('${memberships.finance}', '${churches.primary}', '${users.finance}', 'finance_admin', 'active', null),
        ('${memberships.staff}', '${churches.primary}', '${users.staff}', 'staff', 'active', null),
        ('${memberships.suspended}', '${churches.primary}', '${users.suspendedStaff}', 'staff', 'suspended', null),
        ('${memberships.revoked}', '${churches.primary}', '${users.wrongClaimant}', 'staff', 'revoked', now()),
        ('${memberships.otherOwner}', '${churches.other}', '${users.otherOwner}', 'owner', 'active', null),
        ('${memberships.suspendedOwner}', '${churches.suspended}', '${users.owner}', 'owner', 'active', null),
        ('${memberships.duplicatePrior}', '${churches.primary}', '${users.duplicateClaimant}', 'accountant', 'revoked', now());
    `);
  }, 50_000);

  afterAll(async () => {
    await db.close();
  });

  it("installs the revision, private ledger, audit value, and restrictive user FK", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'churches'
         and column_name = 'staff_revision') revision_default,
      (select relrowsecurity from pg_class
       where oid = 'public.church_staff_mutation_requests'::regclass) rls,
      (select relforcerowsecurity from pg_class
       where oid = 'public.church_staff_mutation_requests'::regclass) forced,
      (select confdeltype from pg_constraint
       where conrelid = 'public.church_memberships'::regclass
         and conname = 'church_memberships_user_id_fkey') delete_action,
      (select count(*)::integer from pg_enum enum_value
       join pg_type enum_type on enum_type.oid = enum_value.enumtypid
       where enum_type.typname = 'audit_action'
         and enum_value.enumlabel = 'staff_invitation_accepted') accepted_action,
      (select count(*)::integer from pg_indexes
       where schemaname = 'public' and indexname in (
         'church_memberships_email_history_unique_idx',
         'church_staff_mutation_requests_membership_idx'
       )) indexes;`);
    expect(result.rows[0]).toEqual({
      revision_default: "0",
      rls: true,
      forced: true,
      delete_action: "r",
      accepted_action: 1,
      indexes: 2,
    });
  });

  it("returns a deterministic minimum roster with safe display copy", async () => {
    const result = await asAuthenticated<{
      church_id: string;
      staff_revision: number;
      staff_json: Array<Record<string, unknown>>;
    }>(users.owner, `select
      (snapshot).church_id,
      (snapshot).staff_revision,
      to_jsonb((snapshot).staff) staff_json
    from (select public.get_church_staff('${churches.primary}') snapshot) q;`);
    expect(result.rows[0]?.church_id).toBe(churches.primary);
    expect(result.rows[0]?.staff_revision).toBe(0);
    const roster = result.rows[0]!.staff_json;
    expect(roster.map((row) => row.membership_id).slice(0, 2)).toEqual([
      memberships.owner,
      memberships.ownerTwo,
    ]);
    expect(roster[0]).toMatchObject({
      email: "owner-p12@example.test",
      display_name: "P12 Owner",
      role: "owner",
      status: "active",
      access_enabled: true,
      is_current_user: true,
    });
    expect(roster.find((row) => row.membership_id === memberships.staff)).toMatchObject({
      display_name: null,
      access_enabled: true,
    });
    expect(JSON.stringify(roster)).not.toContain("user_id");
    expect(JSON.stringify(roster)).not.toContain("phone");
  });

  it("fails roster reads closed outside an active owner capacity", async () => {
    for (const [userId, churchId] of [
      [users.finance, churches.primary],
      [users.staff, churches.primary],
      [users.otherOwner, churches.primary],
      [users.owner, churches.suspended],
    ] as const) {
      await expect(
        asAuthenticated(userId, `select public.get_church_staff('${churchId}');`),
      ).rejects.toThrow(/STAFF_FORBIDDEN/);
    }
    await expect(
      asRole("anon", `select public.get_church_staff('${churches.primary}');`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("preserves request identity queries while making direct roster reads self-only", async () => {
    const own = await asAuthenticated<{
      id: string;
      church_id: string;
      role: string;
      status: string;
    }>(users.owner, `select id, church_id, role, status
      from public.church_memberships
      where user_id = '${users.owner}' and status = 'active'
      order by church_id;`);
    expect(own.rows).toEqual([
      {
        id: memberships.owner,
        church_id: churches.primary,
        role: "owner",
        status: "active",
      },
    ]);

    const visible = await asAuthenticated<{ count: number }>(
      users.owner,
      "select count(*)::integer count from public.church_memberships;",
    );
    expect(visible.rows[0]?.count).toBe(1);
    await expect(
      asAuthenticated(users.owner, "select invited_email from public.church_memberships;"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("rejects malformed requests, roles, emails, and argument shapes", async () => {
    const cases: Array<[StaffMutationInput, RegExp]> = [
      [{ requestId: null, churchId: churches.primary, expectedRevision: 0,
        operation: "invite", email: "valid@example.test", role: "staff" },
      /STAFF_INVALID_REQUEST_ID/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: -1, operation: "invite", email: "valid@example.test",
        role: "staff" }, /STAFF_INVALID_EXPECTED_REVISION/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "destroy" }, /STAFF_INVALID_OPERATION/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "invite", email: "bad", role: "staff" },
      /STAFF_INVALID_EMAIL/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "invite", email: "valid@example.test",
        role: "owner" }, /STAFF_INVALID_ROLE/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "remove", membershipId: memberships.staff,
        role: "staff" }, /STAFF_INVALID_ARGUMENTS/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "invite", email: "owner-p12@example.test",
        role: "staff" }, /STAFF_SELF_PROTECTED/],
    ];
    for (const [input, expected] of cases) {
      await expect(
        asAuthenticated(users.owner, mutateStaffSql(input), true),
      ).rejects.toThrow(expected);
    }
  });

  it("creates identical pending invitations without probing Auth state", async () => {
    const invitations = [
      [requests.claimant, "\u00a0CLAIM-P12@EXAMPLE.TEST\ufeff", "claimant"],
      [requests.unknown, "unknown-p12@example.test", "unknown"],
      [requests.unconfirmed, "unconfirmed-p12@example.test", "unconfirmed"],
      [requests.inactive, "inactive-p12@example.test", "inactive"],
    ] as const;

    let revision = 0;
    for (const [requestId, email, key] of invitations) {
      const result = await asAuthenticated<StaffResult>(
        users.owner,
        mutateStaffSql({
          requestId,
          churchId: churches.primary,
          expectedRevision: revision,
          operation: "invite",
          email,
          role: "staff",
        }),
        true,
      );
      revision += 1;
      expect(result.rows[0]).toMatchObject({
        church_id: churches.primary,
        role: "staff",
        status: "invited",
        staff_revision: revision,
        replayed: false,
      });
      expect(result.rows[0]).not.toHaveProperty("user_id");
      createdMemberships[key] = result.rows[0]!.membership_id;
    }

    const stored = await db.query<{
      invited_email: string;
      user_id: string | null;
      status: string;
    }>(`select invited_email, user_id, status::text
      from public.church_memberships
      where id in (
        '${createdMemberships.claimant}', '${createdMemberships.unknown}',
        '${createdMemberships.unconfirmed}', '${createdMemberships.inactive}'
      ) order by invited_email;`);
    expect(stored.rows.every((row) => row.user_id === null)).toBe(true);
    expect(stored.rows.every((row) => row.status === "invited")).toBe(true);
    expect(stored.rows.map((row) => row.invited_email)).toContain(
      "claim-p12@example.test",
    );

    const audits = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id in (
        '${requests.claimant}', '${requests.unknown}',
        '${requests.unconfirmed}', '${requests.inactive}'
      );`);
    expect(audits.rows).toHaveLength(4);
    expect(audits.rows.every((row) => !row.changes.includes("@"))).toBe(true);
  });

  it("reuses only revoked email history and never unlinks live staff", async () => {
    const rehire = await asAuthenticated<StaffResult>(
      users.owner,
      mutateStaffSql({
        requestId: requests.rehire,
        churchId: churches.primary,
        expectedRevision: 4,
        operation: "invite",
        email: "wrong-p12@example.test",
        role: "accountant",
      }),
      true,
    );
    expect(rehire.rows[0]).toMatchObject({
      membership_id: memberships.revoked,
      role: "accountant",
      status: "invited",
      staff_revision: 5,
    });
    const reused = await db.query<Record<string, unknown>>(`select
      user_id, invited_email, status::text, accepted_at, revoked_at
      from public.church_memberships where id = '${memberships.revoked}';`);
    expect(reused.rows[0]).toEqual({
      user_id: null,
      invited_email: "wrong-p12@example.test",
      status: "invited",
      accepted_at: null,
      revoked_at: null,
    });

    for (const [email, expected] of [
      ["finance-p12@example.test", /STAFF_EMAIL_CONFLICT/],
      ["suspended-p12@example.test", /STAFF_EMAIL_CONFLICT/],
      ["claim-p12@example.test", /STAFF_ALREADY_INVITED/],
      ["owner-two-p12@example.test", /STAFF_OWNER_PROTECTED/],
    ] as const) {
      await expect(
        asAuthenticated(
          users.owner,
          mutateStaffSql({
            requestId: requests.invalid,
            churchId: churches.primary,
            expectedRevision: 5,
            operation: "invite",
            email,
            role: "staff",
          }),
          true,
        ),
      ).rejects.toThrow(expected);
    }

    const live = await db.query<Record<string, unknown>>(`select
      (select jsonb_build_object('user',user_id,'role',role,'status',status)
       from public.church_memberships where id='${memberships.finance}') finance,
      (select jsonb_build_object('user',user_id,'role',role,'status',status)
       from public.church_memberships where id='${memberships.suspended}') suspended;`);
    expect(live.rows[0]).toMatchObject({
      finance: { user: users.finance, role: "finance_admin", status: "active" },
      suspended: { user: users.suspendedStaff, role: "staff", status: "suspended" },
    });
  });

  it("replays before CAS and rejects changed reuse or stale new requests", async () => {
    const replay = await asAuthenticated<StaffResult>(
      users.owner,
      mutateStaffSql({
        requestId: requests.rehire,
        churchId: churches.primary,
        expectedRevision: 4,
        operation: "invite",
        email: "wrong-p12@example.test",
        role: "accountant",
      }),
      true,
    );
    expect(replay.rows[0]).toMatchObject({ staff_revision: 5, replayed: true });
    await expect(
      asAuthenticated(
        users.owner,
        mutateStaffSql({
          requestId: requests.rehire,
          churchId: churches.primary,
          expectedRevision: 4,
          operation: "invite",
          email: "changed-p12@example.test",
          role: "staff",
        }),
        true,
      ),
    ).rejects.toThrow(/STAFF_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        users.owner,
        mutateStaffSql({
          requestId: requests.invalid,
          churchId: churches.primary,
          expectedRevision: 4,
          operation: "change_role",
          membershipId: memberships.finance,
          role: "staff",
        }),
        true,
      ),
    ).rejects.toThrow(/STAFF_REVISION_CONFLICT/);
  });

  it("changes only manageable non-owner roles with a sanitized audit", async () => {
    const changed = await asAuthenticated<StaffResult>(
      users.owner,
      mutateStaffSql({
        requestId: requests.role,
        churchId: churches.primary,
        expectedRevision: 5,
        operation: "change_role",
        membershipId: memberships.finance,
        role: " ACCOUNTANT ",
      }),
      true,
    );
    expect(changed.rows[0]).toMatchObject({
      membership_id: memberships.finance,
      role: "accountant",
      status: "active",
      staff_revision: 6,
    });
    const audit = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id = '${requests.role}';`);
    expect(JSON.parse(audit.rows[0]!.changes)).toEqual({
      from_role: "finance_admin",
      membership_id: memberships.finance,
      to_role: "accountant",
    });

    for (const [membershipId, role, error] of [
      [memberships.finance, "accountant", /STAFF_NO_CHANGES/],
      [memberships.suspended, "accountant", /STAFF_MEMBERSHIP_NOT_MANAGEABLE/],
      [memberships.ownerTwo, "staff", /STAFF_OWNER_PROTECTED/],
      [memberships.owner, "staff", /STAFF_SELF_PROTECTED/],
    ] as const) {
      await expect(
        asAuthenticated(
          users.owner,
          mutateStaffSql({
            requestId: requests.invalid,
            churchId: churches.primary,
            expectedRevision: 6,
            operation: "change_role",
            membershipId,
            role,
          }),
          true,
        ),
      ).rejects.toThrow(error);
    }
  });

  it("revokes active, invited, and suspended members without deleting history", async () => {
    const removals = [
      [requests.remove, memberships.staff, 6],
      [requests.removePending, createdMemberships.unknown, 7],
      [requests.removeSuspended, memberships.suspended, 8],
    ] as const;
    for (const [requestId, membershipId, revision] of removals) {
      const removed = await asAuthenticated<StaffResult>(
        users.owner,
        mutateStaffSql({
          requestId,
          churchId: churches.primary,
          expectedRevision: revision,
          operation: "remove",
          membershipId,
        }),
        true,
      );
      expect(removed.rows[0]).toMatchObject({
        membership_id: membershipId,
        status: "revoked",
        staff_revision: revision + 1,
      });
    }

    const preserved = await db.query<Record<string, unknown>>(`select
      membership.id, membership.user_id, membership.invited_email,
      membership.role::text, membership.status::text,
      membership.revoked_at is not null revoked,
      request.result_user_id_snapshot
    from public.church_memberships membership
    left join public.church_staff_mutation_requests request
      on request.result_membership_id = membership.id
     and request.operation = 'remove'
    where membership.id in (
      '${memberships.staff}', '${createdMemberships.unknown}',
      '${memberships.suspended}'
    ) order by membership.id;`);
    expect(preserved.rows).toHaveLength(3);
    expect(preserved.rows.every((row) => row.status === "revoked")).toBe(true);
    expect(preserved.rows.every((row) => row.revoked === true)).toBe(true);
    expect(preserved.rows.find((row) => row.id === memberships.staff)).toMatchObject({
      user_id: users.staff,
      result_user_id_snapshot: users.staff,
      invited_email: "staff-p12@example.test",
    });
    expect(
      preserved.rows.find((row) => row.id === createdMemberships.unknown),
    ).toMatchObject({ user_id: null, result_user_id_snapshot: null });

    await expect(
      asAuthenticated(
        users.owner,
        mutateStaffSql({
          requestId: requests.invalid,
          churchId: churches.primary,
          expectedRevision: 9,
          operation: "remove",
          membershipId: memberships.staff,
        }),
        true,
      ),
    ).rejects.toThrow(/STAFF_ALREADY_REMOVED/);
    await expect(
      asAuthenticated(
        users.owner,
        mutateStaffSql({
          requestId: requests.invalid,
          churchId: churches.primary,
          expectedRevision: 9,
          operation: "remove",
          membershipId: memberships.ownerTwo,
        }),
        true,
      ),
    ).rejects.toThrow(/STAFF_OWNER_PROTECTED/);
  });

  it("keeps every mutation independently owner-only and tenant-scoped", async () => {
    for (const [userId, churchId] of [
      [users.finance, churches.primary],
      [users.staff, churches.primary],
      [users.otherOwner, churches.primary],
      [users.owner, churches.suspended],
    ] as const) {
      await expect(
        asAuthenticated(
          userId,
          mutateStaffSql({
            requestId: requests.invalid,
            churchId,
            expectedRevision: 9,
            operation: "invite",
            email: "forbidden-p12@example.test",
            role: "staff",
          }),
          true,
        ),
      ).rejects.toThrow(/STAFF_FORBIDDEN/);
    }
  });

  it("claims only an exact verified active-profile invitation and audits acceptance", async () => {
    for (const [userId, membershipId] of [
      [users.wrongClaimant, createdMemberships.claimant],
      [users.unconfirmed, createdMemberships.unconfirmed],
      [users.inactive, createdMemberships.inactive],
    ] as const) {
      await expect(
        asAuthenticated(
          userId,
          `select * from public.claim_church_staff_invitation('${membershipId}');`,
          true,
        ),
      ).rejects.toThrow(/STAFF_INVITATION_NOT_AVAILABLE/);
    }

    const claimed = await asAuthenticated<StaffResult>(
      users.claimant,
      `select * from public.claim_church_staff_invitation(
        '${createdMemberships.claimant}'
      );`,
      true,
    );
    expect(claimed.rows[0]).toMatchObject({
      church_id: churches.primary,
      membership_id: createdMemberships.claimant,
      role: "staff",
      status: "active",
      staff_revision: 10,
      replayed: false,
    });
    expect(claimed.rows[0]).not.toHaveProperty("user_id");

    const state = await db.query<Record<string, unknown>>(`select
      membership.user_id,
      membership.invited_email,
      membership.accepted_at is not null accepted,
      audit.action_code::text action,
      audit.actor_user_id,
      audit.sanitized_changes::text changes
    from public.church_memberships membership
    join public.audit_logs audit
      on audit.entity_id = membership.id::text
     and audit.action_code = 'staff_invitation_accepted'
    where membership.id = '${createdMemberships.claimant}';`);
    expect(state.rows[0]).toMatchObject({
      user_id: users.claimant,
      invited_email: "claim-p12@example.test",
      accepted: true,
      action: "staff_invitation_accepted",
      actor_user_id: users.claimant,
    });
    expect(JSON.parse(state.rows[0]!.changes as string)).toEqual({
      membership_id: createdMemberships.claimant,
      role: "staff",
    });

    const replay = await asAuthenticated<StaffResult>(
      users.claimant,
      `select * from public.claim_church_staff_invitation(
        '${createdMemberships.claimant}'
      );`,
      true,
    );
    expect(replay.rows[0]).toMatchObject({ staff_revision: 10, replayed: true });
    const audits = await db.query<{ count: number }>(`select count(*)::integer count
      from public.audit_logs where action_code = 'staff_invitation_accepted'
        and entity_id = '${createdMemberships.claimant}';`);
    expect(audits.rows[0]?.count).toBe(1);
  });

  it("allows the exact verified user to claim a reserved P08 owner invitation", async () => {
    await db.exec(`insert into public.church_memberships (
      id, church_id, user_id, invited_email, role, status, invited_by
    ) values (
      '35000000-0000-4000-8000-000000001001', '${churches.primary}', null,
      'invited-owner-p12@example.test', 'owner', 'invited', '${users.owner}'
    );`);
    const claimed = await asAuthenticated<StaffResult>(
      users.invitedOwner,
      "select * from public.claim_church_staff_invitation('35000000-0000-4000-8000-000000001001');",
      true,
    );
    expect(claimed.rows[0]).toMatchObject({
      role: "owner",
      status: "active",
      staff_revision: 11,
      replayed: false,
    });
    const owners = await db.query<{ count: number }>(`select count(*)::integer count
      from public.church_memberships where church_id = '${churches.primary}'
        and role = 'owner' and status = 'active';`);
    expect(owners.rows[0]?.count).toBe(3);
  });

  it("fails a claim generically when that user already has church history", async () => {
    await db.exec(`
      update auth.users set email = 'alias-duplicate-p12@example.test'
      where id = '${users.duplicateClaimant}';
      insert into public.church_memberships (
        id, church_id, user_id, invited_email, role, status, invited_by
      ) values (
        '35000000-0000-4000-8000-000000001002', '${churches.primary}', null,
        'alias-duplicate-p12@example.test', 'staff', 'invited', '${users.owner}'
      );
    `);
    await expect(
      asAuthenticated(
        users.duplicateClaimant,
        "select * from public.claim_church_staff_invitation('35000000-0000-4000-8000-000000001002');",
        true,
      ),
    ).rejects.toThrow(/STAFF_INVITATION_NOT_AVAILABLE/);
    const pending = await db.query<Record<string, unknown>>(`select
      status::text, user_id, accepted_at from public.church_memberships
      where id = '35000000-0000-4000-8000-000000001002';`);
    expect(pending.rows[0]).toEqual({
      status: "invited",
      user_id: null,
      accepted_at: null,
    });
  });

  it("makes Auth deletion fail closed instead of erasing membership history", async () => {
    await expect(
      db.exec(`delete from auth.users where id = '${users.staff}';`),
    ).rejects.toThrow(/foreign key constraint/i);
    const preserved = await db.query<{ count: number }>(`select count(*)::integer count
      from public.church_memberships where id = '${memberships.staff}'
        and user_id = '${users.staff}' and status = 'revoked';`);
    expect(preserved.rows[0]?.count).toBe(1);
  });

  it("denies direct membership writes and keeps the replay ledger private", async () => {
    await expect(
      asAuthenticated(
        users.owner,
        `update public.church_memberships set role = 'staff'
         where id = '${memberships.finance}';`,
        true,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole(
        "service_role",
        `delete from public.church_memberships where id = '${memberships.finance}';`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(users.owner, "select * from public.church_staff_mutation_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.church_staff_mutation_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.church_staff_mutation_requests
        set payload_sha256 = repeat('a', 64)
        where request_id = '${requests.rehire}';`),
    ).rejects.toThrow(/STAFF_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec(`delete from public.church_staff_mutation_requests
        where request_id = '${requests.rehire}';`),
    ).rejects.toThrow(/STAFF_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec("truncate public.church_staff_mutation_requests;"),
    ).rejects.toThrow(/STAFF_LEDGER_APPEND_ONLY/);
  });

  it("rolls back membership, revision, audit, and ledger on a late mutation failure", async () => {
    await db.exec(`
      create function public.p12_force_mutation_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'P12_FORCED_MUTATION_FAILURE'; end;
      $$;
      create trigger p12_force_mutation_failure
      before insert on public.church_staff_mutation_requests
      for each row execute function public.p12_force_mutation_failure();
    `);
    const before = await db.query<Record<string, unknown>>(`select
      (select staff_revision from public.churches
       where id = '${churches.primary}') revision,
      (select count(*)::integer from public.church_memberships
       where church_id = '${churches.primary}') memberships,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.primary}') audits,
      (select count(*)::integer from public.church_staff_mutation_requests
       where church_id = '${churches.primary}') ledgers;`);
    await expect(
      asAuthenticated(
        users.owner,
        mutateStaffSql({
          requestId: requests.lateMutation,
          churchId: churches.primary,
          expectedRevision: 11,
          operation: "invite",
          email: "late-mutation-p12@example.test",
          role: "staff",
        }),
        true,
      ),
    ).rejects.toThrow(/P12_FORCED_MUTATION_FAILURE/);
    const after = await db.query<Record<string, unknown>>(`select
      (select staff_revision from public.churches
       where id = '${churches.primary}') revision,
      (select count(*)::integer from public.church_memberships
       where church_id = '${churches.primary}') memberships,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.primary}') audits,
      (select count(*)::integer from public.church_staff_mutation_requests
       where church_id = '${churches.primary}') ledgers;`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    await db.exec(`
      drop trigger p12_force_mutation_failure
        on public.church_staff_mutation_requests;
      drop function public.p12_force_mutation_failure();
    `);
  });

  it("rolls back invitation activation and revision on a late audit failure", async () => {
    await db.exec(`
      insert into public.church_memberships (
        id, church_id, user_id, invited_email, role, status, invited_by
      ) values (
        '35000000-0000-4000-8000-000000001003', '${churches.primary}', null,
        'late-claim-p12@example.test', 'staff', 'invited', '${users.owner}'
      );
      create function public.p12_force_claim_audit_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'P12_FORCED_CLAIM_FAILURE'; end;
      $$;
      create trigger p12_force_claim_audit_failure
      before insert on public.audit_logs
      for each row execute function public.p12_force_claim_audit_failure();
    `);
    await expect(
      asAuthenticated(
        users.lateClaimant,
        "select * from public.claim_church_staff_invitation('35000000-0000-4000-8000-000000001003');",
        true,
      ),
    ).rejects.toThrow(/P12_FORCED_CLAIM_FAILURE/);
    const state = await db.query<Record<string, unknown>>(`select
      (select staff_revision from public.churches
       where id = '${churches.primary}') revision,
      membership.status::text, membership.user_id, membership.accepted_at
    from public.church_memberships membership
    where membership.id = '35000000-0000-4000-8000-000000001003';`);
    expect(state.rows[0]).toEqual({
      revision: 11,
      status: "invited",
      user_id: null,
      accepted_at: null,
    });
    await db.exec(`
      drop trigger p12_force_claim_audit_failure on public.audit_logs;
      drop function public.p12_force_claim_audit_failure();
    `);
  });
});

describe("P12 staff migration preflight", () => {
  it("rejects duplicate canonical membership emails", async () => {
    const preflight = new PGlite();
    await preflight.waitReady;
    try {
      await installFoundation(preflight, migrations.length - 2);
      await preflight.exec(`
        insert into auth.users (id,email,email_confirmed_at) values
          ('41000000-0000-4000-8000-000000001001','duplicate@example.test',now());
        insert into public.churches (id,name,slug,status)
        values ('42000000-0000-4000-8000-000000001001','Preflight','p12-preflight','active');
        insert into public.church_memberships (
          church_id,user_id,invited_email,role,status
        ) values
          ('42000000-0000-4000-8000-000000001001',
           '41000000-0000-4000-8000-000000001001',null,'owner','active'),
          ('42000000-0000-4000-8000-000000001001',null,
           U&'\\00A0DUPLICATE@example.test\\FEFF','staff','revoked');
      `);
      await preflight.exec(migrations.at(-2)!);
      await expect(preflight.exec(migrations.at(-1)!)).rejects.toThrow(
        /P12_EXISTING_MEMBERSHIP_EMAIL_CONFLICT/,
      );
    } finally {
      await preflight.close();
    }
  }, 40_000);

  it("rejects invalid existing invitation identity", async () => {
    const preflight = new PGlite();
    await preflight.waitReady;
    try {
      await installFoundation(preflight, migrations.length - 2);
      await preflight.exec(`
        insert into public.churches (id,name,slug,status)
        values ('42000000-0000-4000-8000-000000001002','Preflight','p12-preflight-two','active');
        insert into public.church_memberships (
          church_id,invited_email,role,status
        ) values ('42000000-0000-4000-8000-000000001002','not-an-email','staff','invited');
      `);
      await preflight.exec(migrations.at(-2)!);
      await expect(preflight.exec(migrations.at(-1)!)).rejects.toThrow(
        /P12_EXISTING_MEMBERSHIP_EMAIL_UNAVAILABLE/,
      );
    } finally {
      await preflight.close();
    }
  }, 40_000);

  it("backfills a canonical immutable email snapshot for linked legacy users", async () => {
    const preflight = new PGlite();
    await preflight.waitReady;
    try {
      await installFoundation(preflight, migrations.length - 2);
      await preflight.exec(`
        insert into auth.users (id,email,email_confirmed_at)
        values ('41000000-0000-4000-8000-000000001003','Legacy@Example.Test',now());
        insert into public.churches (id,name,slug,status)
        values ('42000000-0000-4000-8000-000000001003','Preflight','p12-preflight-three','active');
        insert into public.church_memberships (
          church_id,user_id,role,status
        ) values ('42000000-0000-4000-8000-000000001003',
          '41000000-0000-4000-8000-000000001003','owner','active');
      `);
      await preflight.exec(migrations.at(-2)!);
      await expect(preflight.exec(migrations.at(-1)!)).resolves.toBeDefined();
      const result = await preflight.query<{ invited_email: string }>(
        "select invited_email from public.church_memberships;",
      );
      expect(result.rows[0]?.invited_email).toBe("legacy@example.test");
    } finally {
      await preflight.close();
    }
  }, 40_000);
});
