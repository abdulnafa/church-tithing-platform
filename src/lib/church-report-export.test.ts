import { describe, expect, it } from "vitest";

import {
  createChurchReportCsv,
  createChurchReportFilename,
  formatChurchReportMinorUnits,
  parseChurchReportExportSearchParams,
  type ChurchReportExport,
  type ChurchReportExportRow,
} from "./church-report-export";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "20000000-0000-4000-8000-000000000001";

const baseRow: ChurchReportExportRow = {
  transactionId: TRANSACTION_ID,
  donatedAt: "2026-09-19T12:30:00.123456+00:00",
  donorName: "Jordan Reed",
  fundName: "Community Care",
  campaignName: "Family Support",
  source: "online",
  frequency: "monthly",
  recurringStatus: "active",
  grossAmountMinor: BigInt(12_500),
  currency: "BBD",
  processingFeeMinor: BigInt(375),
  refundedAmountMinor: BigInt(0),
  recordedNetAmountMinor: BigInt(12_125),
  paymentMethodBrand: "Visa",
  paymentMethodLast4: "4242",
  paymentStatus: "succeeded",
};

function reportWith(
  transactions: readonly ChurchReportExportRow[],
  overrides: Partial<ChurchReportExport> = {},
): ChurchReportExport {
  return {
    churchId: CHURCH_ID,
    churchSlug: "harbour-grace",
    churchTimezone: "America/Barbados",
    period: "all",
    asOfDate: "2026-09-19",
    periodStartDate: null,
    periodEndDate: "2026-09-19",
    transactions,
    ...overrides,
  };
}

describe("church report export query", () => {
  it("accepts only the supported single-value period and as-of parameters", () => {
    expect(parseChurchReportExportSearchParams(new URLSearchParams())).toEqual({
      ok: true,
      selection: { period: "all", asOfDate: null },
    });
    expect(
      parseChurchReportExportSearchParams(
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
    "period=quarter",
    "asOf=2026-02-30",
    "period=all&unknown=value",
  ])("rejects duplicate, invalid, or unknown query input: %s", (query) => {
    expect(
      parseChurchReportExportSearchParams(new URLSearchParams(query)),
    ).toEqual({ ok: false, reason: "invalid_request" });
  });
});

describe("church report CSV", () => {
  it("uses a UTF-8 BOM, RFC4180 quoting, CRLF rows, and spreadsheet formula neutralization", () => {
    const csv = createChurchReportCsv(
      reportWith([
        {
          ...baseRow,
          donorName: '=HYPERLINK("https://evil.test","click")',
          fundName: 'General, "Community"',
          campaignName: "Line 1\r\nLine 2",
          paymentMethodBrand: "@Visa",
        },
      ]),
    );

    expect(csv.startsWith("\uFEFFTransaction ID,Donated at (UTC),Donor"))
      .toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain(
      `"'=HYPERLINK(""https://evil.test"",""click"")"`,
    );
    expect(csv).toContain(`"General, ""Community"""`);
    expect(csv).toContain(`"Line 1\r\nLine 2"`);
    expect(csv).toContain("'@Visa ending 4242");

    const withoutQuotedEmbeddedLineBreak = csv.replace(
      `"Line 1\r\nLine 2"`,
      "quoted-value",
    );
    expect(withoutQuotedEmbeddedLineBreak.replaceAll("\r\n", "")).not.toContain(
      "\n",
    );
  });

  it.each(["=2+2", "+SUM(A1:A2)", "-10+20", "@command"])(
    "neutralizes a dangerous leading spreadsheet token: %s",
    (donorName) => {
      const csv = createChurchReportCsv(
        reportWith([{ ...baseRow, donorName }]),
      );

      expect(csv).toContain(`'${donorName}`);
      expect(csv).not.toContain(`,${donorName},`);
    },
  );

  it("formats bigint minor units exactly, including recorded negative net", () => {
    expect(formatChurchReportMinorUnits(BigInt("9007199254740993"))).toBe(
      "90071992547409.93",
    );
    expect(formatChurchReportMinorUnits(BigInt("-9007199254740993"))).toBe(
      "-90071992547409.93",
    );
    expect(formatChurchReportMinorUnits(BigInt(-25))).toBe("-0.25");

    const csv = createChurchReportCsv(
      reportWith([
        {
          ...baseRow,
          grossAmountMinor: BigInt(100),
          processingFeeMinor: BigInt(125),
          refundedAmountMinor: BigInt(0),
          recordedNetAmountMinor: BigInt(-25),
        },
      ]),
    );

    expect(csv).toContain(",1.00,BBD,1.25,0.00,-0.25,");
    expect(csv).not.toMatch(/donor email|prayer|provider reference/i);
  });

  it("builds a deterministic attachment-safe filename", () => {
    expect(
      createChurchReportFilename(
        reportWith([], {
          period: "month",
          periodStartDate: "2026-09-01",
        }),
      ),
    ).toBe("harbour-grace-giving-monthly-2026-09-19.csv");
  });
});
