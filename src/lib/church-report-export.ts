import {
  getChurchTransactionTimestampMicroseconds,
  isChurchTransactionDate,
  isChurchTransactionId,
} from "./church-transactions";

export const CHURCH_REPORT_PERIODS = [
  "last_7_days",
  "month",
  "year",
  "all",
] as const;

export const CHURCH_REPORT_EXPORT_MAX_ROWS = 10_000;

export const CHURCH_REPORT_EXPORT_PAYMENT_STATUSES = [
  "succeeded",
  "partially_refunded",
  "refunded",
  "disputed",
] as const;

export const CHURCH_REPORT_EXPORT_SOURCES = [
  "online",
  "cash",
  "cheque",
  "other",
] as const;

export const CHURCH_REPORT_EXPORT_FREQUENCIES = [
  "weekly",
  "monthly",
] as const;

export const CHURCH_REPORT_EXPORT_RECURRING_STATUSES = [
  "incomplete",
  "active",
  "paused",
  "past_due",
  "canceled",
] as const;

export type ChurchReportPeriod = (typeof CHURCH_REPORT_PERIODS)[number];
export type ChurchReportExportPaymentStatus =
  (typeof CHURCH_REPORT_EXPORT_PAYMENT_STATUSES)[number];
export type ChurchReportExportSource =
  (typeof CHURCH_REPORT_EXPORT_SOURCES)[number];
export type ChurchReportExportFrequency =
  (typeof CHURCH_REPORT_EXPORT_FREQUENCIES)[number];
export type ChurchReportExportRecurringStatus =
  (typeof CHURCH_REPORT_EXPORT_RECURRING_STATUSES)[number];

export type ChurchReportExportRow = Readonly<{
  transactionId: string;
  donatedAt: string;
  donorName: string;
  fundName: string;
  campaignName: string | null;
  source: ChurchReportExportSource;
  frequency: ChurchReportExportFrequency | null;
  recurringStatus: ChurchReportExportRecurringStatus | null;
  grossAmountMinor: bigint;
  currency: string;
  processingFeeMinor: bigint;
  refundedAmountMinor: bigint;
  recordedNetAmountMinor: bigint;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentStatus: ChurchReportExportPaymentStatus;
}>;

export type ChurchReportExport = Readonly<{
  churchId: string;
  churchSlug: string;
  churchTimezone: string;
  period: ChurchReportPeriod;
  asOfDate: string;
  periodStartDate: string | null;
  periodEndDate: string;
  transactions: readonly ChurchReportExportRow[];
}>;

export type ChurchReportExportSelection = Readonly<{
  period: ChurchReportPeriod;
  asOfDate: string | null;
}>;

export type ChurchReportExportSearchParseResult =
  | Readonly<{ ok: true; selection: ChurchReportExportSelection }>
  | Readonly<{ ok: false; reason: "invalid_request" }>;

const SUPPORTED_CURRENCIES = new Set(["BBD", "CAD", "USD", "XCD"]);
const PERIOD_SET = new Set<string>(CHURCH_REPORT_PERIODS);
const FORMULA_PREFIX_PATTERN = /^[\t\r ]*[=+\-@]/;
const CSV_QUOTE_PATTERN = /[",\r\n]/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHURCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ZERO_MINOR_UNITS = BigInt(0);
const ONE_HUNDRED_MINOR_UNITS = BigInt(100);
const POSTGRES_BIGINT_MINIMUM = BigInt("-9223372036854775808");
const POSTGRES_BIGINT_MAXIMUM = BigInt("9223372036854775807");

function includes<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function getSingleParam(params: URLSearchParams, name: string) {
  const values = params.getAll(name);
  return values.length <= 1 ? values[0] ?? null : undefined;
}

export function parseChurchReportExportSearchParams(
  params: URLSearchParams,
): ChurchReportExportSearchParseResult {
  const allowed = new Set(["period", "asOf"]);
  if (Array.from(params.keys()).some((name) => !allowed.has(name))) {
    return { ok: false, reason: "invalid_request" };
  }

  const periodValue = getSingleParam(params, "period");
  const asOfValue = getSingleParam(params, "asOf");
  if (
    periodValue === undefined ||
    asOfValue === undefined ||
    (periodValue !== null && !PERIOD_SET.has(periodValue)) ||
    (asOfValue !== null && !isChurchTransactionDate(asOfValue))
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  return {
    ok: true,
    selection: {
      period: (periodValue ?? "all") as ChurchReportPeriod,
      asOfDate: asOfValue,
    },
  };
}

export function isChurchReportPeriod(value: unknown): value is ChurchReportPeriod {
  return typeof value === "string" && PERIOD_SET.has(value);
}

export function isChurchReportSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 63 &&
    CHURCH_SLUG_PATTERN.test(value)
  );
}

export function isChurchReportCurrency(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED_CURRENCIES.has(value);
}

export function isChurchReportSafeText(
  value: unknown,
  maximumCodePoints: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().replace(/\s+/g, " ") &&
    Array.from(value).length >= 1 &&
    Array.from(value).length <= maximumCodePoints &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function parseChurchReportMinorUnits(value: unknown) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)$/.test(value)) {
    return null;
  }

  try {
    const parsed = BigInt(value);
    return parsed >= POSTGRES_BIGINT_MINIMUM &&
      parsed <= POSTGRES_BIGINT_MAXIMUM
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function formatChurchReportMinorUnits(value: bigint) {
  const negative = value < ZERO_MINOR_UNITS;
  const absolute = negative ? -value : value;
  const whole = absolute / ONE_HUNDRED_MINOR_UNITS;
  const fraction = String(absolute % ONE_HUNDRED_MINOR_UNITS).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function escapeCsvValue(value: string, neutralizeFormula = false) {
  const safeValue =
    neutralizeFormula && FORMULA_PREFIX_PATTERN.test(value)
      ? `'${value}`
      : value;
  return CSV_QUOTE_PATTERN.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue;
}

function formatGiftType(row: ChurchReportExportRow) {
  return row.frequency === null ? "One-time" : row.frequency;
}

function formatPaymentMethod(row: ChurchReportExportRow) {
  if (!row.paymentMethodBrand && !row.paymentMethodLast4) return "";
  if (!row.paymentMethodBrand) return `Ending ${row.paymentMethodLast4}`;
  if (!row.paymentMethodLast4) return row.paymentMethodBrand;
  return `${row.paymentMethodBrand} ending ${row.paymentMethodLast4}`;
}

export function createChurchReportCsv(report: ChurchReportExport) {
  const header = [
    "Transaction ID",
    "Donated at (UTC)",
    "Donor",
    "Fund",
    "Campaign",
    "Source",
    "Gift type",
    "Current recurring status",
    "Gross amount",
    "Currency",
    "Processing fee",
    "Refunded amount",
    "Recorded net amount",
    "Payment method",
    "Payment status",
  ];

  const rows = report.transactions.map((row) => [
    escapeCsvValue(row.transactionId),
    escapeCsvValue(row.donatedAt),
    escapeCsvValue(row.donorName, true),
    escapeCsvValue(row.fundName, true),
    escapeCsvValue(row.campaignName ?? "", true),
    escapeCsvValue(row.source),
    escapeCsvValue(formatGiftType(row)),
    escapeCsvValue(row.recurringStatus ?? ""),
    escapeCsvValue(formatChurchReportMinorUnits(row.grossAmountMinor)),
    escapeCsvValue(row.currency),
    escapeCsvValue(formatChurchReportMinorUnits(row.processingFeeMinor)),
    escapeCsvValue(formatChurchReportMinorUnits(row.refundedAmountMinor)),
    escapeCsvValue(formatChurchReportMinorUnits(row.recordedNetAmountMinor)),
    escapeCsvValue(formatPaymentMethod(row), true),
    escapeCsvValue(row.paymentStatus),
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.join(","))
    .join("\r\n")}\r\n`;
}

const PERIOD_FILENAME_LABELS: Readonly<Record<ChurchReportPeriod, string>> = {
  last_7_days: "last-7-days",
  month: "monthly",
  year: "yearly",
  all: "all-history",
};

export function createChurchReportFilename(report: ChurchReportExport) {
  return `${report.churchSlug}-giving-${PERIOD_FILENAME_LABELS[report.period]}-${report.asOfDate}.csv`;
}

export function compareChurchReportRows(
  left: Pick<ChurchReportExportRow, "donatedAt" | "transactionId">,
  right: Pick<ChurchReportExportRow, "donatedAt" | "transactionId">,
) {
  if (!isChurchTransactionId(left.transactionId) || !isChurchTransactionId(right.transactionId)) {
    return null;
  }
  const leftTime = getChurchTransactionTimestampMicroseconds(left.donatedAt);
  const rightTime = getChurchTransactionTimestampMicroseconds(right.donatedAt);
  if (leftTime === null || rightTime === null) return null;
  if (leftTime !== rightTime) return leftTime > rightTime ? 1 : -1;
  return left.transactionId === right.transactionId
    ? 0
    : left.transactionId > right.transactionId
      ? 1
      : -1;
}

export function expectedChurchReportStartDate(
  period: ChurchReportPeriod,
  asOfDate: string,
) {
  if (!isChurchTransactionDate(asOfDate)) return null;
  if (period === "all") return null;
  if (period === "month") return `${asOfDate.slice(0, 7)}-01`;
  if (period === "year") return `${asOfDate.slice(0, 4)}-01-01`;

  const [year, month, day] = asOfDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().slice(0, 10);
}

export function isCanonicalReportId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isChurchReportTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isChurchReportExportSource(
  value: unknown,
): value is ChurchReportExportSource {
  return includes(CHURCH_REPORT_EXPORT_SOURCES, value);
}

export function isChurchReportExportFrequency(
  value: unknown,
): value is ChurchReportExportFrequency {
  return includes(CHURCH_REPORT_EXPORT_FREQUENCIES, value);
}

export function isChurchReportExportRecurringStatus(
  value: unknown,
): value is ChurchReportExportRecurringStatus {
  return includes(CHURCH_REPORT_EXPORT_RECURRING_STATUSES, value);
}

export function isChurchReportExportPaymentStatus(
  value: unknown,
): value is ChurchReportExportPaymentStatus {
  return includes(CHURCH_REPORT_EXPORT_PAYMENT_STATUSES, value);
}
