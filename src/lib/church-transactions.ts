export const CHURCH_TRANSACTION_PAGE_SIZE = 20;
export const CHURCH_TRANSACTION_MAX_PAGE_SIZE = 50;
export const CHURCH_TRANSACTION_MIN_DATE = "2000-01-01";
export const CHURCH_TRANSACTION_MAX_DATE = "2100-12-31";
export const CHURCH_TRANSACTION_MAX_AMOUNT_MINOR = 99_999_999_999;

export const CHURCH_TRANSACTION_RECURRING_FILTERS = [
  "one_time",
  "recurring",
  "incomplete",
  "active",
  "paused",
  "past_due",
  "canceled",
] as const;

export const CHURCH_TRANSACTION_PAYMENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "partially_refunded",
  "refunded",
  "disputed",
  "canceled",
] as const;

export const CHURCH_TRANSACTION_CANCELLATION_FILTERS = [
  "not_canceled",
  "payment_canceled",
  "recurring_canceled",
  "any_canceled",
] as const;

export const CHURCH_TRANSACTION_CANCELLATION_STATES = [
  "not_canceled",
  "payment_canceled",
  "recurring_canceled",
  "payment_and_recurring_canceled",
] as const;

export const CHURCH_TRANSACTION_FREQUENCIES = ["weekly", "monthly"] as const;
export const CHURCH_TRANSACTION_RECURRING_STATUSES = [
  "incomplete",
  "active",
  "paused",
  "past_due",
  "canceled",
] as const;
export const CHURCH_TRANSACTION_FUND_STATUSES = ["active", "archived"] as const;

export const CHURCH_TRANSACTION_RECURRING_OPTIONS = [
  { value: "one_time", label: "One-time" },
  { value: "recurring", label: "Any recurring" },
  { value: "incomplete", label: "Recurring: incomplete" },
  { value: "active", label: "Recurring: active" },
  { value: "paused", label: "Recurring: paused" },
  { value: "past_due", label: "Recurring: past due" },
  { value: "canceled", label: "Recurring: canceled" },
] as const;

export const CHURCH_TRANSACTION_PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "partially_refunded", label: "Partially refunded" },
  { value: "refunded", label: "Refunded" },
  { value: "disputed", label: "Disputed" },
  { value: "canceled", label: "Canceled" },
] as const;

export const CHURCH_TRANSACTION_CANCELLATION_OPTIONS = [
  { value: "not_canceled", label: "Not canceled" },
  { value: "payment_canceled", label: "Payment canceled" },
  { value: "recurring_canceled", label: "Recurring plan canceled" },
  { value: "any_canceled", label: "Any cancellation" },
] as const;

export type ChurchTransactionRecurringFilter =
  (typeof CHURCH_TRANSACTION_RECURRING_FILTERS)[number];
export type ChurchTransactionPaymentStatus =
  (typeof CHURCH_TRANSACTION_PAYMENT_STATUSES)[number];
export type ChurchTransactionCancellationFilter =
  (typeof CHURCH_TRANSACTION_CANCELLATION_FILTERS)[number];
export type ChurchTransactionCancellationState =
  (typeof CHURCH_TRANSACTION_CANCELLATION_STATES)[number];
export type ChurchTransactionFrequency =
  (typeof CHURCH_TRANSACTION_FREQUENCIES)[number];
export type ChurchTransactionRecurringStatus =
  (typeof CHURCH_TRANSACTION_RECURRING_STATUSES)[number];
export type ChurchTransactionFundStatus =
  (typeof CHURCH_TRANSACTION_FUND_STATUSES)[number];

export type ChurchTransactionFilters = Readonly<{
  dateFrom: string | null;
  dateTo: string | null;
  donorQuery: string | null;
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  fundId: string | null;
  recurringState: ChurchTransactionRecurringFilter | null;
  last4: string | null;
  paymentStatus: ChurchTransactionPaymentStatus | null;
  cancellationState: ChurchTransactionCancellationFilter | null;
}>;

export type ChurchTransactionCursor = Readonly<{
  createdAt: string;
  transactionId: string;
}>;

export type ChurchTransactionRow = Readonly<{
  id: string;
  donorName: string;
  fundId: string;
  fundName: string;
  campaignId: string | null;
  campaignName: string | null;
  recordedAt: string;
  frequency: ChurchTransactionFrequency | null;
  recurringStatus: ChurchTransactionRecurringStatus | null;
  amountMinor: number;
  currency: string;
  processingFeeMinor: number;
  refundedAmountMinor: number;
  netAmountMinor: number;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentStatus: ChurchTransactionPaymentStatus;
  cancellationState: ChurchTransactionCancellationState;
}>;

export type ChurchTransactionFundOption = Readonly<{
  id: string;
  name: string;
  status: ChurchTransactionFundStatus;
}>;

export type ChurchTransactionPage = Readonly<{
  churchId: string;
  churchTimezone: string;
  transactions: readonly ChurchTransactionRow[];
  fundOptions: readonly ChurchTransactionFundOption[];
  nextCursor: ChurchTransactionCursor | null;
  hasMore: boolean;
}>;

export type ChurchTransactionSearchParseResult =
  | Readonly<{
      ok: true;
      filters: ChurchTransactionFilters;
      cursor: ChurchTransactionCursor | null;
    }>
  | Readonly<{ ok: false; reason: "invalid_request" }>;

export const EMPTY_CHURCH_TRANSACTION_FILTERS: ChurchTransactionFilters = {
  dateFrom: null,
  dateTo: null,
  donorQuery: null,
  minAmountMinor: null,
  maxAmountMinor: null,
  fundId: null,
  recurringState: null,
  last4: null,
  paymentStatus: null,
  cancellationState: null,
};

type SearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/;
const LAST4_PATTERN = /^\d{4}$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;

function getSingleSearchValue(params: SearchParams, name: string) {
  const value = params[name];
  if (Array.isArray(value)) return { valid: false, value: null } as const;
  return {
    valid: true,
    value: typeof value === "string" && value.length > 0 ? value : null,
  } as const;
}

function isCanonicalDate(value: string) {
  if (
    !DATE_PATTERN.test(value) ||
    value < CHURCH_TRANSACTION_MIN_DATE ||
    value > CHURCH_TRANSACTION_MAX_DATE
  ) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseAmountToMinor(value: string) {
  const match = AMOUNT_PATTERN.exec(value);
  if (!match) return null;

  const [whole, fraction = ""] = value.split(".");
  const amount =
    BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0") || "0");
  if (amount > BigInt(CHURCH_TRANSACTION_MAX_AMOUNT_MINOR)) return null;
  return Number(amount);
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isTimestamp(value: string) {
  return getChurchTransactionTimestampMicroseconds(value) !== null;
}

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function normalizeDonorQuery(value: string) {
  if (UNSAFE_SINGLE_LINE_PATTERN.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  const length = Array.from(normalized).length;
  return length >= 1 && length <= 120 ? normalized : null;
}

export function getChurchTransactionTimestampMicroseconds(value: unknown) {
  if (typeof value !== "string") return null;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const offsetSign = match[9];
  const offsetHour = Number(match[10] ?? "0");
  const offsetMinute = Number(match[11] ?? "0");
  if (
    year < 1_000 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null;
  }

  const localMilliseconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
  );
  const local = new Date(localMilliseconds);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return null;
  }

  const offsetDirection = offsetSign === "-" ? -1 : 1;
  const offsetMilliseconds =
    offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
  return (
    BigInt(localMilliseconds - offsetMilliseconds) * BigInt(1_000) +
    BigInt(fraction.padEnd(6, "0") || "0")
  );
}

export function isChurchTransactionId(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

export function isChurchTransactionCursor(
  value: unknown,
): value is ChurchTransactionCursor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.createdAt === "string" &&
    isTimestamp(cursor.createdAt) &&
    isChurchTransactionId(cursor.transactionId)
  );
}

export function compareChurchTransactionPositions(
  left: ChurchTransactionCursor,
  right: ChurchTransactionCursor,
) {
  const leftTime = getChurchTransactionTimestampMicroseconds(left.createdAt);
  const rightTime = getChurchTransactionTimestampMicroseconds(right.createdAt);
  if (leftTime === null || rightTime === null) return null;
  if (leftTime !== rightTime) return leftTime > rightTime ? 1 : -1;

  const leftId = left.transactionId.toLowerCase();
  const rightId = right.transactionId.toLowerCase();
  return leftId === rightId ? 0 : leftId > rightId ? 1 : -1;
}

export function isChurchTransactionFilters(
  value: unknown,
): value is ChurchTransactionFilters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const filters = value as Record<string, unknown>;
  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const donorQuery = filters.donorQuery;
  const minAmountMinor = filters.minAmountMinor;
  const maxAmountMinor = filters.maxAmountMinor;
  const fundId = filters.fundId;
  const recurringState = filters.recurringState;
  const last4 = filters.last4;
  const paymentStatus = filters.paymentStatus;
  const cancellationState = filters.cancellationState;

  return (
    (dateFrom === null ||
      (typeof dateFrom === "string" && isCanonicalDate(dateFrom))) &&
    (dateTo === null || (typeof dateTo === "string" && isCanonicalDate(dateTo))) &&
    !(
      typeof dateFrom === "string" &&
      typeof dateTo === "string" &&
      dateFrom > dateTo
    ) &&
    (donorQuery === null ||
      (typeof donorQuery === "string" &&
        normalizeDonorQuery(donorQuery) === donorQuery)) &&
    (minAmountMinor === null ||
      (Number.isSafeInteger(minAmountMinor) &&
        (minAmountMinor as number) >= 0 &&
        (minAmountMinor as number) <= CHURCH_TRANSACTION_MAX_AMOUNT_MINOR)) &&
    (maxAmountMinor === null ||
      (Number.isSafeInteger(maxAmountMinor) &&
        (maxAmountMinor as number) >= 0 &&
        (maxAmountMinor as number) <= CHURCH_TRANSACTION_MAX_AMOUNT_MINOR)) &&
    !(
      typeof minAmountMinor === "number" &&
      typeof maxAmountMinor === "number" &&
      minAmountMinor > maxAmountMinor
    ) &&
    (fundId === null ||
      (typeof fundId === "string" &&
        isUuid(fundId) &&
        fundId === fundId.toLowerCase())) &&
    (recurringState === null ||
      (typeof recurringState === "string" &&
        includes(CHURCH_TRANSACTION_RECURRING_FILTERS, recurringState))) &&
    (last4 === null ||
      (typeof last4 === "string" && LAST4_PATTERN.test(last4))) &&
    (paymentStatus === null ||
      (typeof paymentStatus === "string" &&
        includes(CHURCH_TRANSACTION_PAYMENT_STATUSES, paymentStatus))) &&
    (cancellationState === null ||
      (typeof cancellationState === "string" &&
        includes(CHURCH_TRANSACTION_CANCELLATION_FILTERS, cancellationState)))
  );
}

export function parseChurchTransactionSearchParams(
  params: SearchParams,
): ChurchTransactionSearchParseResult {
  const names = [
    "from",
    "to",
    "donor",
    "min",
    "max",
    "fund",
    "recurring",
    "last4",
    "status",
    "cancellation",
    "cursorCreatedAt",
    "cursorId",
  ] as const;
  const values = Object.fromEntries(
    names.map((name) => [name, getSingleSearchValue(params, name)]),
  ) as Record<(typeof names)[number], ReturnType<typeof getSingleSearchValue>>;

  if (Object.values(values).some((entry) => !entry.valid)) {
    return { ok: false, reason: "invalid_request" };
  }

  const dateFrom = values.from.value;
  const dateTo = values.to.value;
  if (
    (dateFrom !== null && !isCanonicalDate(dateFrom)) ||
    (dateTo !== null && !isCanonicalDate(dateTo)) ||
    (dateFrom !== null && dateTo !== null && dateFrom > dateTo)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const donorQuery =
    values.donor.value === null
      ? null
      : normalizeDonorQuery(values.donor.value);
  if (values.donor.value !== null && donorQuery === null) {
    return { ok: false, reason: "invalid_request" };
  }

  const minAmountMinor =
    values.min.value === null ? null : parseAmountToMinor(values.min.value);
  const maxAmountMinor =
    values.max.value === null ? null : parseAmountToMinor(values.max.value);
  if (
    (values.min.value !== null && minAmountMinor === null) ||
    (values.max.value !== null && maxAmountMinor === null) ||
    (minAmountMinor !== null &&
      maxAmountMinor !== null &&
      minAmountMinor > maxAmountMinor)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const fundId = values.fund.value;
  const recurringState = values.recurring.value;
  const last4 = values.last4.value;
  const paymentStatus = values.status.value;
  const cancellationState = values.cancellation.value;
  if (
    (fundId !== null && !isUuid(fundId)) ||
    (recurringState !== null &&
      !includes(CHURCH_TRANSACTION_RECURRING_FILTERS, recurringState)) ||
    (last4 !== null && !LAST4_PATTERN.test(last4)) ||
    (paymentStatus !== null &&
      !includes(CHURCH_TRANSACTION_PAYMENT_STATUSES, paymentStatus)) ||
    (cancellationState !== null &&
      !includes(CHURCH_TRANSACTION_CANCELLATION_FILTERS, cancellationState))
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const cursorCreatedAt = values.cursorCreatedAt.value;
  const cursorId = values.cursorId.value;
  if (
    (cursorCreatedAt === null) !== (cursorId === null) ||
    (cursorCreatedAt !== null && !isTimestamp(cursorCreatedAt)) ||
    (cursorId !== null && !isUuid(cursorId))
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  return {
    ok: true,
    filters: {
      dateFrom,
      dateTo,
      donorQuery,
      minAmountMinor,
      maxAmountMinor,
      fundId: fundId?.toLowerCase() ?? null,
      recurringState,
      last4,
      paymentStatus,
      cancellationState,
    },
    cursor:
      cursorCreatedAt && cursorId
        ? {
            createdAt: cursorCreatedAt,
            transactionId: cursorId.toLowerCase(),
          }
        : null,
  };
}

export function formatChurchTransactionAmountInput(amountMinor: number | null) {
  if (amountMinor === null) return "";
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > CHURCH_TRANSACTION_MAX_AMOUNT_MINOR
  ) {
    return "";
  }

  const whole = Math.floor(amountMinor / 100);
  const fraction = String(amountMinor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function hasActiveChurchTransactionFilters(
  filters: ChurchTransactionFilters,
) {
  return Object.values(filters).some((value) => value !== null);
}

export function createChurchTransactionPageHref(
  filters: ChurchTransactionFilters,
  cursor: ChurchTransactionCursor | null = null,
) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.donorQuery) params.set("donor", filters.donorQuery);
  if (filters.minAmountMinor !== null) {
    params.set("min", formatChurchTransactionAmountInput(filters.minAmountMinor));
  }
  if (filters.maxAmountMinor !== null) {
    params.set("max", formatChurchTransactionAmountInput(filters.maxAmountMinor));
  }
  if (filters.fundId) params.set("fund", filters.fundId);
  if (filters.recurringState) params.set("recurring", filters.recurringState);
  if (filters.last4) params.set("last4", filters.last4);
  if (filters.paymentStatus) params.set("status", filters.paymentStatus);
  if (filters.cancellationState) {
    params.set("cancellation", filters.cancellationState);
  }
  if (cursor) {
    params.set("cursorCreatedAt", cursor.createdAt);
    params.set("cursorId", cursor.transactionId);
  }

  const query = params.toString();
  return query ? `/church/transactions?${query}` : "/church/transactions";
}
