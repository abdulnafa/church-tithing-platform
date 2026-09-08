import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const primaryChurchId = "00000000-0000-4000-8000-000000000301";
const otherChurchId = "00000000-0000-4000-8000-000000000302";
const emptyChurchId = "00000000-0000-4000-8000-000000000315";
const donationId = "00000000-0000-4000-8000-000000000303";
const connectionId = "00000000-0000-4000-8000-000000000304";
const donorOneId = "00000000-0000-4000-8000-000000000305";
const donorTwoId = "00000000-0000-4000-8000-000000000306";
const secondFundId = "00000000-0000-4000-8000-000000000307";
const campaignId = "00000000-0000-4000-8000-000000000308";
const recurringGiftId = "00000000-0000-4000-8000-000000000309";
const secondConnectionId = "00000000-0000-4000-8000-000000000310";
const onlineDonationId = "00000000-0000-4000-8000-000000000311";
const fullRefundDonationId = "00000000-0000-4000-8000-000000000312";
const authUserId = "00000000-0000-4000-8000-000000000313";
const statementId = "00000000-0000-4000-8000-000000000314";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608180001_initial_schema.sql",
  ),
  "utf8",
);

const db = new PGlite();

async function expectSqlError(sql: string, message: string) {
  await expect(db.exec(sql)).rejects.toThrow(message);
}

describe("initial migration in PostgreSQL", () => {
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

    await db.exec(migration);

    await db.exec(`
      insert into public.churches (id, name, slug, default_currency)
      values
        ('${primaryChurchId}', 'P02 PostgreSQL Church', 'p02-postgres-church', 'BBD'),
        ('${otherChurchId}', 'P02 Other PostgreSQL Church', 'p02-other-postgres-church', 'USD'),
        ('${emptyChurchId}', 'P02 Empty PostgreSQL Church', 'p02-empty-postgres-church', 'BBD');

      insert into public.funds (id, church_id, name, slug)
      values ('${secondFundId}', '${primaryChurchId}', 'Missions', 'missions');

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, currency
      ) values (
        '${campaignId}', '${primaryChurchId}', '${secondFundId}',
        'Community outreach', 'community-outreach', 'BBD'
      );

      insert into public.donors (id, church_id, display_name, email)
      values
        ('${donorOneId}', '${primaryChurchId}', 'P02 Donor One', 'donor-one@example.test'),
        ('${donorTwoId}', '${primaryChurchId}', 'P02 Donor Two', 'donor-two@example.test');

      insert into public.payment_provider_connections (
        id, church_id, provider, external_account_reference
      ) values
        ('${connectionId}', '${primaryChurchId}', 'p02-test-provider', 'p02-test-account'),
        ('${secondConnectionId}', '${primaryChurchId}', 'p02-test-provider', 'p02-second-account');

      insert into public.recurring_gifts (
        id, church_id, donor_id, fund_id, campaign_id,
        payment_connection_id, amount_minor, currency, frequency, status,
        provider_subscription_reference, started_at
      ) values (
        '${recurringGiftId}', '${primaryChurchId}', '${donorOneId}',
        '${secondFundId}', '${campaignId}', '${connectionId}', 2500, 'BBD',
        'monthly', 'active', 'p02-subscription-one', now()
      );

      insert into public.donations (
        id, church_id, donor_id, fund_id, source, status, amount_minor,
        currency, processing_fee_minor, donated_at
      ) values (
        '${donationId}', '${primaryChurchId}', '${donorOneId}',
        (
          select id from public.funds
          where church_id = '${primaryChurchId}' and is_default
        ),
        'cash', 'succeeded', 10000, 'BBD', 200, now()
      );
    `);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("applies all tables and enables RLS", async () => {
    const result = await db.query<{ rls_count: number; table_count: number }>(`
      select
        count(*)::integer as table_count,
        count(*) filter (where c.relrowsecurity)::integer as rls_count
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any (array[
          'profiles', 'platform_admins', 'churches', 'church_memberships',
          'funds', 'campaigns', 'donors', 'payment_provider_connections',
          'recurring_gifts', 'donations', 'prayer_requests', 'receipts',
          'annual_statements', 'statement_donations', 'platform_subscriptions',
          'payment_provider_references', 'qr_links', 'webhook_events',
          'email_events', 'audit_logs'
        ]);
    `);

    expect(result.rows[0]).toEqual({ table_count: 20, rls_count: 20 });
  });

  it("creates and synchronizes a safe profile for an auth user", async () => {
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values (
        '${authUserId}', 'first@example.test',
        '{"display_name":"P02 Auth User"}'::jsonb
      );
      update auth.users
      set email = 'updated@example.test'
      where id = '${authUserId}';
    `);

    const result = await db.query<{ display_name: string; email: string }>(`
      select display_name, email from public.profiles
      where id = '${authUserId}';
    `);

    expect(result.rows).toEqual([
      { display_name: "P02 Auth User", email: "updated@example.test" },
    ]);
  });

  it("provisions exactly one default Tithes fund and one church QR", async () => {
    const funds = await db.query<{
      is_default: boolean;
      name: string;
      slug: string;
      status: string;
    }>(`
      select name, slug, status::text, is_default
      from public.funds
      where church_id = '${primaryChurchId}' and is_default;
    `);
    const qrLinks = await db.query<{
      campaign_id: string | null;
      fund_id: string | null;
      kind: string;
      short_code: string;
    }>(`
      select kind::text, fund_id, campaign_id, short_code
      from public.qr_links
      where church_id = '${primaryChurchId}';
    `);

    expect(funds.rows).toEqual([
      { name: "Tithes", slug: "tithes", status: "active", is_default: true },
    ]);
    expect(qrLinks.rows).toHaveLength(1);
    expect(qrLinks.rows[0]).toMatchObject({
      kind: "church",
      fund_id: null,
      campaign_id: null,
    });
    expect(qrLinks.rows[0]?.short_code).toMatch(
      /^[a-z0-9][a-z0-9_-]{6,62}[a-z0-9]$/,
    );
  });

  it("keeps the default fund and permanent QR invariants", async () => {
    await expectSqlError(
      `update public.funds set is_default = false
       where church_id = '${primaryChurchId}' and is_default;`,
      "church must have exactly one active default fund",
    );
    await expectSqlError(
      `
        do $test$
        begin
          delete from public.funds
          where church_id = '${emptyChurchId}' and is_default;
          set constraints funds_require_one_active_default immediate;
        end;
        $test$;
      `,
      "church must have exactly one active default fund",
    );
    await expectSqlError(
      `update public.funds set status = 'archived'
       where church_id = '${emptyChurchId}' and is_default;`,
      "funds_default_must_be_active",
    );
    await expectSqlError(
      `insert into public.qr_links (church_id, kind)
       values ('${primaryChurchId}', 'church');`,
      "qr_links_one_church_code_idx",
    );
    await expectSqlError(
      `update public.qr_links set short_code = 'changed-code-123'
       where church_id = '${primaryChurchId}';`,
      "permanent QR routing fields cannot be changed",
    );
    await expectSqlError(
      `
        do $test$
        begin
          delete from public.qr_links where church_id = '${primaryChurchId}';
          set constraints qr_links_require_one_per_church immediate;
        end;
        $test$;
      `,
      "church must have exactly one permanent QR link",
    );
  });

  it("rejects cross-tenant references", async () => {
    await expectSqlError(
      `
        insert into public.campaigns (church_id, fund_id, name, slug, currency)
        values (
          '${primaryChurchId}',
          (select id from public.funds
           where church_id = '${otherChurchId}' and is_default),
          'Cross tenant campaign', 'cross-tenant-campaign', 'BBD'
        );
      `,
      "campaigns_fund_tenant_fk",
    );
  });

  it("keeps campaign fund and currency routes consistent", async () => {
    const defaultFundSql = `(
      select id from public.funds
      where church_id = '${primaryChurchId}' and is_default
    )`;

    await expectSqlError(
      `insert into public.donations
         (church_id, donor_id, fund_id, campaign_id, source, amount_minor, currency)
       values ('${primaryChurchId}', '${donorOneId}', ${defaultFundSql},
         '${campaignId}', 'cash', 1000, 'BBD');`,
      "campaign, fund, and currency must belong to the same giving route",
    );
    await expectSqlError(
      `insert into public.donations
         (church_id, donor_id, fund_id, campaign_id, source, amount_minor, currency)
       values ('${primaryChurchId}', '${donorOneId}', '${secondFundId}',
         '${campaignId}', 'cash', 1000, 'USD');`,
      "campaign, fund, and currency must belong to the same giving route",
    );
    await expectSqlError(
      `insert into public.recurring_gifts
         (church_id, donor_id, fund_id, campaign_id, payment_connection_id,
          amount_minor, currency, frequency)
       values ('${primaryChurchId}', '${donorOneId}', ${defaultFundSql},
         '${campaignId}', '${connectionId}', 1000, 'BBD', 'weekly');`,
      "campaign, fund, and currency must belong to the same giving route",
    );
    await expectSqlError(
      `insert into public.recurring_gifts
         (church_id, donor_id, fund_id, campaign_id, payment_connection_id,
          amount_minor, currency, frequency)
       values ('${primaryChurchId}', '${donorOneId}', '${secondFundId}',
         '${campaignId}', '${connectionId}', 1000, 'USD', 'weekly');`,
      "campaign, fund, and currency must belong to the same giving route",
    );
  });

  it("keeps recurring installments attached to the same donor and connection", async () => {
    await expectSqlError(
      `insert into public.donations
         (church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
          payment_connection_id, source, amount_minor, currency,
          external_idempotency_key)
       values ('${primaryChurchId}', '${donorTwoId}', '${secondFundId}',
         '${campaignId}', '${recurringGiftId}', '${connectionId}',
         'online', 2500, 'BBD', 'p02-wrong-donor');`,
      "donations_recurring_identity_tenant_fk",
    );
    await expectSqlError(
      `insert into public.donations
         (church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
          payment_connection_id, source, amount_minor, currency,
          external_idempotency_key)
       values ('${primaryChurchId}', '${donorOneId}', '${secondFundId}',
         '${campaignId}', '${recurringGiftId}', '${secondConnectionId}',
         'online', 2500, 'BBD', 'p02-wrong-connection');`,
      "donations_recurring_identity_tenant_fk",
    );

    await db.exec(`
      insert into public.donations
        (church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
         payment_connection_id, source, amount_minor, currency,
         external_idempotency_key)
      values ('${primaryChurchId}', '${donorOneId}', '${secondFundId}',
        '${campaignId}', '${recurringGiftId}', '${connectionId}',
        'online', 2500, 'BBD', 'p02-valid-recurring-installment');
    `);
  });

  it("allows operational updates after campaign configuration changes", async () => {
    const historicalDonationId = "00000000-0000-4000-8000-000000000316";

    await db.exec(`
      insert into public.donations
        (id, church_id, donor_id, fund_id, campaign_id, recurring_gift_id,
         payment_connection_id, source, amount_minor, currency,
         external_idempotency_key)
      values ('${historicalDonationId}', '${primaryChurchId}', '${donorOneId}',
        '${secondFundId}', '${campaignId}', '${recurringGiftId}',
        '${connectionId}', 'online', 2500, 'BBD', 'p02-historical-gift');

      update public.campaigns set currency = 'USD' where id = '${campaignId}';
      update public.donations set status = 'processing'
        where id = '${historicalDonationId}';
      update public.recurring_gifts set status = 'past_due'
        where id = '${recurringGiftId}';
      update public.campaigns set currency = 'BBD' where id = '${campaignId}';
    `);

    const result = await db.query<{
      donation_status: string;
      recurring_status: string;
    }>(`
      select
        (select status::text from public.donations
         where id = '${historicalDonationId}') as donation_status,
        (select status::text from public.recurring_gifts
         where id = '${recurringGiftId}') as recurring_status;
    `);

    expect(result.rows[0]).toEqual({
      donation_status: "processing",
      recurring_status: "past_due",
    });
  });

  it("enforces online idempotency and documents refund net accounting", async () => {
    const defaultFundSql = `(
      select id from public.funds
      where church_id = '${primaryChurchId}' and is_default
    )`;

    await expectSqlError(
      `insert into public.donations
         (church_id, fund_id, payment_connection_id, source, amount_minor, currency)
       values ('${primaryChurchId}', ${defaultFundSql}, '${connectionId}',
         'online', 1000, 'BBD');`,
      "donations_online_idempotency_required",
    );

    await db.exec(`
      insert into public.donations
        (id, church_id, fund_id, payment_connection_id, source,
         amount_minor, currency, external_idempotency_key)
      values ('${onlineDonationId}', '${primaryChurchId}', ${defaultFundSql},
        '${connectionId}', 'online', 1000, 'BBD', 'p02-online-one');
    `);

    await expectSqlError(
      `insert into public.donations
         (church_id, fund_id, payment_connection_id, source,
          amount_minor, currency, external_idempotency_key)
       values ('${primaryChurchId}', ${defaultFundSql}, '${connectionId}',
         'online', 1200, 'BBD', 'p02-online-one');`,
      "donations_idempotency_unique_idx",
    );
    await expectSqlError(
      `insert into public.donations
         (church_id, fund_id, source, status, amount_minor, currency,
          refunded_amount_minor, donated_at, refunded_at)
       values ('${primaryChurchId}', ${defaultFundSql}, 'cash', 'succeeded',
         1000, 'BBD', 100, now(), now());`,
      "donations_refund_state_consistent",
    );

    await db.exec(`
      insert into public.donations
        (id, church_id, fund_id, source, status, amount_minor, currency,
         processing_fee_minor, refunded_amount_minor, donated_at, refunded_at)
      values ('${fullRefundDonationId}', '${primaryChurchId}', ${defaultFundSql},
        'cash', 'refunded', 10000, 'BBD', 200, 10000, now(), now());
    `);

    const result = await db.query<{ base_net: number; refunded_net: number }>(`
      select
        (select net_amount_minor from public.donations
         where id = '${donationId}')::integer as base_net,
        (select net_amount_minor from public.donations
         where id = '${fullRefundDonationId}')::integer as refunded_net;
    `);

    expect(result.rows[0]).toEqual({ base_net: 9800, refunded_net: -200 });
  });

  it("accepts matching receipts and rejects altered snapshots", async () => {
    await db.exec(`
      insert into public.receipts
        (church_id, donation_id, donor_id, receipt_number, amount_minor, currency)
      values ('${primaryChurchId}', '${donationId}', '${donorOneId}',
        'P02-VALID', 10000, 'BBD');
    `);

    await expectSqlError(
      `insert into public.receipts
         (church_id, donation_id, donor_id, receipt_number, version,
          amount_minor, currency)
       values ('${primaryChurchId}', '${donationId}', '${donorOneId}',
         'P02-MISMATCH', 2, 9999, 'BBD');`,
      "receipt snapshot must match the donation",
    );
    await expectSqlError(
      `update public.donations set amount_minor = 9999
       where id = '${donationId}';`,
      "donation identity and giving snapshot cannot be changed",
    );
    await expectSqlError(
      `update public.donations set currency = 'USD'
       where id = '${donationId}';`,
      "donation identity and giving snapshot cannot be changed",
    );
  });

  it("prevents annual statements from superseding another donor's statement", async () => {
    await db.exec(`
      insert into public.annual_statements
        (id, church_id, donor_id, tax_year, statement_number, currency,
         period_start, period_end)
      values ('${statementId}', '${primaryChurchId}', '${donorOneId}', 2026,
        'P02-STATEMENT-ONE', 'BBD', '2026-01-01', '2026-12-31');
    `);

    await expectSqlError(
      `insert into public.annual_statements
         (church_id, donor_id, tax_year, statement_number, currency,
          period_start, period_end, supersedes_statement_id)
       values ('${primaryChurchId}', '${donorTwoId}', 2026,
         'P02-STATEMENT-TWO', 'BBD', '2026-01-01', '2026-12-31',
         '${statementId}');`,
      "annual_statements_supersedes_donor_tenant_fk",
    );
  });

  it("prevents audit-log update, delete, and truncate operations", async () => {
    await db.exec(`
      insert into public.audit_logs
        (church_id, actor_type, action, entity_table, entity_id)
      values ('${primaryChurchId}', 'system', 'p02.postgres.created',
        'churches', '${primaryChurchId}');
    `);

    await expectSqlError(
      "update public.audit_logs set action = 'p02.changed';",
      "audit_logs is append-only",
    );
    await expectSqlError(
      "delete from public.audit_logs;",
      "audit_logs is append-only",
    );
    await expectSqlError(
      "truncate table public.audit_logs;",
      "audit_logs is append-only",
    );
  });

  it("removes Supabase default grants and restores only intended privileges", async () => {
    const result = await db.query<{
      anon_created_by: boolean;
      anon_helper_execute: boolean;
      anon_name: boolean;
      anon_sequence_select: boolean;
      anon_sequence_update: boolean;
      anon_sequence_usage: boolean;
      authenticated_donation_insert: boolean;
      authenticated_qr_delete: boolean;
      authenticated_sequence_select: boolean;
      authenticated_sequence_update: boolean;
      authenticated_sequence_usage: boolean;
      service_audit_insert: boolean;
      service_audit_sequence_select: boolean;
      service_audit_sequence_update: boolean;
      service_audit_sequence_usage: boolean;
      service_audit_truncate: boolean;
      service_qr_delete: boolean;
      service_qr_scan_update: boolean;
      service_qr_short_code_update: boolean;
    }>(`
      select
        has_column_privilege('anon', 'public.churches', 'name', 'SELECT') as anon_name,
        has_column_privilege('anon', 'public.churches', 'created_by', 'SELECT') as anon_created_by,
        has_function_privilege('anon', 'public.is_church_member(uuid)', 'EXECUTE') as anon_helper_execute,
        has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE') as anon_sequence_usage,
        has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'SELECT') as anon_sequence_select,
        has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'UPDATE') as anon_sequence_update,
        has_table_privilege('authenticated', 'public.donations', 'INSERT') as authenticated_donation_insert,
        has_table_privilege('authenticated', 'public.qr_links', 'DELETE') as authenticated_qr_delete,
        has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'USAGE') as authenticated_sequence_usage,
        has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'SELECT') as authenticated_sequence_select,
        has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'UPDATE') as authenticated_sequence_update,
        has_table_privilege('service_role', 'public.audit_logs', 'INSERT') as service_audit_insert,
        has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE') as service_audit_truncate,
        has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE') as service_audit_sequence_usage,
        has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'SELECT') as service_audit_sequence_select,
        has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'UPDATE') as service_audit_sequence_update,
        has_table_privilege('service_role', 'public.qr_links', 'DELETE') as service_qr_delete,
        has_column_privilege('service_role', 'public.qr_links', 'scan_count', 'UPDATE') as service_qr_scan_update,
        has_column_privilege('service_role', 'public.qr_links', 'short_code', 'UPDATE') as service_qr_short_code_update;
    `);

    expect(result.rows[0]).toEqual({
      anon_name: true,
      anon_created_by: false,
      anon_helper_execute: false,
      anon_sequence_select: false,
      anon_sequence_update: false,
      anon_sequence_usage: false,
      authenticated_donation_insert: false,
      authenticated_qr_delete: false,
      authenticated_sequence_select: false,
      authenticated_sequence_update: false,
      authenticated_sequence_usage: false,
      service_audit_insert: true,
      service_audit_truncate: false,
      service_audit_sequence_select: true,
      service_audit_sequence_update: false,
      service_audit_sequence_usage: true,
      service_qr_delete: false,
      service_qr_scan_update: true,
      service_qr_short_code_update: false,
    });
  });
});
