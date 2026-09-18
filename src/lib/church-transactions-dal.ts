import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  CHURCH_TRANSACTION_CANCELLATION_STATES,
  CHURCH_TRANSACTION_FREQUENCIES,
  CHURCH_TRANSACTION_FUND_STATUSES,
  CHURCH_TRANSACTION_MAX_PAGE_SIZE,
  CHURCH_TRANSACTION_PAGE_SIZE,
  CHURCH_TRANSACTION_PAYMENT_STATUSES,
  CHURCH_TRANSACTION_RECURRING_STATUSES,
  EMPTY_CHURCH_TRANSACTION_FILTERS,
  compareChurchTransactionPositions,
  isChurchTransactionCursor,
  isChurchTransactionFilters,
  isChurchTransactionId,
  type ChurchTransactionCancellationState,
  type ChurchTransactionCursor,
  type ChurchTransactionFilters,
  type ChurchTransactionFrequency,
  type ChurchTransactionFundOption,
  type ChurchTransactionFundStatus,
  type ChurchTransactionPage,
  type ChurchTransactionPaymentStatus,
  type ChurchTransactionRecurringStatus,
  type ChurchTransactionRow,
} from "./church-transactions";

export type ChurchTransactionPageFailureReason =
  | "forbidden"
  | "invalid_request"
  | "unavailable";

export type ChurchTransactionPageResult =
  | Readonly<{ ok: true; page: ChurchTransactionPage }>
  | Readonly<{ ok: false; reason: ChurchTransactionPageFailureReason }>;

export type ChurchTransactionPageOptions = Readonly<{
  pageSize?: number;
  filters?: ChurchTransactionFilters;
  cursor?: ChurchTransactionCursor | null;
}>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
type RpcError = Readonly<{ message?: unknown }>;
type TransactionRpcArgs = Readonly<{
  target_church_id: string;
  transaction_page_size: number;
  transaction_cursor_created_at?: string;
  transaction_cursor_id?: string;
  transaction_date_from?: string;
  transaction_date_to?: string;
  transaction_donor_query?: string;
  transaction_min_amount_minor?: number;
  transaction_max_amount_minor?: number;
  transaction_fund_id?: string;
  transaction_recurring_state?: string;
  transaction_last4?: string;
  transaction_payment_status?: ChurchTransactionPaymentStatus;
  transaction_cancellation_state?: string;
}>;
const CURRENCIES = new Set(["BBD", "CAD", "USD", "XCD"]);
const LAST4_PATTERN = /^\d{4}$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function isSafeText(value: unknown, maximumCodePoints: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().replace(/\s+/g, " ") &&
    Array.from(value).length >= 1 &&
    Array.from(value).length <= maximumCodePoints &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function isTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    value === value.trim() &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isNullableSafeText(
  value: unknown,
  maximumCodePoints: number,
): value is string | null {
  return value === null || isSafeText(value, maximumCodePoints);
}

function expectedCancellationState(
  paymentStatus: ChurchTransactionPaymentStatus,
  recurringStatus: ChurchTransactionRecurringStatus | null,
): ChurchTransactionCancellationState {
  const paymentCanceled = paymentStatus === "canceled";
  const recurringCanceled = recurringStatus === "canceled";
  if (paymentCanceled && recurringCanceled) {
    return "payment_and_recurring_canceled";
  }
  if (paymentCanceled) return "payment_canceled";
  if (recurringCanceled) return "recurring_canceled";
  return "not_canceled";
}

function parseTransactionRow(
  value: unknown,
  churchId: string,
): ChurchTransactionRow | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isChurchTransactionId(row.transaction_id) ||
    !isSafeText(row.donor_name, 120) ||
    !isChurchTransactionId(row.fund_id) ||
    !isSafeText(row.fund_name, 120) ||
    !(
      (row.campaign_id === null && row.campaign_name === null) ||
      (isChurchTransactionId(row.campaign_id) &&
        isSafeText(row.campaign_name, 120))
    ) ||
    typeof row.recorded_at !== "string" ||
    !isChurchTransactionCursor({
      createdAt: row.recorded_at,
      transactionId: row.transaction_id,
    }) ||
    !(
      (row.frequency === null && row.recurring_status === null) ||
      (includes(CHURCH_TRANSACTION_FREQUENCIES, row.frequency) &&
        includes(CHURCH_TRANSACTION_RECURRING_STATUSES, row.recurring_status))
    ) ||
    !isNonnegativeSafeInteger(row.amount_minor) ||
    row.amount_minor === 0 ||
    typeof row.currency !== "string" ||
    !CURRENCIES.has(row.currency) ||
    !isNonnegativeSafeInteger(row.processing_fee_minor) ||
    !isNonnegativeSafeInteger(row.refunded_amount_minor) ||
    row.refunded_amount_minor > row.amount_minor ||
    !isSafeInteger(row.net_amount_minor) ||
    row.net_amount_minor !==
      row.amount_minor - row.processing_fee_minor - row.refunded_amount_minor ||
    !isNullableSafeText(row.payment_method_brand, 40) ||
    !(
      row.payment_method_last4 === null ||
      (typeof row.payment_method_last4 === "string" &&
        LAST4_PATTERN.test(row.payment_method_last4))
    ) ||
    !includes(CHURCH_TRANSACTION_PAYMENT_STATUSES, row.payment_status) ||
    !includes(CHURCH_TRANSACTION_CANCELLATION_STATES, row.cancellation_state)
  ) {
    return null;
  }

  const frequency = row.frequency as ChurchTransactionFrequency | null;
  const recurringStatus = row.recurring_status as ChurchTransactionRecurringStatus | null;
  const paymentStatus = row.payment_status as ChurchTransactionPaymentStatus;
  const cancellationState = row.cancellation_state as ChurchTransactionCancellationState;
  if (
    cancellationState !==
      expectedCancellationState(paymentStatus, recurringStatus) ||
    (paymentStatus === "refunded" &&
      row.refunded_amount_minor !== row.amount_minor) ||
    (paymentStatus === "partially_refunded" &&
      (row.refunded_amount_minor === 0 ||
        row.refunded_amount_minor === row.amount_minor)) ||
    (row.refunded_amount_minor > 0 &&
      paymentStatus !== "partially_refunded" &&
      paymentStatus !== "refunded" &&
      paymentStatus !== "disputed")
  ) {
    return null;
  }

  return {
    id: (row.transaction_id as string).toLowerCase(),
    donorName: row.donor_name as string,
    fundId: (row.fund_id as string).toLowerCase(),
    fundName: row.fund_name as string,
    campaignId:
      row.campaign_id === null
        ? null
        : (row.campaign_id as string).toLowerCase(),
    campaignName: row.campaign_name as string | null,
    recordedAt: row.recorded_at,
    frequency,
    recurringStatus,
    amountMinor: row.amount_minor,
    currency: row.currency,
    processingFeeMinor: row.processing_fee_minor,
    refundedAmountMinor: row.refunded_amount_minor,
    netAmountMinor: row.net_amount_minor,
    paymentMethodBrand: row.payment_method_brand as string | null,
    paymentMethodLast4: row.payment_method_last4 as string | null,
    paymentStatus,
    cancellationState,
  };
}

function parseFundOption(value: unknown): ChurchTransactionFundOption | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    !isChurchTransactionId(row.fund_id) ||
    !isSafeText(row.fund_name, 120) ||
    !includes(CHURCH_TRANSACTION_FUND_STATUSES, row.fund_status)
  ) {
    return null;
  }
  return {
    id: row.fund_id.toLowerCase(),
    name: row.fund_name,
    status: row.fund_status as ChurchTransactionFundStatus,
  };
}

function parseTransactionPage(
  value: unknown,
  churchId: string,
  pageSize: number,
  cursor: ChurchTransactionCursor | null,
): ChurchTransactionPage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isTimezone(row.church_timezone) ||
    !Array.isArray(row.transactions) ||
    row.transactions.length > pageSize ||
    !Array.isArray(row.fund_options) ||
    typeof row.has_more !== "boolean"
  ) {
    return null;
  }

  const fundOptions = row.fund_options.map(parseFundOption);
  if (fundOptions.some((fund) => fund === null)) return null;
  const parsedFundOptions = fundOptions as ChurchTransactionFundOption[];
  const fundIds = new Set(parsedFundOptions.map((fund) => fund.id));
  const fundNames = new Set(
    parsedFundOptions.map((fund) => fund.name.toLocaleLowerCase("en-US")),
  );
  if (
    fundIds.size !== parsedFundOptions.length ||
    fundNames.size !== parsedFundOptions.length
  ) {
    return null;
  }

  const transactions = row.transactions.map((transaction) =>
    parseTransactionRow(transaction, churchId),
  );
  if (transactions.some((transaction) => transaction === null)) return null;
  const parsedTransactions = transactions as ChurchTransactionRow[];
  if (
    new Set(parsedTransactions.map((transaction) => transaction.id)).size !==
    parsedTransactions.length
  ) {
    return null;
  }

  const fundById = new Map(parsedFundOptions.map((fund) => [fund.id, fund]));
  for (const transaction of parsedTransactions) {
    const fund = fundById.get(transaction.fundId);
    if (!fund || fund.name !== transaction.fundName) return null;
  }

  for (let index = 1; index < parsedTransactions.length; index += 1) {
    const previous = parsedTransactions[index - 1];
    const current = parsedTransactions[index];
    if (
      compareChurchTransactionPositions(
        { createdAt: previous.recordedAt, transactionId: previous.id },
        { createdAt: current.recordedAt, transactionId: current.id },
      ) !== 1
    ) {
      return null;
    }
  }

  const first = parsedTransactions[0];
  if (
    cursor &&
    first &&
    compareChurchTransactionPositions(cursor, {
      createdAt: first.recordedAt,
      transactionId: first.id,
    }) !== 1
  ) {
    return null;
  }

  const nextCreatedAt = row.next_cursor_created_at;
  const nextId = row.next_cursor_transaction_id;
  if (
    !(
      (nextCreatedAt === null && nextId === null) ||
      isChurchTransactionCursor({
        createdAt: nextCreatedAt,
        transactionId: nextId,
      })
    ) ||
    row.has_more !== (nextCreatedAt !== null)
  ) {
    return null;
  }

  const last = parsedTransactions.at(-1);
  if (
    row.has_more &&
    (!last || nextCreatedAt !== last.recordedAt || nextId !== last.id)
  ) {
    return null;
  }

  return {
    churchId,
    churchTimezone: row.church_timezone,
    transactions: parsedTransactions,
    fundOptions: parsedFundOptions,
    nextCursor:
      typeof nextCreatedAt === "string" && typeof nextId === "string"
        ? { createdAt: nextCreatedAt, transactionId: nextId.toLowerCase() }
        : null,
    hasMore: row.has_more,
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

function createRpcArgs(
  churchId: string,
  pageSize: number,
  filters: ChurchTransactionFilters,
  cursor: ChurchTransactionCursor | null,
): TransactionRpcArgs {
  return {
    target_church_id: churchId,
    transaction_page_size: pageSize,
    ...(cursor
      ? {
          transaction_cursor_created_at: cursor.createdAt,
          transaction_cursor_id: cursor.transactionId,
        }
      : {}),
    ...(filters.dateFrom
      ? { transaction_date_from: filters.dateFrom }
      : {}),
    ...(filters.dateTo ? { transaction_date_to: filters.dateTo } : {}),
    ...(filters.donorQuery
      ? { transaction_donor_query: filters.donorQuery }
      : {}),
    ...(filters.minAmountMinor !== null
      ? { transaction_min_amount_minor: filters.minAmountMinor }
      : {}),
    ...(filters.maxAmountMinor !== null
      ? { transaction_max_amount_minor: filters.maxAmountMinor }
      : {}),
    ...(filters.fundId
      ? { transaction_fund_id: filters.fundId }
      : {}),
    ...(filters.recurringState
      ? { transaction_recurring_state: filters.recurringState }
      : {}),
    ...(filters.last4 ? { transaction_last4: filters.last4 } : {}),
    ...(filters.paymentStatus
      ? { transaction_payment_status: filters.paymentStatus }
      : {}),
    ...(filters.cancellationState
      ? { transaction_cancellation_state: filters.cancellationState }
      : {}),
  };
}

export async function getChurchTransactionPage(
  client: SupabaseClient<Database>,
  churchId: string,
  options: ChurchTransactionPageOptions = {},
): Promise<ChurchTransactionPageResult> {
  const normalizedChurchId = churchId.toLowerCase();
  const pageSize = options.pageSize ?? CHURCH_TRANSACTION_PAGE_SIZE;
  const filters = options.filters ?? EMPTY_CHURCH_TRANSACTION_FILTERS;
  const cursor = options.cursor ?? null;
  if (
    !isChurchTransactionId(churchId) ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > CHURCH_TRANSACTION_MAX_PAGE_SIZE ||
    !isChurchTransactionFilters(filters) ||
    (cursor !== null && !isChurchTransactionCursor(cursor))
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const normalizedCursor = cursor
    ? { createdAt: cursor.createdAt, transactionId: cursor.transactionId.toLowerCase() }
    : null;
  let response: RpcResponse;
  try {
    response = await client.rpc(
      "get_church_transaction_page",
      createRpcArgs(normalizedChurchId, pageSize, filters, normalizedCursor),
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const identifier = getErrorIdentifier(response.error);
    if (identifier === "CHURCH_TRANSACTIONS_FORBIDDEN") {
      return { ok: false, reason: "forbidden" };
    }
    if (identifier?.startsWith("CHURCH_TRANSACTIONS_INVALID_")) {
      return { ok: false, reason: "invalid_request" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const page = parseTransactionPage(
    getSingleRow(response.data),
    normalizedChurchId,
    pageSize,
    normalizedCursor,
  );
  return page ? { ok: true, page } : { ok: false, reason: "unavailable" };
}
