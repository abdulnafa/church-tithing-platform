import { describe, expect, it } from "vitest";

import {
  CHURCH_GIVING_REPORT_PERIOD_OPTIONS,
  formatChurchGivingReportAmount,
  formatChurchGivingReportMinorUnits,
  formatChurchGivingReportPercentage,
  getChurchGivingReportPercentageBasisPoints,
  getChurchGivingReportPeriodDescription,
  getChurchGivingReportPeriodLabel,
  parseChurchGivingReportSearchParams,
} from "./church-giving-report";

describe("church giving report period selection", () => {
  it("defaults to full history and accepts a single supported period and date", () => {
    expect(parseChurchGivingReportSearchParams(new URLSearchParams())).toEqual({
      ok: true,
      selection: { period: "all", asOfDate: null },
    });
    expect(
      parseChurchGivingReportSearchParams(
        new URLSearchParams("period=last_7_days&asOf=2026-09-19"),
      ),
    ).toEqual({
      ok: true,
      selection: { period: "last_7_days", asOfDate: "2026-09-19" },
    });
  });

  it.each([
    "period=all&period=month",
    "asOf=2026-09-19&asOf=2026-09-18",
    "period=week",
    "period=",
    "asOf=2026-02-30",
    "period=all&private=value",
  ])("rejects ambiguous, invalid, or unknown input: %s", (query) => {
    expect(
      parseChurchGivingReportSearchParams(new URLSearchParams(query)),
    ).toEqual({ ok: false, reason: "invalid_request" });
  });

  it("publishes stable labels and explicit local-calendar semantics", () => {
    expect(CHURCH_GIVING_REPORT_PERIOD_OPTIONS).toEqual([
      {
        value: "last_7_days",
        label: "Last 7 days",
        description: "The selected local date and the six preceding days.",
      },
      {
        value: "month",
        label: "Monthly",
        description:
          "The current local calendar month through the selected date.",
      },
      {
        value: "year",
        label: "Yearly",
        description:
          "The current local calendar year through the selected date.",
      },
      {
        value: "all",
        label: "Full history",
        description: "All captured giving through the selected date.",
      },
    ]);
    expect(getChurchGivingReportPeriodLabel("month")).toBe("Monthly");
    expect(getChurchGivingReportPeriodDescription("year")).toContain(
      "local calendar year",
    );
  });
});

describe("church giving report exact display helpers", () => {
  it("formats arbitrary bigint minor units without number coercion", () => {
    expect(formatChurchGivingReportMinorUnits(BigInt("9007199254740993"))).toBe(
      "90071992547409.93",
    );
    expect(
      formatChurchGivingReportMinorUnits(BigInt("-9007199254740993")),
    ).toBe("-90071992547409.93");
    expect(formatChurchGivingReportAmount(BigInt(-25), "BBD")).toBe(
      "BBD -0.25",
    );
  });

  it("calculates rounded basis points using exact bigint arithmetic", () => {
    expect(
      getChurchGivingReportPercentageBasisPoints(BigInt(1), BigInt(3)),
    ).toBe(3333);
    expect(
      getChurchGivingReportPercentageBasisPoints(BigInt(2), BigInt(3)),
    ).toBe(6667);
    expect(
      getChurchGivingReportPercentageBasisPoints(
        BigInt("9007199254740993"),
        BigInt("18014398509481986"),
      ),
    ).toBe(5000);
    expect(
      getChurchGivingReportPercentageBasisPoints(BigInt(0), BigInt(0)),
    ).toBe(0);
    expect(
      getChurchGivingReportPercentageBasisPoints(BigInt(5), BigInt(4)),
    ).toBe(10_000);
  });

  it("formats basis points without floating-point rounding", () => {
    expect(formatChurchGivingReportPercentage(0)).toBe("0.00%");
    expect(formatChurchGivingReportPercentage(3333)).toBe("33.33%");
    expect(formatChurchGivingReportPercentage(10_000)).toBe("100.00%");
    expect(formatChurchGivingReportPercentage(-1)).toBe("0.00%");
  });
});
