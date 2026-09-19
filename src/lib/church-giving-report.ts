import {
  CHURCH_REPORT_PERIODS,
  formatChurchReportMinorUnits,
  parseChurchReportExportSearchParams,
  type ChurchReportPeriod,
} from "./church-report-export";

export const CHURCH_GIVING_REPORT_GIFT_TYPES = [
  "one_time",
  "recurring",
] as const;

export const CHURCH_GIVING_REPORT_CURRENCIES = [
  "BBD",
  "CAD",
  "USD",
  "XCD",
] as const;

export type ChurchGivingReportGiftType =
  (typeof CHURCH_GIVING_REPORT_GIFT_TYPES)[number];
export type ChurchGivingReportCurrency =
  (typeof CHURCH_GIVING_REPORT_CURRENCIES)[number];
export type ChurchGivingReportPeriod = ChurchReportPeriod;

export type ChurchGivingReportSelection = Readonly<{
  period: ChurchGivingReportPeriod;
  asOfDate: string | null;
}>;

export type ChurchGivingReportSearchParseResult =
  | Readonly<{ ok: true; selection: ChurchGivingReportSelection }>
  | Readonly<{ ok: false; reason: "invalid_request" }>;

export type ChurchGivingReportAmounts = Readonly<{
  grossAmountMinor: bigint;
  processingFeeMinor: bigint;
  refundedAmountMinor: bigint;
  recordedNetAmountMinor: bigint;
  giftCount: bigint;
}>;

export type ChurchGivingReportCurrencySummary =
  ChurchGivingReportAmounts &
    Readonly<{
      currency: ChurchGivingReportCurrency;
    }>;

export type ChurchGivingReportTrendPoint = ChurchGivingReportCurrencySummary &
  Readonly<{
    bucketStart: string;
  }>;

export type ChurchGivingReportFundSummary = ChurchGivingReportCurrencySummary &
  Readonly<{
    fundId: string;
    fundName: string;
  }>;

export type ChurchGivingReportGiftTypeSummary =
  ChurchGivingReportCurrencySummary &
    Readonly<{
      giftType: ChurchGivingReportGiftType;
    }>;

export type ChurchGivingReport = Readonly<{
  churchId: string;
  churchTimezone: string;
  period: ChurchGivingReportPeriod;
  asOfDate: string;
  periodStartDate: string | null;
  periodEndDate: string;
  currencySummaries: readonly ChurchGivingReportCurrencySummary[];
  trendPoints: readonly ChurchGivingReportTrendPoint[];
  fundSummaries: readonly ChurchGivingReportFundSummary[];
  giftTypeSummaries: readonly ChurchGivingReportGiftTypeSummary[];
}>;

export const CHURCH_GIVING_REPORT_PERIOD_OPTIONS = [
  {
    value: "last_7_days",
    label: "Last 7 days",
    description: "The selected local date and the six preceding days.",
  },
  {
    value: "month",
    label: "Monthly",
    description: "The current local calendar month through the selected date.",
  },
  {
    value: "year",
    label: "Yearly",
    description: "The current local calendar year through the selected date.",
  },
  {
    value: "all",
    label: "Full history",
    description: "All captured giving through the selected date.",
  },
] as const satisfies readonly Readonly<{
  value: ChurchGivingReportPeriod;
  label: string;
  description: string;
}>[];

const PERIOD_OPTION_BY_VALUE = new Map(
  CHURCH_GIVING_REPORT_PERIOD_OPTIONS.map((option) => [option.value, option]),
);
const ZERO = BigInt(0);
const TEN_THOUSAND = BigInt(10_000);

export function parseChurchGivingReportSearchParams(
  params: URLSearchParams,
): ChurchGivingReportSearchParseResult {
  return parseChurchReportExportSearchParams(params);
}

export function getChurchGivingReportPeriodLabel(
  period: ChurchGivingReportPeriod,
) {
  return PERIOD_OPTION_BY_VALUE.get(period)?.label ?? "Reporting period";
}

export function getChurchGivingReportPeriodDescription(
  period: ChurchGivingReportPeriod,
) {
  return PERIOD_OPTION_BY_VALUE.get(period)?.description ?? "";
}

export function formatChurchGivingReportMinorUnits(value: bigint) {
  return formatChurchReportMinorUnits(value);
}

export function formatChurchGivingReportAmount(
  value: bigint,
  currency: ChurchGivingReportCurrency,
) {
  return `${currency} ${formatChurchGivingReportMinorUnits(value)}`;
}

export function getChurchGivingReportPercentageBasisPoints(
  part: bigint,
  total: bigint,
) {
  if (part <= ZERO || total <= ZERO) return 0;
  if (part >= total) return 10_000;

  const rounded = (part * TEN_THOUSAND + total / BigInt(2)) / total;
  return Number(rounded);
}

export function formatChurchGivingReportPercentage(basisPoints: number) {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    return "0.00%";
  }
  return `${Math.floor(basisPoints / 100)}.${String(basisPoints % 100).padStart(2, "0")}%`;
}

export function isChurchGivingReportGiftType(
  value: unknown,
): value is ChurchGivingReportGiftType {
  return (
    typeof value === "string" &&
    (CHURCH_GIVING_REPORT_GIFT_TYPES as readonly string[]).includes(value)
  );
}

export function isChurchGivingReportCurrency(
  value: unknown,
): value is ChurchGivingReportCurrency {
  return (
    typeof value === "string" &&
    (CHURCH_GIVING_REPORT_CURRENCIES as readonly string[]).includes(value)
  );
}

export function isChurchGivingReportPeriod(
  value: unknown,
): value is ChurchGivingReportPeriod {
  return (
    typeof value === "string" &&
    (CHURCH_REPORT_PERIODS as readonly string[]).includes(value)
  );
}
