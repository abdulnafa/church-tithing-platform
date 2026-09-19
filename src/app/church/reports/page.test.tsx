import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchPermission } from "@/lib/auth/permissions";
import type { ChurchGivingReport } from "@/lib/church-giving-report";

const {
  createServerSupabaseClientMock,
  getChurchGivingReportMock,
  requireChurchPermissionsMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getChurchGivingReportMock: vi.fn(),
  requireChurchPermissionsMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermissions: requireChurchPermissionsMock,
}));
vi.mock("@/lib/church-giving-report-dal", () => ({
  getChurchGivingReport: getChurchGivingReportMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import ChurchReportsPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT = { rpc: vi.fn() };

const report: ChurchGivingReport = {
  churchId: CHURCH_ID,
  churchTimezone: "America/Barbados",
  period: "month",
  asOfDate: "2026-09-19",
  periodStartDate: "2026-09-01",
  periodEndDate: "2026-09-19",
  currencySummaries: [
    {
      currency: "BBD",
      grossAmountMinor: BigInt(12_500),
      processingFeeMinor: BigInt(375),
      refundedAmountMinor: BigInt(1_000),
      recordedNetAmountMinor: BigInt(11_125),
      giftCount: BigInt(2),
    },
    {
      currency: "USD",
      grossAmountMinor: BigInt(5_000),
      processingFeeMinor: BigInt(150),
      refundedAmountMinor: BigInt(0),
      recordedNetAmountMinor: BigInt(4_850),
      giftCount: BigInt(1),
    },
  ],
  trendPoints: [
    {
      bucketStart: "2026-09-02",
      currency: "BBD",
      grossAmountMinor: BigInt(12_500),
      processingFeeMinor: BigInt(375),
      refundedAmountMinor: BigInt(1_000),
      recordedNetAmountMinor: BigInt(11_125),
      giftCount: BigInt(2),
    },
    {
      bucketStart: "2026-09-03",
      currency: "USD",
      grossAmountMinor: BigInt(5_000),
      processingFeeMinor: BigInt(150),
      refundedAmountMinor: BigInt(0),
      recordedNetAmountMinor: BigInt(4_850),
      giftCount: BigInt(1),
    },
  ],
  fundSummaries: [
    {
      fundId: "20000000-0000-4000-8000-000000000001",
      fundName: "Tithes",
      currency: "BBD",
      grossAmountMinor: BigInt(12_500),
      processingFeeMinor: BigInt(375),
      refundedAmountMinor: BigInt(1_000),
      recordedNetAmountMinor: BigInt(11_125),
      giftCount: BigInt(2),
    },
    {
      fundId: "20000000-0000-4000-8000-000000000002",
      fundName: "Missions",
      currency: "USD",
      grossAmountMinor: BigInt(5_000),
      processingFeeMinor: BigInt(150),
      refundedAmountMinor: BigInt(0),
      recordedNetAmountMinor: BigInt(4_850),
      giftCount: BigInt(1),
    },
  ],
  giftTypeSummaries: [
    {
      giftType: "one_time",
      currency: "BBD",
      grossAmountMinor: BigInt(12_500),
      processingFeeMinor: BigInt(375),
      refundedAmountMinor: BigInt(1_000),
      recordedNetAmountMinor: BigInt(11_125),
      giftCount: BigInt(2),
    },
    {
      giftType: "recurring",
      currency: "USD",
      grossAmountMinor: BigInt(5_000),
      processingFeeMinor: BigInt(150),
      refundedAmountMinor: BigInt(0),
      recordedNetAmountMinor: BigInt(4_850),
      giftCount: BigInt(1),
    },
  ],
};

function usePermissions(permissions: readonly ChurchPermission[]) {
  requireChurchPermissionsMock.mockResolvedValue({
    workspace: {
      kind: "church",
      churchId: CHURCH_ID,
      permissions,
    },
  });
}

describe("real church giving reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClientMock.mockResolvedValue(CLIENT);
    getChurchGivingReportMock.mockResolvedValue({ ok: true, report });
  });

  it("requires both read capabilities and renders saved currencies separately", async () => {
    usePermissions(["reports_read", "financial_read"]);

    const markup = renderToStaticMarkup(
      await ChurchReportsPage({
        searchParams: Promise.resolve({
          period: "month",
          asOf: "2026-09-19",
        }),
      }),
    );

    expect(requireChurchPermissionsMock).toHaveBeenCalledWith([
      "financial_read",
      "reports_read",
    ]);
    expect(getChurchGivingReportMock).toHaveBeenCalledWith(CLIENT, CHURCH_ID, {
      period: "month",
      asOfDate: "2026-09-19",
    });
    expect(markup).toContain("Giving reports");
    expect(markup).toContain("BBD 125.00");
    expect(markup).toContain("USD 50.00");
    expect(markup).toContain("BBD 111.25");
    expect(markup).toContain("Tithes");
    expect(markup).toContain("Missions");
    expect(markup).toContain("currencies are never combined");
    expect(markup).toContain("Provider statements");
    expect(markup).not.toContain("Export CSV");
    expect(markup).not.toContain("data:text/csv");
    expect(markup).not.toContain("Seeded demo");
  });

  it("renders four period controls and exact secure export links", async () => {
    usePermissions(["reports_read", "financial_read", "reports_export"]);

    const markup = renderToStaticMarkup(
      await ChurchReportsPage({
        searchParams: Promise.resolve({
          period: "month",
          asOf: "2026-09-19",
        }),
      }),
    );

    for (const label of ["Last 7 days", "Monthly", "Yearly", "Full history"]) {
      expect(markup).toContain(label);
    }
    expect(markup.match(/Export CSV/g)).toHaveLength(2);
    expect(
      markup.match(
        /href="\/church\/reports\/export\?period=month&amp;asOf=2026-09-19"/g,
      ),
    ).toHaveLength(2);
    expect(markup).toContain(
      'href="/church/reports?period=year&amp;asOf=2026-09-19"',
    );
    expect(markup).not.toContain("data:text/csv");
    expect(markup).not.toContain("download=");
  });

  it("keeps period navigation on the resolved church-local snapshot date", async () => {
    usePermissions(["reports_read", "financial_read"]);

    const markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(getChurchGivingReportMock).toHaveBeenCalledWith(CLIENT, CHURCH_ID, {
      period: "all",
      asOfDate: null,
    });
    expect(markup).toContain(
      'href="/church/reports?period=last_7_days&amp;asOf=2026-09-19"',
    );
    expect(markup).toContain(
      'href="/church/reports?period=all&amp;asOf=2026-09-19"',
    );
    expect(markup).toContain("BBD gross giving trend details");
    expect(markup).toContain("2026-09-02");
    expect(markup).toContain("BBD 111.25");
  });

  it("renders exact huge amounts and a signed recorded net", async () => {
    usePermissions(["reports_read", "financial_read"]);
    getChurchGivingReportMock.mockResolvedValue({
      ok: true,
      report: {
        ...report,
        currencySummaries: [
          {
            ...report.currencySummaries[0],
            grossAmountMinor: BigInt("9007199254740993"),
            recordedNetAmountMinor: BigInt(-25),
          },
        ],
      },
    });

    const markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(markup).toContain("BBD 90071992547409.93");
    expect(markup).toContain("BBD -0.25");
  });

  it("rejects invalid report links before creating a database client", async () => {
    usePermissions(["reports_read", "financial_read"]);

    const markup = renderToStaticMarkup(
      await ChurchReportsPage({
        searchParams: Promise.resolve({ period: "quarter" }),
      }),
    );

    expect(markup).toContain("This report link is invalid.");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getChurchGivingReportMock).not.toHaveBeenCalled();
  });

  it("fails closed when the report is unavailable", async () => {
    usePermissions(["reports_read", "financial_read"]);
    getChurchGivingReportMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = renderToStaticMarkup(
      await ChurchReportsPage({
        searchParams: Promise.resolve({
          period: "year",
          asOf: "2026-09-19",
        }),
      }),
    );

    expect(markup).toContain("Giving reports could not be loaded.");
    expect(markup).toContain(
      'href="/church/reports?period=year&amp;asOf=2026-09-19"',
    );
    expect(markup).not.toContain("BBD 125.00");
  });

  it("renders a truthful empty state without inventing totals", async () => {
    usePermissions(["reports_read", "financial_read"]);
    getChurchGivingReportMock.mockResolvedValue({
      ok: true,
      report: {
        ...report,
        currencySummaries: [],
        trendPoints: [],
        fundSummaries: [],
        giftTypeSummaries: [],
      },
    });

    const markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(markup).toContain("No captured gifts in this period");
    expect(markup).not.toContain("BBD 125.00");
  });
});
