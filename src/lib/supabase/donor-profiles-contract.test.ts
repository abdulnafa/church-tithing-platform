import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const catalogPath = resolve(
  process.cwd(),
  "supabase/migrations/202609090011_donor_profile_audit_catalog.sql",
);
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609090012_donor_profiles.sql",
);
const runtimeTestPath = resolve(
  process.cwd(),
  "src/lib/supabase/donor-profiles-postgres.test.ts",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/011_donor_profiles.test.sql",
);
const packagePath = resolve(process.cwd(), "package.json");

const catalog = readFileSync(catalogPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P15 donor profile migration contract", () => {
  it("commits the enum catalog before the atomic workflow migration", () => {
    expect(catalog.trimStart().startsWith("begin;")).toBe(true);
    expect(catalog.trimEnd().endsWith("commit;")).toBe(true);
    expect(catalog).toContain("'donor_profile_created'");
    expect(catalog).toContain("'donor_profile_updated'");
    expect(catalog).toContain("add value if not exists 'donor'");
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
  });

  it("requires canonical minimum name/email while retaining legacy phone internally", () => {
    expect(normalized).toContain("alter column display_name set not null");
    expect(normalized).toContain("alter column email set not null");
    expect(normalized).toContain("donors_display_name_canonical");
    expect(normalized).toContain("donors_display_name_safe");
    expect(normalized).toContain("donors_email_canonical");
    expect(normalized).toContain("donors_email_valid");
    expect(normalized).toContain("profile_revision bigint not null default 0");
    expect(normalized).not.toContain("drop column phone");
    expect(normalized).toContain("phone/address/TIN are deliberately excluded");
  });

  it("aligns Unicode canonicalization and rejects control/bidi formatting", () => {
    const canonicalName = functionBlock("canonicalize_donor_display_name");
    expect(canonicalName).toContain("immutable");
    expect(canonicalName).toContain("strict");
    expect(canonicalName).toContain("\\00A0");
    expect(canonicalName).toContain("\\FEFF");
    const unsafe = functionBlock("donor_text_has_unsafe_formatting");
    expect(unsafe).toContain("generate_series(127, 159)");
    for (const codePoint of [1564, 8206, 8232, 8238, 8294, 8297]) {
      expect(unsafe).toContain(String(codePoint));
    }
    const email = functionBlock("canonicalize_donor_email");
    expect(email).toContain("\\00A0");
    expect(email).toContain("pg_catalog.lower");
    const validateEmail = functionBlock("is_valid_donor_email");
    expect(validateEmail).toContain("char_length(canonical_email) > 254");
    expect(validateEmail).toContain("at_position not between 2 and 65");
    expect(validateEmail).toContain("char_length(domain_label) not between 1 and 63");
  });

  it("permits same-email guest/member coexistence but one linked church per account", () => {
    expect(normalized).toContain("drop index public.donors_email_unique_idx");
    expect(normalized).toContain(
      "create index donors_email_lookup_idx on public.donors (church_id, email)",
    );
    expect(normalized).toContain("drop index public.donors_auth_user_unique_idx");
    expect(normalized).toContain(
      "create unique index donors_auth_user_global_unique_idx on public.donors (auth_user_id) where auth_user_id is not null",
    );
    expect(normalized).toContain("P15_EXISTING_SHARED_DONOR_ACCOUNT");
    expect(normalized).toContain("donors_linked_member_not_anonymous");
  });

  it("preserves donor/Auth attribution and exposes no link/unlink path", () => {
    expect(normalized).toContain(
      "foreign key (auth_user_id) references auth.users(id) on delete restrict",
    );
    expect(functionBlock("guard_donor_auth_identity")).toContain(
      "DONOR_AUTH_IDENTITY_IMMUTABLE",
    );
    const mutate = functionBlock("mutate_my_donor_profile");
    expect(mutate).not.toContain("update public.donations");
    expect(mutate).not.toContain("update public.recurring_gifts");
    expect(mutate).not.toContain("donor.auth_user_id is null");
    expect(migration).not.toMatch(
      /create or replace function public\.(?:link|claim|merge)_.*donor/i,
    );
  });

  it("defines the exact minimum read and mutation contracts", () => {
    expect(normalized).toContain(
      "create type public.my_donor_profile_record as ( church_id uuid, donor_id uuid, display_name text, email text, profile_revision bigint, updated_at timestamptz )",
    );
    expect(normalized).toContain(
      "create type public.my_donor_profile_mutation_result as ( church_id uuid, donor_id uuid, profile_revision bigint, operation text, replayed boolean )",
    );
    const read = functionBlock("get_my_donor_profile");
    expect(read).toContain("returns setof public.my_donor_profile_record");
    expect(read).toContain("auth_user.email_confirmed_at is not null");
    expect(read).toContain("church.status = 'active'");
    expect(read).not.toContain("phone");
    const mutate = functionBlock("mutate_my_donor_profile");
    for (const argument of [
      "target_church_id uuid,",
      "profile_request_id uuid,",
      "expected_profile_revision bigint,",
      "profile_display_name text",
    ]) {
      expect(mutate).toContain(argument);
    }
    expect(mutate).not.toContain("profile_email");
    expect(mutate).not.toContain("profile_phone");
    expect(mutate).not.toContain("target_donor_id");
  });

  it("uses current verified Auth email, exact CAS, stable replay, and generic cross-church denial", () => {
    const mutate = functionBlock("mutate_my_donor_profile");
    for (const code of [
      "DONOR_PROFILE_FORBIDDEN",
      "DONOR_PROFILE_INVALID_REQUEST_ID",
      "DONOR_PROFILE_INVALID_EXPECTED_REVISION",
      "DONOR_PROFILE_INVALID_DISPLAY_NAME",
      "DONOR_PROFILE_IDEMPOTENCY_CONFLICT",
      "DONOR_PROFILE_REVISION_CONFLICT",
      "DONOR_PROFILE_NO_CHANGES",
    ]) {
      expect(mutate).toContain(code);
    }
    const payloadStart = mutate.indexOf("canonical_payload :=");
    const payloadEnd = mutate.indexOf("canonical_payload_sha256 :=", payloadStart);
    const payload = mutate.slice(payloadStart, payloadEnd);
    expect(payload).toContain("expected_profile_revision");
    expect(payload).toContain("profile_display_name");
    expect(payload).not.toContain("verified_email");
    expect(mutate).toContain("target_donor.profile_revision + 1");
    expect(mutate).toContain("if target_donor.church_id <> target_church_id");
  });

  it("locks request, global identity, church, Auth, and profile before replay", () => {
    const mutate = functionBlock("mutate_my_donor_profile");
    const requestLock = mutate.indexOf("donor-profile-request:");
    const identityLock = mutate.indexOf("donor-profile-identity:");
    const churchLock = mutate.indexOf("for share;");
    const authLock = mutate.indexOf("for share of auth_user, profile;");
    const replay = mutate.indexOf("select request_record.*");
    const donorLock = mutate.indexOf("select donor.*", replay);
    expect(requestLock).toBeLessThan(identityLock);
    expect(identityLock).toBeLessThan(churchLock);
    expect(churchLock).toBeLessThan(authLock);
    expect(authLock).toBeLessThan(replay);
    expect(replay).toBeLessThan(donorLock);
    expect(mutate).toContain(
      "'donor-profile-identity:' || request_user_id::text",
    );
  });

  it("hardens every donor-owned RLS consumer to verified active identity and tenant", () => {
    const owns = functionBlock("owns_donor");
    expect(owns).toContain("security definer");
    expect(owns).toContain("set search_path = ''");
    expect(owns).toContain("church.status = 'active'");
    expect(owns).toContain("profile.is_active");
    expect(owns).toContain("auth_user.email_confirmed_at is not null");
    expect(owns).toContain("not donor.is_anonymous");
    expect(owns).toContain(
      "donor.email = public.canonicalize_donor_email(auth_user.email)",
    );
    expect(normalized).toContain(
      "grant execute on function public.owns_donor(uuid) to authenticated",
    );
  });

  it("captures donor actors only for exact profile events and writes PII-free audits", () => {
    const capture = functionBlock("capture_audit_actor_snapshot");
    expect(capture).toContain("'donor_profile_created'");
    expect(capture).toContain("new.entity_code = 'donor'");
    expect(capture).toContain("donor.id::text = new.entity_id");
    expect(capture).toContain("'Registered donor', 'member'");
    expect(capture).toContain("user audit actor has no active donor capacity");
    expect(capture).toContain("user audit actor has no active church capacity");
    const auditShape = functionBlock("audit_changes_match_action");
    expect(auditShape).toContain(
      "when 'donor_profile_created' then array['donor_id', 'field_names']",
    );
    expect(auditShape).not.toContain("display_name', 'email");
  });

  it("keeps the replay ledger private, forced-RLS, append-only, and revision-unique", () => {
    expect(normalized).toContain(
      "alter table public.donor_profile_mutation_requests force row level security",
    );
    expect(migration).not.toMatch(
      /^create policy .*donor_profile_mutation_requests/gm,
    );
    expect(normalized).toContain(
      "constraint donor_profile_mutation_requests_donor_revision_unique unique ( church_id, result_donor_id, result_profile_revision )",
    );
    expect(functionBlock("guard_donor_profile_mutation_request")).toContain(
      "DONOR_PROFILE_LEDGER_APPEND_ONLY",
    );
    expect(normalized).not.toContain(
      "create index donor_profile_mutation_requests_donor_idx",
    );
    expect(normalized).toContain(
      "revoke all privileges on table public.donor_profile_mutation_requests from public, anon, authenticated, service_role",
    );
  });

  it("preserves members-read rows with identity-only columns and keeps all writes closed", () => {
    expect(normalized).toContain(
      "drop policy if exists donors_permission_read on public.donors",
    );
    expect(normalized).toContain(
      "create policy donors_permission_read on public.donors for select to authenticated using ( (select public.has_church_permission(church_id, 'members_read')) and ( auth_user_id is distinct from (select auth.uid()) or (select public.owns_donor(id)) ) )",
    );
    expect(normalized).toContain(
      "revoke select on table public.donors from authenticated",
    );
    expect(normalized).toContain(
      "grant select (id, church_id, auth_user_id) on public.donors to authenticated",
    );
    expect(normalized).toContain(
      "revoke insert, update, delete, truncate, references, trigger on table public.donors from anon, authenticated, service_role",
    );
  });

  it("ships PGlite, rollback-only pgTAP, and database-suite wiring", () => {
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
    expect(runtimeTest).toContain("P15_FORCED_LATE_FAILURE");
    expect(assertionCount).toBe(planned);
    expect(planned).toBeGreaterThanOrEqual(60);
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest).toContain(
      "create extension if not exists pgtap with schema extensions;",
    );
    expect(
      hostedTest.match(/select \* from extensions\.finish\(\);/g),
    ).toHaveLength(1);
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/donor-profiles-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/donor-profiles-postgres.test.ts",
    );
  });
});
