import type { Metadata } from "next";
import Link from "next/link";

import { ChurchTransactions } from "@/components/church-transactions";
import { SectionHeader } from "@/components/dashboard-shell";
import { CardIcon, ShieldIcon } from "@/components/icons";
import { requireChurchPermission } from "@/lib/auth/guards";
import {
  CHURCH_TRANSACTION_PAGE_SIZE,
  createChurchTransactionPageHref,
  hasActiveChurchTransactionFilters,
  parseChurchTransactionSearchParams,
} from "@/lib/church-transactions";
import { getChurchTransactionPage } from "@/lib/church-transactions-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church transactions",
  description: "Review and filter saved church giving transactions.",
};

type ChurchTransactionsPageProps = Readonly<{
  searchParams?: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}>;

export default async function ChurchTransactionsPage({
  searchParams = Promise.resolve({}),
}: ChurchTransactionsPageProps = {}) {
  const { workspace } = await requireChurchPermission("financial_read");
  const query = await searchParams;
  const parsed = parseChurchTransactionSearchParams(query);

  if (!parsed.ok) {
    return <TransactionPageState state="invalid" />;
  }

  let result: Awaited<ReturnType<typeof getChurchTransactionPage>>;
  try {
    const client = await createServerSupabaseClient();
    result = await getChurchTransactionPage(client, workspace.churchId, {
      pageSize: CHURCH_TRANSACTION_PAGE_SIZE,
      filters: parsed.filters,
      cursor: parsed.cursor,
    });
  } catch {
    return (
      <TransactionPageState
        retryHref={createChurchTransactionPageHref(
          parsed.filters,
          parsed.cursor,
        )}
        state="unavailable"
      />
    );
  }

  if (!result.ok) {
    return result.reason === "invalid_request" ? (
      <TransactionPageState state="invalid" />
    ) : (
      <TransactionPageState
        retryHref={createChurchTransactionPageHref(
          parsed.filters,
          parsed.cursor,
        )}
        state="unavailable"
      />
    );
  }

  const firstPageHref = createChurchTransactionPageHref(parsed.filters);
  const nextPageHref =
    result.page.hasMore && result.page.nextCursor
      ? createChurchTransactionPageHref(
          parsed.filters,
          result.page.nextCursor,
        )
      : null;
  const hasActiveFilters = hasActiveChurchTransactionFilters(parsed.filters);

  return (
    <main
      className="mx-auto min-w-0 max-w-[1320px] pb-24"
      key={workspace.churchId}
    >
      <header className="mb-6 lg:hidden">
        <p className="text-xs font-semibold text-[var(--sage)]">
          Giving activity
        </p>
        <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">
          Transactions
        </h1>
        <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">
          Review saved giving records with detailed filters and pagination.
        </p>
      </header>

      <section className="mb-6 grid gap-4 rounded-[22px] border border-[#cddfd8] bg-[var(--sage-pale)] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--sage)] text-white">
            <ShieldIcon size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Protected financial records</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">
              Results are limited to the selected church. Card display is
              restricted to the saved brand and last four digits when supplied.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--sage-dark)]">
          Permission checked
        </span>
      </section>

      <section className="soft-card min-w-0 rounded-[22px] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Bookkeeping"
          title="All transactions"
        />
        <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
          Filter the saved transaction ledger by date, donor, amount, category,
          recurrence, safe card metadata, payment status, or cancellation state.
        </p>

        <ChurchTransactions
          filters={parsed.filters}
          firstPageHref={firstPageHref}
          hasActiveFilters={hasActiveFilters}
          isPaginated={parsed.cursor !== null}
          nextPageHref={nextPageHref}
          page={result.page}
        />
      </section>

      <section className="mt-6 flex min-w-0 items-start gap-3 rounded-[22px] bg-[var(--ink)] p-5 text-white sm:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.08] text-[#b9d7cb]">
          <CardIcon size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold">Payment and plan status stay separate</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-white/65">
            A canceled recurring plan does not change a historical successful
            payment. The table shows both states independently.
          </p>
        </div>
      </section>
    </main>
  );
}

function TransactionPageState({
  state,
  retryHref = "/church/transactions",
}: Readonly<{
  state: "invalid" | "unavailable";
  retryHref?: string;
}>) {
  const invalid = state === "invalid";

  return (
    <main className="mx-auto min-w-0 max-w-3xl pb-24">
      <section
        className="soft-card rounded-[24px] p-6 text-center sm:p-8"
        role="alert"
      >
        <ShieldIcon className="mx-auto text-[var(--sage)]" size={24} />
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          {invalid ? "Invalid transaction link" : "Records unavailable"}
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
          {invalid
            ? "This transaction link is invalid."
            : "Transactions could not be loaded."}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-[var(--muted)]">
          {invalid
            ? "Open the first transaction page and apply the filters again."
            : "No financial records are displayed in this state. Retry the permission-checked request."}
        </p>
        <Link
          className="focus-ring mt-6 inline-flex rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white"
          href={invalid ? "/church/transactions" : retryHref}
        >
          {invalid ? "Open transactions" : "Try again"}
        </Link>
      </section>
    </main>
  );
}
