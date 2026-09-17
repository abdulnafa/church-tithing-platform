import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609170015_mock_giving_checkout.sql",
  ),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/014_mock_giving_checkout.test.sql"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const normalized = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function tableBlock() {
  const start = migration.indexOf(
    "create table public.mock_giving_checkout_sessions",
  );
  const end = migration.indexOf("\n);", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

describe("P18 mock giving database contract", () => {
  it("is one atomic additive migration with a private forced-RLS ledger", () => {
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).toContain(
      "alter table public.mock_giving_checkout_sessions enable row level security;",
    );
    expect(normalized).toContain(
      "alter table public.mock_giving_checkout_sessions force row level security;",
    );
    expect(normalized).toContain(
      "revoke all privileges on table public.mock_giving_checkout_sessions from public, anon, authenticated, service_role;",
    );
  });

  it("stores only hashed capabilities and lifecycle-safe checkout fields", () => {
    const table = tableBlock();
    expect(table).toContain("capability_sha256 text not null");
    expect(table).toContain("payload_hmac_sha256 text not null");
    expect(table).toContain("completion_payload_sha256 text");
    expect(table).toContain("unique (church_id, capability_sha256)");
    expect(table).toContain("unique (connection_id, checkout_reference)");
    expect(table).toContain("frequency in ('one_time', 'weekly', 'monthly')");
    expect(table).toContain("status in ('open', 'completed', 'canceled', 'expired')");
    expect(table).not.toMatch(
      /\b(?:prayer|capability_token|raw_body|raw_payload|card_number|cvv|cvc|provider_secret)\b/i,
    );
  });

  it("begins one tenant-bound, exact-idempotent development mock checkout", () => {
    const begin = functionBlock("begin_mock_giving_checkout");
    expect(begin).toMatch(
      /begin_mock_giving_checkout\(\s*church_slug text,\s*capability_token uuid,\s*target_kind text,\s*target_id uuid,\s*amount_minor bigint,\s*frequency text,\s*donor_display_name text,\s*donor_email text\s*\)/,
    );
    expect(begin).toContain("security definer");
    expect(begin).toContain("set search_path = ''");
    expect(begin).toContain("connection.provider = 'mock-development-gateway'");
    expect(begin).toContain(
      "connection.capabilities ->> 'environment' = 'development'",
    );
    expect(begin).toContain(
      "connection.capabilities ->> 'settlement_mode' = 'direct_to_church'",
    );
    expect(begin).toContain("connection.charges_enabled");
    expect(begin).toContain("connection.payouts_enabled");
    expect(begin).toContain("target_church.default_currency = any");
    expect(begin).toContain("target_kind is null");
    expect(begin).toContain("amount_minor is null");
    expect(begin).toContain("frequency is null");
    expect(begin.match(/for share/g)?.length).toBeGreaterThanOrEqual(4);
    expect(begin).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(begin).toContain("MOCK_CHECKOUT_IDEMPOTENCY_CONFLICT");
    expect(begin).toContain("capability_sha256");
    expect(begin).toContain("auth_user_id");
    expect(begin).toContain("donor_message");
    expect(begin).toContain("null,");
    expect(begin).not.toMatch(/\bprayer\b/i);
  });

  it("separates guest, pending donation, and optional recurring records", () => {
    const begin = functionBlock("begin_mock_giving_checkout");
    const donorInsert = begin.indexOf("insert into public.donors");
    const recurringInsert = begin.indexOf("insert into public.recurring_gifts");
    const donationInsert = begin.indexOf("insert into public.donations");
    const sessionInsert = begin.indexOf(
      "insert into public.mock_giving_checkout_sessions",
    );
    expect(donorInsert).toBeGreaterThanOrEqual(0);
    expect(recurringInsert).toBeGreaterThan(donorInsert);
    expect(donationInsert).toBeGreaterThan(recurringInsert);
    expect(sessionInsert).toBeGreaterThan(donationInsert);
    expect(begin).toContain("'incomplete'");
    expect(begin).toContain("'pending'");
    expect(begin).toContain("'online'");
    expect(begin).toContain("'checkout_session'");
    expect(begin).toContain("'payment'");
    expect(begin).toContain("'subscription'");
  });

  it("capability-guards reads and idempotent cancellation", () => {
    const get = functionBlock("get_mock_giving_checkout");
    const cancel = functionBlock("cancel_mock_giving_checkout");
    for (const block of [get, cancel]) {
      expect(block).toContain("checkout_id uuid");
      expect(block).toContain("capability_token uuid");
      expect(block).toContain("capability_sha256 = capability_hash");
      expect(block).toContain("for update");
      expect(block).not.toContain("lock_mock_giving_checkout_connection");
      expect(block).not.toMatch(/\bprayer\b/i);
    }
    expect(get).toContain("public.close_mock_giving_checkout");
    expect(cancel).toContain("MOCK_CHECKOUT_FORBIDDEN");
    expect(cancel).toContain("result_record.replayed := true");
  });

  it("verifies exact raw-body HMAC before the temporary success transition", () => {
    const complete = functionBlock("complete_mock_giving_checkout");
    expect(complete).toMatch(
      /complete_mock_giving_checkout\(\s*checkout_id uuid,\s*capability_token uuid,\s*raw_body text,\s*signature text\s*\)/,
    );
    expect(complete).toContain(
      "public.mock_hmac_sha256_hex(\n    capability_token::text,\n    raw_body",
    );
    expect(complete).toContain(
      "'checkoutId', 'eventId', 'paymentReference', 'type'",
    );
    for (const field of [
      "type",
      "checkoutId",
      "eventId",
      "paymentReference",
    ]) {
      expect(complete).toContain(
        `pg_catalog.jsonb_typeof(webhook_payload -> '${field}')`,
      );
    }
    expect(complete).toContain(
      "webhook_payload ->> 'type' is distinct from 'payment.succeeded'",
    );
    expect(complete).toContain("completion_payload_sha256 = completion_hash");
    expect(complete).toContain("status = 'succeeded'");
    expect(complete).toContain("status = 'active'");
    expect(complete).toContain("last_gave_at = processed_at");
    expect(complete).toContain("public.lock_mock_giving_checkout_connection");
    expect(complete.indexOf("target_session.expires_at <= processed_at"))
      .toBeLessThan(
        complete.indexOf("public.lock_mock_giving_checkout_connection"),
      );
    expect(complete).not.toMatch(/insert into public\.webhook_events/i);
    expect(complete).not.toMatch(/settled_at\s*=/i);
    expect(complete).not.toMatch(/\bprayer\b/i);
  });

  it("keeps creation server-only and exposes only capability routines to anon", () => {
    expect(normalized).toContain(
      "public.lock_mock_giving_checkout_connection(uuid)",
    );
    expect(normalized).toContain(
      "grant usage on type public.mock_giving_checkout_start_result to service_role;",
    );
    expect(normalized).toContain(
      "grant usage on type public.mock_giving_checkout_record, public.mock_giving_checkout_state_result, public.mock_giving_checkout_completion_result to anon;",
    );
    expect(normalized).toContain(
      "grant execute on function public.begin_mock_giving_checkout( text, uuid, text, uuid, bigint, text, text, text ) to service_role;",
    );
    expect(normalized).toContain(
      "grant execute on function public.get_mock_giving_checkout(uuid, uuid), public.cancel_mock_giving_checkout(uuid, uuid), public.complete_mock_giving_checkout(uuid, uuid, text, text) to anon;",
    );
    expect(normalized).not.toMatch(/to authenticated/);
  });

  it("revalidates locked sources and freezes terminal evidence", () => {
    const lock = functionBlock("lock_mock_giving_checkout_connection");
    expect(lock).toContain("for share of church, connection");
    expect(lock.match(/for share/g)?.length).toBeGreaterThanOrEqual(2);
    expect(lock).toContain("church.status = 'active'");
    expect(lock).toContain("connection.provider = 'mock-development-gateway'");
    expect(lock).toContain("connection.status = 'active'");
    expect(lock).toContain(
      "connection.capabilities ->> 'environment' = 'development'",
    );
    expect(lock).not.toMatch(/public\.(?:funds|campaigns)/);
    const guard = functionBlock("guard_mock_giving_checkout_update");
    expect(guard).toContain(
      "new.completion_payload_sha256\n        is distinct from old.completion_payload_sha256",
    );
    expect(guard).toContain("new.completed_at is distinct from old.completed_at");
    expect(guard).toContain("new.canceled_at is distinct from old.canceled_at");
  });

  it("ships rollback-only hosted coverage and focused database test wiring", () => {
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
      "src/lib/supabase/mock-giving-contract.test.ts",
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/mock-giving-postgres.test.ts",
    );
  });
});
