import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609190019_church_giving_reports.sql",
  ),
  "utf8",
);
const runtimeTest = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/supabase/church-giving-reports-postgres.test.ts",
  ),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
) as { scripts: { "test:db": string } };
const normalized = migration.replace(/\s+/g, " ").trim();

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

const exactAggregateFields = [
  "currency text",
  "gross_amount_minor text",
  "processing_fee_minor text",
  "refunded_amount_minor text",
  "recorded_net_amount_minor text",
  "gift_count text",
] as const;

describe("P22 church giving reports migration contract", () => {
  it("is one atomic additive migration with minimum aggregate DTOs", () => {
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).not.toMatch(/alter table public\./i);
    expect(normalized).not.toMatch(/create table public\./i);

    for (const typeName of [
      "church_giving_report_currency_summary",
      "church_giving_report_trend_point",
      "church_giving_report_fund_summary",
      "church_giving_report_gift_type_summary",
    ]) {
      const block = compositeBlock(typeName);
      for (const field of exactAggregateFields) expect(block).toContain(field);
    }

    expect(compositeBlock("church_giving_report_trend_point")).toContain(
      "bucket_start date",
    );
    const fund = compositeBlock("church_giving_report_fund_summary");
    expect(fund).toContain("fund_id uuid");
    expect(fund).toContain("fund_name text");
    expect(
      compositeBlock("church_giving_report_gift_type_summary"),
    ).toContain("gift_type text");

    const result = compositeBlock("church_giving_report_result");
    for (const field of [
      "church_id uuid",
      "church_timezone text",
      "report_period public.church_report_period",
      "report_as_of_date date",
      "period_start_date date",
      "period_end_date date",
      "currency_summaries public.church_giving_report_currency_summary[]",
      "trend_points public.church_giving_report_trend_point[]",
      "fund_summaries public.church_giving_report_fund_summary[]",
      "gift_type_summaries public.church_giving_report_gift_type_summary[]",
    ]) {
      expect(result).toContain(field);
    }
  });

  it("defines one stable authenticated definer RPC with minimum permissions", () => {
    const rpc = functionBlock("get_church_giving_report");
    for (const argument of [
      "target_church_id uuid,",
      "selected_period public.church_report_period default 'all',",
      "selected_as_of_date date default null",
    ]) {
      expect(rpc).toContain(argument);
    }
    expect(rpc).toContain("returns public.church_giving_report_result");
    expect(rpc).toContain("language plpgsql");
    expect(rpc).toContain("stable");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("set search_path = ''");
    expect(rpc).toContain("request_user_id := (select auth.uid())");
    expect(rpc).toContain("'financial_read'");
    expect(rpc).toContain("'reports_read'");
    expect(rpc).not.toContain("'reports_export'");
    expect(rpc).not.toContain("is_platform_super_admin");
    expect(rpc).toContain("church.status in ('active', 'onboarding')");
    expect(rpc).toContain("CHURCH_GIVING_REPORT_FORBIDDEN");
  });

  it("uses donated-at church-local half-open boundaries for all periods", () => {
    const rpc = functionBlock("get_church_giving_report");
    expect(rpc).toContain("when 'last_7_days' then resolved_as_of_date - 6");
    expect(rpc).toContain("when 'month' then pg_catalog.date_trunc(");
    expect(rpc).toContain("when 'year' then pg_catalog.make_date(");
    expect(rpc).toContain("when 'all' then null");
    expect(rpc).toContain("at time zone selected_timezone");
    expect(rpc).toContain("donation.donated_at >= start_at");
    expect(rpc).toContain("donation.donated_at < end_before");
    expect(rpc).not.toContain("donation.created_at >= start_at");
    expect(rpc).toContain("CHURCH_GIVING_REPORT_INVALID_PERIOD");
    expect(rpc).toContain("CHURCH_GIVING_REPORT_INVALID_AS_OF_DATE");
  });

  it("aggregates only post-capture gifts and never mixes currencies", () => {
    const rpc = functionBlock("get_church_giving_report");
    for (const status of [
      "succeeded",
      "partially_refunded",
      "refunded",
      "disputed",
    ]) {
      expect(rpc).toContain(`'${status}'`);
    }
    for (const status of ["pending", "processing", "failed", "canceled"]) {
      expect(rpc.match(new RegExp(`'${status}'`, "g")) ?? []).toHaveLength(0);
    }
    expect(rpc).toContain("group by gift.currency");
    expect(rpc).toContain("group by gift.bucket_start, gift.currency");
    expect(rpc).toContain(
      "group by gift.fund_id, gift.fund_name, gift.currency",
    );
    expect(rpc).toContain("group by gift.gift_type, gift.currency");
    expect(rpc).toContain("pg_catalog.sum(gift.net_amount_minor)::text");
    expect(rpc).toContain("pg_catalog.count(*)::text");
  });

  it("uses stable orderings and daily/monthly trend buckets", () => {
    const rpc = functionBlock("get_church_giving_report");
    expect(rpc).toContain("order by summary.currency asc");
    expect(rpc).toContain(
      "order by trend.bucket_start asc, trend.currency asc",
    );
    expect(rpc).toMatch(
      /summary\.currency asc,\s+summary\.gross_amount_numeric desc,\s+summary\.fund_id asc/,
    );
    expect(rpc).toContain("when 'one_time' then 0");
    expect(rpc).toContain(
      "when selected_period in ('last_7_days', 'month')",
    );
    expect(rpc).toContain("donation.donated_at at time zone selected_timezone");
  });

  it("keeps joins tenant-scoped and canceled plans cannot erase history", () => {
    const rpc = functionBlock("get_church_giving_report");
    expect(rpc).toContain("fund.church_id = donation.church_id");
    expect(rpc).toContain("fund.id = donation.fund_id");
    expect(rpc).toContain("donation.church_id = target_church_id");
    expect(rpc).toContain("when donation.recurring_gift_id is null");
    expect(rpc).not.toMatch(/join public\.recurring_gifts/i);
    expect(rpc).not.toMatch(/recurring\.(?:status|canceled_at)/i);
  });

  it("projects no donor, contact, message, provider, prayer, or checkout data", () => {
    const result = compositeBlock("church_giving_report_result");
    const rpc = functionBlock("get_church_giving_report");
    for (const prohibited of [
      "donor_name",
      "donor_email",
      "donor_message",
      "payment_method",
      "provider_",
      "external_idempotency_key",
      "checkout",
      "webhook",
      "prayer",
    ]) {
      expect(result).not.toContain(prohibited);
      expect(rpc).not.toContain(prohibited);
    }
  });

  it("grants only authenticated type usage and RPC execution", () => {
    expect(normalized).toContain(
      "revoke all privileges on type public.church_giving_report_currency_summary, public.church_giving_report_trend_point, public.church_giving_report_fund_summary, public.church_giving_report_gift_type_summary, public.church_giving_report_result from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "grant usage on type public.church_giving_report_currency_summary, public.church_giving_report_trend_point, public.church_giving_report_fund_summary, public.church_giving_report_gift_type_summary, public.church_giving_report_result to authenticated",
    );
    expect(normalized).toContain(
      "revoke all privileges on function public.get_church_giving_report( uuid, public.church_report_period, date ) from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "grant execute on function public.get_church_giving_report( uuid, public.church_report_period, date ) to authenticated",
    );
  });

  it("wires focused contract and runtime coverage into the database suite", () => {
    expect(runtimeTest).toContain("new PGlite()");
    expect(runtimeTest).toContain("America/Barbados");
    expect(runtimeTest).toContain("recorded_net_amount_minor");
    expect(runtimeTest).toContain("partially_refunded");
    expect(runtimeTest).toContain("canceled");
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/church-giving-reports-contract.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "src/lib/supabase/church-giving-reports-postgres.test.ts",
    );
  });
});
