import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609180017_church_transaction_list.sql",
  ),
  "utf8",
);
const hostedTest = readFileSync(
  resolve(process.cwd(), "supabase/tests/016_church_transactions.test.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/supabase/church-transactions-postgres.test.ts",
  ),
  "utf8",
);
const normalized = migration.replace(/\s+/g, " ").trim();

function functionBlock(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start);
  expect(start, `${name} should be defined`).toBeGreaterThanOrEqual(0);
  expect(end, `${name} should have a complete body`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

describe("P20 church transaction list migration contract", () => {
  it("is one atomic additive migration with the exact minimum DTOs", () => {
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).toContain(
      "create type public.church_transaction_record as ( transaction_id uuid, church_id uuid, donor_name text, fund_id uuid, fund_name text, campaign_id uuid, campaign_name text, recorded_at timestamptz, frequency text, recurring_status text, amount_minor bigint, currency text, processing_fee_minor bigint, refunded_amount_minor bigint, net_amount_minor bigint, payment_method_brand text, payment_method_last4 text, payment_status public.donation_status, cancellation_state text )",
    );
    expect(normalized).toContain(
      "create type public.church_transaction_fund_option as ( fund_id uuid, fund_name text, fund_status public.fund_status )",
    );
    expect(normalized).toContain(
      "create type public.church_transaction_page as ( church_id uuid, church_timezone text, transactions public.church_transaction_record[], fund_options public.church_transaction_fund_option[], next_cursor_created_at timestamptz, next_cursor_transaction_id uuid, has_more boolean )",
    );
    expect(normalized).not.toMatch(/alter table public\.(?:donations|donors|funds|campaigns|recurring_gifts)/i);
    expect(normalized).not.toMatch(/insert into|update public\.|delete from public\./i);
  });

  it("defines the exact RPC signature and stable definer boundary", () => {
    const rpc = functionBlock("get_church_transaction_page");
    for (const argument of [
      "target_church_id uuid,",
      "transaction_page_size integer default 25,",
      "transaction_cursor_created_at timestamptz default null,",
      "transaction_cursor_id uuid default null,",
      "transaction_date_from date default null,",
      "transaction_date_to date default null,",
      "transaction_donor_query text default null,",
      "transaction_min_amount_minor bigint default null,",
      "transaction_max_amount_minor bigint default null,",
      "transaction_fund_id uuid default null,",
      "transaction_recurring_state text default null,",
      "transaction_last4 text default null,",
      "transaction_payment_status public.donation_status default null,",
      "transaction_cancellation_state text default null",
    ]) {
      expect(rpc).toContain(argument);
    }
    expect(rpc).toContain("returns public.church_transaction_page");
    expect(rpc).toContain("language plpgsql");
    expect(rpc).toContain("stable");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("set search_path = ''");
  });

  it("rechecks active authenticated financial access inside the database", () => {
    const rpc = functionBlock("get_church_transaction_page");
    expect(rpc).toContain("(select auth.uid()) is null");
    expect(rpc).toContain("target_church_id is null");
    expect(rpc).toContain("'financial_read'");
    expect(rpc).toContain("church.status in ('active', 'onboarding')");
    expect(rpc.match(/CHURCH_TRANSACTIONS_FORBIDDEN/g)).toHaveLength(2);
    expect(rpc).not.toContain("is_platform_super_admin");
  });

  it("uses a stable created-at/UUID keyset and exact supporting index", () => {
    expect(normalized).toContain(
      "create index donations_church_created_cursor_idx on public.donations (church_id, created_at desc, id desc)",
    );
    const rpc = functionBlock("get_church_transaction_page");
    expect(rpc).toContain(
      "(record.recorded_at, record.transaction_id) < (",
    );
    expect(rpc).toContain("limit transaction_page_size + 1");
    expect(rpc).toContain(
      "order by record.recorded_at desc, record.transaction_id desc",
    );
    expect(rpc).not.toMatch(/\boffset\b/i);
    expect(rpc).not.toContain("coalesce(donation.donated_at");
  });

  it("resolves inclusive date filters in the selected church timezone", () => {
    const rpc = functionBlock("get_church_transaction_page");
    expect(rpc).toContain("select church.timezone");
    expect(rpc).toContain("transaction_date_from::timestamp without time zone");
    expect(rpc).toContain("at time zone selected_timezone");
    expect(rpc).toContain("(transaction_date_to + 1)::timestamp without time zone");
    expect(rpc).toContain("donation.created_at >= date_start_at");
    expect(rpc).toContain("donation.created_at < date_end_before");
    expect(rpc).toContain("CHURCH_TRANSACTIONS_INVALID_DATE_RANGE");
  });

  it("implements every approved filter without searching hidden donor email", () => {
    const rpc = functionBlock("get_church_transaction_page");
    for (const filterFragment of [
      "donation.donor_display_name",
      "donation.amount_minor >= transaction_min_amount_minor",
      "donation.amount_minor <= transaction_max_amount_minor",
      "donation.fund_id = transaction_fund_id",
      "donation.payment_method_last4 = transaction_last4",
      "donation.status = transaction_payment_status",
      "record.recurring_status = transaction_recurring_state",
    ]) {
      expect(rpc).toContain(filterFragment);
    }
    expect(rpc).not.toContain("donation.donor_email");
    expect(rpc).not.toContain("donor.email");
    for (const error of [
      "INVALID_PAGE_SIZE",
      "INVALID_CURSOR",
      "INVALID_DONOR_QUERY",
      "INVALID_AMOUNT_RANGE",
      "INVALID_RECURRING_STATE",
      "INVALID_LAST4",
      "INVALID_CANCELLATION_STATE",
    ]) {
      expect(rpc).toContain(`CHURCH_TRANSACTIONS_${error}`);
    }
  });

  it("keeps tenant equality on every joined financial table", () => {
    const rpc = functionBlock("get_church_transaction_page");
    for (const join of [
      "fund.church_id = donation.church_id",
      "campaign.church_id = donation.church_id",
      "recurring.church_id = donation.church_id",
    ]) {
      expect(rpc).toContain(join);
    }
    expect(rpc).toContain("donation.church_id = target_church_id");
    expect(rpc).toContain("fund.church_id = target_church_id");
  });

  it("projects safe financial fields without contact, message, provider, checkout, or prayer data", () => {
    const rpc = functionBlock("get_church_transaction_page");
    for (const prohibited of [
      "donor_email",
      "donor_message",
      "provider_payment_reference",
      "provider_charge_reference",
      "external_idempotency_key",
      "mock_giving_checkout",
      "prayer_request",
      "failure_message",
    ]) {
      expect(rpc).not.toContain(prohibited);
    }
    expect(rpc).toContain("donation.payment_method_last4");
    expect(rpc).toContain(
      "donation.payment_method_brand =\n            public.canonicalize_public_display_name",
    );
    expect(rpc).toContain("between 1 and 40");
    expect(rpc).toContain("donation.payment_method_brand !~ '[[:cntrl:]]'");
    expect(rpc).not.toMatch(/payment_method_(?:number|cvc|expiry)/i);
  });

  it("distinguishes payment and recurring-plan cancellation without rewriting history", () => {
    const rpc = functionBlock("get_church_transaction_page");
    for (const state of [
      "not_canceled",
      "payment_canceled",
      "recurring_canceled",
      "payment_and_recurring_canceled",
      "any_canceled",
    ]) {
      expect(rpc).toContain(`'${state}'`);
    }
    expect(rpc).toContain("donation.status = 'canceled'");
    expect(rpc).toContain("recurring.status = 'canceled'");
    expect(rpc).not.toMatch(/update\s+public\.donations/i);
  });

  it("returns all tenant fund options through the same bounded page", () => {
    const rpc = functionBlock("get_church_transaction_page");
    expect(rpc).toContain("result_page.fund_options");
    expect(rpc).toContain(
      "array[]::public.church_transaction_fund_option[]",
    );
    expect(rpc).toContain("case when fund.status = 'active' then 0 else 1 end");
    expect(rpc).toContain("fund.status");
  });

  it("grants only authenticated type usage and function execution", () => {
    expect(normalized).toContain(
      "revoke all privileges on type public.church_transaction_record, public.church_transaction_fund_option, public.church_transaction_page from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "grant usage on type public.church_transaction_record, public.church_transaction_fund_option, public.church_transaction_page to authenticated",
    );
    expect(normalized).toContain(
      "from public, anon, authenticated, service_role; grant execute on function public.get_church_transaction_page(",
    );
    expect(normalized).toMatch(/\) to authenticated; commit;$/);
  });

  it("ships focused PostgreSQL and rollback-only hosted coverage", () => {
    const plan = Number(
      hostedTest.match(/select extensions\.plan\((\d+)\);/i)?.[1],
    );
    const assertions =
      hostedTest.match(
        /extensions\.(?:ok|is|isnt|like|unlike|throws_ok|throws_like|lives_ok|results_eq|set_eq|bag_eq|cmp_ok|has_type|has_index)\s*\(/gim,
      ) ?? [];
    expect(runtimeTest).toContain("new PGlite()");
    expect(runtimeTest).toContain("payment_and_recurring_canceled");
    expect(hostedTest.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(hostedTest.trimEnd().toLowerCase().endsWith("rollback;")).toBe(true);
    expect(hostedTest).toContain("select * from extensions.finish();");
    expect(assertions).toHaveLength(plan);
    expect(plan).toBeGreaterThanOrEqual(30);
  });
});
