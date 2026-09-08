import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  ownerA: "00000000-0000-4000-8000-000000000401",
  financeA: "00000000-0000-4000-8000-000000000402",
  accountantA: "00000000-0000-4000-8000-000000000403",
  staffA: "00000000-0000-4000-8000-000000000404",
  ownerB: "00000000-0000-4000-8000-000000000405",
  donorA: "00000000-0000-4000-8000-000000000406",
  donorB: "00000000-0000-4000-8000-000000000407",
  disabledOwnerA: "00000000-0000-4000-8000-000000000408",
  revokedOwnerA: "00000000-0000-4000-8000-000000000409",
  superAdmin: "00000000-0000-4000-8000-000000000410",
  supportAdmin: "00000000-0000-4000-8000-000000000411",
} as const;

const churchA = "00000000-0000-4000-8000-000000000421";
const churchB = "00000000-0000-4000-8000-000000000422";

const initialMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608180001_initial_schema.sql",
  ),
  "utf8",
);
const activeProfileMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609050001_harden_active_profile_authorization.sql",
  ),
  "utf8",
);

const db = new PGlite();

async function asAuthenticated<T extends Record<string, unknown>>(
  userId: string,
  sql: string,
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
    return await db.query<T>(sql);
  } finally {
    await db.exec("rollback;");
  }
}

async function asAnonymous<T extends Record<string, unknown>>(sql: string) {
  await db.exec("begin;");
  try {
    await db.exec("set local role anon;");
    return await db.query<T>(sql);
  } finally {
    await db.exec("rollback;");
  }
}

async function expectAuthenticatedError(
  userId: string,
  sql: string,
  message: RegExp,
) {
  await expect(asAuthenticated(userId, sql)).rejects.toThrow(message);
}

async function expectAnonymousError(sql: string, message: RegExp) {
  await expect(asAnonymous(sql)).rejects.toThrow(message);
}

describe("tenant isolation through real PostgreSQL RLS queries", () => {
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
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );

      create function auth.uid()
      returns uuid
      language sql
      stable
      set search_path = ''
      as $$
        select nullif(
          pg_catalog.current_setting('request.jwt.claim.sub', true),
          ''
        )::uuid;
      $$;
    `);

    await db.exec(initialMigration);
    await db.exec(activeProfileMigration);

    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${users.ownerA}', 'owner-a@example.test', '{"display_name":"Owner A"}'),
        ('${users.financeA}', 'finance-a@example.test', '{"display_name":"Finance A"}'),
        ('${users.accountantA}', 'accountant-a@example.test', '{"display_name":"Accountant A"}'),
        ('${users.staffA}', 'staff-a@example.test', '{"display_name":"Staff A"}'),
        ('${users.ownerB}', 'owner-b@example.test', '{"display_name":"Owner B"}'),
        ('${users.donorA}', 'donor-a@example.test', '{"display_name":"Donor A"}'),
        ('${users.donorB}', 'donor-b@example.test', '{"display_name":"Donor B"}'),
        ('${users.disabledOwnerA}', 'disabled-a@example.test', '{"display_name":"Disabled Owner A"}'),
        ('${users.revokedOwnerA}', 'revoked-a@example.test', '{"display_name":"Revoked Owner A"}'),
        ('${users.superAdmin}', 'super@example.test', '{"display_name":"Super Admin"}'),
        ('${users.supportAdmin}', 'support@example.test', '{"display_name":"Support Admin"}');

      update public.profiles
      set is_active = false
      where id = '${users.disabledOwnerA}';

      insert into public.platform_admins (user_id, role, is_active)
      values
        ('${users.superAdmin}', 'super_admin', true),
        ('${users.supportAdmin}', 'support', true),
        ('${users.disabledOwnerA}', 'super_admin', true);

      insert into public.churches (
        id, name, slug, status, default_currency, activated_at
      ) values
        ('${churchA}', 'P04 Church A', 'p04-church-a', 'active', 'USD', now()),
        ('${churchB}', 'P04 Church B', 'p04-church-b', 'active', 'CAD', now());

      insert into public.church_memberships (
        church_id, user_id, role, status, accepted_at, revoked_at
      ) values
        ('${churchA}', '${users.ownerA}', 'owner', 'active', now(), null),
        ('${churchA}', '${users.financeA}', 'finance_admin', 'active', now(), null),
        ('${churchA}', '${users.accountantA}', 'accountant', 'active', now(), null),
        ('${churchA}', '${users.staffA}', 'staff', 'active', now(), null),
        ('${churchB}', '${users.ownerB}', 'owner', 'active', now(), null),
        ('${churchA}', '${users.disabledOwnerA}', 'owner', 'active', now(), null),
        ('${churchA}', '${users.revokedOwnerA}', 'owner', 'revoked', now(), now());

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, status, currency
      ) values
        (
          '00000000-0000-4000-8000-000000000501', '${churchA}',
          (select id from public.funds where church_id = '${churchA}' and is_default),
          'P04 Campaign A', 'p04-campaign-a', 'active', 'USD'
        ),
        (
          '00000000-0000-4000-8000-000000000502', '${churchB}',
          (select id from public.funds where church_id = '${churchB}' and is_default),
          'P04 Campaign B', 'p04-campaign-b', 'active', 'CAD'
        );

      insert into public.donors (id, church_id, auth_user_id, display_name, email)
      values
        ('00000000-0000-4000-8000-000000000441', '${churchA}', '${users.donorA}', 'Donor A', 'donor-a@example.test'),
        ('00000000-0000-4000-8000-000000000442', '${churchA}', null, 'Other Donor A', 'other-a@example.test'),
        ('00000000-0000-4000-8000-000000000443', '${churchB}', '${users.donorB}', 'Donor B', 'donor-b@example.test');

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status
      ) values
        ('00000000-0000-4000-8000-000000000451', '${churchA}', 'p04-provider', 'p04-account-a', 'active'),
        ('00000000-0000-4000-8000-000000000452', '${churchB}', 'p04-provider', 'p04-account-b', 'active');

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, payment_connection_id,
        amount_minor, currency, frequency
      ) values
        (
          '00000000-0000-4000-8000-000000000461', '${churchA}',
          '00000000-0000-4000-8000-000000000441',
          (select id from public.funds where church_id = '${churchA}' and is_default),
          '00000000-0000-4000-8000-000000000451', 2500, 'USD', 'monthly'
        ),
        (
          '00000000-0000-4000-8000-000000000462', '${churchA}',
          '00000000-0000-4000-8000-000000000442',
          (select id from public.funds where church_id = '${churchA}' and is_default),
          '00000000-0000-4000-8000-000000000451', 1500, 'USD', 'weekly'
        ),
        (
          '00000000-0000-4000-8000-000000000463', '${churchB}',
          '00000000-0000-4000-8000-000000000443',
          (select id from public.funds where church_id = '${churchB}' and is_default),
          '00000000-0000-4000-8000-000000000452', 3500, 'CAD', 'monthly'
        );

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status,
        amount_minor, currency, donated_at
      ) values
        (
          '00000000-0000-4000-8000-000000000431', '${churchA}',
          '00000000-0000-4000-8000-000000000441',
          (select id from public.funds where church_id = '${churchA}' and is_default),
          'cash', 'succeeded', 5000, 'USD', now()
        ),
        (
          '00000000-0000-4000-8000-000000000432', '${churchA}',
          '00000000-0000-4000-8000-000000000441',
          (select id from public.funds where church_id = '${churchA}' and is_default),
          'cash', 'succeeded', 6000, 'USD', now()
        ),
        (
          '00000000-0000-4000-8000-000000000433', '${churchA}',
          '00000000-0000-4000-8000-000000000442',
          (select id from public.funds where church_id = '${churchA}' and is_default),
          'cash', 'succeeded', 7000, 'USD', now()
        ),
        (
          '00000000-0000-4000-8000-000000000434', '${churchB}',
          '00000000-0000-4000-8000-000000000443',
          (select id from public.funds where church_id = '${churchB}' and is_default),
          'cash', 'succeeded', 8000, 'CAD', now()
        );

      insert into public.prayer_requests (
        id, church_id, donation_id, donor_id, body, consented_at, deleted_at
      ) values
        (
          '00000000-0000-4000-8000-000000000471', '${churchA}',
          '00000000-0000-4000-8000-000000000431',
          '00000000-0000-4000-8000-000000000441', 'Active prayer A', now(), null
        ),
        (
          '00000000-0000-4000-8000-000000000472', '${churchA}',
          '00000000-0000-4000-8000-000000000432',
          '00000000-0000-4000-8000-000000000441', 'Deleted prayer A', now(), now()
        ),
        (
          '00000000-0000-4000-8000-000000000473', '${churchB}',
          '00000000-0000-4000-8000-000000000434',
          '00000000-0000-4000-8000-000000000443', 'Active prayer B', now(), null
        );

      insert into public.receipts (
        id, church_id, donation_id, donor_id, receipt_number,
        status, amount_minor, currency, issued_at
      ) values
        (
          '00000000-0000-4000-8000-000000000481', '${churchA}',
          '00000000-0000-4000-8000-000000000431',
          '00000000-0000-4000-8000-000000000441', 'P04-A-ISSUED',
          'issued', 5000, 'USD', now()
        ),
        (
          '00000000-0000-4000-8000-000000000482', '${churchA}',
          '00000000-0000-4000-8000-000000000432',
          '00000000-0000-4000-8000-000000000441', 'P04-A-DRAFT',
          'draft', 6000, 'USD', null
        ),
        (
          '00000000-0000-4000-8000-000000000483', '${churchA}',
          '00000000-0000-4000-8000-000000000433',
          '00000000-0000-4000-8000-000000000442', 'P04-A-OTHER',
          'issued', 7000, 'USD', now()
        ),
        (
          '00000000-0000-4000-8000-000000000484', '${churchB}',
          '00000000-0000-4000-8000-000000000434',
          '00000000-0000-4000-8000-000000000443', 'P04-B-ISSUED',
          'issued', 8000, 'CAD', now()
        );

      insert into public.annual_statements (
        id, church_id, donor_id, tax_year, statement_number, status,
        currency, total_amount_minor, period_start, period_end, published_at
      ) values
        (
          '00000000-0000-4000-8000-000000000491', '${churchA}',
          '00000000-0000-4000-8000-000000000441', 2026, 'P04-A-PUBLISHED',
          'published', 'USD', 5000, '2026-01-01', '2026-12-31', now()
        ),
        (
          '00000000-0000-4000-8000-000000000492', '${churchA}',
          '00000000-0000-4000-8000-000000000441', 2025, 'P04-A-DRAFT',
          'draft', 'USD', 6000, '2025-01-01', '2025-12-31', null
        ),
        (
          '00000000-0000-4000-8000-000000000493', '${churchA}',
          '00000000-0000-4000-8000-000000000442', 2026, 'P04-A-OTHER',
          'published', 'USD', 7000, '2026-01-01', '2026-12-31', now()
        ),
        (
          '00000000-0000-4000-8000-000000000494', '${churchB}',
          '00000000-0000-4000-8000-000000000443', 2026, 'P04-B-PUBLISHED',
          'published', 'CAD', 8000, '2026-01-01', '2026-12-31', now()
        );

      insert into public.statement_donations (
        church_id, statement_id, donation_id, donor_id, included_amount_minor
      ) values
        (
          '${churchA}', '00000000-0000-4000-8000-000000000491',
          '00000000-0000-4000-8000-000000000431',
          '00000000-0000-4000-8000-000000000441', 5000
        ),
        (
          '${churchA}', '00000000-0000-4000-8000-000000000493',
          '00000000-0000-4000-8000-000000000433',
          '00000000-0000-4000-8000-000000000442', 7000
        ),
        (
          '${churchB}', '00000000-0000-4000-8000-000000000494',
          '00000000-0000-4000-8000-000000000434',
          '00000000-0000-4000-8000-000000000443', 8000
        );

      insert into public.platform_subscriptions (
        church_id, plan_code, amount_minor, currency
      ) values
        ('${churchA}', 'p04-plan-a', 2500, 'USD'),
        ('${churchB}', 'p04-plan-b', 3000, 'USD');

      insert into public.email_events (
        church_id, donor_id, donation_id, template_key, recipient_email
      ) values
        (
          '${churchA}', '00000000-0000-4000-8000-000000000441',
          '00000000-0000-4000-8000-000000000431', 'receipt', 'donor-a@example.test'
        ),
        (
          '${churchB}', '00000000-0000-4000-8000-000000000443',
          '00000000-0000-4000-8000-000000000434', 'receipt', 'donor-b@example.test'
        );

      insert into public.audit_logs (
        church_id, actor_user_id, action, entity_table, entity_id
      ) values
        ('${churchA}', '${users.ownerA}', 'p04.created', 'churches', '${churchA}'),
        ('${churchB}', '${users.ownerB}', 'p04.created', 'churches', '${churchB}');
    `);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("limits an owner to their church across configuration and private records", async () => {
    const result = await asAuthenticated<{
      audits: number;
      churches: number;
      donations: number;
      donors: number;
      memberships: number;
      prayers: number;
      subscriptions: number;
    }>(
      users.ownerA,
      `select
        (select count(id)::integer from public.churches) as churches,
        (select count(id)::integer from public.church_memberships) as memberships,
        (select count(id)::integer from public.donors) as donors,
        (select count(id)::integer from public.donations) as donations,
        (select count(id)::integer from public.prayer_requests) as prayers,
        (select count(id)::integer from public.platform_subscriptions) as subscriptions,
        (select count(id)::integer from public.audit_logs) as audits;`,
    );

    expect(result.rows[0]).toEqual({
      churches: 1,
      memberships: 6,
      donors: 2,
      donations: 3,
      prayers: 1,
      subscriptions: 1,
      audits: 1,
    });
  });

  it("enforces finance, accounting, and pastoral least-privilege reads", async () => {
    const roleCountsSql = `select
      (select count(id)::integer from public.donors) as donors,
      (select count(id)::integer from public.donations) as donations,
      (select count(id)::integer from public.payment_provider_connections) as connections,
      (select count(id)::integer from public.prayer_requests) as prayers,
      (select count(id)::integer from public.email_events) as emails,
      (select count(id)::integer from public.audit_logs) as audits;`;

    const finance = await asAuthenticated<Record<string, number>>(
      users.financeA,
      roleCountsSql,
    );
    const accountant = await asAuthenticated<Record<string, number>>(
      users.accountantA,
      roleCountsSql,
    );
    const staff = await asAuthenticated<Record<string, number>>(
      users.staffA,
      roleCountsSql,
    );

    expect(finance.rows[0]).toEqual({
      donors: 2,
      donations: 3,
      connections: 1,
      prayers: 0,
      emails: 1,
      audits: 0,
    });
    expect(accountant.rows[0]).toEqual({
      donors: 2,
      donations: 3,
      connections: 0,
      prayers: 0,
      emails: 0,
      audits: 0,
    });
    expect(staff.rows[0]).toEqual({
      donors: 0,
      donations: 0,
      connections: 0,
      prayers: 1,
      emails: 0,
      audits: 0,
    });
  });

  it("shows donors only their own eligible giving records", async () => {
    const result = await asAuthenticated<{
      donations: number;
      donors: number;
      prayers: number;
      receipts: number;
      recurring: number;
      statementDonations: number;
      statements: number;
    }>(
      users.donorA,
      `select
        (select count(id)::integer from public.donors) as donors,
        (select count(id)::integer from public.donations) as donations,
        (select count(id)::integer from public.recurring_gifts) as recurring,
        (select count(id)::integer from public.prayer_requests) as prayers,
        (select count(id)::integer from public.receipts) as receipts,
        (select count(id)::integer from public.annual_statements) as statements,
        (select count(statement_id)::integer from public.statement_donations) as "statementDonations";`,
    );

    expect(result.rows[0]).toEqual({
      donors: 1,
      donations: 2,
      recurring: 1,
      prayers: 1,
      receipts: 1,
      statements: 1,
      statementDonations: 1,
    });
  });

  it("fails closed for disabled profiles and revoked memberships", async () => {
    const protectedCountsSql = `select
      (select count(user_id)::integer from public.platform_admins) as admins,
      (select count(id)::integer from public.churches) as churches,
      (select count(id)::integer from public.church_memberships) as memberships,
      (select count(id)::integer from public.donations) as donations,
      (select count(id)::integer from public.audit_logs) as audits;`;

    const disabled = await asAuthenticated<Record<string, number>>(
      users.disabledOwnerA,
      protectedCountsSql,
    );
    const revoked = await asAuthenticated<Record<string, number>>(
      users.revokedOwnerA,
      protectedCountsSql,
    );
    const disabledProfile = await asAuthenticated<{
      is_active: boolean;
    }>(
      users.disabledOwnerA,
      "select is_active from public.profiles;",
    );

    expect(disabled.rows[0]).toEqual({
      admins: 0,
      churches: 0,
      memberships: 0,
      donations: 0,
      audits: 0,
    });
    expect(revoked.rows[0]).toEqual({
      admins: 0,
      churches: 0,
      memberships: 1,
      donations: 0,
      audits: 0,
    });
    expect(disabledProfile.rows).toEqual([{ is_active: false }]);

    const update = await asAuthenticated<{ display_name: string }>(
      users.disabledOwnerA,
      `update public.profiles
       set display_name = 'Should not change'
       where id = '${users.disabledOwnerA}'
       returning display_name;`,
    );
    expect(update.rows).toEqual([]);
  });

  it("gives only active super administrators cross-church platform visibility", async () => {
    const superResult = await asAuthenticated<{
      admins: number;
      churches: number;
      donations: number;
      subscriptions: number;
    }>(
      users.superAdmin,
      `select
        (select count(user_id)::integer from public.platform_admins) as admins,
        (select count(id)::integer from public.churches) as churches,
        (select count(id)::integer from public.platform_subscriptions) as subscriptions,
        (select count(id)::integer from public.donations) as donations;`,
    );
    const supportResult = await asAuthenticated<{
      admins: number;
      churches: number;
      subscriptions: number;
    }>(
      users.supportAdmin,
      `select
        (select count(user_id)::integer from public.platform_admins) as admins,
        (select count(id)::integer from public.churches) as churches,
        (select count(id)::integer from public.platform_subscriptions) as subscriptions;`,
    );

    expect(superResult.rows[0]).toEqual({
      admins: 3,
      churches: 2,
      subscriptions: 2,
      donations: 0,
    });
    expect(supportResult.rows[0]).toEqual({
      admins: 1,
      churches: 0,
      subscriptions: 0,
    });
  });

  it("exposes only active public giving projections to anonymous users", async () => {
    const result = await asAnonymous<{
      campaigns: number;
      churches: number;
      funds: number;
      qrLinks: number;
    }>(`select
      (select count(id)::integer from public.churches) as churches,
      (select count(id)::integer from public.funds) as funds,
      (select count(id)::integer from public.campaigns) as campaigns,
      (select count(church_id)::integer from public.qr_links) as "qrLinks";`);

    expect(result.rows[0]).toEqual({
      churches: 2,
      funds: 2,
      campaigns: 2,
      qrLinks: 2,
    });

    await expectAnonymousError(
      "select created_by from public.churches;",
      /permission denied/i,
    );
    await expectAnonymousError(
      "select id from public.donations;",
      /permission denied/i,
    );
    await expectAnonymousError(
      "select public.is_active_authenticated_user();",
      /permission denied/i,
    );
  });

  it("keeps authenticated domain mutations closed", async () => {
    const ownProfileUpdate = await asAuthenticated<{ display_name: string }>(
      users.ownerA,
      `update public.profiles
       set display_name = 'Updated Owner A'
       where id = '${users.ownerA}'
       returning display_name;`,
    );
    expect(ownProfileUpdate.rows).toEqual([
      { display_name: "Updated Owner A" },
    ]);

    const otherProfileUpdate = await asAuthenticated<{ display_name: string }>(
      users.ownerA,
      `update public.profiles
       set display_name = 'Not allowed'
       where id = '${users.ownerB}'
       returning display_name;`,
    );
    expect(otherProfileUpdate.rows).toEqual([]);

    await expectAuthenticatedError(
      users.ownerA,
      `update public.profiles
       set email = 'changed@example.test'
       where id = '${users.ownerA}';`,
      /permission denied/i,
    );
    await expectAuthenticatedError(
      users.ownerA,
      `insert into public.donations (
         church_id, fund_id, source, amount_minor, currency
       ) values (
         '${churchA}',
         (select id from public.funds where church_id = '${churchA}' and is_default),
         'cash', 1000, 'USD'
       );`,
      /permission denied/i,
    );
    await expectAuthenticatedError(
      users.ownerA,
      `delete from public.qr_links where church_id = '${churchA}';`,
      /permission denied/i,
    );
    await expectAuthenticatedError(
      users.ownerA,
      `insert into public.audit_logs (
         church_id, action, entity_table
       ) values ('${churchA}', 'p04.client-write', 'churches');`,
      /permission denied/i,
    );
  });

  it("reports authorization helper behavior and exact execute privileges", async () => {
    const activeOwner = await asAuthenticated<{
      active: boolean;
      member: boolean;
      owner: boolean;
      super_admin: boolean;
    }>(
      users.ownerA,
      `select
        public.is_active_authenticated_user() as active,
        public.is_church_member('${churchA}') as member,
        public.has_church_role(
          '${churchA}', array['owner']::public.church_member_role[]
        ) as owner,
        public.is_platform_super_admin() as super_admin;`,
    );
    const inactiveOwner = await asAuthenticated<{
      active: boolean;
      member: boolean;
      owner: boolean;
    }>(
      users.disabledOwnerA,
      `select
        public.is_active_authenticated_user() as active,
        public.is_church_member('${churchA}') as member,
        public.has_church_role(
          '${churchA}', array['owner']::public.church_member_role[]
        ) as owner;`,
    );
    const privileges = await db.query<{
      anon_active: boolean;
      authenticated_active: boolean;
      public_active: boolean;
      service_active: boolean;
    }>(`select
      has_function_privilege(
        'anon', 'public.is_active_authenticated_user()', 'EXECUTE'
      ) as anon_active,
      has_function_privilege(
        'authenticated', 'public.is_active_authenticated_user()', 'EXECUTE'
      ) as authenticated_active,
      has_function_privilege(
        'service_role', 'public.is_active_authenticated_user()', 'EXECUTE'
      ) as service_active,
      has_function_privilege(
        'public', 'public.is_active_authenticated_user()', 'EXECUTE'
      ) as public_active;`);

    expect(activeOwner.rows[0]).toEqual({
      active: true,
      member: true,
      owner: true,
      super_admin: false,
    });
    expect(inactiveOwner.rows[0]).toEqual({
      active: false,
      member: false,
      owner: false,
    });
    expect(privileges.rows[0]).toEqual({
      anon_active: false,
      authenticated_active: true,
      public_active: false,
      service_active: false,
    });
  });
});
