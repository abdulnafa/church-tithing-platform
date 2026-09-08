import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const auditMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609070007_staff_invitation_audit_action.sql",
  ),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202609070008_staff_management.sql"),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/008_staff_management.test.sql"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const normalizedAuditMigration = auditMigration.replace(/\s+/g, " ").trim();
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

describe("P12 staff-management migration contract", () => {
  it("commits the new audit enum value before the atomic workflow migration", () => {
    expect(normalizedAuditMigration.startsWith("begin;")).toBe(true);
    expect(normalizedAuditMigration.endsWith("commit;")).toBe(true);
    expect(normalizedAuditMigration).toContain(
      "alter type public.audit_action add value if not exists 'staff_invitation_accepted' after 'staff_invited';",
    );
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
  });

  it("adds a bounded revision and canonical all-lifecycle email identity", () => {
    expect(normalizedMigration).toContain(
      "add column staff_revision bigint not null default 0",
    );
    expect(normalizedMigration).toContain("check (staff_revision >= 0)");
    expect(normalizedMigration).toContain(
      "create unique index church_memberships_email_history_unique_idx on public.church_memberships (church_id, invited_email);",
    );
    expect(normalizedMigration).toContain("alter column invited_email set not null");
    expect(normalizedMigration).toContain(
      "public.is_valid_provisioning_email(invited_email)",
    );
    expect(migration).toContain("P12_EXISTING_MEMBERSHIP_EMAIL_UNAVAILABLE");
    expect(migration).toContain("P12_EXISTING_MEMBERSHIP_EMAIL_CONFLICT");
  });

  it("preserves membership history across Auth deletion and future inserts", () => {
    expect(normalizedMigration).toContain(
      "foreign key (user_id) references auth.users(id) on delete restrict",
    );
    const snapshotTrigger = functionBlock("ensure_church_membership_email_snapshot");
    expect(snapshotTrigger).toContain("new.user_id is not null");
    expect(snapshotTrigger).toContain("MEMBERSHIP_INVALID_EMAIL");
    expect(normalizedMigration).toContain(
      "before insert or update of user_id, invited_email on public.church_memberships",
    );
  });

  it("exposes only minimum public composite fields and never a user UUID", () => {
    const record = typeBlock("church_staff_record");
    const result = typeBlock("church_staff_mutation_result");
    expect(record).toContain("is_current_user boolean");
    expect(record).toContain("access_enabled boolean");
    expect(record).not.toMatch(/\buser_id\b/);
    expect(result).not.toMatch(/\buser_id\b/);
    expect(result).not.toContain("email text");
    expect(result).not.toContain("display_name");
  });

  it("returns one authorized empty-safe scalar roster in deterministic order", () => {
    const snapshot = functionBlock("get_church_staff");
    expect(snapshot).toContain("returns public.church_staff_snapshot");
    expect(snapshot).toContain("'staff_manage'");
    expect(snapshot).toContain("STAFF_FORBIDDEN");
    expect(snapshot).toContain("array[]::public.church_staff_record[]");
    expect(snapshot).toContain("public.safe_staff_display_name");
    expect(snapshot).toContain("membership.user_id = request_user_id");
    expect(snapshot).toContain("case membership.role");
    expect(snapshot).toContain("case membership.status");
  });

  it("makes invite account-opaque, pending-only, and self-safe", () => {
    const mutation = functionBlock("mutate_church_staff");
    expect(mutation).toContain("canonical_operation = 'invite'");
    expect(mutation).toContain("status = 'invited'");
    expect(mutation).toContain("user_id = null");
    expect(mutation).toContain("STAFF_SELF_PROTECTED");
    expect(mutation).toContain("request_user_email");
    expect(mutation).not.toContain("email_confirmed_at");
    expect(mutation).not.toContain("STAFF_PROFILE_INACTIVE");
  });

  it("uses only conservative managed roles and protects owners", () => {
    const mutation = functionBlock("mutate_church_staff");
    expect(mutation).toContain("'finance_admin', 'accountant', 'staff'");
    expect(mutation).toContain("STAFF_INVALID_ROLE");
    expect(mutation).toContain("target_membership.role = 'owner'");
    expect(mutation).toContain("STAFF_OWNER_PROTECTED");
    expect(mutation).toContain("STAFF_MEMBERSHIP_NOT_MANAGEABLE");
    expect(mutation).not.toMatch(/set\s+role\s*=\s*'owner'/);
  });

  it("only reuses revoked email history and never demotes active records", () => {
    const mutation = functionBlock("mutate_church_staff");
    expect(mutation).toContain("target_membership.status in ('active', 'suspended')");
    expect(mutation).toContain("STAFF_EMAIL_CONFLICT");
    expect(mutation).toContain("target_membership.status = 'invited'");
    expect(mutation).toContain("STAFF_ALREADY_INVITED");
    expect(mutation).toContain("status = 'invited'");
    expect(mutation).toContain("revoked_at = null");
  });

  it("performs authenticated replay before CAS and rechecks after locking", () => {
    const mutation = functionBlock("mutate_church_staff");
    const replay = mutation.indexOf("from public.church_staff_mutation_requests");
    const lock = mutation.indexOf("from public.churches church", replay);
    const cas = mutation.indexOf("STAFF_REVISION_CONFLICT", lock);
    expect(replay).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(replay);
    expect(cas).toBeGreaterThan(lock);
    expect(mutation.slice(lock, cas)).toContain("'staff_manage'");
    expect(mutation).toContain("STAFF_IDEMPOTENCY_CONFLICT");
  });

  it("claims only the caller exact confirmed invitation and audits acceptance", () => {
    const claim = functionBlock("claim_church_staff_invitation");
    expect(claim).toContain("auth_user.id = request_user_id");
    expect(claim).toContain("auth_user.email_confirmed_at is not null");
    expect(claim).toContain("profile.is_active");
    expect(claim).toContain("membership.invited_email = request_user_email");
    expect(claim).toContain("STAFF_INVITATION_NOT_AVAILABLE");
    expect(claim).toContain("event_action => 'staff_invitation_accepted'");
    expect(claim).toContain("event_actor_user_id => request_user_id");
    expect(claim).not.toContain("event_request_id =>");
  });

  it("keeps every staff audit free of email and display-name copy", () => {
    const shapeGuard = functionBlock("audit_changes_match_action");
    const writer = functionBlock("append_audit_event");
    const mutation = functionBlock("mutate_church_staff");
    expect(shapeGuard).toContain(
      "when 'staff_invitation_accepted' then array['membership_id', 'role']",
    );
    expect(writer).toContain("'staff_invitation_accepted'");
    expect(mutation).toContain("'membership_id', target_membership.id");
    expect(mutation).not.toContain("'email', canonical_email");
    expect(mutation).not.toContain("display_name");
  });

  it("uses a private forced-RLS append-only ledger with indexed FKs", () => {
    expect(normalizedMigration).toContain(
      "alter table public.church_staff_mutation_requests enable row level security;",
    );
    expect(normalizedMigration).toContain(
      "alter table public.church_staff_mutation_requests force row level security;",
    );
    expect(normalizedMigration).toContain(
      "foreign key (church_id, result_membership_id) references public.church_memberships(church_id, id) on delete restrict",
    );
    expect(normalizedMigration).toContain(
      "create index church_staff_mutation_requests_membership_idx",
    );
    expect(migration).toContain("STAFF_LEDGER_APPEND_ONLY");
    const tableStart = migration.indexOf(
      "create table public.church_staff_mutation_requests",
    );
    const tableEnd = migration.indexOf("\n);", tableStart);
    const table = migration.slice(tableStart, tableEnd);
    expect(table).not.toContain("email");
    expect(table).not.toContain("display_name");
    expect(table).toContain("result_user_id_snapshot uuid");
    expect(table).not.toMatch(/result_user_id_snapshot[^\n]*references auth\.users/);
    expect(normalizedMigration).toContain(
      "target_membership.id, target_membership.user_id, target_membership.role",
    );
  });

  it("closes direct writes and narrows authenticated identity reads", () => {
    expect(normalizedMigration).toContain(
      "grant select (id, church_id, user_id, role, status) on public.church_memberships to authenticated;",
    );
    expect(normalizedMigration).toContain(
      "revoke insert, update, delete, truncate, references, trigger on table public.church_memberships from anon, authenticated, service_role;",
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on table public.church_staff_mutation_requests from public, anon, authenticated, service_role;",
    );
  });

  it("grants only the reviewed authenticated RPC boundary", () => {
    expect(normalizedMigration).toContain(
      "grant execute on function public.get_church_staff(uuid), public.mutate_church_staff( uuid, uuid, bigint, text, uuid, text, text ), public.claim_church_staff_invitation(uuid) to authenticated;",
    );
    expect(normalizedMigration).toContain(
      "revoke all on type public.church_staff_record, public.church_staff_snapshot, public.church_staff_mutation_result from public, anon, authenticated, service_role;",
    );
  });

  it("ships a static rollback-only hosted suite and database script wiring", () => {
    const plan = hostedTest.match(/select extensions\.plan\((\d+)\);/i)?.[1];
    expect(plan).toBeDefined();
    expect(hostedTest.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().toLowerCase().endsWith("rollback;")).toBe(true);
    expect(hostedTest).toContain("select * from extensions.finish();");
    expect((hostedTest.match(/^select extensions\.(?:ok|is|isnt|like|unlike|throws_ok|throws_like|lives_ok|results_eq|set_eq|bag_eq|cmp_ok|has_|col_|function_|table_|index_|trigger_)/gim) ?? []).length).toBe(
      Number(plan),
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/staff-contract.test.ts",
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/staff-postgres.test.ts",
    );
  });
});
