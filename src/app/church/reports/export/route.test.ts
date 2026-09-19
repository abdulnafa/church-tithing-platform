import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchReportExport } from "@/lib/church-report-export";

const {
  createServerSupabaseClientMock,
  exportChurchGivingReportMock,
  requireChurchPermissionsMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  exportChurchGivingReportMock: vi.fn(),
  requireChurchPermissionsMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermissions: requireChurchPermissionsMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/church-report-export-dal", () => ({
  exportChurchGivingReport: exportChurchGivingReportMock,
}));

import { dynamic, GET, runtime } from "./route";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "20000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };

const report: ChurchReportExport = {
  churchId: CHURCH_ID,
  churchSlug: "harbour-grace",
  churchTimezone: "America/Barbados",
  period: "month",
  asOfDate: "2026-09-19",
  periodStartDate: "2026-09-01",
  periodEndDate: "2026-09-19",
  transactions: [
    {
      transactionId: TRANSACTION_ID,
      donatedAt: "2026-09-19T12:30:00.000000+00:00",
      donorName: "Jordan Reed",
      fundName: "Community Care",
      campaignName: null,
      source: "online",
      frequency: null,
      recurringStatus: null,
      grossAmountMinor: BigInt(100),
      currency: "BBD",
      processingFeeMinor: BigInt(125),
      refundedAmountMinor: BigInt(0),
      recordedNetAmountMinor: BigInt(-25),
      paymentMethodBrand: "Visa",
      paymentMethodLast4: "4242",
      paymentStatus: "succeeded",
    },
  ],
};

function request(query = "period=month&asOf=2026-09-19") {
  return new Request(`https://giving.example/church/reports/export?${query}`);
}

function expectPrivateResponseHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("GET /church/reports/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionsMock.mockResolvedValue({
      workspace: {
        kind: "church",
        churchId: CHURCH_ID,
        permissions: ["financial_read", "reports_read", "reports_export"],
      },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    exportChurchGivingReportMock.mockResolvedValue({ ok: true, report });
  });

  it("is a request-time Node route and authorizes before any data access", async () => {
    const response = await GET(request());

    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
    expect(requireChurchPermissionsMock).toHaveBeenCalledWith([
      "financial_read",
      "reports_read",
      "reports_export",
    ]);
    expect(requireChurchPermissionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      createServerSupabaseClientMock.mock.invocationCallOrder[0],
    );
    expect(createServerSupabaseClientMock.mock.invocationCallOrder[0]).toBeLessThan(
      exportChurchGivingReportMock.mock.invocationCallOrder[0],
    );
    expect(response.status).toBe(200);
  });

  it("does not swallow an authentication or authorization redirect", async () => {
    const guardFailure = new Error("NEXT_REDIRECT");
    requireChurchPermissionsMock.mockRejectedValue(guardFailure);

    await expect(GET(request())).rejects.toBe(guardFailure);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(exportChurchGivingReportMock).not.toHaveBeenCalled();
  });

  it.each([
    "period=all&period=month",
    "asOf=2026-09-19&asOf=2026-09-18",
    "period=all&unknown=value",
  ])("rejects duplicate or unknown parameters before data access: %s", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("The report export request is invalid.");
    expectPrivateResponseHeaders(response);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(exportChurchGivingReportMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_request", 400, "The report export request is invalid."],
    ["forbidden", 403, "You do not have access to this report export."],
    [
      "too_large",
      413,
      "This report is too large to export at once. Choose a shorter period.",
    ],
    [
      "unavailable",
      503,
      "The report export is temporarily unavailable.",
    ],
  ] as const)(
    "maps the %s DAL result to a private generic response",
    async (reason, status, message) => {
      exportChurchGivingReportMock.mockResolvedValue({
        ok: false,
        reason,
        raw: "private database or provider detail",
      });

      const response = await GET(request());

      expect(response.status).toBe(status);
      expect(await response.text()).toBe(message);
      expectPrivateResponseHeaders(response);
      expect(response.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
      );
    },
  );

  it("maps thrown client or DAL failures to a generic unavailable response", async () => {
    createServerSupabaseClientMock.mockRejectedValueOnce(
      new Error("private client failure"),
    );
    let response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(
      "The report export is temporarily unavailable.",
    );
    expectPrivateResponseHeaders(response);

    createServerSupabaseClientMock.mockResolvedValueOnce(client);
    exportChurchGivingReportMock.mockRejectedValueOnce(
      new Error("private database failure"),
    );
    response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(
      "The report export is temporarily unavailable.",
    );
    expectPrivateResponseHeaders(response);
  });

  it("returns an attachment with exact CSV content and private response headers", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expectPrivateResponseHeaders(response);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="harbour-grace-giving-monthly-2026-09-19.csv"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder().decode(bytes.slice(3));
    expect(body.startsWith("Transaction ID,Donated at (UTC),Donor")).toBe(
      true,
    );
    expect(body).toContain(",1.00,BBD,1.25,0.00,-0.25,");
    expect(body.endsWith("\r\n")).toBe(true);

    expect(exportChurchGivingReportMock).toHaveBeenCalledTimes(1);
    const [passedClient, churchId, requestId, selection] =
      exportChurchGivingReportMock.mock.calls[0];
    expect(passedClient).toBe(client);
    expect(churchId).toBe(CHURCH_ID);
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(selection).toEqual({ period: "month", asOfDate: "2026-09-19" });
  });
});
