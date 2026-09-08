import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "11000000-0000-4000-8000-000000001001",
  otherOwner: "11000000-0000-4000-8000-000000001002",
  staff: "11000000-0000-4000-8000-000000001003",
  finance: "11000000-0000-4000-8000-000000001004",
  inactiveOwner: "11000000-0000-4000-8000-000000001005",
} as const;

const churches = {
  primary: "12000000-0000-4000-8000-000000001001",
  empty: "12000000-0000-4000-8000-000000001002",
  other: "12000000-0000-4000-8000-000000001003",
  suspended: "12000000-0000-4000-8000-000000001004",
} as const;

const funds = {
  active: "14000000-0000-4000-8000-000000001001",
  archived: "14000000-0000-4000-8000-000000001002",
  other: "14000000-0000-4000-8000-000000001003",
} as const;

const campaigns = {
  draft: "15000000-0000-4000-8000-000000001001",
  active: "15000000-0000-4000-8000-000000001002",
  recurring: "15000000-0000-4000-8000-000000001003",
  closed: "15000000-0000-4000-8000-000000001004",
  archived: "15000000-0000-4000-8000-000000001005",
  endedDraft: "15000000-0000-4000-8000-000000001006",
  other: "15000000-0000-4000-8000-000000001007",
} as const;

const requests = {
  create: "13000000-0000-4000-8000-000000001001",
  update: "13000000-0000-4000-8000-000000001002",
  activate: "13000000-0000-4000-8000-000000001003",
  close: "13000000-0000-4000-8000-000000001004",
  archive: "13000000-0000-4000-8000-000000001005",
  restore: "13000000-0000-4000-8000-000000001006",
  invalid: "13000000-0000-4000-8000-000000001099",
  forcedFailure: "13000000-0000-4000-8000-000000001098",
} as const;

const migrationFiles = [
  "202608180001_initial_schema.sql",
  "202609050001_harden_active_profile_authorization.sql",
  "202609050002_staff_permissions_and_audit_foundation.sql",
  "202609050003_provision_church_rpc.sql",
  "202609050004_church_settings_and_logo_storage.sql",
  "202609050005_fund_management.sql",
  "202609050006_campaign_management.sql",
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

type CampaignMutationInput = {
  requestId: string | null;
  churchId: string;
  expectedRevision: number | null;
  operation: string | null;
  campaignId?: string | null;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  fundId?: string | null;
  goalText?: string | null;
};

type CampaignResult = {
  church_id: string;
  campaign_id: string;
  fund_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "active" | "closed" | "archived";
  goal_amount_minor_text: string | null;
  currency: string;
  starts_at: string | null;
  ends_at: string | null;
  campaigns_revision: number;
  replayed: boolean;
};

const db = new PGlite();

async function createPreP11Database() {
  const preflightDb = new PGlite();
  await preflightDb.waitReady;
  await preflightDb.exec(`
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
  for (const migration of migrations.slice(0, -1)) {
    await preflightDb.exec(migration);
  }
  return preflightDb;
}

function sqlLiteral(value: string | null | undefined) {
  return value == null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function mutateCampaignSql(input: CampaignMutationInput) {
  return `select * from public.mutate_church_campaign(
    campaign_request_id => ${sqlLiteral(input.requestId)}::uuid,
    target_church_id => '${input.churchId}'::uuid,
    expected_campaigns_revision => ${input.expectedRevision ?? "null"}::bigint,
    campaign_operation => ${sqlLiteral(input.operation)},
    target_campaign_id => ${sqlLiteral(input.campaignId)}::uuid,
    campaign_name => ${sqlLiteral(input.name)},
    campaign_slug => ${sqlLiteral(input.slug)},
    campaign_description => ${sqlLiteral(input.description)},
    campaign_fund_id => ${sqlLiteral(input.fundId)}::uuid,
    campaign_goal_amount_minor_text => ${sqlLiteral(input.goalText)}
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

describe("P11 campaign management behavior in PostgreSQL", () => {
  let createdCampaignId = "";

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
        ('${users.owner}', 'owner-p11@example.test', now(), '{"display_name":"P11 Owner"}'),
        ('${users.otherOwner}', 'other-p11@example.test', now(), '{"display_name":"P11 Other"}'),
        ('${users.staff}', 'staff-p11@example.test', now(), '{"display_name":"P11 Staff"}'),
        ('${users.finance}', 'finance-p11@example.test', now(), '{"display_name":"P11 Finance"}'),
        ('${users.inactiveOwner}', 'inactive-p11@example.test', now(), '{"display_name":"P11 Inactive"}');

      update public.profiles set is_active = false
      where id = '${users.inactiveOwner}';

      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        support_email, activated_at
      ) values
        ('${churches.primary}', 'P11 Primary', 'P11 Primary Inc.',
         'p11-primary', 'active', 'BBD', 'America/Barbados',
         'primary-p11@example.test', now()),
        ('${churches.empty}', 'P11 Empty', 'P11 Empty Inc.',
         'p11-empty', 'active', 'BBD', 'America/Barbados',
         'empty-p11@example.test', now()),
        ('${churches.other}', 'P11 Other', 'P11 Other Inc.',
         'p11-other', 'onboarding', 'USD', 'America/New_York',
         'other-p11@example.test', null),
        ('${churches.suspended}', 'P11 Suspended', 'P11 Suspended Inc.',
         'p11-suspended', 'suspended', 'BBD', 'America/Barbados',
         'suspended-p11@example.test', now());

      insert into public.church_memberships (church_id, user_id, role, status)
      values
        ('${churches.primary}', '${users.owner}', 'owner', 'active'),
        ('${churches.primary}', '${users.staff}', 'staff', 'active'),
        ('${churches.primary}', '${users.finance}', 'finance_admin', 'active'),
        ('${churches.primary}', '${users.inactiveOwner}', 'owner', 'active'),
        ('${churches.empty}', '${users.owner}', 'owner', 'active'),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active'),
        ('${churches.suspended}', '${users.owner}', 'owner', 'active');

      insert into public.funds (
        id, church_id, name, slug, description, status, is_default, sort_order
      ) values
        ('${funds.active}', '${churches.primary}', 'Campaigns', 'campaigns',
         'Campaign route', 'active', false, 1),
        ('${funds.archived}', '${churches.primary}', 'Legacy', 'legacy',
         null, 'archived', false, 2),
        ('${funds.other}', '${churches.other}', 'Other Campaigns',
         'other-campaigns', null, 'active', false, 1);

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, description, status,
        goal_amount_minor, currency, ends_at
      ) values
        ('${campaigns.draft}', '${churches.primary}', '${funds.active}',
         'Draft Appeal', 'draft-appeal', 'Draft', 'draft', 500000, 'BBD', null),
        ('${campaigns.active}', '${churches.primary}', '${funds.active}',
         'Active Appeal', 'active-appeal', 'Active', 'active', 1000000, 'BBD', null),
        ('${campaigns.recurring}', '${churches.primary}', '${funds.active}',
         'Recurring Appeal', 'recurring-appeal', null, 'active', null, 'BBD', null),
        ('${campaigns.closed}', '${churches.primary}', '${funds.active}',
         'Closed Appeal', 'closed-appeal', null, 'closed', null, 'BBD', null),
        ('${campaigns.archived}', '${churches.primary}', '${funds.active}',
         'Archived Appeal', 'archived-appeal', null, 'archived', null, 'BBD', null),
        ('${campaigns.endedDraft}', '${churches.primary}', '${funds.active}',
         'Ended Draft', 'ended-draft', null, 'draft', null, 'BBD', '2020-01-01Z'),
        ('${campaigns.other}', '${churches.other}', '${funds.other}',
         'Other Appeal', 'other-appeal', null, 'draft', null, 'USD', null);

      insert into public.donors (id, church_id, display_name, email)
      values ('16000000-0000-4000-8000-000000001001', '${churches.primary}',
        'P11 Donor', 'donor-p11@example.test');
      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status,
        is_primary, charges_enabled, recurring_enabled, supported_currencies
      ) values (
        '17000000-0000-4000-8000-000000001001', '${churches.primary}',
        'mock', 'p11-account', 'active', true, true, true, array['BBD']
      );
      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, campaign_id, payment_connection_id,
        amount_minor, currency, frequency, status,
        provider_subscription_reference, started_at
      ) values (
        '18000000-0000-4000-8000-000000001001', '${churches.primary}',
        '16000000-0000-4000-8000-000000001001', '${funds.active}',
        '${campaigns.recurring}', '17000000-0000-4000-8000-000000001001',
        2500, 'BBD', 'monthly', 'active', 'p11-recurring', now()
      );

      insert into public.donations (
        id, church_id, donor_id, fund_id, campaign_id,
        payment_connection_id, source, status, amount_minor,
        refunded_amount_minor, currency, external_idempotency_key,
        donated_at, refunded_at
      ) values
        ('19000000-0000-4000-8000-000000001001', '${churches.primary}',
         '16000000-0000-4000-8000-000000001001', '${funds.active}',
         '${campaigns.active}', '17000000-0000-4000-8000-000000001001',
         'online', 'succeeded', 1000, 0, 'BBD', 'p11-success', now(), null),
        ('19000000-0000-4000-8000-000000001002', '${churches.primary}',
         '16000000-0000-4000-8000-000000001001', '${funds.active}',
         '${campaigns.active}', '17000000-0000-4000-8000-000000001001',
         'online', 'partially_refunded', 1000, 200, 'BBD', 'p11-partial',
         now(), now()),
        ('19000000-0000-4000-8000-000000001003', '${churches.primary}',
         '16000000-0000-4000-8000-000000001001', '${funds.active}',
         '${campaigns.active}', '17000000-0000-4000-8000-000000001001',
         'online', 'refunded', 1000, 1000, 'BBD', 'p11-refunded', now(), now()),
        ('19000000-0000-4000-8000-000000001004', '${churches.primary}',
         '16000000-0000-4000-8000-000000001001', '${funds.active}',
         '${campaigns.active}', '17000000-0000-4000-8000-000000001001',
         'online', 'disputed', 1000, 0, 'BBD', 'p11-disputed', now(), null),
        ('19000000-0000-4000-8000-000000001005', '${churches.primary}',
         '16000000-0000-4000-8000-000000001001', '${funds.active}',
         '${campaigns.active}', null, 'cash', 'succeeded', 5000, 0, 'BBD',
         null, now(), null),
        ('19000000-0000-4000-8000-000000001006', '${churches.primary}',
         '16000000-0000-4000-8000-000000001001', '${funds.active}',
         '${campaigns.active}', '17000000-0000-4000-8000-000000001001',
         'online', 'pending', 9000, 0, 'BBD', 'p11-pending', null, null);
    `);
  }, 40_000);

  afterAll(async () => {
    await db.close();
  });

  it("creates the revision, private ledger, and aligned progress index", async () => {
    const result = await db.query<Record<string, unknown>>(`select
      (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'churches'
         and column_name = 'campaigns_revision') revision_default,
      (select relrowsecurity from pg_class
       where oid = 'public.church_campaign_mutation_requests'::regclass) rls,
      (select relforcerowsecurity from pg_class
       where oid = 'public.church_campaign_mutation_requests'::regclass) forced,
      (select count(*)::integer from pg_indexes where schemaname = 'public'
       and indexname in ('campaigns_name_unique_idx',
         'donations_campaign_progress_idx',
         'church_campaign_mutation_requests_result_campaign_idx',
         'church_campaign_mutation_requests_result_fund_idx')) indexes;`);
    expect(result.rows[0]).toEqual({
      revision_default: "0",
      rls: true,
      forced: true,
      indexes: 4,
    });
  });

  it("returns one atomic empty snapshot with its authoritative revision", async () => {
    const result = await asAuthenticated<{
      church_id: string;
      campaigns_revision: number;
      campaign_count: number;
      campaigns_json: unknown[];
    }>(users.owner, `select
      (snapshot).church_id,
      (snapshot).campaigns_revision,
      cardinality((snapshot).campaigns) as campaign_count,
      to_jsonb((snapshot).campaigns) as campaigns_json
    from (select public.get_church_campaigns('${churches.empty}') snapshot) q;`);
    expect(result.rows[0]).toEqual({
      church_id: churches.empty,
      campaigns_revision: 0,
      campaign_count: 0,
      campaigns_json: [],
    });
  });

  it("returns deterministic config to campaign readers without progress", async () => {
    for (const userId of [users.owner, users.staff]) {
      const result = await asAuthenticated<{ campaigns: unknown[] }>(
        userId,
        `select to_jsonb((public.get_church_campaigns('${churches.primary}')).campaigns)
          as campaigns;`,
      );
      const rows = result.rows[0]!.campaigns as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(6);
      expect(rows.map((row) => row.status)).toEqual([
        "draft", "draft", "active", "active", "closed", "archived",
      ]);
      expect(rows[0]).toHaveProperty("goal_amount_minor_text");
      expect(JSON.stringify(rows)).not.toContain("raised_amount_minor");
    }

    await expect(
      asAuthenticated(
        users.otherOwner,
        `select public.get_church_campaigns('${churches.primary}');`,
      ),
    ).rejects.toThrow(/CAMPAIGNS_FORBIDDEN/);
    await expect(
      asAuthenticated(
        users.inactiveOwner,
        `select public.get_church_campaigns('${churches.primary}');`,
      ),
    ).rejects.toThrow(/CAMPAIGNS_FORBIDDEN/);
    await expect(
      asAuthenticated(
        users.owner,
        `select public.get_church_campaigns('${churches.suspended}');`,
      ),
    ).rejects.toThrow(/CAMPAIGNS_FORBIDDEN/);
  });

  it("calculates online finalized progress and protects it from staff", async () => {
    for (const userId of [users.owner, users.finance]) {
      const result = await asAuthenticated<{
        raised_amount_minor_text: string;
        eligible_donation_count_text: string;
      }>(userId, `select raised_amount_minor_text, eligible_donation_count_text
        from public.get_church_campaign_progress('${churches.primary}')
        where campaign_id = '${campaigns.active}';`);
      expect(result.rows[0]).toEqual({
        raised_amount_minor_text: "1800",
        eligible_donation_count_text: "2",
      });
    }
    await expect(
      asAuthenticated(
        users.staff,
        `select * from public.get_church_campaign_progress('${churches.primary}');`,
      ),
    ).rejects.toThrow(/CAMPAIGNS_FORBIDDEN/);
    for (const [userId, churchId] of [
      [users.otherOwner, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.owner, churches.suspended],
    ]) {
      await expect(
        asAuthenticated(
          userId,
          `select * from public.get_church_campaign_progress('${churchId}');`,
        ),
      ).rejects.toThrow(/CAMPAIGNS_FORBIDDEN/);
    }
    await expect(
      asRole(
        "anon",
        `select * from public.get_church_campaign_progress('${churches.primary}');`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("rejects invalid shapes, canonical text, and unsafe goals", async () => {
    const cases: Array<[CampaignMutationInput, RegExp]> = [
      [{ requestId: null, churchId: churches.primary, expectedRevision: 0,
        operation: "create", name: "Valid", slug: "valid", fundId: funds.active },
      /CAMPAIGNS_INVALID_REQUEST_ID/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: -1, operation: "create", name: "Valid", slug: "valid",
        fundId: funds.active }, /CAMPAIGNS_INVALID_EXPECTED_REVISION/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "destroy" }, /CAMPAIGNS_INVALID_OPERATION/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "create", name: "x", slug: "valid",
        fundId: funds.active }, /CAMPAIGNS_INVALID_NAME/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "create", name: "Valid", slug: "Bad Slug",
        fundId: funds.active }, /CAMPAIGNS_INVALID_SLUG/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "create", name: "Valid", slug: "valid",
        description: "x".repeat(1001), fundId: funds.active },
      /CAMPAIGNS_INVALID_DESCRIPTION/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "create", name: "Valid", slug: "valid",
        fundId: funds.active, goalText: "01" }, /CAMPAIGNS_INVALID_GOAL/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "create", name: "Valid", slug: "valid",
        fundId: funds.active, goalText: "9007199254740992" },
      /CAMPAIGNS_INVALID_GOAL/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 0, operation: "activate", campaignId: campaigns.draft,
        name: "Unexpected" }, /CAMPAIGNS_INVALID_ARGUMENTS/],
    ];
    for (const [input, expected] of cases) {
      await expect(
        asAuthenticated(users.owner, mutateCampaignSql(input), true),
      ).rejects.toThrow(expected);
    }
  });

  it("creates one canonical draft with null date/image and exact replay state", async () => {
    const created = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({
        requestId: requests.create,
        churchId: churches.primary,
        expectedRevision: 0,
        operation: "create",
        name: "\u00a0Mercy\u2003Appeal\ufeff",
        slug: "mercy-appeal",
        description: "\u00a0Community help\r\nLine two\u2003",
        fundId: funds.active,
        goalText: "9007199254740991",
      }),
      true,
    );
    expect(created.rows[0]).toMatchObject({
      name: "Mercy Appeal",
      slug: "mercy-appeal",
      description: "Community help\nLine two",
      status: "draft",
      goal_amount_minor_text: "9007199254740991",
      currency: "BBD",
      starts_at: null,
      ends_at: null,
      campaigns_revision: 1,
      replayed: false,
    });
    createdCampaignId = created.rows[0]!.campaign_id;

    const state = await db.query<Record<string, unknown>>(`select
      campaign.image_url,
      request.payload_sha256,
      audit.action_code,
      audit.entity_code,
      audit.sanitized_changes::text changes
    from public.campaigns campaign
    join public.church_campaign_mutation_requests request
      on request.result_campaign_id = campaign.id
    join public.audit_logs audit on audit.id = request.audit_log_id
    where campaign.id = '${createdCampaignId}';`);
    expect(state.rows[0]).toMatchObject({
      image_url: null,
      action_code: "campaign_created",
      entity_code: "campaign",
    });
    expect(state.rows[0]?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(state.rows[0]?.changes as string)).toEqual({
      campaign_id: createdCampaignId,
    });
  });

  it("replays before CAS and rejects changed reuse or stale new requests", async () => {
    const replay = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({
        requestId: requests.create,
        churchId: churches.primary,
        expectedRevision: 0,
        operation: "create",
        name: "Mercy Appeal",
        slug: "mercy-appeal",
        description: "Community help\nLine two",
        fundId: funds.active,
        goalText: "9007199254740991",
      }),
      true,
    );
    expect(replay.rows[0]).toMatchObject({ campaigns_revision: 1, replayed: true });
    await expect(
      asAuthenticated(
        users.owner,
        mutateCampaignSql({ requestId: requests.create,
          churchId: churches.primary, expectedRevision: 0, operation: "create",
          name: "Changed", slug: "changed", fundId: funds.active }),
        true,
      ),
    ).rejects.toThrow(/CAMPAIGNS_IDEMPOTENCY_CONFLICT/);
    await expect(
      asAuthenticated(
        users.owner,
        mutateCampaignSql({ requestId: requests.invalid,
          churchId: churches.primary, expectedRevision: 0, operation: "update",
          campaignId: createdCampaignId, name: "Stale", fundId: funds.active }),
        true,
      ),
    ).rejects.toThrow(/CAMPAIGNS_REVISION_CONFLICT/);
  });

  it("updates draft copy and goal only while preserving the immutable route", async () => {
    const updated = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({ requestId: requests.update, churchId: churches.primary,
        expectedRevision: 1, operation: "update", campaignId: createdCampaignId,
        name: " Mercy   Outreach ", description: "", fundId: funds.active,
        goalText: null }),
      true,
    );
    expect(updated.rows[0]).toMatchObject({
      name: "Mercy Outreach",
      slug: "mercy-appeal",
      description: null,
      goal_amount_minor_text: null,
      campaigns_revision: 2,
    });
    const audit = await db.query<{ changes: string }>(`select
      sanitized_changes::text changes from public.audit_logs
      where request_id = '${requests.update}';`);
    expect(JSON.parse(audit.rows[0]!.changes)).toEqual({
      campaign_id: createdCampaignId,
      field_names: ["description", "goal_amount_minor", "name"],
    });

    await expect(
      asAuthenticated(
        users.owner,
        mutateCampaignSql({ requestId: requests.invalid,
          churchId: churches.primary, expectedRevision: 2, operation: "update",
          campaignId: createdCampaignId, name: "Mercy Outreach",
          fundId: funds.archived }),
        true,
      ),
    ).rejects.toThrow(/CAMPAIGNS_INVALID_ARGUMENTS/);
  });

  it("activates, manually closes, archives, and restores only to closed", async () => {
    const activate = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({ requestId: requests.activate,
        churchId: churches.primary, expectedRevision: 2, operation: "activate",
        campaignId: createdCampaignId }),
      true,
    );
    expect(activate.rows[0]).toMatchObject({ status: "active", campaigns_revision: 3 });

    const close = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({ requestId: requests.close,
        churchId: churches.primary, expectedRevision: 3, operation: "close",
        campaignId: createdCampaignId }),
      true,
    );
    expect(close.rows[0]).toMatchObject({ status: "closed", campaigns_revision: 4 });

    const archive = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({ requestId: requests.archive,
        churchId: churches.primary, expectedRevision: 4, operation: "archive",
        campaignId: createdCampaignId }),
      true,
    );
    expect(archive.rows[0]).toMatchObject({ status: "archived", campaigns_revision: 5 });

    const restore = await asAuthenticated<CampaignResult>(
      users.owner,
      mutateCampaignSql({ requestId: requests.restore,
        churchId: churches.primary, expectedRevision: 5, operation: "restore",
        campaignId: createdCampaignId }),
      true,
    );
    expect(restore.rows[0]).toMatchObject({ status: "closed", campaigns_revision: 6 });
  });

  it("blocks frozen edits, invalid transitions, recurrence, and ended legacy activation", async () => {
    const failures: Array<[CampaignMutationInput, RegExp]> = [
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 6, operation: "update", campaignId: campaigns.active,
        name: "Changed", fundId: funds.active }, /CAMPAIGNS_NOT_DRAFT/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 6, operation: "activate", campaignId: campaigns.active },
      /CAMPAIGNS_NOT_DRAFT/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 6, operation: "close", campaignId: campaigns.recurring },
      /CAMPAIGNS_ACTIVE_RECURRING_GIFTS/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 6, operation: "archive", campaignId: campaigns.active },
      /CAMPAIGNS_NOT_CLOSED/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 6, operation: "restore", campaignId: campaigns.closed },
      /CAMPAIGNS_NOT_ARCHIVED/],
      [{ requestId: requests.invalid, churchId: churches.primary,
        expectedRevision: 6, operation: "activate", campaignId: campaigns.endedDraft },
      /CAMPAIGNS_WINDOW_ENDED/],
    ];
    for (const [input, expected] of failures) {
      await expect(
        asAuthenticated(users.owner, mutateCampaignSql(input), true),
      ).rejects.toThrow(expected);
    }
  });

  it("enforces immutable slug, fund, currency, image, and dates for trusted DML", async () => {
    for (const [assignment, expected] of [
      ["slug = 'changed'", /CAMPAIGN_SLUG_IMMUTABLE/],
      [`fund_id = '${funds.archived}'`, /CAMPAIGN_FUND_IMMUTABLE/],
      ["currency = 'USD'", /CAMPAIGN_CURRENCY_IMMUTABLE/],
      ["image_url = 'https://example.test/image.webp'", /CAMPAIGN_IMAGE_IMMUTABLE/],
      ["starts_at = now()", /CAMPAIGN_DATES_IMMUTABLE/],
    ] as const) {
      await expect(
        db.exec(`update public.campaigns set ${assignment}
          where id = '${campaigns.draft}';`),
      ).rejects.toThrow(expected);
    }
    await expect(
      db.exec(`insert into public.campaigns
        (church_id, fund_id, name, slug, status, currency)
        values ('${churches.primary}', '${funds.archived}', 'Bad Route',
          'bad-route', 'draft', 'BBD');`),
    ).rejects.toThrow(/CAMPAIGN_ROUTE_INVALID/);
  });

  it("keeps mutations owner-only and direct authenticated DML closed", async () => {
    for (const [userId, churchId] of [
      [users.staff, churches.primary],
      [users.finance, churches.primary],
      [users.otherOwner, churches.primary],
      [users.inactiveOwner, churches.primary],
      [users.owner, churches.suspended],
    ]) {
      await expect(
        asAuthenticated(
          userId,
          mutateCampaignSql({ requestId: requests.invalid, churchId,
            expectedRevision: 6, operation: "activate",
            campaignId: campaigns.draft }),
          true,
        ),
      ).rejects.toThrow(/CAMPAIGNS_FORBIDDEN/);
    }
    await expect(
      asAuthenticated(users.owner, `update public.campaigns set name = 'Direct'
        where id = '${campaigns.draft}';`, true),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(users.owner, "select created_by from public.campaigns;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", `update public.campaigns set status = 'active'
        where id = '${campaigns.draft}' returning id;`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("prevents a canceled recurring plan from reactivating after campaign close", async () => {
    const canceledRecurringId = "18000000-0000-4000-8000-000000001002";
    await db.exec(`insert into public.recurring_gifts (
      id, church_id, donor_id, fund_id, campaign_id, payment_connection_id,
      amount_minor, currency, frequency, status,
      provider_subscription_reference, started_at, canceled_at
    ) values (
      '${canceledRecurringId}', '${churches.primary}',
      '16000000-0000-4000-8000-000000001001', '${funds.active}',
      '${campaigns.closed}', '17000000-0000-4000-8000-000000001001',
      2500, 'BBD', 'monthly', 'canceled', 'p11-canceled-recurring',
      now(), now()
    );`);
    await expect(
      db.exec(`update public.recurring_gifts
        set status = 'active', canceled_at = null
        where id = '${canceledRecurringId}';`),
    ).rejects.toThrow(/RECURRING_CAMPAIGN_NOT_ACTIVE/);
    await db.exec(`update public.recurring_gifts set cancel_reason = 'remains-canceled'
      where id = '${canceledRecurringId}';`);
  });

  it("reruns the seed after a seeded campaign and its fund are archived", async () => {
    const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
    await db.exec(seed);
    await db.exec(`
      update public.campaigns set status = 'archived'
      where id = '10000000-0000-4000-8000-000000000201';
      update public.funds set status = 'archived', is_default = false
      where id = '10000000-0000-4000-8000-000000000103';
    `);
    await expect(db.exec(seed)).resolves.toBeDefined();
    const state = await db.query<{ campaign_status: string; fund_status: string }>(`
      select
        (select status::text from public.campaigns
         where id = '10000000-0000-4000-8000-000000000201') campaign_status,
        (select status::text from public.funds
         where id = '10000000-0000-4000-8000-000000000103') fund_status;
    `);
    expect(state.rows[0]).toEqual({
      campaign_status: "archived",
      fund_status: "archived",
    });
  });

  it("keeps the replay ledger private and append-only", async () => {
    await expect(
      asAuthenticated(users.owner, "select * from public.church_campaign_mutation_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.church_campaign_mutation_requests;"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.church_campaign_mutation_requests
        set payload_sha256 = repeat('a', 64)
        where request_id = '${requests.create}';`),
    ).rejects.toThrow(/CAMPAIGNS_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec(`delete from public.church_campaign_mutation_requests
        where request_id = '${requests.create}';`),
    ).rejects.toThrow(/CAMPAIGNS_LEDGER_APPEND_ONLY/);
    await expect(
      db.exec("truncate public.church_campaign_mutation_requests;"),
    ).rejects.toThrow(/CAMPAIGNS_LEDGER_APPEND_ONLY/);
  });

  it("rolls back campaign, revision, audit, and ledger on a late failure", async () => {
    await db.exec(`
      create function public.p11_force_late_failure()
      returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'P11_FORCED_LATE_FAILURE'; end;
      $$;
      create trigger p11_force_late_failure
      before insert on public.church_campaign_mutation_requests
      for each row execute function public.p11_force_late_failure();
    `);
    const before = await db.query<Record<string, unknown>>(`select
      (select campaigns_revision from public.churches
       where id = '${churches.primary}') revision,
      (select status::text from public.campaigns
       where id = '${campaigns.closed}') status,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.primary}') audits,
      (select count(*)::integer from public.church_campaign_mutation_requests
       where church_id = '${churches.primary}') ledgers;`);

    await expect(
      asAuthenticated(
        users.owner,
        mutateCampaignSql({ requestId: requests.forcedFailure,
          churchId: churches.primary, expectedRevision: 6,
          operation: "archive", campaignId: campaigns.closed }),
        true,
      ),
    ).rejects.toThrow(/P11_FORCED_LATE_FAILURE/);

    const after = await db.query<Record<string, unknown>>(`select
      (select campaigns_revision from public.churches
       where id = '${churches.primary}') revision,
      (select status::text from public.campaigns
       where id = '${campaigns.closed}') status,
      (select count(*)::integer from public.audit_logs
       where church_id = '${churches.primary}') audits,
      (select count(*)::integer from public.church_campaign_mutation_requests
       where church_id = '${churches.primary}') ledgers;`);
    expect(after.rows[0]).toEqual(before.rows[0]);

    await db.exec(`
      drop trigger p11_force_late_failure
        on public.church_campaign_mutation_requests;
      drop function public.p11_force_late_failure();
    `);
  });
});

describe("P11 campaign migration preflight", () => {
  it.each([
    {
      setup: `insert into public.churches (id,name,slug,default_currency)
        values ('21000000-0000-4000-8000-000000001001','Preflight','preflight-one','BBD');
        insert into public.funds(id,church_id,name,slug,status,sort_order)
        values ('22000000-0000-4000-8000-000000001001','21000000-0000-4000-8000-000000001001','Route','route','active',1);
        insert into public.campaigns(church_id,fund_id,name,slug,status,currency)
        values ('21000000-0000-4000-8000-000000001001','22000000-0000-4000-8000-000000001001','Wrong Currency','wrong-currency','active','USD');`,
      error: /P11_EXISTING_CAMPAIGN_CURRENCY_MISMATCH/,
    },
    {
      setup: `insert into public.churches (id,name,slug,default_currency)
        values ('21000000-0000-4000-8000-000000001002','Preflight','preflight-two','BBD');
        insert into public.funds(id,church_id,name,slug,status,sort_order)
        values ('22000000-0000-4000-8000-000000001002','21000000-0000-4000-8000-000000001002','Route','route','active',1);
        insert into public.campaigns(church_id,fund_id,name,slug,status,currency)
        values ('21000000-0000-4000-8000-000000001002','22000000-0000-4000-8000-000000001002','Inactive Route','inactive-route','draft','BBD');
        update public.funds set status='archived'
        where id='22000000-0000-4000-8000-000000001002';`,
      error: /P11_EXISTING_OPEN_CAMPAIGN_INACTIVE_FUND/,
    },
    {
      setup: `insert into public.churches (id,name,slug,default_currency)
        values ('21000000-0000-4000-8000-000000001003','Preflight','preflight-three','BBD');
        insert into public.campaigns(church_id,fund_id,name,slug,status,currency)
        values ('21000000-0000-4000-8000-000000001003',null,'No Route','no-route','draft','BBD');`,
      error: /P11_EXISTING_CAMPAIGN_WITHOUT_FUND/,
    },
  ])("rejects unsafe existing campaign state", async ({ setup, error }) => {
    const preflightDb = await createPreP11Database();
    try {
      await preflightDb.exec(setup);
      await expect(preflightDb.exec(migrations.at(-1)!)).rejects.toThrow(error);
    } finally {
      await preflightDb.close();
    }
  }, 30_000);

  it("preserves a closed campaign's historical currency", async () => {
    const preflightDb = await createPreP11Database();
    try {
      await preflightDb.exec(`
        insert into public.churches (id,name,slug,default_currency)
        values ('21000000-0000-4000-8000-000000001004','Preflight','preflight-four','BBD');
        insert into public.funds(id,church_id,name,slug,status,sort_order)
        values ('22000000-0000-4000-8000-000000001004','21000000-0000-4000-8000-000000001004','Route','route','active',1);
        insert into public.campaigns(church_id,fund_id,name,slug,status,currency)
        values ('21000000-0000-4000-8000-000000001004','22000000-0000-4000-8000-000000001004','Historic','historic','closed','USD');
      `);
      await expect(preflightDb.exec(migrations.at(-1)!)).resolves.toBeDefined();
      const result = await preflightDb.query<{ currency: string }>(
        "select currency from public.campaigns where slug='historic';",
      );
      expect(result.rows[0]?.currency).toBe("USD");
    } finally {
      await preflightDb.close();
    }
  }, 30_000);
});
