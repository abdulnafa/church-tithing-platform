import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609070009_platform_tenant_management.sql",
  ),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/009_platform_tenant_management.test.sql"),
  "utf8",
);
const priorRlsTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/002_rls_tenant_isolation.test.sql"),
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

describe("P13 platform tenant-management migration contract", () => {
  it("is one atomic ordered migration with a fail-closed timestamp preflight", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(migration).toContain("P13_EXISTING_LIFECYCLE_TIMESTAMPS_INVALID");
    expect(normalizedMigration).toContain(
      "add constraint churches_lifecycle_timestamps_consistent",
    );
    expect(normalizedMigration).not.toMatch(
      /update public\.churches[\s\S]*set[\s\S]*activated_at[\s\S]*where[\s\S]*status =/i,
    );
  });

  it("adds a bounded lifecycle revision and an indexed keyset order", () => {
    expect(normalizedMigration).toContain(
      "add column lifecycle_revision bigint not null default 0",
    );
    expect(normalizedMigration).toContain("check (lifecycle_revision >= 0)");
    expect(normalizedMigration).toContain(
      "create index churches_platform_keyset_idx on public.churches (created_at desc, id desc);",
    );
  });

  it("exposes only a minimum identity-free non-financial tenant record", () => {
    const tenant = typeBlock("platform_tenant_record");
    expect(tenant).toContain("foundation_ready boolean");
    expect(tenant).toContain("missing_readiness_codes text[]");
    expect(tenant).not.toMatch(/owner|email|legal_name|support_email/i);
    expect(tenant).not.toMatch(/subscription|provider|donation|amount|volume/i);

    const list = functionBlock("get_platform_tenants");
    expect(list).toContain("tenant_page_size not between 1 and 50");
    expect(list).toContain("(church.created_at, church.id) <");
    expect(list).toContain("order by church.created_at desc, church.id desc");
    expect(list).toContain("PLATFORM_TENANTS_FORBIDDEN");
    expect(list).toContain(
      "candidate.default_currency in ('BBD', 'USD', 'CAD', 'XCD')",
    );
    expect(list).toContain("timezone_record.name = candidate.timezone");
    expect(list).toContain("else null");
    expect(list).not.toMatch(
      /platform_subscriptions|payment_provider|donations|donors|auth\.users/i,
    );
  });

  it("derives only approved foundation checks and keeps branding optional", () => {
    const readiness = functionBlock("platform_tenant_missing_readiness");
    expect(readiness).toContain("'active_owner'");
    expect(readiness).toContain("'church_profile'");
    expect(readiness).toContain("'default_fund'");
    expect(readiness).toContain("'permanent_qr'");
    expect(readiness).not.toMatch(/logo|primary_color|secondary_color/i);
    expect(readiness).not.toMatch(
      /platform_subscriptions|payment_provider|donations|donors/i,
    );
  });

  it("allows only the conservative manual lifecycle graph", () => {
    const mutation = functionBlock("mutate_platform_tenant_lifecycle");
    expect(mutation).toContain("'activate', 'suspend', 'restore'");
    expect(mutation).toContain("prior_status <> 'onboarding'");
    expect(mutation).toContain("prior_status <> 'active'");
    expect(mutation).toContain("prior_status <> 'suspended'");
    expect(mutation).toContain("PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED");
    expect(mutation).toContain("PLATFORM_LIFECYCLE_TENANT_NOT_READY");
    expect(mutation).not.toMatch(/cancel|archive|subscription|provider|billing/i);
  });

  it("uses finite neutral suspension reasons and identifier-only audit data", () => {
    const mutation = functionBlock("mutate_platform_tenant_lifecycle");
    for (const reason of [
      "administrative_hold",
      "compliance_review",
      "security_review",
      "church_request",
    ]) {
      expect(mutation).toContain(`'${reason}'`);
    }
    expect(mutation).toContain("'reason_code', audit_reason_code");
    expect(mutation).toContain("event_action => 'church_status_changed'");
    expect(mutation).not.toMatch(/church\.name|owner_email|support_email/i);
  });

  it("checks exact replay before CAS and reauthorizes after the row lock", () => {
    const mutation = functionBlock("mutate_platform_tenant_lifecycle");
    const replay = mutation.indexOf(
      "from public.platform_tenant_lifecycle_requests",
    );
    const lock = mutation.indexOf("from public.churches church", replay);
    const reauthorization = mutation.indexOf("is_platform_super_admin", lock);
    const cas = mutation.indexOf("PLATFORM_LIFECYCLE_REVISION_CONFLICT", lock);
    expect(replay).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(replay);
    expect(reauthorization).toBeGreaterThan(lock);
    expect(cas).toBeGreaterThan(reauthorization);
    expect(mutation).toContain("PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT");
  });

  it("persists one independently revised future-default row", () => {
    expect(normalizedMigration).toContain(
      "create table public.platform_onboarding_defaults",
    );
    expect(normalizedMigration).toContain(
      "insert into public.platform_onboarding_defaults (singleton_key) values (true);",
    );
    expect(normalizedMigration).toContain(
      "default_currency text not null default 'BBD'",
    );
    expect(normalizedMigration).toContain(
      "default_timezone text not null default 'America/Barbados'",
    );
    expect(normalizedMigration).toContain(
      "default_primary_color text not null default '#1F6D60'",
    );
    expect(normalizedMigration).toContain(
      "default_secondary_color text not null default '#E1B85A'",
    );
  });

  it("validates, canonicalizes, CAS-checks, and audits changed setting keys", () => {
    const update = functionBlock("update_platform_onboarding_defaults");
    expect(update).toContain("PLATFORM_DEFAULTS_INVALID_CURRENCY");
    expect(update).toContain("pg_timezone_names");
    expect(update).toContain("^#[0-9A-F]{6}$");
    expect(update).toContain("PLATFORM_DEFAULTS_REVISION_CONFLICT");
    expect(update).toContain("PLATFORM_DEFAULTS_NO_CHANGES");
    expect(update).toContain("PLATFORM_DEFAULTS_IDEMPOTENCY_CONFLICT");
    expect(update).toContain("event_action => 'platform_settings_updated'");
    expect(update).toContain("'setting_keys', to_jsonb(changed_setting_keys)");
  });

  it("keeps both idempotency ledgers private, forced-RLS, and append-only", () => {
    for (const table of [
      "platform_tenant_lifecycle_requests",
      "platform_onboarding_default_requests",
    ]) {
      expect(normalizedMigration).toContain(
        `alter table public.${table} enable row level security;`,
      );
      expect(normalizedMigration).toContain(
        `alter table public.${table} force row level security;`,
      );
    }
    expect(migration).toContain("PLATFORM_MANAGEMENT_LEDGER_APPEND_ONLY");
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.platform_onboarding_defaults, public.platform_tenant_lifecycle_requests, public.platform_onboarding_default_requests from public, anon, authenticated, service_role;",
    );
  });

  it("removes provisional broad Super Admin policies and escalation writes", () => {
    expect(normalizedMigration).toContain(
      "create policy platform_admins_read_self on public.platform_admins for select to authenticated",
    );
    for (const policy of [
      "churches_platform_admin_read",
      "funds_platform_admin_read",
      "campaigns_platform_admin_read",
      "qr_links_platform_admin_read",
      "platform_subscriptions_platform_admin_read",
    ]) {
      expect(normalizedMigration).toContain(`drop policy if exists ${policy}`);
    }
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.platform_admins from service_role;",
    );
    expect(normalizedMigration).toContain(
      "grant select (user_id, role, is_active) on public.platform_admins to authenticated;",
    );
    expect(priorRlsTest).toContain(
      "super administrator direct identity reads are self-only",
    );
    expect(priorRlsTest).not.toContain(
      "super administrator sees all platform administrator rows",
    );
  });

  it("grants only the reviewed authenticated RPC surface", () => {
    expect(normalizedMigration).toContain(
      "grant execute on function public.get_platform_tenants(integer, timestamptz, uuid), public.mutate_platform_tenant_lifecycle(uuid, uuid, bigint, text, text), public.get_platform_onboarding_defaults(), public.update_platform_onboarding_defaults( uuid, bigint, text, text, text, text ) to authenticated;",
    );
  });

  it("ships a rollback-only hosted suite and database-script wiring", () => {
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
      "src/lib/supabase/platform-contract.test.ts",
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/platform-postgres.test.ts",
    );
  });
});
