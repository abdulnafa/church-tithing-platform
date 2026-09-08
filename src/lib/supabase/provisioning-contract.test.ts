import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609050003_provision_church_rpc.sql",
);
const runtimeTestPath = resolve(
  process.cwd(),
  "src/lib/supabase/provisioning-postgres.test.ts",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/004_church_provisioning.test.sql",
);
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

describe("P08 church provisioning migration contract", () => {
  it("ships an atomic typed scalar-composite RPC contract", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(normalizedMigration).toContain(
      "create type public.church_provisioning_result as ( church_id uuid, church_slug text, owner_membership_id uuid, owner_membership_status public.membership_status, default_fund_id uuid, qr_short_code text, replayed boolean );",
    );

    const rpc = functionBlock("provision_church");
    expect(rpc).toContain("returns public.church_provisioning_result");
    expect(rpc).not.toContain("returns setof");
    expect(rpc).toContain("church_legal_name text,");
    expect(rpc).toContain("church_support_email text,");
    expect(rpc).not.toContain("church_legal_name text default");
    expect(rpc).not.toContain("church_support_email text default");
  });

  it("keeps the idempotency ledger private, RLS-enabled, and append-only", () => {
    expect(normalizedMigration).toContain(
      "create table public.church_provisioning_requests",
    );
    expect(normalizedMigration).toContain(
      "constraint church_provisioning_requests_pkey primary key ( requested_by_user_id, request_id )",
    );
    expect(normalizedMigration).toContain(
      "alter table public.church_provisioning_requests enable row level security;",
    );
    expect(normalizedMigration).toContain(
      "alter table public.church_provisioning_requests force row level security;",
    );
    expect(migration).not.toMatch(
      /^create policy .*church_provisioning_requests/gm,
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.church_provisioning_requests from public, anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "create trigger church_provisioning_requests_append_only before update or delete",
    );
    expect(normalizedMigration).toContain(
      "create trigger church_provisioning_requests_reject_truncate before truncate",
    );
    expect(normalizedMigration).not.toContain(
      "church_provisioning_requests_membership_fkey",
    );
    expect(normalizedMigration).toContain(
      "Immutable provisioning-result UUID snapshot without a membership lifecycle foreign key",
    );
  });

  it("authenticates an active platform super admin and exposes only the RPC", () => {
    const rpc = functionBlock("provision_church");
    expect(rpc).toContain("request_user_id := (select auth.uid())");
    expect(rpc).toContain("public.is_platform_super_admin()");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("set search_path = ''");
    expect(normalizedMigration).toContain(
      "grant execute on function public.provision_church( uuid, text, text, text, text, text, text, text, text, text, text ) to authenticated;",
    );
    expect(normalizedMigration).not.toContain(
      "to anon, authenticated, service_role; grant execute",
    );
  });

  it("canonicalizes and validates every accepted field at the database boundary", () => {
    const rpc = functionBlock("provision_church");
    expect(rpc).toContain("'[[:space:]]+'");
    expect(rpc).toContain("'[[:cntrl:]]'");
    expect(rpc).toContain("not between 2 and 120");
    expect(rpc).toContain("not between 2 and 160");
    expect(rpc).toContain("'^[a-z0-9]+(-[a-z0-9]+)*$'");
    expect(rpc).toContain("public.is_valid_provisioning_email");
    expect(functionBlock("is_valid_provisioning_email")).toContain(
      "between 1 and 64",
    );
    expect(rpc).toContain("('BBD', 'USD', 'CAD', 'XCD')");
    expect(rpc).toContain("pg_catalog.pg_timezone_names");
    expect(rpc).toContain("'^#[0-9A-F]{6}$'");
    expect(rpc).toContain("char_length(canonical_thank_you_message) > 500");

    for (const error of [
      "PROVISION_FORBIDDEN",
      "PROVISION_REQUEST_ID_REQUIRED",
      "PROVISION_INVALID_CHURCH_NAME",
      "PROVISION_INVALID_LEGAL_NAME",
      "PROVISION_INVALID_SLUG",
      "PROVISION_INVALID_OWNER_EMAIL",
      "PROVISION_INVALID_SUPPORT_EMAIL",
      "PROVISION_INVALID_CURRENCY",
      "PROVISION_INVALID_TIMEZONE",
      "PROVISION_INVALID_PRIMARY_COLOR",
      "PROVISION_INVALID_SECONDARY_COLOR",
      "PROVISION_INVALID_THANK_YOU_MESSAGE",
      "PROVISION_OWNER_PROFILE_INACTIVE",
      "PROVISION_IDEMPOTENCY_CONFLICT",
      "PROVISION_SLUG_UNAVAILABLE",
      "PROVISION_INTERNAL_CHILD_RECORDS",
    ]) {
      expect(rpc).toContain(error);
    }
  });

  it("serializes requests and fingerprints canonical payloads for exact replay", () => {
    const rpc = functionBlock("provision_church");
    expect(rpc).toContain("pg_catalog.sha256");
    expect(rpc).toContain("canonical_payload::text");
    expect(rpc.match(/pg_catalog\.pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(rpc).toContain("'provision-request:'");
    expect(rpc).toContain("'provision-slug:'");
    expect(rpc).toContain(
      "existing_request.payload_sha256 <> canonical_payload_sha256",
    );
    expect(rpc).toContain("provisioned_result.replayed := true");
    expect(rpc).toContain("provisioned_result.replayed := false");
  });

  it("resolves owner state conservatively and creates only approved records", () => {
    const rpc = functionBlock("provision_church");
    expect(rpc).toContain("auth_user.email_confirmed_at is not null");
    expect(rpc).toContain("profile.is_active");
    expect(rpc).toContain("resolved_owner_status := 'active'");
    expect(rpc).toContain("resolved_owner_status := 'invited'");
    expect(rpc).toContain("insert into public.churches");
    expect(rpc).toContain("insert into public.church_memberships");
    expect(rpc.match(/insert into public\.church_memberships/g)).toHaveLength(2);
    expect(rpc).not.toMatch(/insert into auth\.users/i);
    expect(rpc).not.toMatch(/insert into public\.platform_subscriptions/i);
    expect(rpc).not.toMatch(/insert into public\.payment_provider_connections/i);
    expect(rpc).not.toMatch(/insert into public\.email_events/i);
    expect(rpc).toContain("'onboarding'");
    expect(rpc).toContain("'{}'::jsonb");
  });

  it("writes one P07-compatible non-PII support audit event", () => {
    const rpc = functionBlock("provision_church");
    const auditStart = rpc.indexOf(
      "inserted_audit_log_id := public.append_audit_event(",
    );
    const auditEnd = rpc.indexOf("\n  );", auditStart);
    const audit = rpc.slice(auditStart, auditEnd);

    expect(audit).toContain("event_actor_type => 'support'");
    expect(audit).toContain("event_action => 'church_provisioned'");
    expect(audit).toContain("event_actor_user_id => request_user_id");
    for (const key of [
      "church_slug",
      "currency",
      "owner_membership_status",
      "default_fund_id",
      "qr_short_code",
    ]) {
      expect(audit).toContain(`'${key}'`);
    }
    expect(audit).not.toContain("canonical_owner_email");
    expect(audit).not.toContain("canonical_support_email");
    expect(audit).not.toContain("canonical_display_name");
    expect(audit).not.toContain("canonical_legal_name");
    expect(audit).not.toContain("canonical_thank_you_message");
  });

  it("ships executable PGlite and exact rollback-only pgTAP coverage", () => {
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
    expect(runtimeTest).toContain("P08_FORCED_LATE_FAILURE");
    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(35);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/provisioning-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/provisioning-postgres.test.ts",
    );
  });
});
