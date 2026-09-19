import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { exportChurchGivingReport } from "./church-report-export-dal";
import type { ChurchReportExportSelection } from "./church-report-export";

const CHURCH_ID = "abcdef12-3456-4abc-8def-1234567890ab";
const OTHER_CHURCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "fedcba98-7654-4cba-9fed-ba0987654321";
const NEWER_TRANSACTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const OLDER_TRANSACTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const selection: ChurchReportExportSelection = {
  period: "month",
  asOfDate: "2026-09-19",
};

const transactionRow = {
  transaction_id: NEWER_TRANSACTION_ID,
  donated_at: "2026-09-19T14:30:00.123456+00:00",
  donor_name: "Alicia Clarke",
  fund_name: "Tithes",
  campaign_name: "Community Care",
  source: "online",
  frequency: "weekly",
  recurring_status: "active",
  gross_amount_minor: "25000",
  currency: "BBD",
  processing_fee_minor: "775",
  refunded_amount_minor: "0",
  recorded_net_amount_minor: "24225",
  payment_method_brand: "Visa",
  payment_method_last4: "4242",
  payment_status: "succeeded",
} as const;

const signedNetRow = {
  ...transactionRow,
  transaction_id: OLDER_TRANSACTION_ID,
  donated_at: "2026-09-18T09:15:00+00:00",
  donor_name: "Jordan Reed",
  campaign_name: null,
  source: "cheque",
  frequency: null,
  recurring_status: null,
  gross_amount_minor: "9007199254740991",
  processing_fee_minor: "775",
  refunded_amount_minor: "9007199254740991",
  recorded_net_amount_minor: "-775",
  payment_method_brand: null,
  payment_method_last4: null,
  payment_status: "refunded",
} as const;

function reportRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    church_id: CHURCH_ID,
    church_slug: "harbour-grace",
    church_timezone: "America/Barbados",
    report_period: "month",
    report_as_of_date: "2026-09-19",
    period_start_date: "2026-09-01",
    period_end_date: "2026-09-19",
    transactions: [transactionRow, signedNetRow],
    ...overrides,
  };
}

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("church report export database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: reportRow(), error: null });
  });

  it("passes canonical RPC arguments and maps exact bigint strings including a signed net", async () => {
    await expect(
      exportChurchGivingReport(
        client,
        CHURCH_ID.toUpperCase(),
        REQUEST_ID.toUpperCase(),
        selection,
      ),
    ).resolves.toEqual({
      ok: true,
      report: {
        churchId: CHURCH_ID,
        churchSlug: "harbour-grace",
        churchTimezone: "America/Barbados",
        period: "month",
        asOfDate: "2026-09-19",
        periodStartDate: "2026-09-01",
        periodEndDate: "2026-09-19",
        transactions: [
          {
            transactionId: NEWER_TRANSACTION_ID,
            donatedAt: "2026-09-19T14:30:00.123456+00:00",
            donorName: "Alicia Clarke",
            fundName: "Tithes",
            campaignName: "Community Care",
            source: "online",
            frequency: "weekly",
            recurringStatus: "active",
            grossAmountMinor: BigInt(25_000),
            currency: "BBD",
            processingFeeMinor: BigInt(775),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(24_225),
            paymentMethodBrand: "Visa",
            paymentMethodLast4: "4242",
            paymentStatus: "succeeded",
          },
          {
            transactionId: OLDER_TRANSACTION_ID,
            donatedAt: "2026-09-18T09:15:00+00:00",
            donorName: "Jordan Reed",
            fundName: "Tithes",
            campaignName: null,
            source: "cheque",
            frequency: null,
            recurringStatus: null,
            grossAmountMinor: BigInt("9007199254740991"),
            currency: "BBD",
            processingFeeMinor: BigInt(775),
            refundedAmountMinor: BigInt("9007199254740991"),
            recordedNetAmountMinor: BigInt(-775),
            paymentMethodBrand: null,
            paymentMethodLast4: null,
            paymentStatus: "refunded",
          },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("export_church_giving_report", {
      target_church_id: CHURCH_ID,
      report_request_id: REQUEST_ID,
      selected_period: "month",
      selected_as_of_date: "2026-09-19",
    });
  });

  it("omits the optional as-of argument and accepts the database-resolved date", async () => {
    const openSelection: ChurchReportExportSelection = {
      period: "all",
      asOfDate: null,
    };
    rpc.mockResolvedValue({
      data: reportRow({
        report_period: "all",
        period_start_date: null,
        transactions: [],
      }),
      error: null,
    });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, openSelection),
    ).resolves.toMatchObject({
      ok: true,
      report: {
        period: "all",
        asOfDate: "2026-09-19",
        periodStartDate: null,
        transactions: [],
      },
    });
    expect(rpc).toHaveBeenCalledWith("export_church_giving_report", {
      target_church_id: CHURCH_ID,
      report_request_id: REQUEST_ID,
      selected_period: "all",
    });
  });

  it("drops unreviewed fields from the mapped export DTO", async () => {
    rpc.mockResolvedValue({
      data: reportRow({
        transactions: [
          {
            ...transactionRow,
            donor_email: "alicia@example.test",
            donor_message: "private note",
            provider_payment_reference: "provider-secret",
            prayer_request: "private prayer",
          },
        ],
      }),
      error: null,
    });

    const result = await exportChurchGivingReport(
      client,
      CHURCH_ID,
      REQUEST_ID,
      selection,
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? Object.keys(result.report.transactions[0]!) : []).toEqual([
      "transactionId",
      "donatedAt",
      "donorName",
      "fundName",
      "campaignName",
      "source",
      "frequency",
      "recurringStatus",
      "grossAmountMinor",
      "currency",
      "processingFeeMinor",
      "refundedAmountMinor",
      "recordedNetAmountMinor",
      "paymentMethodBrand",
      "paymentMethodLast4",
      "paymentStatus",
    ]);
  });

  it.each([
    ["CHURCH_REPORT_EXPORT_FORBIDDEN", "forbidden"],
    ["CHURCH_REPORT_EXPORT_TOO_LARGE", "too_large"],
    ["CHURCH_REPORT_EXPORT_INVALID_AS_OF_DATE", "invalid_request"],
    ["CHURCH_REPORT_EXPORT_INVALID_PERIOD", "invalid_request"],
    ["CHURCH_REPORT_EXPORT_AUDIT_FAILED", "unavailable"],
    ["private relation detail", "unavailable"],
  ] as const)("maps database error %s conservatively", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("treats non-string database errors as unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 42 } });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["null result", null],
    ["empty array", []],
    ["multiple result rows", [reportRow(), reportRow()]],
    ["missing fields", {}],
  ])("fails closed for a malformed response envelope: %s", async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["cross-tenant church", { church_id: OTHER_CHURCH_ID }],
    ["unsafe slug", { church_slug: "Harbour Grace" }],
    ["unsafe timezone", { church_timezone: "America/Barbados\nsecret" }],
    ["wrong period", { report_period: "year" }],
    ["invalid as-of date", { report_as_of_date: "2026-02-30" }],
    ["mismatched as-of date", { report_as_of_date: "2026-09-18" }],
    ["invalid end date", { period_end_date: "19 September 2026" }],
    ["mismatched end date", { period_end_date: "2026-09-18" }],
    ["wrong period start", { period_start_date: "2026-09-02" }],
    ["non-array transactions", { transactions: null }],
  ])("fails closed for malformed report metadata: %s", async (_label, override) => {
    rpc.mockResolvedValue({ data: reportRow(override), error: null });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects an oversized response even before mapping its rows", async () => {
    rpc.mockResolvedValue({
      data: reportRow({ transactions: Array(10_001).fill(transactionRow) }),
      error: null,
    });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["uppercase transaction ID", { transaction_id: NEWER_TRANSACTION_ID.toUpperCase() }],
    ["invalid donated date", { donated_at: "2026-02-30T12:00:00Z" }],
    ["blank donor", { donor_name: "" }],
    ["non-canonical donor", { donor_name: "  Alicia   Clarke  " }],
    ["unsafe fund", { fund_name: "Tithes\nprivate" }],
    ["blank campaign", { campaign_name: "" }],
    ["unknown source", { source: "bank" }],
    ["half recurring frequency", { recurring_status: null }],
    ["half recurring status", { frequency: null }],
    ["numeric gross", { gross_amount_minor: 25000 }],
    ["non-canonical gross", { gross_amount_minor: "025000" }],
    ["zero gross", { gross_amount_minor: "0", recorded_net_amount_minor: "-775" }],
    ["out-of-range gross", { gross_amount_minor: "9223372036854775808" }],
    ["negative fee", { processing_fee_minor: "-1" }],
    ["negative refund", { refunded_amount_minor: "-1" }],
    ["refund above gross", { refunded_amount_minor: "25001" }],
    ["wrong net arithmetic", { recorded_net_amount_minor: "24224" }],
    ["unsupported currency", { currency: "EUR" }],
    ["unsafe payment brand", { payment_method_brand: "Visa\nsecret" }],
    ["invalid last four", { payment_method_last4: "424" }],
    ["unknown payment status", { payment_status: "complete" }],
    ["full refund without refunded status", {
      refunded_amount_minor: "25000",
      recorded_net_amount_minor: "-775",
    }],
    ["refunded status without full refund", { payment_status: "refunded" }],
    ["partial status without a refund", { payment_status: "partially_refunded" }],
  ])("fails closed for malformed export row data: %s", async (_label, override) => {
    rpc.mockResolvedValue({
      data: reportRow({ transactions: [{ ...transactionRow, ...override }] }),
      error: null,
    });

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects duplicate or non-descending transaction positions", async () => {
    rpc.mockResolvedValue({
      data: reportRow({ transactions: [transactionRow, transactionRow] }),
      error: null,
    });
    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValue({
      data: reportRow({ transactions: [signedNetRow, transactionRow] }),
      error: null,
    });
    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects malformed inputs before calling the database", async () => {
    await expect(
      exportChurchGivingReport(client, "not-a-uuid", REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      exportChurchGivingReport(client, CHURCH_ID, "not-a-uuid", selection),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, {
        period: "weekly" as ChurchReportExportSelection["period"],
        asOfDate: null,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, {
        period: "all",
        asOfDate: "2026-02-30",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails unavailable when the RPC throws", async () => {
    rpc.mockRejectedValue(new Error("network unavailable"));

    await expect(
      exportChurchGivingReport(client, CHURCH_ID, REQUEST_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
