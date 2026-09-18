import Link from "next/link";

import { SearchIcon } from "@/components/icons";
import {
  CHURCH_TRANSACTION_CANCELLATION_OPTIONS,
  CHURCH_TRANSACTION_MAX_DATE,
  CHURCH_TRANSACTION_MIN_DATE,
  CHURCH_TRANSACTION_PAYMENT_STATUS_OPTIONS,
  CHURCH_TRANSACTION_RECURRING_OPTIONS,
  formatChurchTransactionAmountInput,
  type ChurchTransactionCancellationState,
  type ChurchTransactionFilters,
  type ChurchTransactionPage,
  type ChurchTransactionPaymentStatus,
  type ChurchTransactionRecurringStatus,
  type ChurchTransactionRow,
} from "@/lib/church-transactions";
import type { CurrencyCode } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/utils";

type ChurchTransactionsProps = Readonly<{
  page: ChurchTransactionPage;
  filters: ChurchTransactionFilters;
  hasActiveFilters: boolean;
  isPaginated: boolean;
  firstPageHref: string;
  nextPageHref: string | null;
}>;

const PAYMENT_STATUS_LABELS: Readonly<
  Record<ChurchTransactionPaymentStatus, string>
> = Object.fromEntries(
  CHURCH_TRANSACTION_PAYMENT_STATUS_OPTIONS.map(({ value, label }) => [
    value,
    label,
  ]),
) as Record<ChurchTransactionPaymentStatus, string>;

const RECURRING_STATUS_LABELS: Readonly<
  Record<ChurchTransactionRecurringStatus, string>
> = {
  incomplete: "Incomplete",
  active: "Active",
  paused: "Paused",
  past_due: "Past due",
  canceled: "Canceled",
};

const CANCELLATION_LABELS: Readonly<
  Record<ChurchTransactionCancellationState, string>
> = {
  not_canceled: "Not canceled",
  payment_canceled: "Payment canceled",
  recurring_canceled: "Recurring plan canceled",
  payment_and_recurring_canceled: "Payment and plan canceled",
};

const fieldClassName =
  "focus-ring mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-xs outline-none";

function formatFrequency(frequency: ChurchTransactionRow["frequency"]) {
  if (frequency === "weekly") return "Weekly";
  if (frequency === "monthly") return "Monthly";
  return "One-time";
}

function paymentStatusClassName(status: ChurchTransactionPaymentStatus) {
  if (status === "succeeded") {
    return "bg-[var(--sage-pale)] text-[var(--sage-dark)]";
  }
  if (status === "failed" || status === "canceled" || status === "disputed") {
    return "bg-[#fce8e4] text-[#963f31]";
  }
  if (status === "refunded" || status === "partially_refunded") {
    return "bg-[#edf1f5] text-[#496785]";
  }
  return "bg-[var(--gold-pale)] text-[#79581f]";
}

function cancellationClassName(state: ChurchTransactionCancellationState) {
  return state === "not_canceled"
    ? "bg-[#edf1f5] text-[#496785]"
    : "bg-[#fce8e4] text-[#963f31]";
}

function formatTransactionMoney(amountMinor: number, currency: string) {
  return formatMoney({ amountMinor, currency: currency as CurrencyCode });
}

export function ChurchTransactions({
  page,
  filters,
  hasActiveFilters,
  isPaginated,
  firstPageHref,
  nextPageHref,
}: ChurchTransactionsProps) {
  return (
    <div className="mt-5">
      <form
        action="/church/transactions"
        className="rounded-[20px] border border-[var(--line)] bg-[#f7f5f0] p-4 sm:p-5"
        method="get"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[var(--sage)]">
            <SearchIcon size={16} />
          </span>
          <div>
            <h3 className="text-xs font-bold">Filter transactions</h3>
            <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
              Filters run against the church&apos;s saved transaction records.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            From date
            <input
              className={fieldClassName}
              defaultValue={filters.dateFrom ?? ""}
              max={CHURCH_TRANSACTION_MAX_DATE}
              min={CHURCH_TRANSACTION_MIN_DATE}
              name="from"
              type="date"
            />
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            To date
            <input
              className={fieldClassName}
              defaultValue={filters.dateTo ?? ""}
              max={CHURCH_TRANSACTION_MAX_DATE}
              min={CHURCH_TRANSACTION_MIN_DATE}
              name="to"
              type="date"
            />
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)] sm:col-span-2">
            Donor name
            <input
              autoComplete="off"
              className={fieldClassName}
              defaultValue={filters.donorQuery ?? ""}
              maxLength={120}
              name="donor"
              placeholder="Search by saved display name"
              type="search"
            />
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            Minimum amount
            <input
              className={fieldClassName}
              defaultValue={formatChurchTransactionAmountInput(
                filters.minAmountMinor,
              )}
              inputMode="decimal"
              max="999999999.99"
              min="0"
              name="min"
              placeholder="0.00"
              step="0.01"
              type="number"
            />
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            Maximum amount
            <input
              className={fieldClassName}
              defaultValue={formatChurchTransactionAmountInput(
                filters.maxAmountMinor,
              )}
              inputMode="decimal"
              max="999999999.99"
              min="0"
              name="max"
              placeholder="0.00"
              step="0.01"
              type="number"
            />
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            Category
            <select
              className={fieldClassName}
              defaultValue={filters.fundId ?? ""}
              name="fund"
            >
              <option value="">All categories</option>
              {page.fundOptions.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                  {fund.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            Recurring state
            <select
              className={fieldClassName}
              defaultValue={filters.recurringState ?? ""}
              name="recurring"
            >
              <option value="">All giving types</option>
              {CHURCH_TRANSACTION_RECURRING_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            Card last four
            <input
              autoComplete="off"
              className={fieldClassName}
              defaultValue={filters.last4 ?? ""}
              inputMode="numeric"
              maxLength={4}
              name="last4"
              pattern="[0-9]{4}"
              placeholder="4242"
              type="text"
            />
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)]">
            Payment status
            <select
              className={fieldClassName}
              defaultValue={filters.paymentStatus ?? ""}
              name="status"
            >
              <option value="">All payment statuses</option>
              {CHURCH_TRANSACTION_PAYMENT_STATUS_OPTIONS.map(
                ({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
                ),
              )}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-bold text-[var(--ink-soft)] sm:col-span-2">
            Cancellation state
            <select
              className={fieldClassName}
              defaultValue={filters.cancellationState ?? ""}
              name="cancellation"
            >
              <option value="">All cancellation states</option>
              {CHURCH_TRANSACTION_CANCELLATION_OPTIONS.map(
                ({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="focus-ring rounded-full bg-[var(--sage)] px-5 py-2.5 text-xs font-bold text-white"
            type="submit"
          >
            Apply filters
          </button>
          {hasActiveFilters ? (
            <Link
              className="focus-ring rounded-full border border-[var(--line)] bg-white px-5 py-2.5 text-xs font-bold"
              href="/church/transactions"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] text-[var(--muted)]" role="status">
          Showing {page.transactions.length} transaction
          {page.transactions.length === 1 ? "" : "s"} on this page.
        </p>
        <div className="flex flex-wrap gap-2">
          {isPaginated ? (
            <Link
              className="focus-ring rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[10px] font-bold"
              href={firstPageHref}
            >
              First page
            </Link>
          ) : null}
          {nextPageHref ? (
            <Link
              className="focus-ring rounded-full bg-[var(--ink)] px-4 py-2 text-[10px] font-bold text-white"
              href={nextPageHref}
            >
              Next transactions
            </Link>
          ) : null}
        </div>
      </div>

      {page.transactions.length === 0 ? (
        <TransactionEmptyState
          firstPageHref={firstPageHref}
          hasActiveFilters={hasActiveFilters}
          isPaginated={isPaginated}
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <caption className="sr-only">
              Saved church transaction records
            </caption>
            <thead>
              <tr className="border-b border-[var(--line)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                <th className="px-2 py-3">Donor</th>
                <th className="px-2 py-3">Category</th>
                <th className="px-2 py-3">Recorded</th>
                <th className="px-2 py-3">Recurrence</th>
                <th className="px-2 py-3">Card</th>
                <th className="px-2 py-3 text-right">Gross</th>
                <th className="px-2 py-3 text-right">Net</th>
                <th className="px-2 py-3 text-right">Payment</th>
                <th className="px-2 py-3 text-right">Cancellation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {page.transactions.map((row) => (
                <tr className="align-top text-xs" key={row.id}>
                  <td className="px-2 py-3.5">
                    <p className="max-w-44 break-words font-bold [overflow-wrap:anywhere]">
                      {row.donorName}
                    </p>
                  </td>
                  <td className="px-2 py-3.5">
                    <p className="max-w-44 break-words font-semibold [overflow-wrap:anywhere]">
                      {row.fundName}
                    </p>
                    {row.campaignName ? (
                      <p className="mt-1 max-w-44 break-words text-[9px] text-[var(--muted)] [overflow-wrap:anywhere]">
                        Campaign: {row.campaignName}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3.5 text-[var(--muted)]">
                    {formatDateTime(row.recordedAt, page.churchTimezone)}
                  </td>
                  <td className="px-2 py-3.5">
                    <p className="font-semibold">{formatFrequency(row.frequency)}</p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">
                      {row.recurringStatus
                        ? `Current plan: ${RECURRING_STATUS_LABELS[row.recurringStatus]}`
                        : "No recurring plan"}
                    </p>
                  </td>
                  <td className="px-2 py-3.5 text-[var(--muted)]">
                    {row.paymentMethodLast4 ? (
                      <>
                        <span>{row.paymentMethodBrand ?? "Card"}</span>
                        <span className="mt-1 block text-[9px]" aria-label={`Card ending ${row.paymentMethodLast4}`}>
                          •••• {row.paymentMethodLast4}
                        </span>
                      </>
                    ) : (
                      "Not supplied"
                    )}
                  </td>
                  <td className="px-2 py-3.5 text-right font-bold">
                    {formatTransactionMoney(row.amountMinor, row.currency)}
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    <p className="font-bold">
                      {formatTransactionMoney(row.netAmountMinor, row.currency)}
                    </p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">
                      Fee{" "}
                      {formatTransactionMoney(
                        row.processingFeeMinor,
                        row.currency,
                      )}
                    </p>
                    {row.refundedAmountMinor > 0 ? (
                      <p className="mt-1 text-[9px] text-[#963f31]">
                        Refunded{" "}
                        {formatTransactionMoney(
                          row.refundedAmountMinor,
                          row.currency,
                        )}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wide ${paymentStatusClassName(row.paymentStatus)}`}
                    >
                      {PAYMENT_STATUS_LABELS[row.paymentStatus]}
                    </span>
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    <span
                      className={`inline-flex max-w-36 justify-center rounded-full px-2.5 py-1 text-[8px] font-bold uppercase leading-3 tracking-wide ${cancellationClassName(row.cancellationState)}`}
                    >
                      {CANCELLATION_LABELS[row.cancellationState]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TransactionEmptyState({
  hasActiveFilters,
  isPaginated,
  firstPageHref,
}: Readonly<{
  hasActiveFilters: boolean;
  isPaginated: boolean;
  firstPageHref: string;
}>) {
  const title = isPaginated
    ? "No transactions on this page"
    : hasActiveFilters
      ? "No matching transactions"
      : "No saved transactions yet";
  const message = isPaginated
    ? "Return to the first filtered page and continue from a fresh pagination link."
    : hasActiveFilters
      ? "Adjust or clear the filters to review a broader set of records."
      : "Confirmed giving records will appear here when they are available.";

  return (
    <div
      className="mt-5 rounded-[22px] border border-dashed border-[var(--line)] bg-[#f7f5f0] px-5 py-10 text-center"
      role="status"
    >
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[var(--muted)]">
        {message}
      </p>
      {isPaginated ? (
        <Link
          className="focus-ring mt-5 inline-flex rounded-full bg-[var(--sage)] px-5 py-2.5 text-xs font-bold text-white"
          href={firstPageHref}
        >
          Open first page
        </Link>
      ) : hasActiveFilters ? (
        <Link
          className="focus-ring mt-5 inline-flex rounded-full bg-[var(--sage)] px-5 py-2.5 text-xs font-bold text-white"
          href="/church/transactions"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
