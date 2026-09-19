import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { getChurchGivingReport } from "./church-giving-report-dal";
import type { ChurchGivingReportSelection } from "./church-giving-report";

const CHURCH_ID = "abcdef12-3456-4abc-8def-1234567890ab";
const OTHER_CHURCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUILDING_FUND_ID = "10000000-0000-4000-8000-000000000001";
const TITHES_FUND_ID = "20000000-0000-4000-8000-000000000002";
const MISSIONS_FUND_ID = "30000000-0000-4000-8000-000000000003";

const selection: ChurchGivingReportSelection = {
  period: "all",
  asOfDate: "2026-09-19",
};

const currencySummary = {
  currency: "BBD",
  gross_amount_minor: "127500",
  processing_fee_minor: "4020",
  refunded_amount_minor: "0",
  recorded_net_amount_minor: "123480",
  gift_count: "6",
} as const;

const trendPoints = [
  {
    bucket_start: "2026-09-01",
    currency: "BBD",
    gross_amount_minor: "7500",
    processing_fee_minor: "245",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "7255",
    gift_count: "1",
  },
  {
    bucket_start: "2026-09-10",
    currency: "BBD",
    gross_amount_minor: "120000",
    processing_fee_minor: "3775",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "116225",
    gift_count: "5",
  },
] as const;

const fundSummaries = [
  {
    fund_id: BUILDING_FUND_ID,
    fund_name: "Building Fund",
    currency: "BBD",
    gross_amount_minor: "65000",
    processing_fee_minor: "2025",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "62975",
    gift_count: "2",
  },
  {
    fund_id: TITHES_FUND_ID,
    fund_name: "Tithes",
    currency: "BBD",
    gross_amount_minor: "55000",
    processing_fee_minor: "1750",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "53250",
    gift_count: "3",
  },
  {
    fund_id: MISSIONS_FUND_ID,
    fund_name: "Missions",
    currency: "BBD",
    gross_amount_minor: "7500",
    processing_fee_minor: "245",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "7255",
    gift_count: "1",
  },
] as const;

const giftTypeSummaries = [
  {
    gift_type: "one_time",
    currency: "BBD",
    gross_amount_minor: "92500",
    processing_fee_minor: "2945",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "89555",
    gift_count: "4",
  },
  {
    gift_type: "recurring",
    currency: "BBD",
    gross_amount_minor: "35000",
    processing_fee_minor: "1075",
    refunded_amount_minor: "0",
    recorded_net_amount_minor: "33925",
    gift_count: "2",
  },
] as const;

function reportRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    church_id: CHURCH_ID,
    church_timezone: "America/Barbados",
    report_period: "all",
    report_as_of_date: "2026-09-19",
    period_start_date: null,
    period_end_date: "2026-09-19",
    currency_summaries: [currencySummary],
    trend_points: trendPoints,
    fund_summaries: fundSummaries,
    gift_type_summaries: giftTypeSummaries,
    ...overrides,
  };
}

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("church giving report database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: reportRow(), error: null });
  });

  it("passes canonical RPC arguments and maps exact aggregate strings to bigint", async () => {
    await expect(
      getChurchGivingReport(client, CHURCH_ID.toUpperCase(), selection),
    ).resolves.toEqual({
      ok: true,
      report: {
        churchId: CHURCH_ID,
        churchTimezone: "America/Barbados",
        period: "all",
        asOfDate: "2026-09-19",
        periodStartDate: null,
        periodEndDate: "2026-09-19",
        currencySummaries: [
          {
            currency: "BBD",
            grossAmountMinor: BigInt(127_500),
            processingFeeMinor: BigInt(4_020),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(123_480),
            giftCount: BigInt(6),
          },
        ],
        trendPoints: [
          {
            bucketStart: "2026-09-01",
            currency: "BBD",
            grossAmountMinor: BigInt(7_500),
            processingFeeMinor: BigInt(245),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(7_255),
            giftCount: BigInt(1),
          },
          {
            bucketStart: "2026-09-10",
            currency: "BBD",
            grossAmountMinor: BigInt(120_000),
            processingFeeMinor: BigInt(3_775),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(116_225),
            giftCount: BigInt(5),
          },
        ],
        fundSummaries: [
          {
            fundId: BUILDING_FUND_ID,
            fundName: "Building Fund",
            currency: "BBD",
            grossAmountMinor: BigInt(65_000),
            processingFeeMinor: BigInt(2_025),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(62_975),
            giftCount: BigInt(2),
          },
          {
            fundId: TITHES_FUND_ID,
            fundName: "Tithes",
            currency: "BBD",
            grossAmountMinor: BigInt(55_000),
            processingFeeMinor: BigInt(1_750),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(53_250),
            giftCount: BigInt(3),
          },
          {
            fundId: MISSIONS_FUND_ID,
            fundName: "Missions",
            currency: "BBD",
            grossAmountMinor: BigInt(7_500),
            processingFeeMinor: BigInt(245),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(7_255),
            giftCount: BigInt(1),
          },
        ],
        giftTypeSummaries: [
          {
            giftType: "one_time",
            currency: "BBD",
            grossAmountMinor: BigInt(92_500),
            processingFeeMinor: BigInt(2_945),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(89_555),
            giftCount: BigInt(4),
          },
          {
            giftType: "recurring",
            currency: "BBD",
            grossAmountMinor: BigInt(35_000),
            processingFeeMinor: BigInt(1_075),
            refundedAmountMinor: BigInt(0),
            recordedNetAmountMinor: BigInt(33_925),
            giftCount: BigInt(2),
          },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_giving_report", {
      target_church_id: CHURCH_ID,
      selected_period: "all",
      selected_as_of_date: "2026-09-19",
    });
  });

  it("omits the optional date and accepts the database-resolved local date", async () => {
    rpc.mockResolvedValue({ data: reportRow(), error: null });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, {
        period: "all",
        asOfDate: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      report: { asOfDate: "2026-09-19" },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_giving_report", {
      target_church_id: CHURCH_ID,
      selected_period: "all",
    });
  });

  it("accepts an empty report and preserves strict empty dimensions", async () => {
    rpc.mockResolvedValue({
      data: reportRow({
        currency_summaries: [],
        trend_points: [],
        fund_summaries: [],
        gift_type_summaries: [],
      }),
      error: null,
    });

    const result = await getChurchGivingReport(client, CHURCH_ID, selection);
    expect(result).toMatchObject({
      ok: true,
      report: {
        currencySummaries: [],
        trendPoints: [],
        fundSummaries: [],
        giftTypeSummaries: [],
      },
    });
  });

  it("accepts a mathematically correct signed recorded net", async () => {
    const signed = {
      currency: "BBD",
      gross_amount_minor: "100",
      processing_fee_minor: "125",
      refunded_amount_minor: "100",
      recorded_net_amount_minor: "-125",
      gift_count: "1",
    } as const;
    rpc.mockResolvedValue({
      data: reportRow({
        currency_summaries: [signed],
        trend_points: [{ bucket_start: "2026-09-01", ...signed }],
        fund_summaries: [
          {
            fund_id: BUILDING_FUND_ID,
            fund_name: "Building Fund",
            ...signed,
          },
        ],
        gift_type_summaries: [{ gift_type: "one_time", ...signed }],
      }),
      error: null,
    });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toMatchObject({
      ok: true,
      report: {
        currencySummaries: [{ recordedNetAmountMinor: BigInt(-125) }],
      },
    });
  });

  it("keeps aggregate precision beyond the PostgreSQL bigint range", async () => {
    const exact = {
      currency: "BBD",
      gross_amount_minor: "9223372036854775808",
      processing_fee_minor: "125",
      refunded_amount_minor: "0",
      recorded_net_amount_minor: "9223372036854775683",
      gift_count: "9223372036854775808",
    } as const;
    rpc.mockResolvedValue({
      data: reportRow({
        currency_summaries: [exact],
        trend_points: [{ bucket_start: "2026-09-01", ...exact }],
        fund_summaries: [
          {
            fund_id: BUILDING_FUND_ID,
            fund_name: "Building Fund",
            ...exact,
          },
        ],
        gift_type_summaries: [{ gift_type: "one_time", ...exact }],
      }),
      error: null,
    });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toMatchObject({
      ok: true,
      report: {
        currencySummaries: [
          {
            grossAmountMinor: BigInt("9223372036854775808"),
            giftCount: BigInt("9223372036854775808"),
          },
        ],
      },
    });
  });

  it.each([
    ["CHURCH_GIVING_REPORT_FORBIDDEN", "forbidden"],
    ["CHURCH_GIVING_REPORT_INVALID_PERIOD", "invalid_request"],
    ["CHURCH_GIVING_REPORT_INVALID_AS_OF_DATE", "invalid_request"],
    ["private database detail", "unavailable"],
  ] as const)("maps database error %s conservatively", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason });
  });

  it.each([
    ["null", null],
    ["empty array", []],
    ["multiple rows", [reportRow(), reportRow()]],
    ["missing fields", {}],
  ])("fails closed for malformed response envelopes: %s", async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["cross-tenant church", { church_id: OTHER_CHURCH_ID }],
    ["unsafe timezone", { church_timezone: "America/Barbados\nprivate" }],
    ["wrong period", { report_period: "month" }],
    ["invalid as-of", { report_as_of_date: "2026-02-30" }],
    ["wrong requested date", { report_as_of_date: "2026-09-18" }],
    ["invalid end date", { period_end_date: "19 September 2026" }],
    ["mismatched end date", { period_end_date: "2026-09-18" }],
    ["wrong all-history start", { period_start_date: "2026-01-01" }],
    ["non-array currency summaries", { currency_summaries: null }],
    ["non-array trends", { trend_points: null }],
    ["non-array funds", { fund_summaries: null }],
    ["non-array gift types", { gift_type_summaries: null }],
  ])("fails closed for malformed report metadata: %s", async (_label, override) => {
    rpc.mockResolvedValue({ data: reportRow(override), error: null });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("enforces the exact start date for each period", async () => {
    const monthSelection: ChurchGivingReportSelection = {
      period: "month",
      asOfDate: "2026-09-19",
    };
    rpc.mockResolvedValue({
      data: reportRow({
        report_period: "month",
        period_start_date: "2026-09-02",
      }),
      error: null,
    });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, monthSelection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["last_7_days", "2026-09-13"],
    ["month", "2026-09-01"],
    ["year", "2026-01-01"],
    ["all", null],
  ] as const)(
    "accepts the canonical %s period boundary",
    async (period, periodStartDate) => {
      rpc.mockResolvedValue({
        data: reportRow({
          report_period: period,
          period_start_date: periodStartDate,
          currency_summaries: [],
          trend_points: [],
          fund_summaries: [],
          gift_type_summaries: [],
        }),
        error: null,
      });

      await expect(
        getChurchGivingReport(client, CHURCH_ID, {
          period,
          asOfDate: "2026-09-19",
        }),
      ).resolves.toMatchObject({
        ok: true,
        report: { period, periodStartDate },
      });
    },
  );

  it.each([
    ["unsupported currency", { currency: "EUR" }],
    ["numeric gross", { gross_amount_minor: 127500 }],
    ["leading-zero gross", { gross_amount_minor: "0127500" }],
    ["negative-zero net", { recorded_net_amount_minor: "-0" }],
    ["zero gross", { gross_amount_minor: "0", recorded_net_amount_minor: "-4020" }],
    ["negative fee", { processing_fee_minor: "-1" }],
    ["negative refund", { refunded_amount_minor: "-1" }],
    ["refund above gross", { refunded_amount_minor: "127501" }],
    ["wrong net arithmetic", { recorded_net_amount_minor: "123479" }],
    ["zero gift count", { gift_count: "0" }],
    ["decimal gift count", { gift_count: "6.0" }],
    ["excessive-length integer", { gross_amount_minor: "9".repeat(129) }],
  ])("rejects malformed exact aggregate data: %s", async (_label, override) => {
    rpc.mockResolvedValue({
      data: reportRow({
        currency_summaries: [{ ...currencySummary, ...override }],
      }),
      error: null,
    });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    [
      "invalid trend date",
      { trend_points: [{ ...trendPoints[0], bucket_start: "2026-02-30" }] },
    ],
    [
      "future trend date",
      { trend_points: [{ ...trendPoints[0], bucket_start: "2026-09-20" }] },
    ],
    [
      "uppercase fund id",
      {
        fund_summaries: [
          { ...fundSummaries[0], fund_id: BUILDING_FUND_ID.toUpperCase() },
        ],
      },
    ],
    [
      "unsafe fund name",
      { fund_summaries: [{ ...fundSummaries[0], fund_name: "Fund\nprivate" }] },
    ],
    [
      "unknown gift type",
      { gift_type_summaries: [{ ...giftTypeSummaries[0], gift_type: "weekly" }] },
    ],
  ])("rejects malformed dimension identity data: %s", async (_label, override) => {
    rpc.mockResolvedValue({ data: reportRow(override), error: null });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("requires deterministic unique ordering for every dimension", async () => {
    rpc.mockResolvedValue({
      data: reportRow({ trend_points: [...trendPoints].reverse() }),
      error: null,
    });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValue({
      data: reportRow({ fund_summaries: [...fundSummaries].reverse() }),
      error: null,
    });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValue({
      data: reportRow({
        gift_type_summaries: [...giftTypeSummaries].reverse(),
      }),
      error: null,
    });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValue({
      data: reportRow({ currency_summaries: [currencySummary, currencySummary] }),
      error: null,
    });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("fails closed when any dimension disagrees with the currency totals", async () => {
    rpc.mockResolvedValue({
      data: reportRow({
        trend_points: [
          trendPoints[0],
          { ...trendPoints[1], gift_count: "4" },
        ],
      }),
      error: null,
    });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects inconsistent names for the same fund across currencies", async () => {
    const cadSummary = {
      ...currencySummary,
      currency: "CAD",
    } as const;
    const cadTrend = trendPoints.map((point) => ({
      ...point,
      currency: "CAD",
    }));
    const cadFunds = fundSummaries.map((fund, index) => ({
      ...fund,
      currency: "CAD",
      fund_name: index === 0 ? "Different Name" : fund.fund_name,
    }));
    const cadGiftTypes = giftTypeSummaries.map((giftType) => ({
      ...giftType,
      currency: "CAD",
    }));
    rpc.mockResolvedValue({
      data: reportRow({
        currency_summaries: [currencySummary, cadSummary],
        trend_points: trendPoints.flatMap((point, index) => [
          point,
          cadTrend[index],
        ]),
        fund_summaries: [...fundSummaries, ...cadFunds],
        gift_type_summaries: [...giftTypeSummaries, ...cadGiftTypes],
      }),
      error: null,
    });

    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects invalid input before calling the database", async () => {
    await expect(
      getChurchGivingReport(client, "not-a-uuid", selection),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, {
        period: "weekly" as ChurchGivingReportSelection["period"],
        asOfDate: null,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, {
        period: "all",
        asOfDate: "2026-02-30",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails unavailable when the RPC throws or returns a non-string error", async () => {
    rpc.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 42 } });
    await expect(
      getChurchGivingReport(client, CHURCH_ID, selection),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
