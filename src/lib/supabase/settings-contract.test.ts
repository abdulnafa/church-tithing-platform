import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609050004_church_settings_and_logo_storage.sql",
);
const runtimeTestPath = resolve(
  process.cwd(),
  "src/lib/supabase/settings-postgres.test.ts",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/005_church_settings_and_logo_storage.test.sql",
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

describe("P09 church settings and logo storage migration contract", () => {
  it("ships one atomic revisioned settings migration", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(normalizedMigration).toContain(
      "add column settings_revision bigint not null default 0",
    );
    expect(normalizedMigration).toContain(
      "constraint churches_settings_revision_nonnegative check (settings_revision >= 0)",
    );
    expect(normalizedMigration).toContain("add column logo_storage_path text");
    expect(normalizedMigration).toContain(
      "split_part(logo_storage_path, '/', 1) = id::text",
    );
  });

  it("defines exact typed read, update, and cleanup RPC contracts", () => {
    expect(normalizedMigration).toContain(
      "create type public.church_settings_snapshot as ( church_id uuid, display_name text, legal_name text, slug text, status public.church_status, default_currency text, support_email text, timezone text, primary_color text, secondary_color text, thank_you_message text, logo_storage_path text, settings_revision bigint );",
    );
    expect(normalizedMigration).toContain(
      "create type public.church_settings_update_result as ( church_id uuid, settings_revision bigint, logo_storage_path text, logo_cleanup_path text, logo_cleanup_status text, replayed boolean );",
    );

    const update = functionBlock("update_church_settings");
    expect(update).toContain("expected_settings_revision bigint,");
    expect(update).toContain("church_logo_action text,");
    expect(update).toContain("church_logo_storage_path text");
    expect(update).toContain("returns public.church_settings_update_result");
    expect(functionBlock("get_church_settings")).toContain(
      "returns public.church_settings_snapshot",
    );
    expect(functionBlock("get_pending_church_logo_cleanups")).toContain(
      "returns table",
    );
    expect(functionBlock("get_pending_church_logo_cleanups")).toContain(
      "order by request_record.created_at, request_record.request_id\n  limit 100;",
    );
    expect(functionBlock("complete_church_logo_cleanup")).toContain(
      "returns boolean",
    );
  });

  it("authorizes each settings operation through active owner permission", () => {
    for (const name of [
      "get_church_settings",
      "update_church_settings",
      "get_pending_church_logo_cleanups",
      "complete_church_logo_cleanup",
    ]) {
      const block = functionBlock(name);
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
      expect(block).toContain("public.has_church_permission(");
      expect(block).toContain("'settings_manage'");
      expect(block).toContain("SETTINGS_FORBIDDEN");
    }

    const update = functionBlock("update_church_settings");
    expect(update).toContain("for update;");
    expect(update.match(/public\.has_church_permission\(/g)).toHaveLength(2);
    expect(update.indexOf("into locked_church")).toBeLessThan(
      update.lastIndexOf("public.has_church_permission("),
    );
  });

  it("validates and canonicalizes every editable field independently", () => {
    const update = functionBlock("update_church_settings");
    expect(update).toContain("not between 2 and 120");
    expect(update).toContain("not between 2 and 160");
    expect(update).toContain("'[[:cntrl:]]'");
    expect(update).toContain("public.is_valid_provisioning_email");
    expect(update).toContain("pg_catalog.pg_timezone_names");
    expect(update).toContain("'^#[0-9A-F]{6}$'");
    expect(update).toContain("char_length(canonical_thank_you_message) > 500");
    expect(update).toContain("('keep', 'replace', 'remove')");

    for (const token of [
      "SETTINGS_FORBIDDEN",
      "SETTINGS_REQUEST_ID_REQUIRED",
      "SETTINGS_INVALID_EXPECTED_REVISION",
      "SETTINGS_INVALID_CHURCH_NAME",
      "SETTINGS_INVALID_LEGAL_NAME",
      "SETTINGS_INVALID_SUPPORT_EMAIL",
      "SETTINGS_INVALID_TIMEZONE",
      "SETTINGS_INVALID_PRIMARY_COLOR",
      "SETTINGS_INVALID_SECONDARY_COLOR",
      "SETTINGS_INVALID_THANK_YOU_MESSAGE",
      "SETTINGS_INVALID_LOGO_ACTION",
      "SETTINGS_INVALID_LOGO_PATH",
      "SETTINGS_LOGO_OBJECT_NOT_READY",
      "SETTINGS_IDEMPOTENCY_CONFLICT",
      "SETTINGS_REVISION_CONFLICT",
      "SETTINGS_NO_CHANGES",
    ]) {
      expect(update).toContain(token);
    }
  });

  it("replays canonical requests before CAS and records value-free actual changes", () => {
    const update = functionBlock("update_church_settings");
    expect(update).toContain("pg_catalog.sha256");
    expect(update).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(update.indexOf("if found then")).toBeLessThan(
      update.indexOf("locked_church.settings_revision <>"),
    );
    expect(update).toContain("updated_result.replayed := true");
    expect(update).toContain("updated_result.replayed := false");
    expect(update).toContain("array_agg(setting_key order by setting_key)");

    const auditStart = update.indexOf(
      "inserted_audit_log_id := public.append_audit_event(",
    );
    const auditEnd = update.indexOf("\n  );", auditStart);
    const audit = update.slice(auditStart, auditEnd);
    expect(audit).toContain("event_actor_type => 'user'");
    expect(audit).toContain("event_action => 'church_settings_updated'");
    expect(audit).toContain("'setting_keys', sorted_setting_keys");
    for (const privateValue of [
      "canonical_display_name",
      "canonical_legal_name",
      "canonical_support_email",
      "canonical_thank_you_message",
    ]) {
      expect(audit).not.toContain(privateValue);
    }
  });

  it("keeps request state private and permits only pending-to-completed cleanup", () => {
    expect(normalizedMigration).toContain(
      "alter table public.church_settings_update_requests enable row level security;",
    );
    expect(normalizedMigration).toContain(
      "alter table public.church_settings_update_requests force row level security;",
    );
    expect(migration).not.toMatch(
      /^create policy .*church_settings_update_requests/gm,
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.church_settings_update_requests from public, anon, authenticated, service_role;",
    );
    const guard = functionBlock("guard_church_settings_update_request");
    expect(guard).toContain("old.logo_cleanup_status <> 'pending'");
    expect(guard).toContain("new.logo_cleanup_status <> 'completed'");
    expect(guard).toContain("SETTINGS_LEDGER_APPEND_ONLY");
    expect(normalizedMigration).toContain(
      "split_part(result_logo_storage_path, '/', 1) = church_id::text",
    );
    expect(normalizedMigration).toContain(
      "split_part(logo_cleanup_path, '/', 1) = church_id::text",
    );
  });

  it("creates a conflict-checked sanitized WebP bucket and strict policies", () => {
    expect(normalizedMigration).toContain(
      "existing_bucket.file_size_limit is distinct from 768000",
    );
    expect(normalizedMigration).toContain(
      "array['image/webp']::text[]",
    );
    expect(normalizedMigration).toContain(
      "SETTINGS_LOGO_BUCKET_CONFIG_CONFLICT",
    );
    expect(normalizedMigration).not.toContain("on conflict (id) do update");

    const update = functionBlock("update_church_settings");
    expect(update).toContain("object_record.metadata ->> 'mimetype' = 'image/webp'");
    expect(update).toContain("between 1 and 768000");
    expect(update).toContain("for share;");
    expect(update).toContain("settings_request_id::text");

    expect(normalizedMigration).toContain(
      "create policy church_logos_tenant_insert on storage.objects for insert to authenticated",
    );
    expect(normalizedMigration).toContain(
      "create policy church_logos_tenant_delete on storage.objects for delete to authenticated",
    );
    expect(normalizedMigration).toContain(
      "create policy church_logos_no_update on storage.objects as restrictive for update to authenticated using (false) with check (false);",
    );
    expect(functionBlock("can_delete_church_logo")).toContain("for share;");
    expect(functionBlock("can_delete_church_logo")).toContain(
      "active_logo_path is distinct from candidate_path",
    );
  });

  it("removes legacy church projections before the four-column regrant", () => {
    expect(normalizedMigration).toContain(
      "revoke select on public.churches from anon, authenticated;",
    );
    expect(normalizedMigration).toContain(
      "revoke select ( id, name, legal_name, slug, status, default_currency, timezone, logo_url, primary_color, secondary_color, thank_you_message, support_email, public_settings, activated_at, suspended_at, created_by, created_at, updated_at, settings_revision, logo_storage_path ) on public.churches from anon, authenticated;",
    );
    expect(normalizedMigration).toContain(
      "grant select (id, name, slug, status) on public.churches to anon, authenticated;",
    );
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
    expect(runtimeTest).toContain("P09_FORCED_LATE_FAILURE");
    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(40);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/settings-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/settings-postgres.test.ts",
    );
  });
});
