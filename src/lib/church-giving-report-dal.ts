import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  expectedChurchReportStartDate,
  isCanonicalReportId,
  isChurchReportSafeText,
  isChurchReportTimezone,
} from "./church-report-export";
import {
  isChurchGivingReportCurrency,
  isChurchGivingReportGiftType,
  isChurchGivingReportPeriod,
  type ChurchGivingReport,
  type ChurchGivingReportAmounts,
  type ChurchGivingReportCurrency,
  type ChurchGivingReportCurrencySummary,
  type ChurchGivingReportFundSummary,
  type ChurchGivingReportGiftTypeSummary,
  type ChurchGivingReportSelection,
  type ChurchGivingReportTrendPoint,
} from "./church-giving-report";
import { isChurchTransactionDate } from "./church-transactions";

export type ChurchGivingReportFailureReason =
  | "forbidden"
  | "invalid_request"
  | "unavailable";

export type ChurchGivingReportResult =
  | Readonly<{ ok: true; report: ChurchGivingReport }>
  | Readonly<{ ok: false; reason: ChurchGivingReportFailureReason }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
type RpcError = Readonly<{ message?: unknown }>;
type ChurchGivingReportRpcArgs =
  Database["public"]["Functions"]["get_church_giving_report"]["Args"];

const ZERO = BigInt(0);
const MAXIMUM_INTEGER_TEXT_LENGTH = 128;

function parseCanonicalBigint(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > MAXIMUM_INTEGER_TEXT_LENGTH ||
    !/^-?(?:0|[1-9]\d*)$/.test(value)
  ) {
    return null;
  }
  try {
    const parsed = BigInt(value);
    return String(parsed) === value ? parsed : null;
  } catch {
    return null;
  }
}

function parseAmounts(value: Record<string, unknown>) {
  const grossAmountMinor = parseCanonicalBigint(value.gross_amount_minor);
  const processingFeeMinor = parseCanonicalBigint(
    value.processing_fee_minor,
  );
  const refundedAmountMinor = parseCanonicalBigint(value.refunded_amount_minor);
  const recordedNetAmountMinor = parseCanonicalBigint(
    value.recorded_net_amount_minor,
  );
  const giftCount = parseCanonicalBigint(value.gift_count);

  if (
    grossAmountMinor === null ||
    grossAmountMinor <= ZERO ||
    processingFeeMinor === null ||
    processingFeeMinor < ZERO ||
    refundedAmountMinor === null ||
    refundedAmountMinor < ZERO ||
    refundedAmountMinor > grossAmountMinor ||
    recordedNetAmountMinor === null ||
    recordedNetAmountMinor !==
      grossAmountMinor - processingFeeMinor - refundedAmountMinor ||
    giftCount === null ||
    giftCount <= ZERO
  ) {
    return null;
  }

  return {
    grossAmountMinor,
    processingFeeMinor,
    refundedAmountMinor,
    recordedNetAmountMinor,
    giftCount,
  } satisfies ChurchGivingReportAmounts;
}

function parseCurrencySummary(
  value: unknown,
): ChurchGivingReportCurrencySummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const amounts = parseAmounts(row);
  if (!amounts || !isChurchGivingReportCurrency(row.currency)) return null;

  return { currency: row.currency, ...amounts };
}

function parseTrendPoint(value: unknown): ChurchGivingReportTrendPoint | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const summary = parseCurrencySummary(row);
  if (!summary || !isChurchTransactionDate(row.bucket_start)) return null;

  return { bucketStart: row.bucket_start, ...summary };
}

function parseFundSummary(value: unknown): ChurchGivingReportFundSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const summary = parseCurrencySummary(row);
  if (
    !summary ||
    !isCanonicalReportId(row.fund_id) ||
    !isChurchReportSafeText(row.fund_name, 120)
  ) {
    return null;
  }

  return { fundId: row.fund_id, fundName: row.fund_name, ...summary };
}

function parseGiftTypeSummary(
  value: unknown,
): ChurchGivingReportGiftTypeSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const summary = parseCurrencySummary(row);
  if (!summary || !isChurchGivingReportGiftType(row.gift_type)) return null;

  return { giftType: row.gift_type, ...summary };
}

function compareStrings(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isStrictlyOrdered<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
) {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1], values[index]) >= 0) return false;
  }
  return true;
}

function compareTrendPoints(
  left: ChurchGivingReportTrendPoint,
  right: ChurchGivingReportTrendPoint,
) {
  return (
    compareStrings(left.bucketStart, right.bucketStart) ||
    compareStrings(left.currency, right.currency)
  );
}

function compareFundSummaries(
  left: ChurchGivingReportFundSummary,
  right: ChurchGivingReportFundSummary,
) {
  const currency = compareStrings(left.currency, right.currency);
  if (currency !== 0) return currency;
  if (left.grossAmountMinor !== right.grossAmountMinor) {
    return left.grossAmountMinor > right.grossAmountMinor ? -1 : 1;
  }
  return compareStrings(left.fundId, right.fundId);
}

const GIFT_TYPE_ORDER = new Map([
  ["one_time", 0],
  ["recurring", 1],
] as const);

function compareGiftTypeSummaries(
  left: ChurchGivingReportGiftTypeSummary,
  right: ChurchGivingReportGiftTypeSummary,
) {
  return (
    compareStrings(left.currency, right.currency) ||
    (GIFT_TYPE_ORDER.get(left.giftType) ?? -1) -
      (GIFT_TYPE_ORDER.get(right.giftType) ?? -1)
  );
}

function emptyAmounts(): ChurchGivingReportAmounts {
  return {
    grossAmountMinor: ZERO,
    processingFeeMinor: ZERO,
    refundedAmountMinor: ZERO,
    recordedNetAmountMinor: ZERO,
    giftCount: ZERO,
  };
}

function addAmounts(
  total: ChurchGivingReportAmounts,
  value: ChurchGivingReportAmounts,
): ChurchGivingReportAmounts {
  return {
    grossAmountMinor: total.grossAmountMinor + value.grossAmountMinor,
    processingFeeMinor:
      total.processingFeeMinor + value.processingFeeMinor,
    refundedAmountMinor: total.refundedAmountMinor + value.refundedAmountMinor,
    recordedNetAmountMinor:
      total.recordedNetAmountMinor + value.recordedNetAmountMinor,
    giftCount: total.giftCount + value.giftCount,
  };
}

function amountsEqual(
  left: ChurchGivingReportAmounts,
  right: ChurchGivingReportAmounts,
) {
  return (
    left.grossAmountMinor === right.grossAmountMinor &&
    left.processingFeeMinor === right.processingFeeMinor &&
    left.refundedAmountMinor === right.refundedAmountMinor &&
    left.recordedNetAmountMinor === right.recordedNetAmountMinor &&
    left.giftCount === right.giftCount
  );
}

function dimensionMatchesCurrencySummaries(
  values: readonly ChurchGivingReportCurrencySummary[],
  summaries: readonly ChurchGivingReportCurrencySummary[],
) {
  const totals = new Map<ChurchGivingReportCurrency, ChurchGivingReportAmounts>();
  for (const value of values) {
    totals.set(
      value.currency,
      addAmounts(totals.get(value.currency) ?? emptyAmounts(), value),
    );
  }
  if (totals.size !== summaries.length) return false;
  return summaries.every((summary) => {
    const total = totals.get(summary.currency);
    return total !== undefined && amountsEqual(total, summary);
  });
}

function parseArray<T>(
  value: unknown,
  parse: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parse);
  return parsed.some((item) => item === null) ? null : (parsed as T[]);
}

function parseReport(
  value: unknown,
  churchId: string,
  selection: ChurchGivingReportSelection,
): ChurchGivingReport | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isChurchReportTimezone(row.church_timezone) ||
    !isChurchGivingReportPeriod(row.report_period) ||
    row.report_period !== selection.period ||
    !isChurchTransactionDate(row.report_as_of_date) ||
    !isChurchTransactionDate(row.period_end_date) ||
    row.period_end_date !== row.report_as_of_date ||
    (selection.asOfDate !== null &&
      row.report_as_of_date !== selection.asOfDate)
  ) {
    return null;
  }

  const periodStartDate = expectedChurchReportStartDate(
    row.report_period,
    row.report_as_of_date,
  );
  if (row.period_start_date !== periodStartDate) return null;

  const currencySummaries = parseArray(
    row.currency_summaries,
    parseCurrencySummary,
  );
  const trendPoints = parseArray(row.trend_points, parseTrendPoint);
  const fundSummaries = parseArray(row.fund_summaries, parseFundSummary);
  const giftTypeSummaries = parseArray(
    row.gift_type_summaries,
    parseGiftTypeSummary,
  );
  if (
    !currencySummaries ||
    !trendPoints ||
    !fundSummaries ||
    !giftTypeSummaries ||
    !isStrictlyOrdered(currencySummaries, (left, right) =>
      compareStrings(left.currency, right.currency),
    ) ||
    !isStrictlyOrdered(trendPoints, compareTrendPoints) ||
    !isStrictlyOrdered(fundSummaries, compareFundSummaries) ||
    !isStrictlyOrdered(giftTypeSummaries, compareGiftTypeSummaries)
  ) {
    return null;
  }

  for (const point of trendPoints) {
    if (
      point.bucketStart > row.period_end_date ||
      (periodStartDate !== null && point.bucketStart < periodStartDate)
    ) {
      return null;
    }
  }

  const fundNames = new Map<string, string>();
  for (const fund of fundSummaries) {
    const existingName = fundNames.get(fund.fundId);
    if (existingName !== undefined && existingName !== fund.fundName) {
      return null;
    }
    fundNames.set(fund.fundId, fund.fundName);
  }

  if (
    !dimensionMatchesCurrencySummaries(trendPoints, currencySummaries) ||
    !dimensionMatchesCurrencySummaries(fundSummaries, currencySummaries) ||
    !dimensionMatchesCurrencySummaries(
      giftTypeSummaries,
      currencySummaries,
    )
  ) {
    return null;
  }

  return {
    churchId,
    churchTimezone: row.church_timezone,
    period: row.report_period,
    asOfDate: row.report_as_of_date,
    periodStartDate,
    periodEndDate: row.period_end_date,
    currencySummaries,
    trendPoints,
    fundSummaries,
    giftTypeSummaries,
  };
}

function getSingleRow(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.length === 1 ? value[0] : null;
}

function getErrorIdentifier(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const message = (error as RpcError).message;
  return typeof message === "string" ? message : null;
}

export async function getChurchGivingReport(
  client: SupabaseClient<Database>,
  churchId: string,
  selection: ChurchGivingReportSelection,
): Promise<ChurchGivingReportResult> {
  const normalizedChurchId = churchId.toLowerCase();
  if (
    !isCanonicalReportId(normalizedChurchId) ||
    !isChurchGivingReportPeriod(selection.period) ||
    (selection.asOfDate !== null &&
      !isChurchTransactionDate(selection.asOfDate))
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const args: ChurchGivingReportRpcArgs = {
    target_church_id: normalizedChurchId,
    selected_period: selection.period,
    ...(selection.asOfDate
      ? { selected_as_of_date: selection.asOfDate }
      : {}),
  };

  let response: RpcResponse;
  try {
    response = await client.rpc("get_church_giving_report", args);
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const identifier = getErrorIdentifier(response.error);
    if (identifier === "CHURCH_GIVING_REPORT_FORBIDDEN") {
      return { ok: false, reason: "forbidden" };
    }
    if (identifier?.startsWith("CHURCH_GIVING_REPORT_INVALID_")) {
      return { ok: false, reason: "invalid_request" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const report = parseReport(
    getSingleRow(response.data),
    normalizedChurchId,
    selection,
  );
  return report
    ? { ok: true, report }
    : { ok: false, reason: "unavailable" };
}
