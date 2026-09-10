import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609100013_prayer_request_privacy.sql",
);
const runtimeTestPath = resolve(
  process.cwd(),
  "src/lib/supabase/prayer-requests-postgres.test.ts",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/012_prayer_request_privacy.test.sql",
);
const packagePath = resolve(process.cwd(), "package.json");

const migration = readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P16 prayer-request privacy migration contract", () => {
  it("is atomic and refuses to guess consent evidence for legacy rows", () => {
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).toContain(
      "message = 'P16_EXISTING_PRAYER_CONSENT_VERSION_REQUIRED'",
    );
    expect(normalized).toContain(
      "if exists (select 1 from public.prayer_requests)",
    );
  });

  it("normalizes exactly the shared CR and ASCII-edge whitespace contract", () => {
    const canonicalize = functionBlock("canonicalize_prayer_request_body");
    expect(canonicalize).toContain("replace(input_value, E'\\r\\n', E'\\n')");
    expect(canonicalize).toContain("E'\\r'");
    expect(canonicalize).toContain("E' \\t\\n'");
    expect(canonicalize).not.toContain("\\00A0");
    expect(normalized).toContain("char_length(body) between 1 and 2000");
  });

  it("rejects C0 except TAB/LF plus C1 and bidi formatting controls", () => {
    const unsafe = functionBlock("prayer_request_body_has_unsafe_formatting");
    expect(unsafe).toContain("regexp_replace(input_value, E'[\\t\\n]'");
    expect(unsafe).toContain("generate_series(127, 159)");
    for (const codePoint of [1564, 8206, 8207, 8232, 8238, 8294, 8297]) {
      expect(unsafe).toContain(String(codePoint));
    }
  });

  it("creates an empty private immutable hash-only consent catalog", () => {
    expect(normalized).toContain(
      "create table public.prayer_request_consent_versions",
    );
    expect(normalized).toContain(
      "wording_sha256 text not null unique",
    );
    expect(normalized).toContain(
      "version_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'",
    );
    expect(normalized).toContain(
      "alter table public.prayer_request_consent_versions force row level security",
    );
    expect(functionBlock("guard_prayer_request_consent_version")).toContain(
      "PRAYER_CONSENT_VERSION_IMMUTABLE",
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.prayer_request_consent_versions/i,
    );
  });

  it("keeps legacy linkage nullable, tenant-safe, hidden, and immutable", () => {
    expect(normalized).toContain("alter column donation_id drop not null");
    expect(normalized).not.toContain("drop column donation_id");
    expect(normalized).not.toContain("drop column donor_id");
    expect(normalized).toContain(
      "donor_id is null or donation_id is not null",
    );
    const guard = functionBlock("guard_prayer_request_private_fields");
    expect(guard).toContain("new.id is distinct from old.id");
    expect(guard).toContain("new.donation_id is distinct from old.donation_id");
    expect(guard).toContain("new.donor_id is distinct from old.donor_id");
  });

  it("locks retention pending without inventing TTL, purge, redaction, or delete", () => {
    expect(normalized).toContain(
      "retention_policy_status = 'pending_client_approval'",
    );
    expect(normalized).toContain(
      "constraint prayer_requests_no_retention_action check ( deleted_at is null )",
    );
    expect(migration).not.toMatch(
      /create or replace function public\.(?:delete|purge|redact)_prayer/i,
    );
    expect(normalized).not.toContain("retention_expires_at");
    expect(normalized).not.toContain("interval '");
  });

  it("enforces timestamp order and a one-way row-level review revision", () => {
    expect(normalized).toContain("revision between 0 and 1");
    expect(normalized).toContain("consented_at <= created_at");
    expect(normalized).toContain("reviewed_at <= updated_at");
    const guard = functionBlock("guard_prayer_request_private_fields");
    expect(guard).toContain("old.revision + 1");
    expect(guard).toContain("PRAYER_REQUEST_REVIEW_TRANSITION_INVALID");
    expect(normalized).toContain(
      "foreign key (reviewed_by) references auth.users(id) on delete restrict",
    );
  });

  it("defines the exact minimum queue DTO and anti-starvation order", () => {
    expect(normalized).toContain(
      "create type public.prayer_request_queue_record as ( prayer_request_id uuid, body text, is_reviewed boolean, consented_at timestamptz, created_at timestamptz, reviewed_at timestamptz, updated_at timestamptz, revision bigint )",
    );
    const queue = functionBlock("get_prayer_request_queue");
    expect(queue).toContain("PRAYER_QUEUE_FORBIDDEN");
    expect(queue).toContain("church.status in ('active', 'onboarding')");
    expect(queue).toContain("'prayer_requests_review'");
    expect(queue).toContain("prayer.deleted_at is null");
    expect(queue).toContain("then prayer.created_at end asc");
    expect(queue).toContain("then prayer.reviewed_at end desc");
    expect(queue).toContain("limit 100");
    for (const forbiddenField of [
      "donation_id",
      "donor_id",
      "amount_minor",
      "fund_id",
      "receipt",
      "email",
      "reviewed_by",
      "consent_version_id",
    ]) {
      expect(queue).not.toContain(`prayer.${forbiddenField}`);
    }
  });

  it("backs the exact mixed queue order with a partial expression index", () => {
    expect(normalized).toContain("create index prayer_requests_queue_idx");
    expect(normalized).toContain("((reviewed_at is not null))");
    expect(normalized).toContain(
      "((case when reviewed_at is null then created_at end)) asc",
    );
    expect(normalized).toContain(
      "((case when reviewed_at is not null then reviewed_at end)) desc",
    );
    expect(normalized).toContain("where deleted_at is null");
    expect(normalized).toContain(
      "create index prayer_requests_consent_version_fk_idx on public.prayer_requests (consent_version_id)",
    );
    expect(normalized).toContain(
      "foreign key (church_id) references public.churches(id) on delete restrict",
    );
  });

  it("defines the exact one-way CAS and replay contract", () => {
    expect(normalized).toContain(
      "create type public.prayer_request_review_result as ( prayer_request_id uuid, reviewed_at timestamptz, revision bigint, replayed boolean )",
    );
    const review = functionBlock("review_prayer_request");
    for (const argument of [
      "target_church_id uuid,",
      "target_prayer_request_id uuid,",
      "review_request_id uuid,",
      "expected_revision bigint",
    ]) {
      expect(review).toContain(argument);
    }
    for (const code of [
      "PRAYER_REVIEW_FORBIDDEN",
      "PRAYER_REVIEW_INVALID_REQUEST_ID",
      "PRAYER_REVIEW_INVALID_EXPECTED_REVISION",
      "PRAYER_REVIEW_NOT_FOUND",
      "PRAYER_REVIEW_REVISION_CONFLICT",
      "PRAYER_REVIEW_ALREADY_REVIEWED",
      "PRAYER_REVIEW_IDEMPOTENCY_CONFLICT",
    ]) {
      expect(review).toContain(code);
    }
    expect(review).toContain("pg_advisory_xact_lock");
    expect(review).toContain("membership.role = 'owner'");
    expect(review).toContain("church.status in ('active', 'onboarding')");
    expect(review.indexOf("for share of church, membership, profile")).toBeLessThan(
      review.indexOf("select request_record.*"),
    );
    expect(review.indexOf("select request_record.*")).toBeLessThan(
      review.indexOf("select prayer.*"),
    );
  });

  it("writes only body-free identifier and boolean review audit data", () => {
    const review = functionBlock("review_prayer_request");
    const auditStart = review.indexOf("inserted_audit_log_id :=");
    const auditEnd = review.indexOf("insert into public.prayer_request_review_requests");
    const audit = review.slice(auditStart, auditEnd);
    expect(audit).toContain("'prayer_request_reviewed'");
    expect(audit).toContain("'prayer_request_id'");
    expect(audit).toContain("'reviewed', true");
    expect(audit).not.toContain("target_prayer.body");
    expect(audit).not.toContain("donation_id");
    expect(audit).not.toContain("donor_id");
  });

  it("keeps the review replay ledger private, forced-RLS, append-only, and body-free", () => {
    expect(normalized).toContain(
      "alter table public.prayer_request_review_requests force row level security",
    );
    expect(functionBlock("guard_prayer_request_review_request")).toContain(
      "PRAYER_REVIEW_LEDGER_APPEND_ONLY",
    );
    const tableStart = migration.indexOf(
      "create table public.prayer_request_review_requests",
    );
    const tableEnd = migration.indexOf(");", tableStart);
    const table = migration.slice(tableStart, tableEnd);
    expect(table).not.toContain("body");
    expect(table).not.toContain("donation_id");
    expect(table).not.toContain("donor_id");
    expect(normalized).toContain(
      "revoke all privileges on table public.prayer_request_consent_versions, public.prayer_request_review_requests from public, anon, authenticated, service_role",
    );
  });

  it("closes all direct prayer access and grants only authenticated RPC execution", () => {
    expect(normalized).toContain(
      "revoke all privileges on table public.prayer_requests from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "alter table public.prayer_requests force row level security",
    );
    expect(migration).not.toMatch(/^create policy .*prayer_requests/gm);
    expect(normalized).toContain(
      "from public, anon, authenticated, service_role; grant execute on function public.get_prayer_request_queue(uuid), public.review_prayer_request(uuid, uuid, uuid, bigint) to authenticated",
    );
    expect(migration).not.toMatch(
      /create or replace function public\.(?:create|submit)_prayer/i,
    );
  });

  it("ships real PGlite, rollback-only pgTAP, and database-suite wiring", () => {
    const runtimeTest = readFileSync(runtimeTestPath, "utf8");
    const hostedTest = readFileSync(hostedTestPath, "utf8");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: { "test:db": string };
    };
    const assertionCount = Array.from(
      hostedTest.matchAll(
        /select extensions\.(?:is|ok|throws_like|throws_ok|is_deeply|lives_ok)\(/g,
      ),
    ).length;
    const planned = Number(
      hostedTest.match(/select extensions\.plan\((\d+)\);/)?.[1],
    );
    expect(runtimeTest).toContain("new PGlite()");
    expect(runtimeTest).toContain("P16_EXISTING_PRAYER_CONSENT_VERSION_REQUIRED");
    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(70);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest).toContain(
      "create extension if not exists pgtap with schema extensions;",
    );
    expect(hostedTest.match(/select \* from extensions\.finish\(\);/g)).toHaveLength(
      1,
    );
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/prayer-requests-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/prayer-requests-postgres.test.ts",
    );
  });
});
