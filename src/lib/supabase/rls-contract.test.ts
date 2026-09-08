import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609050001_harden_active_profile_authorization.sql",
);
const hostedTestPath = resolve(
  process.cwd(),
  "supabase/tests/002_rls_tenant_isolation.test.sql",
);
const packagePath = resolve(process.cwd(), "package.json");

const migration = readFileSync(migrationPath, "utf8");
const normalizedMigration = migration.replace(/\s+/g, " ").trim();
const hostedTest = readFileSync(hostedTestPath, "utf8");

const authorizationFunctions = [
  "is_active_authenticated_user",
  "is_platform_super_admin",
  "is_church_member",
  "has_church_role",
  "owns_donor",
] as const;

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);

  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("active-profile RLS hardening contract", () => {
  it("ships as a separate atomic follow-up migration", () => {
    expect(normalizedMigration.startsWith("begin;")).toBe(true);
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(migration.match(/^create table /gm) ?? []).toHaveLength(0);
    expect(migration.match(/^alter table /gm) ?? []).toHaveLength(0);
    expect(migration.match(/^create type /gm) ?? []).toHaveLength(0);
  });

  it("hardens every authorization helper with an active profile check", () => {
    const declaredFunctions = Array.from(
      migration.matchAll(/^create or replace function public\.([a-z_]+)\(/gm),
      (match) => match[1],
    );

    expect(declaredFunctions).toEqual(authorizationFunctions);

    for (const name of authorizationFunctions) {
      const block = functionBlock(name);
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
    }

    const activeBlock = functionBlock("is_active_authenticated_user");
    expect(activeBlock).toContain("from public.profiles p");
    expect(activeBlock).toContain("p.id = (select auth.uid())");
    expect(activeBlock).toContain("and p.is_active");

    for (const name of authorizationFunctions.slice(1)) {
      expect(functionBlock(name)).toContain(
        "(select public.is_active_authenticated_user())",
      );
    }
  });

  it("revokes implicit function access and grants only authenticated execute", () => {
    for (const signature of [
      "public.is_active_authenticated_user()",
      "public.is_platform_super_admin()",
      "public.is_church_member(uuid)",
      "public.has_church_role(uuid, public.church_member_role[])",
      "public.owns_donor(uuid)",
    ]) {
      expect(normalizedMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role;`,
      );
      expect(normalizedMigration).toContain(
        `grant execute on function ${signature} to authenticated;`,
      );
    }
  });

  it("hardens every direct auth.uid policy branch", () => {
    expect(normalizedMigration).toContain(
      "create policy profiles_update_self on public.profiles for update to authenticated using ( id = (select auth.uid()) and (select public.is_active_authenticated_user()) ) with check ( id = (select auth.uid()) and (select public.is_active_authenticated_user()) );",
    );
    expect(normalizedMigration).toContain(
      "user_id = (select auth.uid()) and (select public.is_active_authenticated_user())",
    );
    expect(normalizedMigration).toContain(
      "create policy donors_read_own on public.donors for select to authenticated using (public.owns_donor(id));",
    );

    const policyNames = Array.from(
      migration.matchAll(/^create policy ([a-z_]+)/gm),
      (match) => match[1],
    );
    expect(policyNames).toEqual([
      "profiles_update_self",
      "platform_admins_read",
      "church_memberships_read_own_or_owner",
      "donors_read_own",
    ]);
  });

  it("does not open any authenticated table mutation privileges", () => {
    const grantStatements = migration.match(/^grant[\s\S]*?;$/gm) ?? [];
    const authenticatedTableWrites = grantStatements.filter((statement) => {
      const normalized = statement.replace(/\s+/g, " ").toLowerCase();
      return (
        normalized.endsWith("to authenticated;") &&
        /\b(insert|update|delete|truncate)\b/.test(normalized)
      );
    });

    expect(authenticatedTableWrites).toEqual([]);
  });

  it("ships a rollback-only hosted pgTAP isolation suite", () => {
    const assertionCount = Array.from(
      hostedTest.matchAll(
        /select extensions\.(?:is|ok|throws_like|throws_ok)\(/g,
      ),
    ).length;

    expect(hostedTest).toContain("select extensions.plan(50);");
    expect(assertionCount).toBe(50);
    expect(hostedTest).toContain("set local role authenticated;");
    expect(hostedTest).toContain("set local role anon;");
    expect(hostedTest).toContain("public.is_active_authenticated_user()");
    expect(hostedTest).toContain("disabled profile cannot read tenant records");
    expect(hostedTest).toContain("owner sees only their church");
    expect(hostedTest).toContain(
      "authenticated user cannot insert a donation directly",
    );
    expect(hostedTest.trimStart().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(hostedTest).not.toMatch(/^commit;$/gm);
  });

  it("keeps both P04 suites in the focused database test command", () => {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts: { "test:db": string };
    };

    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/rls-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/rls-postgres.test.ts",
    );
  });
});
