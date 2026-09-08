import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = {
  owner: "00000000-0000-4000-8000-000000000701",
  finance: "00000000-0000-4000-8000-000000000702",
  accountant: "00000000-0000-4000-8000-000000000703",
  staff: "00000000-0000-4000-8000-000000000704",
  otherOwner: "00000000-0000-4000-8000-000000000705",
  onboardingOwner: "00000000-0000-4000-8000-000000000706",
  suspendedOwner: "00000000-0000-4000-8000-000000000707",
  canceledOwner: "00000000-0000-4000-8000-000000000708",
  archivedOwner: "00000000-0000-4000-8000-000000000709",
  disabledOwner: "00000000-0000-4000-8000-000000000710",
  revokedOwner: "00000000-0000-4000-8000-000000000711",
  support: "00000000-0000-4000-8000-000000000712",
  deletedActor: "00000000-0000-4000-8000-000000000713",
  superAdmin: "00000000-0000-4000-8000-000000000714",
  legacyActor: "00000000-0000-4000-8000-000000000715",
} as const;

const churches = {
  active: "00000000-0000-4000-8000-000000000721",
  other: "00000000-0000-4000-8000-000000000722",
  onboarding: "00000000-0000-4000-8000-000000000723",
  suspended: "00000000-0000-4000-8000-000000000724",
  canceled: "00000000-0000-4000-8000-000000000725",
  archived: "00000000-0000-4000-8000-000000000726",
  legacy: "00000000-0000-4000-8000-000000000727",
} as const;

const records = {
  campaign: "00000000-0000-4000-8000-000000000731",
  donor: "00000000-0000-4000-8000-000000000732",
  otherDonor: "00000000-0000-4000-8000-000000000733",
  connection: "00000000-0000-4000-8000-000000000734",
  recurring: "00000000-0000-4000-8000-000000000735",
  donation: "00000000-0000-4000-8000-000000000736",
  otherDonation: "00000000-0000-4000-8000-000000000737",
  prayer: "00000000-0000-4000-8000-000000000738",
  receipt: "00000000-0000-4000-8000-000000000739",
  statement: "00000000-0000-4000-8000-000000000740",
} as const;

const migrationFiles = [
  "202608180001_initial_schema.sql",
  "202609050001_harden_active_profile_authorization.sql",
  "202609050002_staff_permissions_and_audit_foundation.sql",
] as const;
const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
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

async function asService<T extends Record<string, unknown>>(
  sql: string,
  actingUserId?: string,
) {
  await db.exec("begin;");
  try {
    await db.exec(`
      select set_config(
        'request.jwt.claim.sub',
        '${actingUserId ?? ""}',
        true
      );
      set local role service_role;
    `);
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

async function expectServiceError(sql: string, message: RegExp) {
  await expect(asService(sql)).rejects.toThrow(message);
}

function permissionQuery(churchId: string) {
  return `select
    array_to_json(public.get_my_church_permissions('${churchId}'))::text
      as permissions;`;
}

function parsePermissions(row: { permissions: string }) {
  return JSON.parse(row.permissions) as string[];
}

describe("P07 permissions and audit behavior in PostgreSQL", () => {
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

    await db.exec(migrations[0]);
    await db.exec(migrations[1]);

    // Exercise a real upgrade path: the pre-P07 schema permits a profile name
    // longer than the new immutable audit snapshot constraint.
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values (
        '${users.legacyActor}',
        'legacy-p07@example.test',
        '{"display_name":"${"L".repeat(200)}"}'
      );
      insert into public.churches (
        id, name, slug, status, default_currency, activated_at
      ) values (
        '${churches.legacy}', 'P07 Legacy Church', 'p07-legacy',
        'active', 'USD', now()
      );
      insert into public.church_memberships (
        church_id, user_id, role, status, accepted_at
      ) values (
        '${churches.legacy}', '${users.legacyActor}', 'owner', 'active', now()
      );
      insert into public.audit_logs (
        church_id, actor_user_id, actor_type, action, entity_table
      ) values (
        '${churches.legacy}', '${users.legacyActor}', 'user',
        'pre_p07_event', 'church'
      );
    `);

    await db.exec(migrations[2]);

    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${users.owner}', 'owner-p07@example.test', '{"display_name":"P07 Owner"}'),
        ('${users.finance}', 'finance-p07@example.test', '{"display_name":"P07 Finance"}'),
        ('${users.accountant}', 'accountant-p07@example.test', '{"display_name":"P07 Accountant"}'),
        ('${users.staff}', 'staff-p07@example.test', '{"display_name":"P07 Staff"}'),
        ('${users.otherOwner}', 'other-owner-p07@example.test', '{"display_name":"P07 Other Owner"}'),
        ('${users.onboardingOwner}', 'onboarding-p07@example.test', '{"display_name":"P07 Onboarding Owner"}'),
        ('${users.suspendedOwner}', 'suspended-p07@example.test', '{"display_name":"P07 Suspended Owner"}'),
        ('${users.canceledOwner}', 'canceled-p07@example.test', '{"display_name":"P07 Canceled Owner"}'),
        ('${users.archivedOwner}', 'archived-p07@example.test', '{"display_name":"P07 Archived Owner"}'),
        ('${users.disabledOwner}', 'disabled-p07@example.test', '{"display_name":"P07 Disabled Owner"}'),
        ('${users.revokedOwner}', 'revoked-p07@example.test', '{"display_name":"P07 Revoked Owner"}'),
        ('${users.support}', 'support-p07@example.test', '{"display_name":"P07 Support"}'),
        ('${users.deletedActor}', 'deleted-p07@example.test', '{"display_name":"P07 Historical Actor"}'),
        ('${users.superAdmin}', 'super-p07@example.test', '{"display_name":"P07 Super Admin"}');

      update public.profiles
      set is_active = false
      where id = '${users.disabledOwner}';

      insert into public.platform_admins (user_id, role, is_active)
      values
        ('${users.support}', 'support', true),
        ('${users.superAdmin}', 'super_admin', true);

      insert into public.churches (
        id, name, slug, status, default_currency, activated_at
      ) values
        ('${churches.active}', 'P07 Active Church', 'p07-active', 'active', 'USD', now()),
        ('${churches.other}', 'P07 Other Church', 'p07-other', 'active', 'CAD', now()),
        ('${churches.onboarding}', 'P07 Onboarding Church', 'p07-onboarding', 'onboarding', 'USD', null),
        ('${churches.suspended}', 'P07 Suspended Church', 'p07-suspended', 'suspended', 'USD', now()),
        ('${churches.canceled}', 'P07 Canceled Church', 'p07-canceled', 'canceled', 'USD', now()),
        ('${churches.archived}', 'P07 Archived Church', 'p07-archived', 'archived', 'USD', now());

      insert into public.church_memberships (
        church_id, user_id, role, status, accepted_at, revoked_at
      ) values
        ('${churches.active}', '${users.owner}', 'owner', 'active', now(), null),
        ('${churches.active}', '${users.finance}', 'finance_admin', 'active', now(), null),
        ('${churches.active}', '${users.accountant}', 'accountant', 'active', now(), null),
        ('${churches.active}', '${users.staff}', 'staff', 'active', now(), null),
        ('${churches.other}', '${users.otherOwner}', 'owner', 'active', now(), null),
        ('${churches.onboarding}', '${users.onboardingOwner}', 'owner', 'active', now(), null),
        ('${churches.suspended}', '${users.suspendedOwner}', 'owner', 'active', now(), null),
        ('${churches.canceled}', '${users.canceledOwner}', 'owner', 'active', now(), null),
        ('${churches.archived}', '${users.archivedOwner}', 'owner', 'active', now(), null),
        ('${churches.active}', '${users.disabledOwner}', 'owner', 'active', now(), null),
        ('${churches.active}', '${users.revokedOwner}', 'owner', 'revoked', now(), now()),
        ('${churches.active}', '${users.deletedActor}', 'staff', 'active', now(), null);

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, status, currency
      ) values (
        '${records.campaign}', '${churches.active}',
        (select id from public.funds where church_id = '${churches.active}' and is_default),
        'P07 Campaign', 'p07-campaign', 'active', 'USD'
      );

      insert into public.donors (id, church_id, display_name, email)
      values
        ('${records.donor}', '${churches.active}', 'P07 Donor', 'donor-p07@example.test'),
        ('${records.otherDonor}', '${churches.other}', 'P07 Other Donor', 'other-donor-p07@example.test');

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference, status
      ) values (
        '${records.connection}', '${churches.active}', 'p07-provider',
        'p07-account', 'active'
      );

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, payment_connection_id,
        amount_minor, currency, frequency, status,
        provider_subscription_reference, started_at
      ) values (
        '${records.recurring}', '${churches.active}', '${records.donor}',
        (select id from public.funds where church_id = '${churches.active}' and is_default),
        '${records.connection}', 2500, 'USD', 'monthly', 'active',
        'p07-provider-subscription', now()
      );

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status,
        amount_minor, currency, donated_at
      ) values
        (
          '${records.donation}', '${churches.active}', '${records.donor}',
          (select id from public.funds where church_id = '${churches.active}' and is_default),
          'cash', 'succeeded', 5000, 'USD', now()
        ),
        (
          '${records.otherDonation}', '${churches.other}', '${records.otherDonor}',
          (select id from public.funds where church_id = '${churches.other}' and is_default),
          'cash', 'succeeded', 6000, 'CAD', now()
        );

      insert into public.prayer_requests (
        id, church_id, donation_id, donor_id, body, consented_at
      ) values (
        '${records.prayer}', '${churches.active}', '${records.donation}',
        '${records.donor}', 'P07 private prayer text', now()
      );

      insert into public.receipts (
        id, church_id, donation_id, donor_id, receipt_number,
        status, amount_minor, currency, issued_at
      ) values (
        '${records.receipt}', '${churches.active}', '${records.donation}',
        '${records.donor}', 'P07-RECEIPT', 'issued', 5000, 'USD', now()
      );

      insert into public.annual_statements (
        id, church_id, donor_id, tax_year, statement_number, status,
        currency, total_amount_minor, period_start, period_end
      ) values (
        '${records.statement}', '${churches.active}', '${records.donor}',
        2026, 'P07-STATEMENT', 'draft', 'USD', 5000,
        '2026-01-01', '2026-12-31'
      );

      insert into public.statement_donations (
        church_id, statement_id, donation_id, donor_id, included_amount_minor
      ) values (
        '${churches.active}', '${records.statement}', '${records.donation}',
        '${records.donor}', 5000
      );

      insert into public.platform_subscriptions (
        church_id, plan_code, amount_minor, currency
      ) values
        ('${churches.active}', 'p07-active-plan', 9900, 'USD'),
        ('${churches.other}', 'p07-other-plan', 9900, 'USD');

      insert into public.email_events (
        church_id, donor_id, donation_id, template_key, recipient_email
      ) values (
        '${churches.active}', '${records.donor}', '${records.donation}',
        'p07-receipt', 'donor-p07@example.test'
      );
    `);

    await db.exec(`
      begin;
      set local "request.jwt.claim.sub" = '${users.owner}';
      set local role service_role;
      select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'user',
        event_action => 'church_settings_updated',
        event_entity => 'church',
        event_entity_id => '${churches.active}',
        event_actor_user_id => '${users.owner}',
        event_request_id => 'p07-runtime-seed',
        event_ip_hash => '${"a".repeat(64)}',
        event_sanitized_changes => '{"setting_keys":["primary_color"]}'
      );
      commit;
      begin;
      set local "request.jwt.claim.sub" = '${users.superAdmin}';
      set local role service_role;
      select public.append_audit_event(
        target_church_id => null,
        event_actor_type => 'support',
        event_action => 'platform_settings_updated',
        event_entity => 'platform_settings',
        event_actor_user_id => '${users.superAdmin}',
        event_request_id => 'p07-platform-runtime-seed',
        event_sanitized_changes => '{"setting_keys":["brand_name"]}'
      );
      commit;
      reset role;
    `);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("upgrades legacy audit rows with bounded immutable snapshots", async () => {
    const result = await db.query<{
      action_code: string;
      actor_display_name_snapshot: string;
      actor_role_snapshot: string;
    }>(`
      select action_code, actor_display_name_snapshot, actor_role_snapshot
      from public.audit_logs
      where church_id = '${churches.legacy}';
    `);

    expect(result.rows).toEqual([
      {
        action_code: "legacy_imported",
        actor_display_name_snapshot: "L".repeat(160),
        actor_role_snapshot: "owner",
      },
    ]);
  });

  it("returns the exact deterministic permission matrix", async () => {
    const expected = {
      owner: [
        "workspace_read",
        "funds_read",
        "funds_manage",
        "campaigns_read",
        "campaigns_manage",
        "qr_read",
        "settings_manage",
        "staff_manage",
        "provider_manage",
        "audit_read",
        "billing_manage",
        "financial_read",
        "members_read",
        "reports_read",
        "reports_export",
        "receipts_read",
        "statements_read",
        "provider_status_read",
        "email_status_read",
        "prayer_requests_review",
      ],
      finance: [
        "workspace_read",
        "funds_read",
        "campaigns_read",
        "qr_read",
        "financial_read",
        "members_read",
        "reports_read",
        "reports_export",
        "receipts_read",
        "statements_read",
        "provider_status_read",
        "email_status_read",
      ],
      accountant: [
        "workspace_read",
        "funds_read",
        "campaigns_read",
        "qr_read",
        "financial_read",
        "members_read",
        "reports_read",
        "reports_export",
        "receipts_read",
        "statements_read",
      ],
      staff: [
        "workspace_read",
        "funds_read",
        "campaigns_read",
        "qr_read",
      ],
    } as const;

    for (const [role, userId] of [
      ["owner", users.owner],
      ["finance", users.finance],
      ["accountant", users.accountant],
      ["staff", users.staff],
    ] as const) {
      const result = await asAuthenticated<{ permissions: string }>(
        userId,
        permissionQuery(churches.active),
      );
      expect(parsePermissions(result.rows[0])).toEqual(expected[role]);
    }
  });

  it("allows onboarding but fails closed for every inactive identity state", async () => {
    const onboarding = await asAuthenticated<{ permissions: string }>(
      users.onboardingOwner,
      permissionQuery(churches.onboarding),
    );
    expect(parsePermissions(onboarding.rows[0])).toContain("settings_manage");

    for (const [userId, churchId] of [
      [users.suspendedOwner, churches.suspended],
      [users.canceledOwner, churches.canceled],
      [users.archivedOwner, churches.archived],
      [users.disabledOwner, churches.active],
      [users.revokedOwner, churches.active],
      [users.support, churches.active],
    ] as const) {
      const result = await asAuthenticated<{ permissions: string }>(
        userId,
        permissionQuery(churchId),
      );
      expect(parsePermissions(result.rows[0])).toEqual([]);
    }

    const crossTenant = await asAuthenticated<{ allowed: boolean }>(
      users.owner,
      `select public.has_church_permission(
        '${churches.other}', 'workspace_read'
      ) as allowed;`,
    );
    expect(crossTenant.rows[0]?.allowed).toBe(false);

    const suspendedMembership = await asAuthenticated<{ count: number }>(
      users.suspendedOwner,
      `select count(id)::integer as count
       from public.church_memberships
       where user_id = '${users.suspendedOwner}';`,
    );
    expect(suspendedMembership.rows[0]?.count).toBe(0);

    const revokedMembership = await asAuthenticated<{ count: number }>(
      users.revokedOwner,
      `select count(id)::integer as count
       from public.church_memberships
       where user_id = '${users.revokedOwner}';`,
    );
    expect(revokedMembership.rows[0]?.count).toBe(1);
  });

  it("gives every active role only its own basic workspace records", async () => {
    const basicSql = `select
      (select count(id)::integer from public.churches) as churches,
      (select count(id)::integer from public.funds) as funds,
      (select count(id)::integer from public.campaigns) as campaigns,
      (select count(church_id)::integer from public.qr_links) as qr;`;

    for (const userId of [
      users.owner,
      users.finance,
      users.accountant,
      users.staff,
    ]) {
      const result = await asAuthenticated<Record<string, number>>(
        userId,
        basicSql,
      );
      expect(result.rows[0]).toEqual({
        churches: 1,
        funds: 1,
        campaigns: 1,
        qr: 1,
      });
    }
  });

  it("enforces finance, owner-status, audit, and pastoral read boundaries", async () => {
    const roleSql = `select
      (select count(id)::integer from public.donors) as donors,
      (select count(id)::integer from public.donations) as donations,
      (select count(id)::integer from public.recurring_gifts) as recurring,
      (select count(id)::integer from public.receipts) as receipts,
      (select count(id)::integer from public.annual_statements) as statements,
      (select count(id)::integer from public.payment_provider_connections) as connections,
      (select count(id)::integer from public.email_events) as emails,
      (select count(id)::integer from public.prayer_requests) as prayers,
      (select count(id)::integer from public.platform_subscriptions) as subscriptions,
      (select count(id)::integer from public.audit_logs) as audits;`;

    const owner = await asAuthenticated<Record<string, number>>(
      users.owner,
      roleSql,
    );
    const finance = await asAuthenticated<Record<string, number>>(
      users.finance,
      roleSql,
    );
    const accountant = await asAuthenticated<Record<string, number>>(
      users.accountant,
      roleSql,
    );
    const staff = await asAuthenticated<Record<string, number>>(
      users.staff,
      roleSql,
    );

    expect(owner.rows[0]).toEqual({
      donors: 1,
      donations: 1,
      recurring: 1,
      receipts: 1,
      statements: 1,
      connections: 1,
      emails: 1,
      prayers: 1,
      subscriptions: 1,
      audits: 1,
    });
    expect(finance.rows[0]).toEqual({
      donors: 1,
      donations: 1,
      recurring: 1,
      receipts: 1,
      statements: 1,
      connections: 1,
      emails: 1,
      prayers: 0,
      subscriptions: 0,
      audits: 0,
    });
    expect(accountant.rows[0]).toEqual({
      donors: 1,
      donations: 1,
      recurring: 1,
      receipts: 1,
      statements: 1,
      connections: 0,
      emails: 0,
      prayers: 0,
      subscriptions: 0,
      audits: 0,
    });
    expect(staff.rows[0]).toEqual({
      donors: 0,
      donations: 0,
      recurring: 0,
      receipts: 0,
      statements: 0,
      connections: 0,
      emails: 0,
      prayers: 0,
      subscriptions: 0,
      audits: 0,
    });
  });

  it("keeps every unapproved sensitive mutation closed", async () => {
    const defaultFund = `(select id from public.funds
      where church_id = '${churches.active}' and is_default)`;

    for (const sql of [
      `update public.church_memberships set role = 'owner'
       where church_id = '${churches.active}' and user_id = '${users.staff}'`,
      `update public.recurring_gifts set status = 'canceled'
       where id = '${records.recurring}'`,
      `insert into public.donations
         (church_id, fund_id, source, status, amount_minor, currency)
       values ('${churches.active}', ${defaultFund}, 'cash', 'succeeded', 1000, 'USD')`,
      `update public.annual_statements set status = 'published'
       where id = '${records.statement}'`,
      `delete from public.prayer_requests where id = '${records.prayer}'`,
      `update public.donations
       set status = 'refunded', refunded_amount_minor = amount_minor,
           refunded_at = now()
       where id = '${records.donation}'`,
    ]) {
      await expectAuthenticatedError(users.owner, sql, /permission denied/i);
    }

    await expectAuthenticatedError(
      users.support,
      `update public.donations
       set status = 'refunded', refunded_amount_minor = amount_minor,
           refunded_at = now()
       where id = '${records.donation}'`,
      /permission denied/i,
    );
    await expectAuthenticatedError(
      users.owner,
      `select public.append_audit_event(
        '${churches.active}', 'user', 'fund_updated', 'fund'
      )`,
      /permission denied/i,
    );
  });

  it("allows only the typed writer and rejects unsafe audit payloads", async () => {
    await expectServiceError(
      `insert into public.audit_logs
        (church_id, actor_type, action, entity_table)
       values ('${churches.active}', 'system', 'forged', 'church')`,
      /permission denied/i,
    );
    await expectServiceError(
      "select nextval('public.audit_logs_id_seq')",
      /permission denied/i,
    );
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'system',
        event_action => 'fund_updated',
        event_entity => 'campaign'
      )`,
      /audit action and entity do not match/i,
    );
    for (const unsafeAlias of [
      "data",
      "value",
      "content",
      "credential",
      "apikey",
      "session",
      "account_number",
    ]) {
      await expectServiceError(
        `select public.append_audit_event(
          target_church_id => '${churches.active}',
          event_actor_type => 'system',
          event_action => 'fund_updated',
          event_entity => 'fund',
          event_sanitized_changes => '{"${unsafeAlias}":"never-log-this"}'
        )`,
        /unsafe or invalid/i,
      );
    }
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'system',
        event_action => 'church_status_changed',
        event_entity => 'church',
        event_sanitized_changes => '{"reason_code":"sk_live_neverlog"}'
      )`,
      /unsafe or invalid/i,
    );
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'system',
        event_action => 'fund_updated',
        event_entity => 'fund',
        event_entity_id => 'sk_live_neverlog'
      )`,
      /entity identifier is invalid/i,
    );
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'system',
        event_action => 'fund_updated',
        event_entity => 'fund',
        event_request_id => 'sk_live_neverlog'
      )`,
      /request identifier is invalid/i,
    );
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'system',
        event_action => 'legacy_imported',
        event_entity => 'church'
      )`,
      /reserved for pre-P07 history/i,
    );
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'system',
        event_action => 'fund_updated',
        event_entity => 'fund',
        event_actor_user_id => '${users.owner}'
      )`,
      /cannot carry a user UUID/i,
    );
    await expectServiceError(
      "select 'refund'::public.audit_action",
      /invalid input value/i,
    );

    const platformEvent = await asService<{ append_audit_event: bigint }>(
      `select public.append_audit_event(
          target_church_id => null,
          event_actor_type => 'support',
          event_action => 'platform_settings_updated',
          event_entity => 'platform_settings',
          event_actor_user_id => '${users.superAdmin}',
          event_sanitized_changes => '{"setting_keys":["maintenance_notice"]}'
        );`,
      users.superAdmin,
    );
    expect(platformEvent.rows).toHaveLength(1);

    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => null,
        event_actor_type => 'system',
        event_action => 'fund_updated',
        event_entity => 'fund'
      )`,
      /requires a church/i,
    );
    await expectServiceError(
      `select public.append_audit_event(
        target_church_id => '${churches.active}',
        event_actor_type => 'user',
        event_action => 'platform_settings_updated',
        event_entity => 'platform_settings',
        event_actor_user_id => '${users.superAdmin}'
      )`,
      /cannot have a church/i,
    );

    for (const [sql, message] of [
      [
        `select public.append_audit_event(
          target_church_id => '${churches.other}',
          event_actor_type => 'user',
          event_action => 'church_settings_updated',
          event_entity => 'church',
          event_actor_user_id => '${users.owner}',
          event_sanitized_changes => '{"setting_keys":["primary_color"]}'
        )`,
        /no active church capacity/i,
      ],
      [
        `select public.append_audit_event(
          target_church_id => '${churches.active}',
          event_actor_type => 'user',
          event_action => 'church_settings_updated',
          event_entity => 'church',
          event_actor_user_id => '${users.disabledOwner}',
          event_sanitized_changes => '{"setting_keys":["primary_color"]}'
        )`,
        /no active church capacity/i,
      ],
      [
        `select public.append_audit_event(
          target_church_id => null,
          event_actor_type => 'support',
          event_action => 'platform_settings_updated',
          event_entity => 'platform_settings',
          event_actor_user_id => '${users.owner}',
          event_sanitized_changes => '{"setting_keys":["brand_name"]}'
        )`,
        /no active platform capacity/i,
      ],
    ] as const) {
      const actor = sql.includes(`'${users.disabledOwner}'`)
        ? users.disabledOwner
        : users.owner;
      await expect(
        asService(sql, actor),
      ).rejects.toThrow(message);
    }

    await expect(
      asService(
        `select public.append_audit_event(
          target_church_id => '${churches.active}',
          event_actor_type => 'user',
          event_action => 'church_settings_updated',
          event_entity => 'church',
          event_actor_user_id => '${users.deletedActor}',
          event_sanitized_changes => '{"setting_keys":["primary_color"]}'
        )`,
        users.owner,
      ),
    ).rejects.toThrow(/must match authenticated request identity/i);
  });

  it("limits audit reads to church owners until platform authority is approved", async () => {
    const superAdmin = await asAuthenticated<{ audits: number }>(
      users.superAdmin,
      "select count(id)::integer as audits from public.audit_logs;",
    );
    const owner = await asAuthenticated<{ audits: number }>(
      users.owner,
      "select count(id)::integer as audits from public.audit_logs;",
    );
    const support = await asAuthenticated<{ audits: number }>(
      users.support,
      "select count(id)::integer as audits from public.audit_logs;",
    );
    const staff = await asAuthenticated<{ audits: number }>(
      users.staff,
      "select count(id)::integer as audits from public.audit_logs;",
    );

    expect(superAdmin.rows[0]?.audits).toBe(0);
    expect(owner.rows[0]?.audits).toBe(1);
    expect(support.rows[0]?.audits).toBe(0);
    expect(staff.rows[0]?.audits).toBe(0);
  });

  it("retains immutable actor evidence after the Auth account is deleted", async () => {
    await db.exec("begin;");
    try {
      await db.exec(`
        set local "request.jwt.claim.sub" = '${users.deletedActor}';
        set local role service_role;
        select public.append_audit_event(
          target_church_id => '${churches.active}',
          event_actor_type => 'user',
          event_action => 'prayer_request_reviewed',
          event_entity => 'prayer_request',
          event_entity_id => '${records.prayer}',
          event_actor_user_id => '${users.deletedActor}',
          event_sanitized_changes => '{"reviewed":true}'
        );
        reset role;
        delete from auth.users where id = '${users.deletedActor}';
      `);

      const result = await db.query<{
        actor_display_name_snapshot: string;
        actor_role_snapshot: string;
        actor_user_id: string;
      }>(`
        select actor_user_id, actor_display_name_snapshot, actor_role_snapshot
        from public.audit_logs
        where actor_user_id = '${users.deletedActor}';
      `);

      expect(result.rows).toEqual([
        {
          actor_user_id: users.deletedActor,
          actor_display_name_snapshot: "P07 Historical Actor",
          actor_role_snapshot: "staff",
        },
      ]);

      await expect(
        db.exec(`update public.audit_logs set actor_role_snapshot = 'owner'
          where actor_user_id = '${users.deletedActor}'`),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await db.exec("rollback;");
    }
  });

  it("locks helper, enum, writer, and sequence privileges to intended roles", async () => {
    const result = await db.query<Record<string, boolean>>(`select
      has_function_privilege(
        'authenticated',
        'public.get_my_church_permissions(uuid)',
        'EXECUTE'
      ) as auth_list,
      has_function_privilege(
        'anon',
        'public.get_my_church_permissions(uuid)',
        'EXECUTE'
      ) as anon_list,
      has_function_privilege(
        'service_role',
        'public.append_audit_event(uuid,public.audit_actor_type,public.audit_action,public.audit_entity,text,uuid,text,text,jsonb)',
        'EXECUTE'
      ) as service_writer,
      has_function_privilege(
        'authenticated',
        'public.append_audit_event(uuid,public.audit_actor_type,public.audit_action,public.audit_entity,text,uuid,text,text,jsonb)',
        'EXECUTE'
      ) as auth_writer,
      has_type_privilege('authenticated', 'public.church_permission', 'USAGE')
        as auth_permission_type,
      has_type_privilege('authenticated', 'public.audit_action', 'USAGE')
        as auth_audit_type,
      has_type_privilege('service_role', 'public.audit_action', 'USAGE')
        as service_audit_type,
      has_type_privilege('authenticated', 'public.audit_actor_type', 'USAGE')
        as auth_actor_type,
      has_type_privilege('service_role', 'public.audit_actor_type', 'USAGE')
        as service_actor_type,
      has_type_privilege('authenticated', 'public.audit_entity', 'USAGE')
        as auth_entity_type,
      has_type_privilege('service_role', 'public.audit_entity', 'USAGE')
        as service_entity_type,
      has_sequence_privilege(
        'service_role', 'public.audit_logs_id_seq', 'USAGE'
      ) as service_sequence;
    `);

    expect(result.rows[0]).toEqual({
      auth_list: true,
      anon_list: false,
      service_writer: true,
      auth_writer: false,
      auth_permission_type: true,
      auth_audit_type: false,
      service_audit_type: true,
      auth_actor_type: false,
      service_actor_type: true,
      auth_entity_type: false,
      service_entity_type: true,
      service_sequence: false,
    });
  });
});
