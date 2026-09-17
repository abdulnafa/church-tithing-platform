import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609170016_webhook_processing.sql",
  ),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/015_webhook_processing.test.sql"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

const normalized = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escapedName}\\s*\\(`,
    "i",
  ).exec(migration);
  const start = match?.index ?? -1;
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P19 webhook persistence database contract", () => {
  it("is one atomic additive migration with durable journal fields", () => {
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    for (const field of [
      "donation_id uuid",
      "event_occurred_at timestamptz",
      "delivery_count integer",
      "last_received_at timestamptz",
      "processing_outcome text",
      "audit_log_id bigint",
    ]) {
      expect(normalized).toContain(field);
    }
    expect(normalized).toContain(
      "alter table public.webhook_events force row level security;",
    );
    expect(normalized).toContain(
      "foreign key (church_id, donation_id) references public.donations(church_id, id) on delete restrict",
    );
    expect(normalized).toContain(
      "create unique index webhook_events_audit_log_unique_idx",
    );
  });

  it("freezes the complete event fingerprint and immutable history", () => {
    const guard = functionBlock("guard_webhook_event_update");
    for (const identityField of [
      "new.church_id is distinct from old.church_id",
      "new.connection_id is distinct from old.connection_id",
      "new.donation_id is distinct from old.donation_id",
      "new.provider is distinct from old.provider",
      "new.external_event_reference is distinct from old.external_event_reference",
      "new.event_type is distinct from old.event_type",
      "new.payload_sha256 is distinct from old.payload_sha256",
      "new.sanitized_payload is distinct from old.sanitized_payload",
      "new.event_occurred_at is distinct from old.event_occurred_at",
    ]) {
      expect(guard).toContain(identityField);
    }
    expect(guard).toContain("WEBHOOK_EVENT_IDENTITY_IMMUTABLE");
    expect(normalized).toContain("webhook_events_no_delete");
    expect(normalized).toContain("webhook_events_no_truncate");
    expect(normalized).toContain("WEBHOOK_EVENT_HISTORY_IMMUTABLE");
  });

  it("stores only an exact sanitized allowlist and never a raw body", () => {
    const sanitizer = functionBlock("webhook_sanitized_payload_is_safe");
    expect(sanitizer).toContain(
      "'checkout_id',\n      'donation_id',\n      'event_occurred_at',\n      'payment_reference'",
    );
    const processor = functionBlock("process_mock_giving_webhook_core");
    const safePayloadStart = processor.indexOf(
      "safe_payload := pg_catalog.jsonb_build_object",
    );
    const insertStart = processor.indexOf(
      "insert into public.webhook_events",
      safePayloadStart,
    );
    const persistedPayload = processor.slice(safePayloadStart, insertStart);
    expect(persistedPayload).not.toMatch(
      /raw_body|signature|donor_email|donor_display_name|prayer|consent|card/i,
    );
    expect(processor).toContain("payload_sha256");
    expect(processor).toContain("safe_payload");
    expect(processor).toContain("pg_catalog.json_each(raw_body::json)");
    expect(sanitizer).toContain("select coalesce((");
    expect(normalized).toContain(
      "lower(provider) <> 'mock-development-gateway' or public.webhook_sanitized_payload_is_safe(sanitized_payload) is true",
    );
  });

  it("compares an immutable fingerprint before updating a duplicate", () => {
    const p19 = functionBlock("process_mock_giving_webhook_core");
    expect(p19).toContain("on conflict do nothing");
    const conflictRead = p19.indexOf("select event.*");
    const capCheck = p19.indexOf("event_identity_count >= 4");
    const insert = p19.indexOf("insert into public.webhook_events");
    const collision = p19.indexOf("MOCK_WEBHOOK_EVENT_COLLISION");
    const deliveryUpdate = p19.indexOf(
      "delivery_count = delivery_count + 1",
    );
    expect(conflictRead).toBeGreaterThanOrEqual(0);
    expect(capCheck).toBeGreaterThan(conflictRead);
    expect(insert).toBeGreaterThan(capCheck);
    expect(collision).toBeGreaterThan(insert);
    expect(deliveryUpdate).toBeGreaterThan(collision);
    expect(p19).toContain("event_was_replayed := true");
    expect(p19).toContain("raise exception 'MOCK_WEBHOOK_EVENT_LIMIT'");
  });

  it("uses the required lock order and a durable handler-failure boundary", () => {
    const p19 = functionBlock("process_mock_giving_webhook_core");
    const checkoutLock = p19.indexOf("from public.mock_giving_checkout_sessions");
    const eventLock = p19.indexOf(
      "from public.webhook_events event",
      checkoutLock,
    );
    expect(checkoutLock).toBeGreaterThanOrEqual(0);
    expect(eventLock).toBeGreaterThan(checkoutLock);

    const processor = functionBlock("process_mock_giving_webhook_event");
    const processorCheckout = processor.indexOf(
      "from public.mock_giving_checkout_sessions",
    );
    const processorEvent = processor.indexOf("from public.webhook_events event");
    const processorDonation = processor.indexOf("from public.donations donation");
    const processorRecurring = processor.indexOf(
      "from public.recurring_gifts recurring",
    );
    expect(processorCheckout).toBeLessThan(processorEvent);
    expect(processorEvent).toBeLessThan(processorDonation);
    expect(processorDonation).toBeLessThan(processorRecurring);

    expect(p19).toContain(
      "processing_result := public.process_mock_giving_webhook_event",
    );
    expect(p19).toContain("exception when others then");
    expect(p19).toContain("processing_outcome = 'handler_failed'");
    expect(p19).not.toMatch(/raise\s+exception[^;]*handler_failed/i);
    expect(p19).toContain(
      "is distinct from webhook_payload ->> 'occurredAt'",
    );
    expect(p19).toContain(
      "pg_catalog.date_trunc(\n      'milliseconds', target_session.created_at",
    );
  });

  it("implements stale-event rejection, equal-time success precedence, and no settlement", () => {
    const processor = functionBlock("process_mock_giving_webhook_event");
    expect(processor).toContain("target_event.event_occurred_at");
    expect(processor).toContain("target_donation.provider_event_occurred_at");
    expect(processor).toContain("target_event.event_type = 'payment.failed'");
    expect(processor).toContain(
      "target_donation.provider_event_type = 'payment.succeeded'",
    );
    expect(processor).toContain("return 'ignored_older_event'");
    expect(processor).toContain("return 'ignored_terminal_state'");
    expect(processor).toContain("status = 'succeeded'");
    expect(processor).toContain("status = 'failed'");
    expect(processor).toContain("failure_code = null");
    expect(processor).toContain("failed_at = null");
    expect(processor).not.toMatch(/settled_at\s*=/i);
  });

  it("records at most one linked audit on the first terminal transition", () => {
    const processor = functionBlock("process_mock_giving_webhook_event");
    expect(processor).toContain("provider_terminal_audit_log_id is null");
    expect(processor).toContain("public.append_audit_event");
    expect(processor).toContain("'webhook_processed'");
    expect(processor).toContain("'webhook_event'");
    expect(processor).toContain("audit_log_id = inserted_audit_log_id");
    expect(normalized).toContain(
      "create unique index donations_provider_terminal_audit_unique_idx",
    );
  });

  it("preserves the completion signature and the temporary P18 compatibility boundary", () => {
    const legacy = functionBlock("complete_mock_giving_checkout");
    const p19 = functionBlock("process_mock_giving_webhook");
    const core = functionBlock("process_mock_giving_webhook_core");
    expect(legacy).toMatch(
      /complete_mock_giving_checkout\(\s*checkout_id uuid,\s*capability_token uuid,\s*raw_body text,\s*signature text\s*\)/,
    );
    expect(p19).toMatch(
      /process_mock_giving_webhook\(\s*checkout_id uuid,\s*capability_token uuid,\s*raw_body text,\s*signature text\s*\)/,
    );
    expect(core).toContain(
      "'checkoutId', 'eventId', 'occurredAt', 'paymentReference', 'type'",
    );
    expect(legacy).toContain(
      "'checkoutId', 'eventId', 'paymentReference', 'type'",
    );
    expect(legacy).toContain(
      "'mock_event_' || pg_catalog.replace(checkout_id::text, '-', '')",
    );
    expect(p19).toContain("return public.process_mock_giving_webhook_core");
    expect(p19).toMatch(/signature,\s*null\s*\)/);
    expect(legacy).toContain(
      "result_record := public.process_mock_giving_webhook_core",
    );
    expect(legacy).toContain("legacy_payload_hash");
    expect(legacy).toContain("target_session.status = 'completed'");
    expect(legacy).toContain(
      "completion_payload_sha256\n      is distinct from legacy_payload_hash",
    );
    expect(legacy).toContain("legacy_was_terminal := target_session.status in");
    expect(legacy).toContain("if result_record.webhook_status = 'failed' then");
    expect(legacy).toContain("return null;");
    expect(legacy).toContain("result_record.replayed := true");
    expect(core).toContain("verified_payload_sha256 !~ '^[0-9a-f]{64}$'");
    expect(core).toContain(
      "payload_hash := coalesce(\n    verified_payload_sha256",
    );
    expect(normalized).toContain(
      "grant execute on function public.complete_mock_giving_checkout(uuid, uuid, text, text) to anon;",
    );
    expect(normalized).toContain(
      "grant execute on function public.process_mock_giving_webhook(uuid, uuid, text, text) to service_role;",
    );
    expect(normalized).toContain(
      "public.process_mock_giving_webhook_event(uuid, uuid), public.process_mock_giving_webhook_core(uuid, uuid, text, text, text), public.process_mock_giving_webhook(uuid, uuid, text, text)",
    );
    expect(normalized).toContain(
      "from public, anon, authenticated, service_role;",
    );
  });

  it("ships rollback-only hosted coverage and focused database wiring", () => {
    const plan = hostedTest.match(/select extensions\.plan\((\d+)\);/i)?.[1];
    expect(plan).toBeDefined();
    expect(hostedTest.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().toLowerCase().endsWith("rollback;")).toBe(true);
    expect(hostedTest).toContain("select * from extensions.finish();");
    expect(
      hostedTest.match(
        /extensions\.(?:ok|is|isnt|like|unlike|throws_ok|throws_like|lives_ok|results_eq|set_eq|bag_eq|cmp_ok|has_column|has_trigger|has_index)\s*\(/gim,
      ) ?? [],
    ).toHaveLength(Number(plan));
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/webhook-processing-contract.test.ts",
    );
    expect(packageJson.scripts?.["test:db"]).toContain(
      "src/lib/supabase/webhook-processing-postgres.test.ts",
    );
  });
});
