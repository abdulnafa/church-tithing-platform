import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609050002_staff_permissions_and_audit_foundation.sql",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/003_staff_permissions_and_audit.test.sql",
);
const packagePath = resolve(process.cwd(), "package.json");

const migration = readFileSync(migrationPath, "utf8");
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

const expectedPermissions = [
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
] as const;

const expectedAuditActions = [
  "legacy_imported",
  "platform_settings_updated",
  "church_provisioned",
  "church_settings_updated",
  "church_status_changed",
  "staff_invited",
  "staff_removed",
  "staff_role_changed",
  "fund_created",
  "fund_updated",
  "fund_archived",
  "campaign_created",
  "campaign_updated",
  "campaign_archived",
  "provider_connection_updated",
  "subscription_updated",
  "report_exported",
  "receipt_issued",
  "prayer_request_reviewed",
  "webhook_processed",
  "email_status_updated",
] as const;

function enumValues(name: string) {
  const block = migration.match(
    new RegExp(`create type public\\.${name} as enum \\(([\\s\\S]*?)\\);`),
  )?.[1];

  expect(block, `${name} should be declared`).toBeDefined();
  return Array.from(block?.matchAll(/'([^']+)'/g) ?? [], (match) => match[1]);
}

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);

  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P07 permission and audit migration contract", () => {
  it("ships as a new atomic migration with finite catalogs", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(migration.match(/^create table /gm) ?? []).toHaveLength(0);
    expect(enumValues("church_permission")).toEqual(expectedPermissions);
    expect(enumValues("audit_action")).toEqual(expectedAuditActions);
    expect(enumValues("audit_entity")).toEqual([
      "platform_settings",
      "church",
      "church_membership",
      "fund",
      "campaign",
      "payment_provider_connection",
      "platform_subscription",
      "report",
      "receipt",
      "prayer_request",
      "webhook_event",
      "email_event",
    ]);
  });

  it("defines fail-closed permission helpers with exact API signatures", () => {
    const list = functionBlock("get_my_church_permissions");
    const predicate = functionBlock("has_church_permission");

    for (const block of [list, predicate]) {
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
    }

    expect(list).toContain("profile.is_active");
    expect(list).toContain("membership.status = 'active'");
    expect(list).toContain("church.status in ('active', 'onboarding')");
    expect(list).toContain("membership.user_id = (select auth.uid())");
    expect(list).toContain("'{}'::public.church_permission[]");
    expect(predicate).toContain(
      "public.get_my_church_permissions(target_church_id)",
    );

    expect(normalizedMigration).toContain(
      "grant execute on function public.get_my_church_permissions(uuid) to authenticated;",
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.has_church_permission( uuid, public.church_permission ) to authenticated;",
    );
  });

  it("encodes the conservative role matrix without unsupported powers", () => {
    const list = functionBlock("get_my_church_permissions");

    for (const permission of [
      "workspace_read",
      "funds_read",
      "campaigns_read",
      "qr_read",
    ]) {
      expect(list.match(new RegExp(`'${permission}'`, "g"))).toHaveLength(4);
    }

    expect(list.match(/'funds_manage'/g)).toHaveLength(1);
    expect(list.match(/'campaigns_manage'/g)).toHaveLength(1);
    expect(list.match(/'settings_manage'/g)).toHaveLength(1);
    expect(list.match(/'staff_manage'/g)).toHaveLength(1);
    expect(list.match(/'audit_read'/g)).toHaveLength(1);
    expect(list.match(/'billing_manage'/g)).toHaveLength(1);
    expect(list.match(/'provider_status_read'/g)).toHaveLength(2);
    expect(list.match(/'email_status_read'/g)).toHaveLength(2);
    expect(list.match(/'prayer_requests_review'/g)).toHaveLength(1);
    expect(list.match(/'financial_read'/g)).toHaveLength(3);

    const permissionCatalog = enumValues("church_permission").join(" ");
    const actionCatalog = enumValues("audit_action").join(" ");
    for (const unsupported of [
      "ownership_transfer",
      "owner_change",
      "recurring_cancel",
      "manual_gift",
      "statement_publish",
      "prayer_delete",
      "support_impersonate",
      "refund",
    ]) {
      expect(permissionCatalog).not.toContain(unsupported);
      expect(actionCatalog).not.toContain(unsupported);
    }
  });

  it("rewrites tenant RLS to named permissions and leaves writes closed", () => {
    const policyStatements =
      migration.match(/^create policy [\s\S]*?;$/gm)?.join("\n") ?? "";

    expect(policyStatements).not.toContain("has_church_role");
    expect(policyStatements).not.toContain("is_church_member");

    for (const mapping of [
      ["churches_workspace_read", "workspace_read"],
      ["funds_permission_read", "funds_read"],
      ["campaigns_permission_read", "campaigns_read"],
      ["donors_permission_read", "members_read"],
      ["payment_connections_permission_read", "provider_status_read"],
      ["recurring_gifts_permission_read", "financial_read"],
      ["donations_permission_read", "financial_read"],
      ["prayer_requests_permission_read", "prayer_requests_review"],
      ["receipts_permission_read", "receipts_read"],
      ["annual_statements_permission_read", "statements_read"],
      ["statement_donations_permission_read", "statements_read"],
      ["platform_subscriptions_permission_read", "billing_manage"],
      ["qr_links_permission_read", "qr_read"],
      ["email_events_permission_read", "email_status_read"],
      ["audit_logs_permission_read", "audit_read"],
    ] as const) {
      expect(policyStatements).toContain(`create policy ${mapping[0]}`);
      expect(policyStatements).toContain(`'${mapping[1]}'`);
    }
    expect(policyStatements).toContain(
      "public.can_read_own_church_membership(church_id)",
    );
    expect(policyStatements).not.toContain(
      "audit_logs_platform_super_admin_read",
    );

    const authenticatedWrites = (migration.match(/^grant[\s\S]*?;$/gm) ?? [])
      .map((statement) => statement.replace(/\s+/g, " ").toLowerCase())
      .filter(
        (statement) =>
          statement.endsWith("to authenticated;") &&
          /\b(insert|update|delete|truncate)\b/.test(statement),
      );
    expect(authenticatedWrites).toEqual([]);
  });

  it("converts audit actors to immutable snapshots", () => {
    expect(normalizedMigration).toContain(
      "drop constraint if exists audit_logs_actor_user_id_fkey",
    );
    expect(normalizedMigration).toContain(
      "add column actor_display_name_snapshot text",
    );
    expect(normalizedMigration).toContain("add column actor_role_snapshot text");
    expect(normalizedMigration).toContain(
      "create trigger audit_logs_capture_actor_snapshot before insert on public.audit_logs",
    );
    expect(normalizedMigration).toContain(
      "create trigger audit_logs_append_only before update or delete on public.audit_logs",
    );
    expect(functionBlock("capture_audit_actor_snapshot")).toContain(
      "security definer",
    );
    const snapshot = functionBlock("capture_audit_actor_snapshot");
    expect(snapshot).toContain("membership.status = 'active'");
    expect(snapshot).toContain("church.status in ('active', 'onboarding')");
    expect(snapshot).toContain("administrator.is_active");
    expect(snapshot).toContain("profile.is_active");
    expect(snapshot).toContain("request_user_id := (select auth.uid())");
    expect(snapshot).toContain(
      "human audit actor must match authenticated request identity",
    );
    expect(snapshot).not.toContain(
      "nullif(btrim(new.actor_display_name_snapshot), '')",
    );
    expect(normalizedMigration).toContain(
      "actor_display_name_snapshot = left(coalesce(",
    );
  });

  it("uses a private typed writer with action-specific safe shapes", () => {
    const scalarGuard = functionBlock("audit_scalar_is_safe");
    const shapeGuard = functionBlock("audit_changes_match_action");
    const writer = functionBlock("append_audit_event");

    expect(scalarGuard).toContain("sk_(live|test)");
    expect(scalarGuard).toContain("between 12 and 19");
    expect(shapeGuard).toContain("allowed_keys := case event_action");
    expect(shapeGuard).toContain("'setting_keys'");
    expect(shapeGuard).toContain("'owner_membership_status'");
    expect(shapeGuard).toContain("'default_fund_id'");
    expect(shapeGuard).toContain("if not (item.key = any(allowed_keys))");
    for (const unsafeAlias of [
      "data",
      "value",
      "content",
      "credential",
      "apikey",
      "session",
      "account_number",
    ]) {
      expect(shapeGuard).not.toContain(`'${unsafeAlias}'`);
    }
    expect(writer).toContain("event_action public.audit_action");
    expect(writer).toContain("event_entity public.audit_entity");
    expect(writer).not.toContain("event_actor_display_name_snapshot text");
    expect(writer).not.toContain("event_actor_role_snapshot text");
    expect(writer).toContain("event_action = 'legacy_imported'");
    expect(writer).toContain("event_action = 'platform_settings_updated'");
    expect(writer).toContain(
      "global platform settings audit events cannot have a church",
    );
    expect(writer).toContain("audit action and entity do not match");
    expect(writer).toContain("pg_catalog.octet_length");
    expect(writer).toContain("public.audit_changes_match_action");
    expect(writer).toContain("public.audit_scalar_is_safe(event_entity_id)");
    expect(writer).toContain("public.audit_scalar_is_safe(event_request_id)");

    expect(normalizedMigration).toContain(
      "grant execute on function public.append_audit_event( uuid, public.audit_actor_type, public.audit_action, public.audit_entity, text, uuid, text, text, jsonb ) to service_role;",
    );
    expect(normalizedMigration).toContain(
      "revoke all on type public.audit_actor_type from public, anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "revoke all on type public.audit_action from public, anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "grant usage on type public.audit_actor_type, public.audit_action, public.audit_entity to service_role;",
    );
    expect(normalizedMigration).toContain(
      "revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on sequence public.audit_logs_id_seq from public, anon, authenticated, service_role;",
    );
  });

  it("ships rollback-only hosted coverage and focused-test wiring", () => {
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

    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(40);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/permissions-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/permissions-postgres.test.ts",
    );
  });
});
