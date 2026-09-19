import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609190018_church_report_export.sql",
  ),
  "utf8",
);
const runtimeTest = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/supabase/church-report-export-postgres.test.ts",
  ),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: { "test:db": string } };
const normalized = migration.replace(/\s+/g, " ").trim();

function enumValues(name: string) {
  const block = migration.match(
    new RegExp(`create type public\\.${name} as enum \\(([\\s\\S]*?)\\);`),
  )?.[1];
  expect(block, `${name} should be declared`).toBeDefined();
  return Array.from(block?.matchAll(/'([^']+)'/g) ?? [], (match) => match[1]);
}

function compositeBlock(name: string) {
  const match = migration.match(
    new RegExp(`create type public\\.${name} as \\(([\\s\\S]*?)\\);`),
  );
  expect(match, `${name} should be declared`).not.toBeNull();
  return match?.[1] ?? "";
}

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P21 church report export migration contract", () => {
  it("is one atomic additive migration with finite periods and minimum DTOs", () => {
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(enumValues("church_report_period")).toEqual([
      "last_7_days",
      "month",
      "year",
      "all",
    ]);
    expect(normalized).not.toMatch(
      /alter table public\.(?:donations|donors|funds|campaigns|recurring_gifts)/i,
    );

    const record = compositeBlock("church_report_export_record");
    for (const field of [
      "transaction_id uuid",
      "donated_at timestamptz",
      "donor_name text",
      "fund_name text",
      "campaign_name text",
      "source public.donation_source",
      "frequency text",
      "recurring_status text",
      "gross_amount_minor text",
      "currency text",
      "processing_fee_minor text",
      "refunded_amount_minor text",
      "recorded_net_amount_minor text",
      "payment_method_brand text",
      "payment_method_last4 text",
      "payment_status public.donation_status",
    ]) {
      expect(record).toContain(field);
    }
    const result = compositeBlock("church_report_export_result");
    expect(result).toContain("church_id uuid");
    expect(result).toContain("church_slug text");
    expect(result).toContain("church_timezone text");
    expect(result).toContain("report_period public.church_report_period");
    expect(result).toContain("report_as_of_date date");
    expect(result).toContain("period_start_date date");
    expect(result).toContain("period_end_date date");
    expect(result).toContain(
      "transactions public.church_report_export_record[]",
    );
  });

  it("defines a volatile authenticated definer RPC with all three permissions", () => {
    const rpc = functionBlock("export_church_giving_report");
    for (const argument of [
      "target_church_id uuid,",
      "report_request_id uuid,",
      "selected_period public.church_report_period default 'all',",
      "selected_as_of_date date default null",
    ]) {
      expect(rpc).toContain(argument);
    }
    expect(rpc).toContain("returns public.church_report_export_result");
    expect(rpc).toContain("language plpgsql");
    expect(rpc).toContain("volatile");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("set search_path = ''");
    expect(rpc).toContain("request_user_id := (select auth.uid())");
    for (const permission of [
      "financial_read",
      "reports_read",
      "reports_export",
    ]) {
      expect(rpc).toContain(`'${permission}'`);
    }
    expect(rpc).toContain("church.status in ('active', 'onboarding')");
    expect(rpc).not.toContain("is_platform_super_admin");
  });

  it("uses church-local donated-at boundaries for all four periods", () => {
    const rpc = functionBlock("export_church_giving_report");
    expect(rpc).toContain("select church.slug, church.timezone");
    expect(rpc).toContain("when 'last_7_days' then resolved_as_of_date - 6");
    expect(rpc).toContain("when 'month' then pg_catalog.date_trunc(");
    expect(rpc).toContain("when 'year' then pg_catalog.make_date(");
    expect(rpc).toContain("when 'all' then null");
    expect(rpc).toContain("at time zone selected_timezone");
    expect(rpc).toContain("donation.donated_at >= start_at");
    expect(rpc).toContain("donation.donated_at < end_before");
    expect(rpc).not.toContain("donation.created_at >= start_at");
    expect(rpc).toContain("CHURCH_REPORT_EXPORT_INVALID_AS_OF_DATE");
  });

  it("exports exactly the post-capture states with a stable 10,000-row bound", () => {
    const rpc = functionBlock("export_church_giving_report");
    for (const status of [
      "succeeded",
      "partially_refunded",
      "refunded",
      "disputed",
    ]) {
      expect(rpc).toContain(`'${status}'`);
    }
    for (const status of ["pending", "processing", "failed", "canceled"]) {
      expect(
        rpc.match(new RegExp(`'${status}'`, "g")) ?? [],
        `${status} should not enter the report eligibility predicate`,
      ).toHaveLength(0);
    }
    expect(rpc).toContain(
      "order by donation.donated_at desc, donation.id desc",
    );
    expect(rpc).toContain("limit 10001");
    expect(rpc).toContain("if export_count > 10000 then");
    expect(rpc).toContain("CHURCH_REPORT_EXPORT_TOO_LARGE");
    expect(rpc).not.toMatch(/\boffset\b/i);
    expect(normalized).toContain(
      "create index donations_church_report_cursor_idx on public.donations (church_id, donated_at desc, id desc)",
    );
  });

  it("keeps every join tenant-scoped and every currency on its source row", () => {
    const rpc = functionBlock("export_church_giving_report");
    for (const join of [
      "fund.church_id = donation.church_id",
      "campaign.church_id = donation.church_id",
      "recurring.church_id = donation.church_id",
      "donation.church_id = target_church_id",
    ]) {
      expect(rpc).toContain(join);
    }
    expect(rpc).toContain("donation.currency");
    expect(rpc).toContain("donation.amount_minor::text");
    expect(rpc).toContain("donation.processing_fee_minor::text");
    expect(rpc).toContain("donation.refunded_amount_minor::text");
    expect(rpc).toContain("donation.net_amount_minor::text");
    expect(rpc).not.toMatch(/sum\s*\(/i);
  });

  it("projects no contact, message, provider, checkout, webhook, or prayer fields", () => {
    const record = compositeBlock("church_report_export_record");
    const rpc = functionBlock("export_church_giving_report");
    for (const prohibited of [
      "donor_email",
      "donor_message",
      "provider_payment_reference",
      "provider_charge_reference",
      "external_idempotency_key",
      "failure_message",
      "checkout",
      "webhook",
      "prayer",
    ]) {
      expect(record).not.toContain(prohibited);
      expect(rpc).not.toContain(prohibited);
    }
    expect(rpc).toContain("donation.payment_method_last4");
    expect(rpc).toContain(
      "donation.payment_method_brand =\n            public.canonicalize_public_display_name",
    );
    expect(rpc).not.toMatch(/payment_method_(?:number|cvc|expiry)/i);
  });

  it("records one sanitized report-export audit identity", () => {
    const rpc = functionBlock("export_church_giving_report");
    expect(rpc).toContain("public.append_audit_event(");
    expect(rpc).toContain("event_action => 'report_exported'");
    expect(rpc).toContain("event_entity => 'report'");
    expect(rpc).toContain("event_entity_id => report_request_id::text");
    expect(rpc).toContain("event_actor_user_id => request_user_id");
    expect(rpc).toContain("event_request_id => report_request_id::text");
    expect(rpc).toContain("'report_type', 'giving_' || selected_period::text");
    expect(rpc).toContain("'format', 'csv'");
    expect(rpc).toContain("'row_count', export_count");
  });

  it("grants only authenticated type usage and RPC execution", () => {
    expect(normalized).toContain(
      "revoke all privileges on type public.church_report_period, public.church_report_export_record, public.church_report_export_result from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "grant usage on type public.church_report_period, public.church_report_export_record, public.church_report_export_result to authenticated",
    );
    expect(normalized).toContain(
      "revoke all privileges on function public.export_church_giving_report( uuid, uuid, public.church_report_period, date ) from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "grant execute on function public.export_church_giving_report( uuid, uuid, public.church_report_period, date ) to authenticated",
    );
  });

  it("wires focused contract/runtime tests into the database suite", () => {
    expect(runtimeTest).toContain("new PGlite()");
    expect(runtimeTest).toContain("CHURCH_REPORT_EXPORT_TOO_LARGE");
    expect(runtimeTest).toContain("Other Tenant Secret");
    expect(runtimeTest).toContain("partially_refunded");
    expect(runtimeTest).toContain("recorded_net_amount_minor");
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/church-report-export-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/church-report-export-postgres.test.ts",
    );
  });
});
