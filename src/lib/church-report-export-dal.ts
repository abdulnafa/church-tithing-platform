import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  CHURCH_REPORT_EXPORT_MAX_ROWS,
  compareChurchReportRows,
  expectedChurchReportStartDate,
  isCanonicalReportId,
  isChurchReportCurrency,
  isChurchReportExportFrequency,
  isChurchReportExportPaymentStatus,
  isChurchReportExportRecurringStatus,
  isChurchReportExportSource,
  isChurchReportPeriod,
  isChurchReportSafeText,
  isChurchReportSlug,
  isChurchReportTimezone,
  parseChurchReportMinorUnits,
  type ChurchReportExport,
  type ChurchReportExportFrequency,
  type ChurchReportExportPaymentStatus,
  type ChurchReportExportRecurringStatus,
  type ChurchReportExportRow,
  type ChurchReportExportSelection,
  type ChurchReportExportSource,
} from "./church-report-export";
import {
  getChurchTransactionTimestampMicroseconds,
  isChurchTransactionDate,
} from "./church-transactions";

export type ChurchReportExportFailureReason =
  | "forbidden"
  | "invalid_request"
  | "too_large"
  | "unavailable";

export type ChurchReportExportResult =
  | Readonly<{ ok: true; report: ChurchReportExport }>
  | Readonly<{ ok: false; reason: ChurchReportExportFailureReason }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
type RpcError = Readonly<{ message?: unknown }>;

const LAST4_PATTERN = /^\d{4}$/;
const ZERO_MINOR_UNITS = BigInt(0);

function parseNullableSafeText(value: unknown, maximumCodePoints: number) {
  return value === null || isChurchReportSafeText(value, maximumCodePoints)
    ? (value as string | null)
    : undefined;
}

function parseExportRow(value: unknown): ChurchReportExportRow | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const campaignName = parseNullableSafeText(row.campaign_name, 120);
  const paymentMethodBrand = parseNullableSafeText(
    row.payment_method_brand,
    40,
  );
  const gross = parseChurchReportMinorUnits(row.gross_amount_minor);
  const fee = parseChurchReportMinorUnits(row.processing_fee_minor);
  const refunded = parseChurchReportMinorUnits(row.refunded_amount_minor);
  const net = parseChurchReportMinorUnits(row.recorded_net_amount_minor);
  const frequency = row.frequency;
  const recurringStatus = row.recurring_status;

  if (
    !isCanonicalReportId(row.transaction_id) ||
    row.transaction_id !== row.transaction_id.toLowerCase() ||
    typeof row.donated_at !== "string" ||
    getChurchTransactionTimestampMicroseconds(row.donated_at) === null ||
    !isChurchReportSafeText(row.donor_name, 120) ||
    !isChurchReportSafeText(row.fund_name, 120) ||
    campaignName === undefined ||
    !isChurchReportExportSource(row.source) ||
    !(
      (frequency === null && recurringStatus === null) ||
      (isChurchReportExportFrequency(frequency) &&
        isChurchReportExportRecurringStatus(recurringStatus))
    ) ||
    gross === null ||
    gross <= ZERO_MINOR_UNITS ||
    fee === null ||
    fee < ZERO_MINOR_UNITS ||
    refunded === null ||
    refunded < ZERO_MINOR_UNITS ||
    refunded > gross ||
    net === null ||
    net !== gross - fee - refunded ||
    !isChurchReportCurrency(row.currency) ||
    paymentMethodBrand === undefined ||
    !(
      row.payment_method_last4 === null ||
      (typeof row.payment_method_last4 === "string" &&
        LAST4_PATTERN.test(row.payment_method_last4))
    ) ||
    !isChurchReportExportPaymentStatus(row.payment_status) ||
    (row.payment_status === "refunded" && refunded !== gross) ||
    (row.payment_status === "partially_refunded" &&
      (refunded === ZERO_MINOR_UNITS || refunded === gross)) ||
    (refunded > ZERO_MINOR_UNITS &&
      row.payment_status !== "partially_refunded" &&
      row.payment_status !== "refunded" &&
      row.payment_status !== "disputed")
  ) {
    return null;
  }

  return {
    transactionId: row.transaction_id,
    donatedAt: row.donated_at,
    donorName: row.donor_name,
    fundName: row.fund_name,
    campaignName,
    source: row.source as ChurchReportExportSource,
    frequency: frequency as ChurchReportExportFrequency | null,
    recurringStatus:
      recurringStatus as ChurchReportExportRecurringStatus | null,
    grossAmountMinor: gross,
    currency: row.currency,
    processingFeeMinor: fee,
    refundedAmountMinor: refunded,
    recordedNetAmountMinor: net,
    paymentMethodBrand,
    paymentMethodLast4: row.payment_method_last4 as string | null,
    paymentStatus:
      row.payment_status as ChurchReportExportPaymentStatus,
  };
}

function parseExport(
  value: unknown,
  churchId: string,
  selection: ChurchReportExportSelection,
): ChurchReportExport | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isChurchReportSlug(row.church_slug) ||
    !isChurchReportTimezone(row.church_timezone) ||
    !isChurchReportPeriod(row.report_period) ||
    row.report_period !== selection.period ||
    !isChurchTransactionDate(row.report_as_of_date) ||
    !isChurchTransactionDate(row.period_end_date) ||
    row.period_end_date !== row.report_as_of_date ||
    (selection.asOfDate !== null &&
      row.report_as_of_date !== selection.asOfDate) ||
    !Array.isArray(row.transactions) ||
    row.transactions.length > CHURCH_REPORT_EXPORT_MAX_ROWS
  ) {
    return null;
  }

  const expectedStart = expectedChurchReportStartDate(
    row.report_period,
    row.report_as_of_date,
  );
  if (row.period_start_date !== expectedStart) return null;

  const transactions = row.transactions.map(parseExportRow);
  if (transactions.some((transaction) => transaction === null)) return null;
  const parsedTransactions = transactions as ChurchReportExportRow[];
  if (
    new Set(parsedTransactions.map((transaction) => transaction.transactionId))
      .size !== parsedTransactions.length
  ) {
    return null;
  }

  for (let index = 1; index < parsedTransactions.length; index += 1) {
    if (
      compareChurchReportRows(
        parsedTransactions[index - 1],
        parsedTransactions[index],
      ) !== 1
    ) {
      return null;
    }
  }

  return {
    churchId,
    churchSlug: row.church_slug,
    churchTimezone: row.church_timezone,
    period: row.report_period,
    asOfDate: row.report_as_of_date,
    periodStartDate: row.period_start_date as string | null,
    periodEndDate: row.period_end_date,
    transactions: parsedTransactions,
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

export async function exportChurchGivingReport(
  client: SupabaseClient<Database>,
  churchId: string,
  requestId: string,
  selection: ChurchReportExportSelection,
): Promise<ChurchReportExportResult> {
  const normalizedChurchId = churchId.toLowerCase();
  const normalizedRequestId = requestId.toLowerCase();
  if (
    !isCanonicalReportId(normalizedChurchId) ||
    !isCanonicalReportId(normalizedRequestId) ||
    !isChurchReportPeriod(selection.period) ||
    (selection.asOfDate !== null &&
      !isChurchTransactionDate(selection.asOfDate))
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  let response: RpcResponse;
  try {
    response = await client.rpc("export_church_giving_report", {
      target_church_id: normalizedChurchId,
      report_request_id: normalizedRequestId,
      selected_period: selection.period,
      ...(selection.asOfDate
        ? { selected_as_of_date: selection.asOfDate }
        : {}),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const identifier = getErrorIdentifier(response.error);
    if (identifier === "CHURCH_REPORT_EXPORT_FORBIDDEN") {
      return { ok: false, reason: "forbidden" };
    }
    if (identifier === "CHURCH_REPORT_EXPORT_TOO_LARGE") {
      return { ok: false, reason: "too_large" };
    }
    if (identifier?.startsWith("CHURCH_REPORT_EXPORT_INVALID_")) {
      return { ok: false, reason: "invalid_request" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const report = parseExport(
    getSingleRow(response.data),
    normalizedChurchId,
    selection,
  );
  return report
    ? { ok: true, report }
    : { ok: false, reason: "unavailable" };
}
