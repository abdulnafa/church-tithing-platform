import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "10000000-0000-4000-8000-000000001001",
  otherOwner: "10000000-0000-4000-8000-000000001002",
  staff: "10000000-0000-4000-8000-000000001003",
  inactiveOwner: "10000000-0000-4000-8000-000000001004",
} as const;

const churches = {
  primary: "20000000-0000-4000-8000-000000001001",
  other: "20000000-0000-4000-8000-000000001002",
  suspended: "20000000-0000-4000-8000-000000001003",
} as const;

const funds = {
  campaign: "40000000-0000-4000-8000-000000001001",
  recurring: "40000000-0000-4000-8000-000000001002",
  history: "40000000-0000-4000-8000-000000001003",
  movable: "40000000-0000-4000-8000-000000001004",
  archived: "40000000-0000-4000-8000-000000001005",
  other: "40000000-0000-4000-8000-000000001006",
} as const;

const requests = {
  create: "30000000-0000-4000-8000-000000001001",
  nameConflict: "30000000-0000-4000-8000-000000001002",
  slugConflict: "30000000-0000-4000-8000-000000001003",
  stale: "30000000-0000-4000-8000-000000001004",
  update: "30000000-0000-4000-8000-000000001005",
  setDefault: "30000000-0000-4000-8000-000000001006",
  moveUp: "30000000-0000-4000-8000-000000001007",
  moveDown: "30000000-0000-4000-8000-000000001008",
  boundary: "30000000-0000-4000-8000-000000001009",
  archive: "30000000-0000-4000-8000-000000001010",
  restore: "30000000-0000-4000-8000-000000001011",
  archivedUpdate: "30000000-0000-4000-8000-000000001012",
  forcedFailure: "30000000-0000-4000-8000-000000001013",
  invalid: "30000000-0000-4000-8000-000000001014",
} as const;

const migrationFiles = [
  "202608180001_initial_schema.sql",
  "202609050001_harden_active_profile_authorization.sql",
  "202609050002_staff_permissions_and_audit_foundation.sql",
  "202609050003_provision_church_rpc.sql",
  "202609050004_church_settings_and_logo_storage.sql",
  "202609050005_fund_management.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type FundMutationInput = {
  requestId: string | null;
  churchId: string;
  expectedRevision: number | null;
  operation: string | null;
  fundId?: string | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
};

type FundResult = {
  church_id: string;
  fund_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "active" | "archived";
  is_default: boolean;
  sort_order: number;
  funds_revision: number;
  replayed: boolean;
};

const db = new PGlite();

function sqlLiteral(value: string | null | undefined) {
  return value == null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function mutateFundSql(input: FundMutationInput) {
  return `select * from public.mutate_church_fund(
    fund_request_id => ${sqlLiteral(input.requestId)}::uuid,
    target_church_id => '${input.churchId}'::uuid,
    expected_funds_revision => ${input.expectedRevision ?? "null"}::bigint,
    fund_operation => ${sqlLiteral(input.operation)},
    target_fund_id => ${sqlLiteral(input.fundId)}::uuid,
    fund_name => ${sqlLiteral(input.name)},
    fund_slug => ${sqlLiteral(input.slug)},
    fund_description => ${sqlLiteral(input.description)}
  );`;
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

describe("P10 fund management behavior in PostgreSQL", () => {
  let createdFundId = "";
  let defaultFundId = "";

  beforeAll(async () => {
    await db.waitReady;
    await db.exec(`
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

    for (const migration of migrations) await db.exec(migration);

    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p10@example.test', now(), '{"display_name":"P10 Owner"}'),
        ('${users.otherOwner}', 'other-owner-p10@example.test', now(), '{"display_name":"P10 Other"}'),
        ('${users.staff}', 'staff-p10@example.test', now(), '{"display_name":"P10 Staff"}'),
        ('${users.inactiveOwner}', 'inactive-p10@example.test', now(), '{"display_name":"P10 Inactive"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at
      ) values
        ('${churches.primary}', 'P10 Primary', 'P10 Primary Inc.',
         'p10-primary', 'active', 'BBD', 'America/Barbados',
         'primary-p10@example.test', now()),
        ('${churches.other}', 'P10 Other', 'P10 Other Inc.',
         'p10-other', 'onboarding', 'USD', 'America/Barbados',
         'other-p10@example.test', null),
        ('${churches.suspended}', 'P10 Suspended', 'P10 Suspended Inc.',
         'p10-suspended', 'suspended', 'USD', 'America/Barbados',
         'suspended-p10@example.test', now());

      insert into public.church_memberships (
        church_id, user_id, role, status, accepted_at
      ) values
        ('${churches.primary}', '${users.owner}', 'owner', 'active', now()),
        ('${churches.primary}', '${users.staff}', 'staff', 'active', now()),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active', now()),
        ('${churches.primary}', '${users.inactiveOwner}', 'owner', 'active', now()),
        ('${churches.suspended}', '${users.owner}', 'owner', 'active', now());

      insert into public.funds (
        id, church_id, name, slug, description, status, is_default, sort_order
      ) values
        ('${funds.campaign}', '${churches.primary}', 'Campaign Fund',
         'campaign-fund', 'Open campaign dependency', 'active', false, 2),
        ('${funds.recurring}', '${churches.primary}', 'Recurring Fund',
         'recurring-fund', 'Recurring dependency', 'active', false, 3),
        ('${funds.history}', '${churches.primary}', 'History Fund',
         'history-fund', 'Historical records', 'active', false, 4),
        ('${funds.movable}', '${churches.primary}', 'Movable Fund',
         'movable-fund', null, 'active', false, 5),
        ('${funds.archived}', '${churches.primary}', 'Archived Fund',
         'archived-fund', 'Old category', 'archived', false, 1),
        ('${funds.other}', '${churches.other}', 'Other Fund',
         'other-fund', null, 'active', false, 2);

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, status, currency
      ) values
        ('50000000-0000-4000-8000-000000001001', '${churches.primary}',
         '${funds.campaign}', 'Open Campaign', 'open-campaign', 'draft', 'BBD'),
        ('50000000-0000-4000-8000-000000001002', '${churches.primary}',
         '${funds.history}', 'Closed Campaign', 'closed-campaign', 'closed', 'BBD');

      insert into public.donors (id, church_id, display_name, email)
      values ('60000000-0000-4000-8000-000000001001', '${churches.primary}',
        'Synthetic Donor', 'donor-p10@example.test');

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, supported_currencies
      ) values (
        '70000000-0000-4000-8000-000000001001', '${churches.primary}',
        'mock', 'p10-account', 'active', true, true, true, array['BBD']
      );

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, payment_connection_id,
        amount_minor, currency, frequency, status,
        provider_subscription_reference, started_at, canceled_at
      ) values
        ('80000000-0000-4000-8000-000000001001', '${churches.primary}',
         '60000000-0000-4000-8000-000000001001', '${funds.recurring}',
         '70000000-0000-4000-8000-000000001001', 2500, 'BBD', 'monthly',
         'active', 'p10-active-recurring', now(), null),
        ('80000000-0000-4000-8000-000000001002', '${churches.primary}',
         '60000000-0000-4000-8000-000000001001', '${funds.history}',
         '70000000-0000-4000-8000-000000001001', 1500, 'BBD', 'monthly',
         'canceled', 'p10-canceled-recurring', now(), now());

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status,
        amount_minor, currency, donated_at
      ) values (
        '90000000-0000-4000-8000-000000001001', '${churches.primary}',
        '60000000-0000-4000-8000-000000001001', '${funds.history}',
        'cash', 'succeeded', 5000, 'BBD', now()
      );
    `);

    const defaultResult = await db.query<{ id: string }>(`
      select id from public.funds
      where church_id = '${churches.primary}' and is_default;
    `);
    defaultFundId = defaultResult.rows[0]!.id;
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates revision, canonical, ordering, and private-ledger invariants", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'churches'
         and column_name = 'funds_revision') revision_default,
      (select relrowsecurity from pg_class
       where oid = 'public.church_fund_mutation_requests'::regclass) rls,
      (select relforcerowsecurity from pg_class
       where oid = 'public.church_fund_mutation_requests'::regclass) forced,
      (select count(*)::integer from pg_indexes
       where schemaname = 'public' and indexname in (
         'funds_name_unique_idx', 'funds_active_sort_order_unique_idx',
         'funds_management_order_idx',
         'church_fund_mutation_requests_result_fund_idx'
       )) indexes;`);
    expect(result.rows[0]).toEqual({
      revision_default: "0",
      rls: true,
      forced: true,
      indexes: 4,
    });
  });

  it("returns deterministic active-then-archived funds to readers only", async () => {
    for (const userId of [users.owner, users.staff]) {
      const result = await asAuthenticated<FundResult>(
        userId,
        `select * from public.get_church_funds('${churches.primary}');`,
      );
      expect(result.rows.map((row) => row.sort_order)).toEqual([0, 2, 3, 4, 5, 1]);
      expect(result.rows.map((row) => row.status)).toEqual([
        "active", "active", "active", "active", "active", "archived",
      ]);
      expect(result.rows.every((row) => row.funds_revision === 0)).toBe(true);
    }

    const onboarding = await asAuthenticated<FundResult>(
      users.otherOwner,
      `select * from public.get_church_funds('${churches.other}');`,
    );
    expect(onboarding.rows).toHaveLength(2);

    for (const [userId, churchId] of [
      [users.otherOwner, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.owner, churches.suspended],
    ]) {
      await expect(
        asAuthenticated(
          userId,
          `select * from public.get_church_funds('${churchId}');`,
        ),
      ).rejects.toThrow(/FUNDS_FORBIDDEN/);
    }
    await expect(
      asRole("anon", `select * from public.get_church_funds('${churches.primary}');`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps anonymous visibility active-only and tenant-status scoped", async () => {
    const result = await asRole<{ church_id: string; status: string }>(
      "anon",
      "select church_id, status::text from public.funds order by church_id, sort_order;",
    );
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.church_id === churches.primary)).toBe(true);
    expect(result.rows.every((row) => row.status === "active")).toBe(true);
  });

  it("rejects invalid request, operation, shape, and canonical fields", async () => {
    const invalidCases: Array<[FundMutationInput, RegExp]> = [
      [{ requestId: null, churchId: churches.primary, expectedRevision: 0,
        operation: "create", name: "Valid", slug: "valid" }, /FUNDS_INVALID_REQUEST_ID/],
      [{ requestId: requests.invalid, churchId: churches.primary, expectedRevision: -1,
        operation: "create", name: "Valid", slug: "valid" }, /FUNDS_INVALID_EXPECTED_REVISION/],
      [{ requestId: requests.invalid, churchId: churches.primary, expectedRevision: 0,
        operation: "destroy" }, /FUNDS_INVALID_OPERATION/],
      [{ requestId: requests.invalid, churchId: churches.primary, expectedRevision: 0,
        operation: "set_default", fundId: funds.movable, name: "Unexpected" }, /FUNDS_INVALID_ARGUMENTS/],
      [{ requestId: requests.invalid, churchId: churches.primary, expectedRevision: 0,
        operation: "create", name: "x", slug: "valid" }, /FUNDS_INVALID_NAME/],
      [{ requestId: requests.invalid, churchId: churches.primary, expectedRevision: 0,
        operation: "create", name: "Valid Name", slug: "Not-Canonical" }, /FUNDS_INVALID_SLUG/],
      [{ requestId: requests.invalid, churchId: churches.primary, expectedRevision: 0,
        operation: "create", name: "Valid Name", slug: "valid-name",
        description: "x".repeat(501) }, /FUNDS_INVALID_DESCRIPTION/],
    ];

    for (const [input, expected] of invalidCases) {
      await expect(
        asAuthenticated(users.owner, mutateFundSql(input), true),
      ).rejects.toThrow(expected);
    }

    await expect(
      asAuthenticated(
        users.owner,
        `select * from public.mutate_church_fund(
          '${requests.invalid}', '${churches.primary}', 0, 'create', null,
          E'Valid\\001Name', 'valid-name', null
        );`,
        true,
      ),
    ).rejects.toThrow(/FUNDS_INVALID_NAME/);
  });

  it("creates one canonical appended fund with revision, audit, and ledger", async () => {
    const created = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({
        requestId: requests.create,
        churchId: churches.primary,
        expectedRevision: 0,
        operation: "create",
        name: "\u00a0Mercy\u2003Fund\ufeff",
        slug: "mercy-fund",
        description: "\u00a0Community support\r\nLine two\u2003",
      }),
      true,
    );
    expect(created.rows[0]).toMatchObject({
      name: "Mercy Fund",
      slug: "mercy-fund",
      description: "Community support\nLine two",
      status: "active",
      is_default: false,
      sort_order: 6,
      funds_revision: 1,
      replayed: false,
    });
    createdFundId = created.rows[0]!.fund_id;

    const stored = await db.query<Record<string, unknown>>(`select
      church.funds_revision,
      request.payload_sha256,
      audit.actor_user_id,
      audit.actor_role_snapshot,
      audit.action_code,
      audit.entity_code,
      audit.sanitized_changes::text changes
    from public.churches church
    join public.church_fund_mutation_requests request
      on request.church_id = church.id and request.request_id = '${requests.create}'
    join public.audit_logs audit on audit.id = request.audit_log_id
    where church.id = '${churches.primary}';`);
    expect(stored.rows[0]).toMatchObject({
      funds_revision: 1,
      actor_user_id: users.owner,
      actor_role_snapshot: "owner",
      action_code: "fund_created",
      entity_code: "fund",
    });
    expect(stored.rows[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(stored.rows[0]?.changes as string)).toEqual({
      fund_id: createdFundId,
    });
  });

  it("normalizes name/slug conflicts without creating state", async () => {
    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.nameConflict,
          churchId: churches.primary, expectedRevision: 1, operation: "create",
          name: "mercy fund", slug: "mercy-giving" }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_NAME_CONFLICT/);
    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.slugConflict,
          churchId: churches.primary, expectedRevision: 1, operation: "create",
          name: "Mercy Giving", slug: "mercy-fund" }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_SLUG_CONFLICT/);
  });

  it("replays before CAS and rejects changed reuse or stale new requests", async () => {
    const replay = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.create, churchId: churches.primary,
        expectedRevision: 0, operation: "create", name: "Mercy Fund",
        slug: "mercy-fund", description: "Community support\nLine two" }),
      true,
    );
    expect(replay.rows[0]).toMatchObject({ funds_revision: 1, replayed: true });

    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.create, churchId: churches.primary,
          expectedRevision: 0, operation: "create", name: "Changed",
          slug: "changed" }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.stale, churchId: churches.primary,
          expectedRevision: 0, operation: "update", fundId: createdFundId,
          name: "Stale Change" }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_REVISION_CONFLICT/);
  });

  it("updates only editable values and keeps the internal slug immutable", async () => {
    const updated = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.update, churchId: churches.primary,
        expectedRevision: 1, operation: "update", fundId: createdFundId,
        name: "  Mercy   Outreach ", description: "" }),
      true,
    );
    expect(updated.rows[0]).toMatchObject({
      name: "Mercy Outreach",
      slug: "mercy-fund",
      description: null,
      funds_revision: 2,
    });

    const audit = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id = '${requests.update}';`);
    expect(JSON.parse(audit.rows[0]!.changes)).toEqual({
      fund_id: createdFundId,
      field_names: ["description", "name"],
    });

    await expect(
      db.exec(`update public.funds set slug = 'changed-slug'
        where id = '${createdFundId}';`),
    ).rejects.toThrow(/FUND_SLUG_IMMUTABLE/);
  });

  it("changes the default without rewriting historical or recurring attribution", async () => {
    const result = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.setDefault, churchId: churches.primary,
        expectedRevision: 2, operation: "set_default", fundId: createdFundId }),
      true,
    );
    expect(result.rows[0]).toMatchObject({ is_default: true, funds_revision: 3 });

    const state = await db.query<Record<string, unknown>>(`select
      (select count(*)::integer from public.funds where church_id = '${churches.primary}'
        and is_default and status = 'active') defaults,
      (select fund_id from public.donations
        where id = '90000000-0000-4000-8000-000000001001') donation_fund,
      (select fund_id from public.recurring_gifts
        where id = '80000000-0000-4000-8000-000000001001') recurring_fund;`);
    expect(state.rows[0]).toEqual({
      defaults: 1,
      donation_fund: funds.history,
      recurring_fund: funds.recurring,
    });
  });

  it("moves active funds against their adjacent sparse-order neighbor only", async () => {
    const up = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.moveUp, churchId: churches.primary,
        expectedRevision: 3, operation: "move_up", fundId: createdFundId }),
      true,
    );
    expect(up.rows[0]).toMatchObject({ sort_order: 5, funds_revision: 4 });

    const down = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.moveDown, churchId: churches.primary,
        expectedRevision: 4, operation: "move_down", fundId: createdFundId }),
      true,
    );
    expect(down.rows[0]).toMatchObject({ sort_order: 6, funds_revision: 5 });

    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.boundary, churchId: churches.primary,
          expectedRevision: 5, operation: "move_up", fundId: defaultFundId }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_ORDER_BOUNDARY/);
    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.boundary, churchId: churches.primary,
          expectedRevision: 5, operation: "move_up", fundId: funds.archived }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_NOT_ACTIVE/);
  });

  it("blocks unsafe archives but preserves donation history and restores by appending", async () => {
    for (const [fundId, expected] of [
      [createdFundId, /FUNDS_DEFAULT_REQUIRED/],
      [funds.campaign, /FUNDS_OPEN_CAMPAIGNS/],
      [funds.recurring, /FUNDS_ACTIVE_RECURRING_GIFTS/],
    ] as const) {
      await expect(
        asAuthenticated(
          users.owner,
          mutateFundSql({ requestId: requests.invalid, churchId: churches.primary,
            expectedRevision: 5, operation: "archive", fundId }),
          true,
        ),
      ).rejects.toThrow(expected);
    }

    const archived = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.archive, churchId: churches.primary,
        expectedRevision: 5, operation: "archive", fundId: funds.history }),
      true,
    );
    expect(archived.rows[0]).toMatchObject({
      status: "archived", funds_revision: 6, replayed: false,
    });
    const donation = await db.query<{ fund_id: string }>(`
      select fund_id from public.donations
      where id = '90000000-0000-4000-8000-000000001001';
    `);
    expect(donation.rows[0]?.fund_id).toBe(funds.history);

    const restored = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.restore, churchId: churches.primary,
        expectedRevision: 6, operation: "restore", fundId: funds.history }),
      true,
    );
    expect(restored.rows[0]).toMatchObject({
      status: "active", is_default: false, sort_order: 7, funds_revision: 7,
    });
    const audit = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id = '${requests.restore}';`);
    expect(JSON.parse(audit.rows[0]!.changes)).toEqual({
      fund_id: funds.history,
      field_names: ["sort_order", "status"],
    });
  });

  it("allows archived metadata edits while keeping restore explicit", async () => {
    const updated = await asAuthenticated<FundResult>(
      users.owner,
      mutateFundSql({ requestId: requests.archivedUpdate,
        churchId: churches.primary, expectedRevision: 7, operation: "update",
        fundId: funds.archived, name: "Archived Legacy", description: null }),
      true,
    );
    expect(updated.rows[0]).toMatchObject({
      status: "archived", name: "Archived Legacy", funds_revision: 8,
    });

    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.invalid, churchId: churches.primary,
          expectedRevision: 8, operation: "restore", fundId: funds.movable }),
        true,
      ),
    ).rejects.toThrow(/FUNDS_NOT_ARCHIVED/);
  });

  it("keeps mutations owner-only, tenant-scoped, and direct DML closed", async () => {
    for (const [userId, churchId] of [
      [users.staff, churches.primary],
      [users.otherOwner, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.owner, churches.suspended],
    ]) {
      await expect(
        asAuthenticated(
          userId,
          mutateFundSql({ requestId: requests.invalid, churchId,
            expectedRevision: 8, operation: "update", fundId: funds.movable,
            name: "Forbidden" }),
          true,
        ),
      ).rejects.toThrow(/FUNDS_FORBIDDEN/);
    }

    await expect(
      asAuthenticated(users.owner, `delete from public.funds
        where id = '${funds.movable}';`, true),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(users.owner, `insert into public.funds
        (church_id, name, slug) values
        ('${churches.primary}', 'Direct', 'direct');`, true),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps the ledger private, forced-RLS, and append-only", async () => {
    await expect(
      asAuthenticated(users.owner, "select * from public.church_fund_mutation_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.church_fund_mutation_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.church_fund_mutation_requests
        set payload_sha256 = repeat('a', 64)
        where request_id = '${requests.create}';`),
    ).rejects.toThrow(/FUNDS_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec(`delete from public.church_fund_mutation_requests
        where request_id = '${requests.create}';`),
    ).rejects.toThrow(/FUNDS_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec("truncate public.church_fund_mutation_requests;"),
    ).rejects.toThrow(/FUNDS_LEDGER_APPEND_ONLY/);
  });

  it("rolls back fund, revision, audit, and ledger after a forced late failure", async () => {
    await db.exec(`
      create function public.p10_force_late_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'P10_FORCED_LATE_FAILURE'; end;
      $$;
      create trigger p10_force_late_failure
      before insert on public.church_fund_mutation_requests
      for each row execute function public.p10_force_late_failure();
    `);
    const before = await db.query<Record<string, unknown>>(`select
      (select funds_revision from public.churches
       where id = '${churches.primary}') revision,
      (select name from public.funds where id = '${funds.movable}') name,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.primary}') audits,
      (select count(*)::integer from public.church_fund_mutation_requests
       where church_id = '${churches.primary}') ledgers;`);

    await expect(
      asAuthenticated(
        users.owner,
        mutateFundSql({ requestId: requests.forcedFailure,
          churchId: churches.primary, expectedRevision: 8, operation: "update",
          fundId: funds.movable, name: "Must Roll Back" }),
        true,
      ),
    ).rejects.toThrow(/P10_FORCED_LATE_FAILURE/);

    const after = await db.query<Record<string, unknown>>(`select
      (select funds_revision from public.churches
       where id = '${churches.primary}') revision,
      (select name from public.funds where id = '${funds.movable}') name,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.primary}') audits,
      (select count(*)::integer from public.church_fund_mutation_requests
       where church_id = '${churches.primary}') ledgers;`);
    expect(after.rows[0]).toEqual(before.rows[0]);

    await db.exec(`
      drop trigger p10_force_late_failure
        on public.church_fund_mutation_requests;
      drop function public.p10_force_late_failure();
    `);
  });
});
