import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608180001_initial_schema.sql",
  ),
  "utf8",
);
const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

const primaryChurchId = "10000000-0000-4000-8000-000000000001";
const secondChurchId = "20000000-0000-4000-8000-000000000001";

const db = new PGlite();

describe("development seed in PostgreSQL", () => {
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
    await db.exec(seed);
    await db.exec(seed);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  it("is rerunnable and produces the expected bounded row counts", async () => {
    const result = await db.query<Record<string, number>>(`
      select
        (select count(*)::integer from public.churches) as churches,
        (select count(*)::integer from public.funds) as funds,
        (select count(*)::integer from public.campaigns) as campaigns,
        (select count(*)::integer from public.donors) as donors,
        (select count(*)::integer from public.payment_provider_connections) as connections,
        (select count(*)::integer from public.recurring_gifts) as recurring_gifts,
        (select count(*)::integer from public.donations) as donations,
        (select count(*)::integer from public.receipts) as receipts,
        (select count(*)::integer from public.platform_subscriptions) as subscriptions,
        (select count(*)::integer from public.qr_links) as qr_links;
    `);

    expect(result.rows[0]).toEqual({
      churches: 2,
      funds: 6,
      campaigns: 2,
      donors: 7,
      connections: 2,
      recurring_gifts: 2,
      donations: 7,
      receipts: 7,
      subscriptions: 2,
      qr_links: 2,
    });
  });

  it("keeps one trigger-owned default fund and QR per tenant", async () => {
    const result = await db.query<{
      church_id: string;
      default_funds: number;
      qr_links: number;
    }>(`
      select
        c.id as church_id,
        (select count(*)::integer from public.funds f
         where f.church_id = c.id and f.is_default and f.status = 'active') as default_funds,
        (select count(*)::integer from public.qr_links q
         where q.church_id = c.id) as qr_links
      from public.churches c
      order by c.id;
    `);

    expect(result.rows).toEqual([
      { church_id: primaryChurchId, default_funds: 1, qr_links: 1 },
      { church_id: secondChurchId, default_funds: 1, qr_links: 1 },
    ]);
  });

  it("keeps legitimate P10-managed fund changes across a seed rerun", async () => {
    await db.exec(`
      update public.funds
      set name = 'Community Giving', status = 'archived', sort_order = 42
      where id = '10000000-0000-4000-8000-000000000101';
    `);

    await db.exec(seed);

    const result = await db.query<{
      name: string;
      slug: string;
      status: string;
      sort_order: number;
    }>(`
      select name, slug, status::text, sort_order
      from public.funds
      where id = '10000000-0000-4000-8000-000000000101';
    `);

    expect(result.rows).toEqual([
      {
        name: "Community Giving",
        slug: "general-offering",
        status: "archived",
        sort_order: 42,
      },
    ]);
  });

  it("matches the Harbour Grace demo ledger totals", async () => {
    const result = await db.query<{
      donation_count: number;
      gross_minor: number;
      fees_minor: number;
      net_minor: number;
      recurring_count: number;
      unique_donors: number;
    }>(`
      select
        count(*)::integer as donation_count,
        sum(amount_minor)::integer as gross_minor,
        sum(processing_fee_minor)::integer as fees_minor,
        sum(net_amount_minor)::integer as net_minor,
        count(*) filter (where recurring_gift_id is not null)::integer as recurring_count,
        count(distinct donor_id)::integer as unique_donors
      from public.donations
      where church_id = '${primaryChurchId}';
    `);

    expect(result.rows[0]).toEqual({
      donation_count: 6,
      gross_minor: 127_500,
      fees_minor: 4_020,
      net_minor: 123_480,
      recurring_count: 2,
      unique_donors: 6,
    });
  });

  it("keeps every seeded relationship inside its tenant", async () => {
    const result = await db.query<{ invalid_relations: number }>(`
      select (
        (select count(*) from public.campaigns c
         join public.funds f on f.id = c.fund_id
         where c.church_id <> f.church_id)
        +
        (select count(*) from public.recurring_gifts r
         join public.donors d on d.id = r.donor_id
         join public.funds f on f.id = r.fund_id
         join public.payment_provider_connections p on p.id = r.payment_connection_id
         where r.church_id <> d.church_id
            or r.church_id <> f.church_id
            or r.church_id <> p.church_id)
        +
        (select count(*) from public.donations d
         join public.funds f on f.id = d.fund_id
         join public.payment_provider_connections p on p.id = d.payment_connection_id
         where d.church_id <> f.church_id
            or d.church_id <> p.church_id)
      )::integer as invalid_relations;
    `);

    expect(result.rows[0]).toEqual({ invalid_relations: 0 });
  });

  it("creates matching issued receipts and USD 99 subscriptions", async () => {
    const result = await db.query<{
      mismatched_receipts: number;
      subscriptions: number;
    }>(`
      select
        (
          select count(*)::integer
          from public.receipts r
          join public.donations d
            on d.id = r.donation_id and d.church_id = r.church_id
          where r.status <> 'issued'
             or r.amount_minor <> d.amount_minor
             or r.currency <> d.currency
             or r.donor_id is distinct from d.donor_id
        ) as mismatched_receipts,
        (
          select count(*)::integer
          from public.platform_subscriptions
          where amount_minor = 9900
            and currency = 'USD'
            and status = 'incomplete'
        ) as subscriptions;
    `);

    expect(result.rows[0]).toEqual({
      mismatched_receipts: 0,
      subscriptions: 2,
    });
  });

  it("does not create Auth, prayer, audit, webhook, or email fixtures", async () => {
    const result = await db.query<Record<string, number>>(`
      select
        (select count(*)::integer from auth.users) as auth_users,
        (select count(*)::integer from public.profiles) as profiles,
        (select count(*)::integer from public.church_memberships) as memberships,
        (select count(*)::integer from public.platform_admins) as platform_admins,
        (select count(*)::integer from public.prayer_requests) as prayer_requests,
        (select count(*)::integer from public.audit_logs) as audit_logs,
        (select count(*)::integer from public.webhook_events) as webhook_events,
        (select count(*)::integer from public.email_events) as email_events,
        (select count(*)::integer from public.payment_provider_references) as provider_references;
    `);

    expect(result.rows[0]).toEqual({
      auth_users: 0,
      profiles: 0,
      memberships: 0,
      platform_admins: 0,
      prayer_requests: 0,
      audit_logs: 0,
      webhook_events: 0,
      email_events: 0,
      provider_references: 0,
    });
  });

  it("fails safely instead of concealing drift in a reserved seed record", async () => {
    await db.exec(`
      update public.donors
      set display_name = 'Drifted Development Name'
      where id = '10000000-0000-4000-8000-000000000301';
    `);

    try {
      await expect(db.exec(seed)).rejects.toThrow(
        "development seed donor snapshots do not match",
      );
    } finally {
      await db.exec(`
        rollback;
        update public.donors
        set display_name = 'Alicia Clarke'
        where id = '10000000-0000-4000-8000-000000000301';
      `);
    }
  });
});
