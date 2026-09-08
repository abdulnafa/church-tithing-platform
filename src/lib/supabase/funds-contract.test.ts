import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609050005_fund_management.sql",
);
const runtimeTestPath = resolve(
  process.cwd(),
  "src/lib/supabase/funds-postgres.test.ts",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/006_fund_management.test.sql",
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

describe("P10 fund management migration contract", () => {
  it("ships one atomic aggregate-revision migration", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(normalizedMigration).toContain(
      "add column funds_revision bigint not null default 0",
    );
    expect(normalizedMigration).toContain(
      "constraint churches_funds_revision_nonnegative check (funds_revision >= 0)",
    );
    expect(normalizedMigration).not.toContain("settings_revision =");
  });

  it("adds canonical names/descriptions, immutable slugs, and sparse ordering", () => {
    const canonicalName = functionBlock("canonicalize_fund_name");
    const canonicalDescription = functionBlock(
      "canonicalize_fund_description",
    );
    for (const helper of [canonicalName, canonicalDescription]) {
      expect(helper).toContain("immutable");
      expect(helper).toContain("strict");
      expect(helper).toContain("set search_path = ''");
      expect(helper).toContain("\\00A0");
      expect(helper).toContain("\\FEFF");
    }
    expect(canonicalName).toContain("\\2000-\\200A");
    expect(canonicalDescription).toContain("E'\\r\\n', E'\\n'");
    expect(normalizedMigration).toContain("constraint funds_name_canonical check");
    expect(normalizedMigration).toContain(
      "constraint funds_description_canonical check",
    );
    expect(normalizedMigration).toContain(
      "constraint funds_sort_order_nonnegative check (sort_order >= 0)",
    );
    expect(normalizedMigration).toContain(
      "create unique index funds_name_unique_idx on public.funds (church_id, pg_catalog.lower(name))",
    );
    expect(normalizedMigration).toContain(
      "create unique index funds_active_sort_order_unique_idx on public.funds (church_id, sort_order) where status = 'active'",
    );
    expect(functionBlock("prevent_fund_slug_change")).toContain(
      "FUND_SLUG_IMMUTABLE",
    );
    expect(normalizedMigration).toContain(
      "create trigger funds_keep_slug before update of slug on public.funds",
    );
    expect(normalizedMigration).not.toMatch(/row_number\s*\(/i);
  });

  it("defines exact typed read and mutation contracts", () => {
    expect(normalizedMigration).toContain(
      "create type public.church_fund_record as ( church_id uuid, fund_id uuid, name text, slug text, description text, status public.fund_status, is_default boolean, sort_order integer, funds_revision bigint )",
    );
    expect(normalizedMigration).toContain(
      "create type public.church_fund_mutation_result as ( church_id uuid, fund_id uuid, name text, slug text, description text, status public.fund_status, is_default boolean, sort_order integer, funds_revision bigint, replayed boolean )",
    );
    expect(functionBlock("get_church_funds")).toContain(
      "returns setof public.church_fund_record",
    );
    const mutate = functionBlock("mutate_church_fund");
    for (const argument of [
      "fund_request_id uuid,",
      "target_church_id uuid,",
      "expected_funds_revision bigint,",
      "fund_operation text,",
      "target_fund_id uuid default null,",
      "fund_name text default null,",
      "fund_slug text default null,",
      "fund_description text default null",
    ]) {
      expect(mutate).toContain(argument);
    }
    expect(mutate).toContain("returns public.church_fund_mutation_result");
  });

  it("keeps read and mutation authorization independently fail closed", () => {
    const read = functionBlock("get_church_funds");
    const mutate = functionBlock("mutate_church_fund");
    for (const block of [read, mutate]) {
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
      expect(block).toContain("public.has_church_permission(");
      expect(block).toContain("FUNDS_FORBIDDEN");
    }
    expect(read).toContain("'funds_read'");
    expect(mutate).toContain("'funds_manage'");
    expect(mutate.match(/public\.has_church_permission\(/g)).toHaveLength(2);
    expect(mutate.indexOf("into locked_church")).toBeLessThan(
      mutate.lastIndexOf("public.has_church_permission("),
    );
  });

  it("validates the finite operation and canonical field shapes", () => {
    const mutate = functionBlock("mutate_church_fund");
    const normalizedMutate = mutate.replace(/\s+/g, " ");
    for (const operation of [
      "'create'",
      "'update'",
      "'set_default'",
      "'move_up'",
      "'move_down'",
      "'archive'",
      "'restore'",
    ]) {
      expect(mutate).toContain(operation);
    }
    expect(mutate).toContain("not between 2 and 120");
    expect(mutate).toContain("not between 1 and 80");
    expect(mutate).toContain("'^[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(mutate).toContain("char_length(canonical_description) > 500");
    expect(mutate).toContain("public.canonicalize_fund_name(fund_name)");
    expect(normalizedMutate).toContain(
      "public.canonicalize_fund_description( fund_description )",
    );

    for (const token of [
      "FUNDS_FORBIDDEN",
      "FUNDS_INVALID_REQUEST_ID",
      "FUNDS_INVALID_EXPECTED_REVISION",
      "FUNDS_INVALID_OPERATION",
      "FUNDS_INVALID_ARGUMENTS",
      "FUNDS_INVALID_NAME",
      "FUNDS_INVALID_SLUG",
      "FUNDS_INVALID_DESCRIPTION",
      "FUNDS_IDEMPOTENCY_CONFLICT",
      "FUNDS_REVISION_CONFLICT",
      "FUNDS_NOT_FOUND",
      "FUNDS_NO_CHANGES",
      "FUNDS_NAME_CONFLICT",
      "FUNDS_SLUG_CONFLICT",
      "FUNDS_NOT_ACTIVE",
      "FUNDS_NOT_ARCHIVED",
      "FUNDS_ORDER_BOUNDARY",
      "FUNDS_ORDER_EXHAUSTED",
      "FUNDS_DEFAULT_REQUIRED",
      "FUNDS_OPEN_CAMPAIGNS",
      "FUNDS_ACTIVE_RECURRING_GIFTS",
    ]) {
      expect(mutate).toContain(token);
    }
  });

  it("replays before CAS and serializes both request and church aggregates", () => {
    const mutate = functionBlock("mutate_church_fund");
    expect(mutate).toContain("pg_catalog.sha256");
    expect(mutate).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(mutate.indexOf("if found then")).toBeLessThan(
      mutate.indexOf("locked_church.funds_revision <>"),
    );
    expect(mutate).toContain("from public.churches church");
    expect(mutate).toContain("for update;");
    expect(mutate).toContain("set funds_revision = next_revision");
    expect(mutate).toContain("mutation_result.replayed := true");
    expect(mutate).toContain("mutation_result.replayed := false");
  });

  it("uses safe lifecycle dependencies and never rewrites gift history", () => {
    const mutate = functionBlock("mutate_church_fund");
    expect(mutate).toContain("campaign.status in ('draft', 'active')");
    expect(mutate).toContain(
      "recurring.status in ('incomplete', 'active', 'paused', 'past_due')",
    );
    expect(mutate).toContain("FUNDS_DEFAULT_REQUIRED");
    expect(mutate).toContain("set status = 'archived'");
    expect(mutate).toContain(
      "set status = 'active', is_default = false, sort_order = next_sort_order",
    );
    expect(mutate).not.toContain("update public.donations");
    expect(mutate).not.toContain("update public.recurring_gifts");
    expect(mutate).not.toContain("delete from public.funds");
  });

  it("stores exact replay snapshots in an append-only private ledger", () => {
    expect(normalizedMigration).toContain(
      "alter table public.church_fund_mutation_requests enable row level security",
    );
    expect(normalizedMigration).toContain(
      "alter table public.church_fund_mutation_requests force row level security",
    );
    expect(migration).not.toMatch(
      /^create policy .*church_fund_mutation_requests/gm,
    );
    expect(normalizedMigration).toContain(
      "constraint church_fund_mutation_requests_church_revision_unique unique ( church_id, result_funds_revision )",
    );
    expect(normalizedMigration).toContain(
      "constraint church_fund_mutation_requests_audit_unique unique (audit_log_id)",
    );
    expect(normalizedMigration).toContain(
      "create index church_fund_mutation_requests_result_fund_idx on public.church_fund_mutation_requests (church_id, result_fund_id)",
    );
    expect(normalizedMigration).toContain(
      "create trigger church_fund_mutation_requests_no_truncate before truncate",
    );
    expect(functionBlock("guard_church_fund_mutation_request")).toContain(
      "tg_op in ('DELETE', 'TRUNCATE')",
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.church_fund_mutation_requests from public, anon, authenticated, service_role",
    );
  });

  it("writes only identifiers and derived field names to the audit log", () => {
    const mutate = functionBlock("mutate_church_fund");
    const auditStart = mutate.indexOf(
      "inserted_audit_log_id := public.append_audit_event(",
    );
    const auditEnd = mutate.indexOf("\n  );", auditStart);
    const audit = mutate.slice(auditStart, auditEnd);
    expect(audit).toContain("event_actor_type => 'user'");
    expect(audit).toContain("event_entity => 'fund'");
    expect(audit).toContain("event_sanitized_changes => audit_changes");
    expect(mutate).toContain("'field_names', sorted_field_names");
    expect(mutate).toContain("'fund_id', target_fund.id");
    expect(audit).not.toContain("canonical_name");
    expect(audit).not.toContain("canonical_description");
  });

  it("keeps seed identities stable without pinning P10-managed values", () => {
    const seed = readFileSync(seedPath, "utf8");
    const start = seed.indexOf("with expected (id, church_id, slug) as (");
    const end = seed.indexOf(
      "development seed fund snapshots do not match",
      start,
    );
    const block = seed.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain("f.slug is distinct from e.slug");
    expect(block).not.toContain("f.name is distinct");
    expect(block).not.toContain("f.status");
    expect(block).not.toContain("f.is_default");
    expect(block).not.toContain("f.sort_order");
    expect(seed).toContain("and f.is_default and f.status = 'active'");
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
    expect(runtimeTest).toContain("P10_FORCED_LATE_FAILURE");
    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(50);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/funds-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/funds-postgres.test.ts",
    );
  });
});
