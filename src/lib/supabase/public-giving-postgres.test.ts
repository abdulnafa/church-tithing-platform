import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
] as const;

const migrations = migrationFiles.map((file) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
);

const churches = {
  active: "a1000000-0000-4000-8000-000000000001",
  other: "a2000000-0000-4000-8000-000000000001",
  onboarding: "a3000000-0000-4000-8000-000000000001",
  suspended: "a4000000-0000-4000-8000-000000000001",
  canceled: "a5000000-0000-4000-8000-000000000001",
  archived: "a6000000-0000-4000-8000-000000000001",
  unsafeName: "a7000000-0000-4000-8000-000000000001",
  unsupportedCurrency: "a8000000-0000-4000-8000-000000000001",
  branding: "a9000000-0000-4000-8000-000000000001",
  canonicalName: "aa000000-0000-4000-8000-000000000001",
  name120: "ab000000-0000-4000-8000-000000000001",
  name121: "ac000000-0000-4000-8000-000000000001",
} as const;

const funds = {
  zeta: "a1000000-0000-4000-8000-000000000101",
  alpha: "a1000000-0000-4000-8000-000000000102",
  archivedRoute: "a1000000-0000-4000-8000-000000000103",
  multibyte: "a1000000-0000-4000-8000-000000000104",
  other: "a2000000-0000-4000-8000-000000000101",
} as const;

const campaigns = {
  recent: "a1000000-0000-4000-8000-000000000201",
  always: "a1000000-0000-4000-8000-000000000202",
  future: "a1000000-0000-4000-8000-000000000203",
  ended: "a1000000-0000-4000-8000-000000000204",
  draft: "a1000000-0000-4000-8000-000000000205",
  archivedRoute: "a1000000-0000-4000-8000-000000000206",
  multibyte: "a1000000-0000-4000-8000-000000000207",
  other: "a2000000-0000-4000-8000-000000000201",
} as const;

type PublicPage = {
  church_id: string;
  church_slug: string;
  display_name: string;
  default_currency: string;
  logo_storage_path: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  thank_you_message: string | null;
  funds: Array<{
    fund_id: string;
    name: string;
    description: string | null;
    is_default: boolean;
  }>;
  campaigns: Array<{
    campaign_id: string;
    fund_id: string;
    name: string;
    description: string | null;
    goal_amount_minor_text: string | null;
  }>;
};

const db = new PGlite();

async function installFoundation(
  target: PGlite = db,
  through = migrations.length,
) {
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

async function asRole<T extends Record<string, unknown>>(
  role: "anon" | "authenticated" | "service_role",
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

async function getPage(slug: string) {
  return asRole<{ page: PublicPage }>(
    "anon",
    `select to_jsonb(page) as page
       from public.get_public_giving_page('${slug}') page;`,
  );
}

describe("P14 public giving behavior in PostgreSQL", () => {
  beforeAll(async () => {
    await db.waitReady;
    await installFoundation();

    await db.exec(`
      insert into public.churches (
        id, name, legal_name, slug, status, default_currency, timezone,
        logo_storage_path, logo_url, primary_color, secondary_color,
        thank_you_message, created_at, activated_at, suspended_at
      ) values
        (
          '${churches.active}', 'P14 Active Church', 'P14 Active Church Inc.',
          'p14-active', 'active', 'BBD', 'America/Barbados',
          '${churches.active}/a1000000-0000-4000-8000-000000000099.webp',
          'javascript:legacy-is-not-public', '#1f6d60', '#e1b85a',
          E'Thank you.\\r\\nYour generosity\\rmatters.',
          now() - interval '20 days', now() - interval '19 days', null
        ),
        (
          '${churches.other}', 'P14 Other Church', 'P14 Other Church Inc.',
          'p14-other', 'active', 'USD', 'America/Barbados',
          null, null, '#274C77', '#E7B24A', null,
          now() - interval '20 days', now() - interval '19 days', null
        ),
        (
          '${churches.onboarding}', 'P14 Onboarding', 'P14 Onboarding Inc.',
          'p14-onboarding', 'onboarding', 'BBD', 'America/Barbados',
          null, null, null, null, null,
          now() - interval '20 days', null, null
        ),
        (
          '${churches.suspended}', 'P14 Suspended', 'P14 Suspended Inc.',
          'p14-suspended', 'suspended', 'BBD', 'America/Barbados',
          null, null, null, null, null,
          now() - interval '20 days', now() - interval '19 days',
          now() - interval '1 day'
        ),
        (
          '${churches.canceled}', 'P14 Canceled', 'P14 Canceled Inc.',
          'p14-canceled', 'canceled', 'BBD', 'America/Barbados',
          null, null, null, null, null, now() - interval '20 days', null, null
        ),
        (
          '${churches.archived}', 'P14 Archived', 'P14 Archived Inc.',
          'p14-archived', 'archived', 'BBD', 'America/Barbados',
          null, null, null, null, null, now() - interval '20 days', null, null
        ),
        (
          '${churches.unsafeName}', 'X', 'P14 Unsafe Name Inc.',
          'p14-unsafe-name', 'active', 'BBD', 'America/Barbados',
          null, null, null, null, null,
          now() - interval '20 days', now() - interval '19 days', null
        ),
        (
          '${churches.unsupportedCurrency}', 'P14 Unsupported Currency',
          'P14 Unsupported Currency Inc.', 'p14-unsupported-currency',
          'active', 'ZZZ', 'America/Barbados', null, null, null, null, null,
          now() - interval '20 days', now() - interval '19 days', null
        ),
        (
          '${churches.branding}', 'P14 Branding Church',
          'P14 Branding Church Inc.', 'p14-branding', 'active', 'BBD',
          'America/Barbados',
          '${churches.branding}/a9000000-0000-4000-8000-000000000099.webp',
          'https://legacy.invalid/logo.svg', '#abcdef', '#123abc',
          E'Unsafe\\001thank-you', now() - interval '20 days',
          now() - interval '19 days', null
        ),
        (
          '${churches.canonicalName}',
          pg_catalog.chr(65279) || pg_catalog.chr(160) || 'P14' ||
            pg_catalog.chr(8195) || 'Canonical' || pg_catalog.chr(160) ||
            'Name' || pg_catalog.chr(65279),
          'P14 Canonical Name Inc.', 'p14-canonical-name', 'active', 'BBD',
          'America/Barbados', null, null, null, null, null,
          now() - interval '20 days', now() - interval '19 days', null
        ),
        (
          '${churches.name120}', repeat(pg_catalog.chr(128591), 120),
          'P14 Name 120 Inc.', 'p14-name-120', 'active', 'BBD',
          'America/Barbados', null, null, null, null, null,
          now() - interval '20 days', now() - interval '19 days', null
        ),
        (
          '${churches.name121}', repeat(pg_catalog.chr(128591), 121),
          'P14 Name 121 Inc.', 'p14-name-121', 'active', 'BBD',
          'America/Barbados', null, null, null, null, null,
          now() - interval '20 days', now() - interval '19 days', null
        );

      update public.funds
      set name = 'Tithes', description = 'The active default fund.'
      where church_id = '${churches.active}' and is_default;

      insert into public.funds (
        id, church_id, name, slug, description, status, is_default, sort_order
      ) values
        (
          '${funds.zeta}', '${churches.active}', 'Zeta Fund', 'zeta-fund',
          'Sorts before Alpha because its configured position is lower.',
          'active', false, 1
        ),
        (
          '${funds.alpha}', '${churches.active}', 'Alpha Fund', 'alpha-fund',
          'Sorts after Zeta despite its name.', 'active', false, 2
        ),
        (
          '${funds.archivedRoute}', '${churches.active}', 'Archived Route',
          'archived-route', 'Its active campaign must not be public.',
          'active', false, 3
        ),
        (
          '${funds.multibyte}', '${churches.active}', 'Multibyte Fund',
          'multibyte-fund', repeat(pg_catalog.chr(128591), 500),
          'active', false, 4
        ),
        (
          '${funds.other}', '${churches.other}', 'Other Tenant Fund',
          'other-tenant-fund', 'Must never cross into another page.',
          'active', false, 1
        );

      insert into public.campaigns (
        id, church_id, fund_id, name, slug, description, status,
        goal_amount_minor, currency, starts_at, ends_at
      ) values
        (
          '${campaigns.recent}', '${churches.active}', '${funds.zeta}',
          'Recent Campaign', 'recent-campaign', 'Currently visible.', 'active',
          9007199254740991, 'BBD', now() - interval '1 day',
          now() + interval '10 days'
        ),
        (
          '${campaigns.always}', '${churches.active}', '${funds.alpha}',
          'Always Campaign', 'always-campaign', 'No visibility dates.',
          'active', null, 'BBD', null, null
        ),
        (
          '${campaigns.future}', '${churches.active}', '${funds.alpha}',
          'Future Campaign', 'future-campaign', 'Not started.', 'active',
          1000, 'BBD', now() + interval '1 day', now() + interval '10 days'
        ),
        (
          '${campaigns.ended}', '${churches.active}', '${funds.alpha}',
          'Ended Campaign', 'ended-campaign', 'Already ended.', 'active',
          1000, 'BBD', now() - interval '10 days', now() - interval '1 day'
        ),
        (
          '${campaigns.draft}', '${churches.active}', '${funds.alpha}',
          'Draft Campaign', 'draft-campaign', 'Not active.', 'draft',
          1000, 'BBD', null, null
        ),
        (
          '${campaigns.archivedRoute}', '${churches.active}',
          '${funds.archivedRoute}', 'Archived Fund Campaign',
          'archived-fund-campaign', 'Its fund is no longer active.', 'active',
          1000, 'BBD', null, null
        ),
        (
          '${campaigns.multibyte}', '${churches.active}', '${funds.multibyte}',
          'Multibyte Campaign', 'multibyte-campaign',
          repeat(pg_catalog.chr(128591), 1000), 'active', 5000, 'BBD',
          now() - interval '2 days', now() + interval '10 days'
        ),
        (
          '${campaigns.other}', '${churches.other}', '${funds.other}',
          'Other Tenant Campaign', 'other-tenant-campaign',
          'Must never cross into another page.', 'active', 1000, 'USD',
          null, null
        );

      update public.funds set status = 'archived'
      where id = '${funds.archivedRoute}';

      insert into public.donations (
        church_id, fund_id, campaign_id, source, status, amount_minor,
        currency, donated_at
      ) values (
        '${churches.active}', '${funds.zeta}', '${campaigns.recent}',
        'cash', 'succeeded', 987654, 'BBD', now()
      );
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it("returns one canonical, tenant-scoped page to anon", async () => {
    const result = await getPage("p14-active");
    expect(result.rows).toHaveLength(1);

    const page = result.rows[0].page;
    expect(page).toMatchObject({
      church_id: churches.active,
      church_slug: "p14-active",
      display_name: "P14 Active Church",
      default_currency: "BBD",
      logo_storage_path: `${churches.active}/a1000000-0000-4000-8000-000000000099.webp`,
      primary_color: "#1F6D60",
      secondary_color: "#E1B85A",
      thank_you_message: "Thank you.\nYour generosity\nmatters.",
    });
    expect(Object.keys(page).sort()).toEqual(
      [
        "campaigns",
        "church_id",
        "church_slug",
        "default_currency",
        "display_name",
        "funds",
        "logo_storage_path",
        "primary_color",
        "secondary_color",
        "thank_you_message",
      ].sort(),
    );
  });

  it("returns every active fund once in configured deterministic order", async () => {
    const page = (await getPage("p14-active")).rows[0].page;
    expect(page.funds.map((fund) => fund.name)).toEqual([
      "Tithes",
      "Zeta Fund",
      "Alpha Fund",
      "Multibyte Fund",
    ]);
    expect(page.funds.filter((fund) => fund.is_default)).toHaveLength(1);
    expect(page.funds.at(-1)?.description).toHaveLength(1_000);
  });

  it("returns only current campaigns with an active same-tenant fund", async () => {
    const page = (await getPage("p14-active")).rows[0].page;
    expect(page.campaigns.map((campaign) => campaign.name)).toEqual([
      "Recent Campaign",
      "Multibyte Campaign",
      "Always Campaign",
    ]);
    expect(page.campaigns[0].goal_amount_minor_text).toBe(
      "9007199254740991",
    );
    expect(page.campaigns[1].description).toHaveLength(2_000);
    expect(page.campaigns[2].goal_amount_minor_text).toBeNull();
    expect(JSON.stringify(page)).not.toMatch(
      /donation|raised|progress|provider|subscription|support|legal/i,
    );
  });

  it("makes every non-active or unsafe essential church indistinguishable", async () => {
    for (const slug of [
      "missing",
      "P14-ACTIVE",
      "p14-onboarding",
      "p14-suspended",
      "p14-canceled",
      "p14-archived",
      "p14-unsafe-name",
      "p14-unsupported-currency",
    ]) {
      expect((await getPage(slug)).rows).toEqual([]);
    }
  });

  it("aligns public names and multiline copy with JavaScript code-point rules", async () => {
    const canonical = (await getPage("p14-canonical-name")).rows[0].page;
    expect(canonical.display_name).toBe("P14 Canonical Name");

    const exactLimit = (await getPage("p14-name-120")).rows[0].page;
    expect(Array.from(exactLimit.display_name)).toHaveLength(120);
    expect((await getPage("p14-name-121")).rows).toEqual([]);

    const active = (await getPage("p14-active")).rows[0].page;
    expect(active.thank_you_message).toBe(
      "Thank you.\nYour generosity\nmatters.",
    );
    expect(active.thank_you_message).not.toContain("\r");
  });

  it("degrades unsafe optional legacy branding to null", async () => {
    const initial = (await getPage("p14-branding")).rows[0].page;
    expect(initial.primary_color).toBe("#ABCDEF");
    expect(initial.secondary_color).toBe("#123ABC");
    expect(initial.thank_you_message).toBeNull();

    await db.exec("begin;");
    try {
      await db.exec(`
        alter table public.churches
          drop constraint churches_logo_storage_path_format,
          drop constraint churches_primary_color_format,
          drop constraint churches_secondary_color_format;
        update public.churches
        set
          logo_storage_path = '${churches.other}/a2000000-0000-4000-8000-000000000099.webp',
          primary_color = 'not-a-color',
          secondary_color = '#12345G'
        where id = '${churches.branding}';
        set local role anon;
      `);
      const result = await db.query<{ page: PublicPage }>(`
        select to_jsonb(page) as page
        from public.get_public_giving_page('p14-branding') page;
      `);
      expect(result.rows[0].page).toMatchObject({
        logo_storage_path: null,
        primary_color: null,
        secondary_color: null,
        thank_you_message: null,
      });
    } finally {
      await db.exec("rollback;");
    }
  });

  it("returns only exact requested active public identities", async () => {
    const result = await asRole<{ identity: Record<string, unknown> }>(
      "anon",
      `select to_jsonb(identity) as identity
       from public.get_public_church_identities(array[
         '${churches.suspended}'::uuid,
         '${churches.other}'::uuid,
         '${churches.active}'::uuid,
         '${churches.onboarding}'::uuid
       ]) identity;`,
    );
    expect(result.rows.map((row) => row.identity)).toEqual([
      {
        church_id: churches.active,
        display_name: "P14 Active Church",
        church_slug: "p14-active",
      },
      {
        church_id: churches.other,
        display_name: "P14 Other Church",
        church_slug: "p14-other",
      },
    ]);
  });

  it("fails closed for invalid identity request arrays", async () => {
    const result = await asRole<{
      null_count: number;
      empty_count: number;
      duplicate_count: number;
      null_member_count: number;
      oversize_count: number;
    }>(
      "anon",
      `select
        (select count(*)::integer
         from public.get_public_church_identities(null::uuid[])) as null_count,
        (select count(*)::integer
         from public.get_public_church_identities(array[]::uuid[])) as empty_count,
        (select count(*)::integer
         from public.get_public_church_identities(
           array['${churches.active}'::uuid, '${churches.active}'::uuid]
         )) as duplicate_count,
        (select count(*)::integer
         from public.get_public_church_identities(
           array['${churches.active}'::uuid, null::uuid]
         )) as null_member_count,
        (select count(*)::integer
         from public.get_public_church_identities(
           (select array_agg(
             ('b0000000-0000-4000-8000-' ||
               pg_catalog.lpad(number::text, 12, '0'))::uuid
           ) from pg_catalog.generate_series(1, 51) number)
         )) as oversize_count;`,
    );
    expect(result.rows[0]).toEqual({
      null_count: 0,
      empty_count: 0,
      duplicate_count: 0,
      null_member_count: 0,
      oversize_count: 0,
    });
  });

  it("allows only anon to execute the public functions and use result types", async () => {
    const privileges = await db.query<Record<string, boolean>>(`
      select
        has_function_privilege(
          'anon', 'public.get_public_giving_page(text)', 'EXECUTE'
        ) as anon_page,
        has_function_privilege(
          'authenticated', 'public.get_public_giving_page(text)', 'EXECUTE'
        ) as authenticated_page,
        has_function_privilege(
          'service_role', 'public.get_public_giving_page(text)', 'EXECUTE'
        ) as service_page,
        has_function_privilege(
          'anon', 'public.get_public_church_identities(uuid[])', 'EXECUTE'
        ) as anon_identities,
        has_function_privilege(
          'authenticated',
          'public.get_public_church_identities(uuid[])', 'EXECUTE'
        ) as authenticated_identities,
        has_type_privilege(
          'anon', 'public.public_giving_page_record', 'USAGE'
        ) as anon_page_type,
        has_type_privilege(
          'authenticated', 'public.public_giving_page_record', 'USAGE'
        ) as authenticated_page_type;
    `);
    expect(privileges.rows[0]).toEqual({
      anon_page: true,
      authenticated_page: false,
      service_page: false,
      anon_identities: true,
      authenticated_identities: false,
      anon_page_type: true,
      authenticated_page_type: false,
    });

    await expect(
      asRole("authenticated", "select * from public.get_public_giving_page('p14-active');"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("service_role", "select * from public.get_public_giving_page('p14-active');"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("closes every legacy direct anonymous configuration projection", async () => {
    const privileges = await db.query<Record<string, boolean>>(`
      select
        has_column_privilege('anon', 'public.churches', 'id', 'SELECT')
          as churches,
        has_column_privilege('anon', 'public.funds', 'id', 'SELECT')
          as funds,
        has_column_privilege('anon', 'public.campaigns', 'id', 'SELECT')
          as campaigns,
        has_column_privilege('anon', 'public.qr_links', 'short_code', 'SELECT')
          as qr_links;
    `);
    expect(privileges.rows[0]).toEqual({
      churches: false,
      funds: false,
      campaigns: false,
      qr_links: false,
    });

    for (const table of ["churches", "funds", "campaigns", "qr_links"]) {
      await expect(
        asRole("anon", `select * from public.${table} limit 1;`),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("installs the lean active lookup and ordering indexes", async () => {
    const result = await db.query<{ indexname: string }>(`
      select indexname
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and indexname in (
          'churches_public_identity_idx',
          'churches_public_giving_slug_idx',
          'funds_public_giving_order_idx',
          'campaigns_public_giving_order_idx'
        )
      order by indexname;
    `);
    expect(result.rows.map((row) => row.indexname)).toEqual([
      "campaigns_public_giving_order_idx",
      "churches_public_giving_slug_idx",
      "churches_public_identity_idx",
      "funds_public_giving_order_idx",
    ]);
  });

  it("applies over an oversized active legacy name without indexing free text", async () => {
    const legacy = new PGlite();
    await legacy.waitReady;
    try {
      await installFoundation(legacy, migrations.length - 1);
      await legacy.exec(`
        insert into public.churches (
          id, name, legal_name, slug, status, default_currency, timezone,
          created_at, activated_at
        ) values (
          'ad000000-0000-4000-8000-000000000001',
          repeat(pg_catalog.chr(128591), 2000),
          'P14 Oversized Legacy Inc.', 'p14-oversized-legacy', 'active',
          'BBD', 'America/Barbados', now() - interval '2 days',
          now() - interval '1 day'
        );
      `);
      await expect(legacy.exec(migrations.at(-1)!)).resolves.toBeDefined();
      await legacy.exec("begin; set local role anon;");
      const result = await legacy.query<{ count: number }>(`
        select count(*)::integer as count
        from public.get_public_giving_page('p14-oversized-legacy');
      `);
      expect(result.rows[0].count).toBe(0);
      await legacy.exec("rollback;");
    } finally {
      await legacy.close();
    }
  });
});
