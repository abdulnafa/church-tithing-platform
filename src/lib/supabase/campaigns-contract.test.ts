import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609050006_campaign_management.sql",
);
const runtimeTestPath = resolve(
  process.cwd(),
  "src/lib/supabase/campaigns-postgres.test.ts",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/007_campaign_management.test.sql",
);
const seedPath = resolve(process.cwd(), "supabase/seed.sql");
const packagePath = resolve(process.cwd(), "package.json");

const migration = readFileSync(migrationPath, "utf8");
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P11 campaign management migration contract", () => {
  it("ships one atomic aggregate-revision migration", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(normalizedMigration).toContain(
      "add column campaigns_revision bigint not null default 0",
    );
    expect(normalizedMigration).toContain(
      "constraint churches_campaigns_revision_nonnegative check (campaigns_revision >= 0)",
    );
  });

  it("canonicalizes bounded Unicode text and freezes the giving route", () => {
    for (const name of [
      "canonicalize_campaign_name",
      "canonicalize_campaign_description",
    ]) {
      const helper = functionBlock(name);
      expect(helper).toContain("immutable");
      expect(helper).toContain("strict");
      expect(helper).toContain("set search_path = ''");
      expect(helper).toContain("\\00A0");
      expect(helper).toContain("\\FEFF");
    }
    expect(normalizedMigration).toContain("alter column fund_id set not null");
    expect(normalizedMigration).toContain(
      "create unique index campaigns_name_unique_idx on public.campaigns (church_id, pg_catalog.lower(name))",
    );
    const immutable = functionBlock("prevent_campaign_route_change");
    for (const token of [
      "CAMPAIGN_SLUG_IMMUTABLE",
      "CAMPAIGN_FUND_IMMUTABLE",
      "CAMPAIGN_CURRENCY_IMMUTABLE",
      "CAMPAIGN_IMAGE_IMMUTABLE",
      "CAMPAIGN_DATES_IMMUTABLE",
    ]) {
      expect(immutable).toContain(token);
    }
    expect(normalizedMigration).toContain(
      "before update of slug, fund_id, currency, image_url, starts_at, ends_at on public.campaigns",
    );
    expect(functionBlock("validate_new_campaign_route")).toContain(
      "fund.status = 'active'",
    );
    expect(normalizedMigration).toContain(
      "where campaign.status in ('draft', 'active') and campaign.currency <> church.default_currency",
    );
    expect(normalizedMigration).toContain(
      "where campaign.status in ('draft', 'active') and fund.status <> 'active'",
    );
  });

  it("returns one typed atomic snapshot even when its campaign array is empty", () => {
    expect(normalizedMigration).toContain(
      "create type public.church_campaign_snapshot as ( church_id uuid, campaigns_revision bigint, campaigns public.church_campaign_record[] )",
    );
    const read = functionBlock("get_church_campaigns");
    expect(read).toContain("returns public.church_campaign_snapshot");
    expect(read).toContain("array[]::public.church_campaign_record[]");
    expect(read).not.toContain("returns setof");
  });

  it("keeps progress separate, permission-gated, exact, and integer-safe", () => {
    const progress = functionBlock("get_church_campaign_progress");
    expect(progress).toContain("returns setof public.church_campaign_progress_record");
    expect(progress).toContain("'campaigns_read'");
    expect(progress).toContain("'financial_read'");
    expect(progress).toContain("donation.source = 'online'");
    expect(progress).toContain(
      "donation.status in ('succeeded', 'partially_refunded')",
    );
    expect(progress).toContain(
      "sum(donation.amount_minor - donation.refunded_amount_minor)",
    );
    expect(progress).toContain("donation.currency = campaign.currency");
    expect(progress).not.toContain("processing_fee_minor");
    expect(progress).not.toContain("donated_at");
    expect(normalizedMigration).toContain(
      "create index donations_campaign_progress_idx on public.donations (church_id, campaign_id, currency) include (amount_minor, refunded_amount_minor) where campaign_id is not null and source = 'online' and status in ('succeeded', 'partially_refunded')",
    );
  });

  it("defines the exact mutation signature and text money result", () => {
    const mutate = functionBlock("mutate_church_campaign");
    for (const argument of [
      "campaign_request_id uuid,",
      "target_church_id uuid,",
      "expected_campaigns_revision bigint,",
      "campaign_operation text,",
      "target_campaign_id uuid default null,",
      "campaign_name text default null,",
      "campaign_slug text default null,",
      "campaign_description text default null,",
      "campaign_fund_id uuid default null,",
      "campaign_goal_amount_minor_text text default null",
    ]) {
      expect(mutate).toContain(argument);
    }
    expect(mutate).toContain(
      "returns public.church_campaign_mutation_result",
    );
    expect(normalizedMigration).toContain("goal_amount_minor_text text");
    expect(mutate).toContain("9007199254740991");
    expect(mutate).not.toContain("campaign_starts");
    expect(mutate).not.toContain("campaign_ends");
  });

  it("uses the conservative explicit lifecycle and freezes edits after draft", () => {
    const mutate = functionBlock("mutate_church_campaign");
    for (const operation of [
      "'create'",
      "'update'",
      "'activate'",
      "'close'",
      "'archive'",
      "'restore'",
    ]) {
      expect(mutate).toContain(operation);
    }
    for (const token of [
      "CAMPAIGNS_NOT_DRAFT",
      "CAMPAIGNS_NOT_ACTIVE",
      "CAMPAIGNS_NOT_CLOSED",
      "CAMPAIGNS_NOT_ARCHIVED",
      "CAMPAIGNS_ACTIVE_RECURRING_GIFTS",
      "CAMPAIGNS_WINDOW_ENDED",
    ]) {
      expect(mutate).toContain(token);
    }
    expect(mutate).toContain("set status = 'active'");
    expect(mutate).toContain("set status = 'closed'");
    expect(mutate).toContain("set status = 'archived'");
    expect(mutate).not.toContain("update public.donations");
    expect(mutate).not.toContain("delete from public.campaigns");
  });

  it("replays before CAS but only after authorization and rechecks after locking", () => {
    const mutate = functionBlock("mutate_church_campaign");
    const firstAuth = mutate.indexOf("public.has_church_permission(");
    const replay = mutate.indexOf("if found then");
    const cas = mutate.indexOf("locked_church.campaigns_revision <>");
    expect(firstAuth).toBeGreaterThanOrEqual(0);
    expect(firstAuth).toBeLessThan(replay);
    expect(replay).toBeLessThan(cas);
    expect(mutate.match(/public\.has_church_permission\(/g)).toHaveLength(2);
    expect(mutate).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(mutate).toContain("set campaigns_revision = next_revision");
  });

  it("keeps replay storage private, forced-RLS, append-only, and indexed", () => {
    expect(normalizedMigration).toContain(
      "alter table public.church_campaign_mutation_requests force row level security",
    );
    expect(migration).not.toMatch(
      /^create policy .*church_campaign_mutation_requests/gm,
    );
    expect(normalizedMigration).toContain(
      "constraint church_campaign_mutation_requests_church_revision_unique unique ( church_id, result_campaigns_revision )",
    );
    expect(normalizedMigration).toContain(
      "create trigger church_campaign_mutation_requests_no_truncate before truncate",
    );
    expect(functionBlock("guard_church_campaign_mutation_request")).toContain(
      "tg_op in ('DELETE', 'TRUNCATE')",
    );
  });

  it("narrows authenticated campaign columns and exposes no progress table", () => {
    expect(normalizedMigration).toContain(
      "revoke select on table public.campaigns from authenticated",
    );
    expect(normalizedMigration).toContain(
      "grant select ( id, church_id, fund_id, name, slug, description, image_url, status, goal_amount_minor, currency, starts_at, ends_at ) on public.campaigns to authenticated",
    );
    expect(normalizedMigration).not.toContain(
      "grant select ( created_by",
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.church_campaign_mutation_requests from public, anon, authenticated, service_role",
    );
    expect(normalizedMigration).toContain(
      "revoke insert, update, delete, truncate, references, trigger on table public.campaigns from anon, authenticated, service_role",
    );
  });

  it("relaxes only P11-managed seed values and skips existing insert triggers", () => {
    const seed = readFileSync(seedPath, "utf8");
    const start = seed.indexOf(
      "with expected (id, church_id, fund_id, slug, currency) as (",
    );
    const end = seed.indexOf(
      "development seed campaign snapshots do not match",
      start,
    );
    const block = seed.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain("c.fund_id is distinct from e.fund_id");
    expect(block).toContain("c.slug is distinct from e.slug");
    expect(block).toContain("c.currency is distinct from e.currency");
    expect(block).not.toContain("c.name is distinct");
    expect(block).not.toContain("c.status");
    expect(block).not.toContain("c.goal_amount_minor");
    expect(seed).toContain("where not exists (\n  select 1 from public.campaigns existing");
  });

  it("ships real PGlite, rollback-only pgTAP, and test:db wiring", () => {
    const runtimeTest = readFileSync(runtimeTestPath, "utf8");
    const hostedTest = readFileSync(hostedTestPath, "utf8");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: { "test:db": string };
    };
    const assertionCount = Array.from(
      hostedTest.matchAll(
        /select extensions\.(?:is|ok|throws_like|throws_ok|is_deeply)\(/g,
      ),
    ).length;
    const planned = Number(
      hostedTest.match(/select extensions\.plan\((\d+)\);/)?.[1],
    );

    expect(runtimeTest).toContain("new PGlite()");
    expect(runtimeTest).toContain("P11_FORCED_LATE_FAILURE");
    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(60);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest).toContain(
      "create extension if not exists pgtap with schema extensions;",
    );
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/campaigns-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/campaigns-postgres.test.ts",
    );
  });
});
