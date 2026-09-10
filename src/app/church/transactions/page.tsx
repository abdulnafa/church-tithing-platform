import type { Metadata } from "next";
import { ChurchTransactions } from "@/components/church-transactions";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { CardIcon, ChartIcon, HeartIcon, UsersIcon } from "@/components/icons";
import { requireChurchPermission } from "@/lib/auth/guards";
import { hasEveryChurchPermission } from "@/lib/auth/permissions";
import {
  createChurchTransactionExportDetails,
  createChurchTransactionFundOptions,
  createChurchTransactionRows,
} from "@/lib/church-transaction-view";
import {
  demoDonations,
  demoFunds,
  formatMoney,
} from "@/lib";

export const metadata: Metadata = {
  title: "Church transactions",
  description: "Review, filter and export Harbour Grace Church giving activity.",
};

export default async function ChurchTransactionsPage() {
  const { workspace } = await requireChurchPermission("financial_read");
  const canExport = hasEveryChurchPermission(workspace.permissions, [
    "reports_read",
    "reports_export",
  ]);
  const grossAmountMinor = demoDonations.reduce(
    (total, donation) => total + donation.amount.amountMinor,
    0,
  );
  const feeAmountMinor = demoDonations.reduce(
    (total, donation) => total + donation.processingFee.amountMinor,
    0,
  );
  const netAmountMinor = demoDonations.reduce(
    (total, donation) => total + donation.netAmount.amountMinor,
    0,
  );
  const recurringPayments = demoDonations.filter(
    (donation) => donation.recurringGiftId !== null,
  ).length;
  const guestPayments = demoDonations.filter(
    (donation) => donation.donor.memberId === null,
  ).length;
  const transactionRows = createChurchTransactionRows(demoDonations);
  const transactionFunds = createChurchTransactionFundOptions(demoFunds);
  const transactionExportDetails = canExport
    ? createChurchTransactionExportDetails(demoDonations)
    : null;

  return (
    <main className="mx-auto max-w-[1320px] pb-24" key={workspace.churchId}>
        <header className="mb-6 lg:hidden">
          <p className="text-xs font-semibold text-[var(--sage)]">Giving activity</p>
          <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Transactions</h1>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">
            Search every demo donation, review settlement totals and export bookkeeping data.
          </p>
        </header>

        <section aria-label="Transaction summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<HeartIcon size={19} />}
            label="Demo gross giving"
            note={`${demoDonations.length} received donations`}
            value={formatMoney({ amountMinor: grossAmountMinor, currency: "BBD" })}
          />
          <StatCard
            icon={<ChartIcon size={19} />}
            label="Demo net giving"
            note="After provider fees"
            tone="blue"
            value={formatMoney({ amountMinor: netAmountMinor, currency: "BBD" })}
          />
          <StatCard
            icon={<CardIcon size={19} />}
            label="Recurring charges"
            note="Weekly and monthly gifts"
            tone="gold"
            value={String(recurringPayments)}
          />
          <StatCard
            icon={<UsersIcon size={19} />}
            label="Guest donations"
            note="No member account required"
            tone="coral"
            value={String(guestPayments)}
          />
        </section>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="soft-card min-w-0 rounded-[22px] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Bookkeeping"
              title="All transactions"
            />
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
              Search by donor, receipt or fund, narrow the list by category, and download the current view as a CSV file.
            </p>
            {transactionExportDetails ? (
              <ChurchTransactions
                canExport
                exportDetails={transactionExportDetails}
                funds={transactionFunds}
                rows={transactionRows}
              />
            ) : (
              <ChurchTransactions
                canExport={false}
                funds={transactionFunds}
                rows={transactionRows}
              />
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-[22px] bg-[var(--ink)] p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b9d7cb]">Demo settlement</p>
                  <h2 className="mt-1 text-base font-bold">Provider summary</h2>
                </div>
                <span className="rounded-full bg-[var(--gold)]/20 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-[#efcb85]">Preview</span>
              </div>
              <dl className="mt-5 divide-y divide-white/10 rounded-2xl bg-white/[0.06] px-4">
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-[10px] text-white/60">Gross collected</dt>
                  <dd className="text-xs font-bold">{formatMoney({ amountMinor: grossAmountMinor, currency: "BBD" })}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-[10px] text-white/60">Provider fees</dt>
                  <dd className="text-xs font-bold">{formatMoney({ amountMinor: feeAmountMinor, currency: "BBD" })}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-[10px] text-white/60">Net settlement</dt>
                  <dd className="text-xs font-bold text-[#b9d7cb]">{formatMoney({ amountMinor: netAmountMinor, currency: "BBD" })}</dd>
                </div>
              </dl>
              <p className="mt-4 text-[10px] leading-4 text-white/55">
                Figures use seeded data. Live settlements will go directly to the church after its merchant account is connected.
              </p>
            </section>

            <section className="soft-card rounded-[22px] p-5">
              <SectionHeader eyebrow="At a glance" title="Giving notes" />
              <dl className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#edf1f5] px-4 py-3">
                  <dt className="text-[10px] font-semibold text-[#496785]">Funds represented</dt>
                  <dd className="text-sm font-bold text-[#496785]">{new Set(demoDonations.map((donation) => donation.fundId)).size}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--gold-pale)] px-4 py-3">
                  <dt className="text-[10px] font-semibold text-[#8a641f]">Completed gifts</dt>
                  <dd className="text-sm font-bold text-[#8a641f]">{demoDonations.filter((donation) => donation.status === "succeeded").length}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
    </main>
  );
}
