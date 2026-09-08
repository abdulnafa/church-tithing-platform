import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609080010_public_giving_data.sql",
  ),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/010_public_giving_data.test.sql"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const normalizedMigration = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function typeBlock(name: string) {
  const start = migration.indexOf(`create type public.${name}`);
  const end = migration.indexOf("\n);", start);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should be complete`).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

describe("P14 public giving database contract", () => {
  it("is one atomic next-ordered migration", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
  });

  it("defines the exact minimum typed public page projection", () => {
    expect(typeBlock("public_church_identity_record")).toMatch(
      /church_id uuid,\s+display_name text,\s+church_slug text/,
    );
    expect(typeBlock("public_giving_fund_record")).toMatch(
      /fund_id uuid,\s+name text,\s+description text,\s+is_default boolean/,
    );
    expect(typeBlock("public_giving_campaign_record")).toMatch(
      /campaign_id uuid,\s+fund_id uuid,\s+name text,\s+description text,\s+goal_amount_minor_text text/,
    );

    const page = typeBlock("public_giving_page_record");
    for (const field of [
      "church_id uuid",
      "church_slug text",
      "display_name text",
      "default_currency text",
      "logo_storage_path text",
      "primary_color text",
      "secondary_color text",
      "thank_you_message text",
      "funds public.public_giving_fund_record[]",
      "campaigns public.public_giving_campaign_record[]",
    ]) {
      expect(page).toContain(field);
    }
    expect(page).not.toMatch(
      /legal|support|donor|donation|raised|progress|provider|subscription|email/i,
    );
  });

  it("returns zero-or-one page rows through a fixed-path security definer", () => {
    const page = functionBlock("get_public_giving_page");
    expect(page).toContain(
      "returns setof public.public_giving_page_record",
    );
    expect(page).toContain("security definer");
    expect(page).toContain("set search_path = ''");
    expect(page).toContain("rows 1");
    expect(page).not.toMatch(/raise exception/i);
  });

  it("validates the exact slug and exposes only active, usable churches", () => {
    const page = functionBlock("get_public_giving_page");
    expect(page).toContain("char_length(church_slug) between 2 and 63");
    expect(page).toContain("church.slug = church_slug");
    expect(page).toContain("church.status = 'active'");
    expect(page).toMatch(
      /char_length\(\s*public\.canonicalize_public_display_name\(church\.name\)\s*\) between 2 and 120/,
    );
    expect(page).toContain("church.name !~ '[[:cntrl:]]'");
    expect(page).toContain(
      "church.default_currency in ('BBD', 'USD', 'CAD', 'XCD')",
    );
    expect(page).toContain("default_fund.is_default");
    expect(page).toContain(") = 1;");
  });

  it("projects optional legacy branding safely without making it readiness", () => {
    const page = functionBlock("get_public_giving_page");
    expect(page).toContain("then pg_catalog.upper(church.primary_color)");
    expect(page).toContain("then pg_catalog.upper(church.secondary_color)");
    expect(page).toContain(
      "then public.canonicalize_public_multiline_text(",
    );
    expect(page.match(/else null/g)?.length).toBeGreaterThanOrEqual(3);
    expect(page).toContain(
      "pg_catalog.split_part(church.logo_storage_path, '/', 1) =",
    );
  });

  it("uses private ECMAScript-parity canonicalizers for names and multiline copy", () => {
    const name = functionBlock("canonicalize_public_display_name");
    const multiline = functionBlock("canonicalize_public_multiline_text");
    expect(name).toContain("\\00A0");
    expect(name).toContain("\\FEFF");
    expect(multiline).toContain("pg_catalog.replace(input_value, E'\\r\\n', E'\\n')");
    expect(multiline).toContain("E'\\r'");

    const page = functionBlock("get_public_giving_page");
    const identities = functionBlock("get_public_church_identities");
    expect(page).toContain("public.canonicalize_public_display_name(church.name)");
    expect(identities).toContain(
      "public.canonicalize_public_display_name(church.name)",
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.canonicalize_public_display_name(text), public.canonicalize_public_multiline_text(text), public.get_public_church_identities(uuid[]), public.get_public_giving_page(text) from public, anon, authenticated, service_role;",
    );
  });

  it("returns all active funds in one deterministic order", () => {
    const page = functionBlock("get_public_giving_page");
    expect(page).toContain("fund.status = 'active'");
    expect(page).toContain(
      "order by fund.sort_order, pg_catalog.lower(fund.name), fund.id",
    );
    expect(page).not.toMatch(/limit\s+100/i);
  });

  it("filters campaigns by lifecycle, time, currency, and active same-tenant fund", () => {
    const page = functionBlock("get_public_giving_page");
    expect(page).toContain("campaign_fund.church_id = campaign.church_id");
    expect(page).toContain("campaign_fund.status = 'active'");
    expect(page).toContain("campaign.status = 'active'");
    expect(page).toContain("campaign.currency = church.default_currency");
    expect(page).toContain("campaign.starts_at <= statement_timestamp()");
    expect(page).toContain("campaign.ends_at > statement_timestamp()");
    expect(page).toContain("campaign.goal_amount_minor::text");
    expect(page).toContain(
      "campaign.starts_at desc nulls last,\n            pg_catalog.lower(campaign.name),\n            campaign.id",
    );
    expect(page).not.toMatch(
      /public\.(donations|donors|payment_provider_connections|platform_subscriptions)/i,
    );
  });

  it("bounds the replacement identity lookup and prevents tenant enumeration", () => {
    const identities = functionBlock("get_public_church_identities");
    expect(identities).toContain("returns setof public.public_church_identity_record");
    expect(identities).toContain("cardinality(church_ids) between 1 and 50");
    expect(identities).toContain("count(distinct requested_church_id)");
    expect(identities).toContain("church.id = any(church_ids)");
    expect(identities).toContain("church.status = 'active'");
    expect(identities).toContain("order by church.id");
    expect(identities).not.toMatch(/raise exception/i);
  });

  it("removes bypassing anonymous table policies and grants", () => {
    for (const policy of [
      "churches_public_read_active",
      "funds_public_read_active",
      "campaigns_public_read_active",
      "qr_links_public_read_active",
    ]) {
      expect(normalizedMigration).toContain(`drop policy if exists ${policy}`);
    }
    expect(normalizedMigration).toContain(
      "revoke select on table public.churches, public.funds, public.campaigns, public.qr_links from anon;",
    );
  });

  it("grants only anon access to the reviewed RPC and result types", () => {
    expect(normalizedMigration).toContain(
      "revoke all on function public.canonicalize_public_display_name(text), public.canonicalize_public_multiline_text(text), public.get_public_church_identities(uuid[]), public.get_public_giving_page(text) from public, anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.get_public_church_identities(uuid[]), public.get_public_giving_page(text) to anon;",
    );
    expect(normalizedMigration).toContain(
      "grant usage on type public.public_church_identity_record, public.public_giving_fund_record, public.public_giving_campaign_record, public.public_giving_page_record to anon;",
    );
  });

  it("adds partial indexes matching both bounded public paths", () => {
    for (const index of [
      "churches_public_identity_idx",
      "churches_public_giving_slug_idx",
      "funds_public_giving_order_idx",
      "campaigns_public_giving_order_idx",
    ]) {
      expect(normalizedMigration).toContain(`create index ${index}`);
    }
    expect(normalizedMigration.match(/where status = 'active';/g)).toHaveLength(4);
    const indexSection = normalizedMigration.slice(
      normalizedMigration.indexOf("create index churches_public_identity_idx"),
      normalizedMigration.indexOf("drop policy if exists churches_public_read_active"),
    );
    expect(indexSection).not.toMatch(
      /include \([^)]*(description|thank_you_message)/i,
    );
    const churchIndexSection = indexSection.slice(
      0,
      indexSection.indexOf("create index funds_public_giving_order_idx"),
    );
    expect(churchIndexSection).not.toMatch(/include \([^)]*name/i);
  });

  it("ships a rollback-only hosted suite and database test wiring", () => {
    const plan = hostedTest.match(/select extensions\.plan\((\d+)\);/i)?.[1];
    expect(plan).toBeDefined();
    expect(hostedTest.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().toLowerCase().endsWith("rollback;")).toBe(true);
    expect(hostedTest).toContain("create extension if not exists pgtap");
    expect(hostedTest).toContain("select * from extensions.finish();");
    expect(
      hostedTest.match(
        /^select extensions\.(?:ok|is|isnt|like|unlike|throws_ok|throws_like|lives_ok|results_eq|set_eq|bag_eq|cmp_ok|has_|col_|function_|table_|index_|trigger_)/gim,
      ) ?? [],
    ).toHaveLength(Number(plan));
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/public-giving-contract.test.ts",
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/public-giving-postgres.test.ts",
    );
  });
});
