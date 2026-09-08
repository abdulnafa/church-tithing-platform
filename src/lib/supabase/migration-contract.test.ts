import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608180001_initial_schema.sql",
);
const databaseTestPath = resolve(
  process.cwd(),
  "supabase/tests/001_schema_and_provisioning.test.sql",
);
const configPath = resolve(process.cwd(), "supabase/config.toml");

const migration = readFileSync(migrationPath, "utf8");
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

const expectedTables = [
  "profiles",
  "platform_admins",
  "churches",
  "church_memberships",
  "funds",
  "campaigns",
  "donors",
  "payment_provider_connections",
  "recurring_gifts",
  "donations",
  "prayer_requests",
  "receipts",
  "annual_statements",
  "statement_donations",
  "platform_subscriptions",
  "payment_provider_references",
  "qr_links",
  "webhook_events",
  "email_events",
  "audit_logs",
] as const;

function matches(pattern: RegExp): string[] {
  return Array.from(migration.matchAll(pattern), (match) => match[1]);
}

describe("initial Supabase migration contract", () => {
  it("is one atomic migration with the expected 20 application tables", () => {
    expect(normalizedMigration).toContain("begin;");
    expect(normalizedMigration.endsWith("commit;")).toBe(true);
    expect(matches(/^create table public\.([a-z_]+) \(/gm)).toEqual(
      expectedTables,
    );
  });

  it("enables RLS on every application table", () => {
    const rlsTables = matches(
      /^alter table public\.([a-z_]+) enable row level security;$/gm,
    );

    expect(rlsTables).toHaveLength(expectedTables.length);
    expect(new Set(rlsTables)).toEqual(new Set(expectedTables));
  });

  it("uses an empty search path for every security-definer function", () => {
    const functionBlocks = Array.from(
      migration.matchAll(
        /create or replace function public\.([a-z_]+)\([\s\S]*?\n\$\$;/g,
      ),
    );
    const securityDefinerBlocks = functionBlocks.filter(([block]) =>
      block.includes("security definer"),
    );

    expect(securityDefinerBlocks).toHaveLength(11);
    for (const [block] of securityDefinerBlocks) {
      expect(block).toContain("set search_path = ''");
      expect(block).not.toContain("set search_path = public, pg_temp");
    }
  });

  it("keeps authenticated mutations closed except safe profile fields", () => {
    const grantStatements = migration.match(/^grant[\s\S]*?;$/gm) ?? [];
    const authenticatedWriteGrants = grantStatements
      .map((statement) => statement.replace(/\s+/g, " ").trim())
      .filter(
        (statement) =>
          statement.endsWith("to authenticated;") &&
          /\b(insert|update|delete|truncate)\b/.test(statement),
      );

    expect(authenticatedWriteGrants).toEqual([
      "grant update (display_name, phone, avatar_url) on public.profiles to authenticated;",
    ]);

    const mutationPolicies = Array.from(
      migration.matchAll(/^create policy ([a-z_]+)[\s\S]*?;$/gm),
    )
      .filter(([statement]) => {
        const normalized = statement.replace(/\s+/g, " ");
        return (
          normalized.includes("to authenticated") &&
          !/\bfor select\b/.test(normalized)
        );
      })
      .map(([, name]) => name);

    expect(mutationPolicies).toEqual(["profiles_update_self"]);
  });

  it("exposes only approved public giving columns to anonymous clients", () => {
    const anonymousGrantSection = normalizedMigration.slice(
      normalizedMigration.indexOf("grant select ( id, name, slug"),
      normalizedMigration.indexOf("grant select on table public.profiles"),
    );

    expect(anonymousGrantSection).toContain("short_code");
    expect(anonymousGrantSection).not.toContain("created_by");
    expect(anonymousGrantSection).not.toContain("scan_count");
    expect(anonymousGrantSection).not.toContain("public_settings");
    expect(normalizedMigration).not.toContain(
      "grant select on public.churches, public.funds, public.campaigns, public.qr_links to anon;",
    );
  });

  it("enforces a permanent, lowercase, church-only QR route", () => {
    expect(normalizedMigration).toContain(
      "constraint qr_links_v1_church_only check ( kind = 'church' and fund_id is null and campaign_id is null )",
    );
    expect(normalizedMigration).toContain(
      "create unique index qr_links_one_church_code_idx on public.qr_links (church_id);",
    );
    expect(normalizedMigration).toContain(
      "create trigger qr_links_keep_routing before update on public.qr_links",
    );
    expect(normalizedMigration).toContain(
      "create constraint trigger qr_links_require_one_per_church",
    );
    expect(normalizedMigration).toContain(
      "grant update (is_active, scan_count, last_scanned_at, updated_at) on public.qr_links to service_role;",
    );
    const serviceTableGrantStart = normalizedMigration.lastIndexOf(
      "grant select, insert, update, delete on table",
    );
    const serviceTableGrantEnd = normalizedMigration.indexOf(
      "to service_role;",
      serviceTableGrantStart,
    );
    const serviceTableGrant = normalizedMigration.slice(
      serviceTableGrantStart,
      serviceTableGrantEnd,
    );
    expect(serviceTableGrant).not.toContain("public.qr_links");
    expect(normalizedMigration).toContain(
      "lower(short_code) = short_code",
    );
  });

  it("protects provisioning and financial record integrity", () => {
    expect(normalizedMigration).toContain(
      "create constraint trigger funds_require_one_active_default",
    );
    expect(normalizedMigration).toContain(
      "church must have exactly one active default fund",
    );
    expect(normalizedMigration).toContain(
      "constraint donations_online_idempotency_required",
    );
    expect(normalizedMigration).toContain(
      "constraint donations_recurring_identity_tenant_fk",
    );
    expect(normalizedMigration).toContain(
      "constraint donations_refund_state_consistent",
    );
    expect(normalizedMigration).toContain(
      "create trigger donations_keep_snapshot before update on public.donations",
    );
    expect(normalizedMigration).toContain(
      "constraint funds_default_must_be_active",
    );
    expect(normalizedMigration).toContain(
      "constraint annual_statements_supersedes_donor_tenant_fk",
    );
    expect(normalizedMigration).toContain(
      "create trigger donations_validate_campaign_fund",
    );
    expect(normalizedMigration).toContain(
      "create trigger receipts_validate_snapshot",
    );
  });

  it("keeps audit history append-only for the service role", () => {
    expect(normalizedMigration).toContain(
      "create trigger audit_logs_reject_truncate before truncate on public.audit_logs",
    );
    expect(normalizedMigration).toContain(
      "grant select, insert on public.audit_logs to service_role;",
    );
    expect(normalizedMigration).toContain(
      "revoke all privileges on sequence public.audit_logs_id_seq from public, anon, authenticated, service_role;",
    );
    expect(normalizedMigration).not.toContain(
      "grant all privileges on table",
    );
  });

  it("declares supporting indexes for the audited foreign keys", () => {
    const requiredIndexes = [
      "recurring_gifts_fund_fk_idx",
      "recurring_gifts_campaign_fk_idx",
      "recurring_gifts_connection_fk_idx",
      "donations_connection_fk_idx",
      "prayer_requests_donor_fk_idx",
      "annual_statements_supersedes_fk_idx",
      "payment_provider_references_subscription_fk_idx",
      "webhook_events_connection_fk_idx",
      "email_events_donor_fk_idx",
      "email_events_donation_fk_idx",
      "email_events_receipt_fk_idx",
      "email_events_statement_fk_idx",
    ];

    for (const indexName of requiredIndexes) {
      expect(normalizedMigration).toContain(`create index ${indexName}`);
    }
  });

  it("ships executable database checks with the reviewed P03 seed enabled", () => {
    const databaseTest = readFileSync(databaseTestPath, "utf8");
    const config = readFileSync(configPath, "utf8");
    const assertionCount = Array.from(
      databaseTest.matchAll(
        /select extensions\.(?:is|ok|throws_like|throws_ok)\(/g,
      ),
    ).length;

    expect(databaseTest).toContain("select extensions.plan(51);");
    expect(assertionCount).toBe(51);
    expect(databaseTest.trimEnd().endsWith("rollback;")).toBe(true);
    expect(config).toMatch(/\[db\.seed\][\s\S]*?enabled = true/);
    expect(config).toMatch(/sql_paths = \["\.\/seed\.sql"\]/);
  });
});
