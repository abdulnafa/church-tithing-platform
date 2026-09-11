import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const foundation = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608180001_initial_schema.sql",
  ),
  "utf8",
);
const permissions = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609050002_staff_permissions_and_audit_foundation.sql",
  ),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609110014_qr_resolution.sql",
  ),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/013_qr_resolution.test.sql"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const normalizedFoundation = foundation.replace(/\s+/g, " ").trim();
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P17 QR resolution database contract", () => {
  it("is one atomic migration after the prayer privacy migration", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/create table|alter type/i);
  });

  it("resolves one exact canonical code to only a canonical church slug", () => {
    const resolver = functionBlock("resolve_public_qr");
    expect(resolver).toMatch(/returns table \(\s*church_slug text\s*\)/);
    expect(resolver).toContain("security definer");
    expect(resolver).toContain("set search_path = ''");
    expect(resolver).toContain("rows 1");
    expect(resolver).toContain("limit 1");
    expect(resolver).toContain(
      "pg_catalog.char_length(target_short_code) between 8 and 64",
    );
    expect(resolver).toContain(
      "target_short_code = pg_catalog.lower(target_short_code)",
    );
    expect(resolver).toContain(
      "target_short_code ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'",
    );
    expect(resolver).toContain(
      "pg_catalog.lower(qr_link.short_code) = target_short_code",
    );
    expect(resolver).not.toMatch(/raise exception/i);
  });

  it("fails closed for unavailable routing state without accepting a URL or host", () => {
    const resolver = functionBlock("resolve_public_qr");
    expect(resolver).toContain("qr_link.kind = 'church'");
    expect(resolver).toContain("qr_link.fund_id is null");
    expect(resolver).toContain("qr_link.campaign_id is null");
    expect(resolver).toContain("qr_link.is_active");
    expect(resolver).toContain("church.status = 'active'");
    expect(resolver).toContain("church.slug = pg_catalog.lower(church.slug)");
    expect(resolver).not.toMatch(
      /https?:|redirect|hostname|origin|display_name|legal_name|support_email|donors|donations|provider|subscription|amount|currency/i,
    );
  });

  it("relies on the stable one-code-per-church schema invariants and indexed exact lookup", () => {
    expect(normalizedFoundation).toContain(
      "create unique index qr_links_short_code_unique_idx on public.qr_links (lower(short_code));",
    );
    expect(normalizedFoundation).toContain(
      "create unique index qr_links_one_church_code_idx on public.qr_links (church_id);",
    );
    expect(normalizedFoundation).toContain(
      "create trigger qr_links_keep_routing before update on public.qr_links",
    );
    expect(normalizedFoundation).toContain(
      "create constraint trigger qr_links_require_one_per_church",
    );
  });

  it("returns the exact permission-checked dashboard snapshot", () => {
    const snapshot = functionBlock("get_church_qr_snapshot");
    expect(snapshot).toMatch(
      /returns table \(\s*church_id uuid,\s*church_slug text,\s*short_code text,\s*is_active boolean\s*\)/,
    );
    expect(snapshot).toContain("security definer");
    expect(snapshot).toContain("set search_path = ''");
    expect(snapshot).toContain("rows 1");
    expect(snapshot).toContain(
      "public.has_church_permission(target_church_id, 'qr_read')",
    );
    expect(snapshot).toContain("raise exception 'QR_SNAPSHOT_FORBIDDEN'");
    expect(snapshot).toContain("using errcode = '42501'");
    expect(snapshot).toContain("limit 1");
    expect(snapshot).not.toMatch(
      /display_name|legal_name|support_email|donors|donations|provider|subscription|amount|currency|scan_count|last_scanned_at/i,
    );
    expect(permissions).toContain("church.status in ('active', 'onboarding')");
  });

  it("closes direct browser-table access and grants each RPC only to its intended role", () => {
    expect(normalizedMigration).toContain(
      "drop policy if exists qr_links_permission_read on public.qr_links;",
    );
    expect(normalizedMigration).toContain(
      "revoke select on table public.qr_links from public, anon, authenticated;",
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.resolve_public_qr(text), public.get_church_qr_snapshot(uuid) from public, anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.resolve_public_qr(text) to anon;",
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.get_church_qr_snapshot(uuid) to authenticated;",
    );
    expect(normalizedFoundation).toContain(
      "grant select on public.qr_links to service_role;",
    );
    expect(normalizedFoundation).toContain(
      "grant update (is_active, scan_count, last_scanned_at, updated_at) on public.qr_links to service_role;",
    );
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
      "src/lib/supabase/qr-resolution-contract.test.ts",
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/qr-resolution-postgres.test.ts",
    );
  });
});
