import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
const config = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);
const normalizedSeed = seed.replace(/\s+/g, " ").trim();

describe("development seed contract", () => {
  it("is explicitly development-only, atomic, bounded, and enabled", () => {
    expect(seed).toContain("DEVELOPMENT-ONLY synthetic data");
    expect(normalizedSeed.startsWith("-- DEVELOPMENT-ONLY")).toBe(true);
    expect(normalizedSeed).toContain("begin;");
    expect(normalizedSeed.endsWith("commit;")).toBe(true);
    expect(normalizedSeed).toContain("set local statement_timeout = '30s';");
    expect(normalizedSeed).toContain("set local lock_timeout = '5s';");
    expect(config).toMatch(/\[db\.seed\][\s\S]*?enabled = true/);
    expect(config).toMatch(/sql_paths = \["\.\/seed\.sql"\]/);
  });

  it("uses two fixed tenants and rerunnable conflict handling", () => {
    expect(seed).toContain("10000000-0000-4000-8000-000000000001");
    expect(seed).toContain("20000000-0000-4000-8000-000000000001");
    expect(seed.match(/on conflict do nothing;/g)?.length).toBe(9);
    expect(seed).toContain("do $seed_validation$");
    expect(seed).toContain("development seed donation snapshots do not match");
    expect(seed).toContain("development seed fund snapshots do not match");
    expect(seed).toContain("development seed campaign snapshots do not match");
    expect(seed).toContain("development seed donor snapshots do not match");
    expect(seed).toContain("development seed provider snapshots do not match");
    expect(seed).toContain(
      "development seed recurring-gift snapshots do not match",
    );
    expect(seed).toContain("development seed subscription snapshots do not match");
  });

  it("contains only synthetic identities and non-secret provider metadata", () => {
    const emailDomains = Array.from(
      seed.matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi),
      (match) => match[1].toLowerCase(),
    );

    expect(emailDomains.length).toBeGreaterThan(0);
    expect(emailDomains.every((domain) => domain.endsWith("example.test"))).toBe(
      true,
    );
    expect(normalizedSeed).not.toMatch(
      /(?:sb_secret_|service_role|sk_live_|sk_test_|whsec_|BEGIN PRIVATE KEY|password\s*=)/i,
    );
    expect(seed).not.toMatch(/insert\s+into\s+auth\./i);
  });

  it("does not seed sensitive or append-only operational tables", () => {
    for (const table of [
      "prayer_requests",
      "audit_logs",
      "webhook_events",
      "email_events",
      "payment_provider_references",
    ]) {
      expect(seed).not.toMatch(
        new RegExp(`insert\\s+into\\s+public\\.${table}\\b`, "i"),
      );
    }
  });

  it("preserves provisioning and tenant-integrity triggers", () => {
    expect(normalizedSeed).not.toMatch(/disable trigger/i);
    expect(normalizedSeed).not.toMatch(/session_replication_role/i);
    expect(normalizedSeed).not.toMatch(/alter table/i);
    expect(seed).toContain("and is_default and status = 'active'");
  });

  it("keeps P10-managed fund fields mutable across seed reruns", () => {
    const fundValidationStart = seed.indexOf(
      "with expected (id, church_id, slug) as (",
    );
    const fundValidationEnd = seed.indexOf(
      "development seed fund snapshots do not match",
      fundValidationStart,
    );
    const fundValidation = seed.slice(fundValidationStart, fundValidationEnd);

    expect(fundValidationStart).toBeGreaterThanOrEqual(0);
    expect(fundValidation).toContain("f.slug is distinct from e.slug");
    for (const mutableField of [
      "f.name is distinct",
      "f.status",
      "f.is_default",
      "f.sort_order",
    ]) {
      expect(fundValidation).not.toContain(mutableField);
    }
  });

  it("stores money as integer minor units with explicit currencies", () => {
    expect(seed).toContain("'online', 'succeeded', 25000, 'BBD'");
    expect(seed).toContain("'online', 'succeeded', 5000, 'USD'");
    expect(seed).toContain(
      "'church-essentials-monthly', 9900, 'USD'",
    );
    expect(seed).not.toMatch(/\b(?:amount|fee|price)[^\n]*\d+\.\d+/i);
  });
});
