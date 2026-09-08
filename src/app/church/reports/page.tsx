import type { Metadata } from "next";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { CalendarIcon, CardIcon, ChartIcon, DownloadIcon, HeartIcon } from "@/components/icons";
import { requireChurchPermission } from "@/lib/auth/guards";
import { hasChurchPermission } from "@/lib/auth/permissions";
import {
  demoDonations,
  demoFundBreakdown,
  demoFunds,
  demoGivingSummary,
  demoGivingTrend,
  formatGivingFrequency,
  formatMoney,
  formatPercentage,
} from "@/lib";

export const metadata: Metadata = {
  title: "Church giving reports",
  description: "Review giving trends, fund performance and settlement totals for Harbour Grace Church.",
};

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function createReportCsv() {
  const header = ["Date", "Donor", "Fund", "Gross (BBD)", "Fees (BBD)", "Net (BBD)", "Frequency", "Status", "Receipt"];
  const rows = demoDonations.map((donation) => {
    const fund = demoFunds.find((item) => item.id === donation.fundId);
    return [
      donation.createdAt.slice(0, 10),
      donation.donor.name,
      fund?.name ?? "Unknown fund",
      (donation.amount.amountMinor / 100).toFixed(2),
      (donation.processingFee.amountMinor / 100).toFixed(2),
      (donation.netAmount.amountMinor / 100).toFixed(2),
      formatGivingFrequency(donation.frequency),
      donation.status,
      donation.receiptNumber ?? "",
    ];
  });

  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export default async function ChurchReportsPage() {
  const { workspace } = await requireChurchPermission("reports_read");
  const canExport = hasChurchPermission(
    workspace.permissions,
    "reports_export",
  );
  const maximumTrend = Math.max(...demoGivingTrend.map((point) => point.total.amountMinor));
  const sixWeekTotal = demoGivingTrend.reduce((total, point) => total + point.total.amountMinor, 0);
  const grossGiving = demoDonations.reduce((total, donation) => total + donation.amount.amountMinor, 0);
  const processingFees = demoDonations.reduce((total, donation) => total + donation.processingFee.amountMinor, 0);
  const netGiving = demoDonations.reduce((total, donation) => total + donation.netAmount.amountMinor, 0);
  const averageGift = Math.round(grossGiving / demoDonations.length);
  const recurringAmount = demoDonations
    .filter((donation) => donation.recurringGiftId)
    .reduce((total, donation) => total + donation.amount.amountMinor, 0);
  const oneTimeAmount = grossGiving - recurringAmount;
  const reportCsv = canExport ? createReportCsv() : "";

  return (
    <main className="mx-auto max-w-[1320px] pb-24" key={workspace.churchId}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:hidden">
          <div>
            <p className="text-xs text-[var(--muted)]">Financial snapshot</p>
            <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Giving reports</h1>
          </div>
          {canExport ? (
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-xs font-bold text-white"
              download="harbour-grace-giving-2026-08-17.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(reportCsv)}`}
            >
              <DownloadIcon size={16} /> Export CSV
            </a>
          ) : null}
        </div>

        <section className="mb-6 flex flex-col gap-4 rounded-[22px] bg-[var(--ink)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fd0c0]">Report period</p>
            <h2 className="mt-2 text-lg font-bold">11–17 August 2026</h2>
            <p className="mt-1 text-xs leading-5 text-white/60">Seeded demo records for bookkeeping review and reporting workflow validation.</p>
          </div>
          {canExport ? (
            <a
              className="focus-ring hidden shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold !text-[#122235] sm:inline-flex"
              download="harbour-grace-giving-2026-08-17.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(reportCsv)}`}
            >
              <DownloadIcon size={16} /> Export CSV
            </a>
          ) : null}
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<ChartIcon size={19} />}
            label="Six-week giving"
            note="13 July–17 August"
            value={formatMoney({ amountMinor: sixWeekTotal, currency: "BBD" })}
          />
          <StatCard
            icon={<HeartIcon size={19} />}
            label="This week"
            note={`${demoGivingSummary.transactionCount} completed gifts`}
            tone="blue"
            value={formatMoney(demoGivingSummary.total)}
          />
          <StatCard
            icon={<CardIcon size={19} />}
            label="Average gift"
            note={`${demoGivingSummary.uniqueDonorCount} unique donors`}
            tone="gold"
            value={formatMoney({ amountMinor: averageGift, currency: "BBD" })}
          />
          <StatCard
            icon={<CalendarIcon size={19} />}
            label="Recurring this week"
            note={`${demoGivingSummary.activeRecurringCount} active schedules`}
            tone="coral"
            value={formatMoney({ amountMinor: recurringAmount, currency: "BBD" })}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
          <section className="soft-card rounded-[22px] p-5 sm:p-6">
            <SectionHeader
              action={<span className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[10px] font-bold">Last 6 weeks</span>}
              eyebrow="Giving trend"
              title="Weekly giving"
            />
            <div className="mt-7 grid h-64 grid-cols-6 items-end gap-2 sm:gap-4" role="img" aria-label="Weekly giving totals for the last six weeks">
              {demoGivingTrend.map((point, index) => {
                const height = Math.max(18, Math.round((point.total.amountMinor / maximumTrend) * 100));
                const isCurrent = index === demoGivingTrend.length - 1;
                return (
                  <div className="flex h-full min-w-0 flex-col justify-end" key={point.label}>
                    <p className="mb-2 hidden text-center text-[9px] font-bold text-[var(--muted)] sm:block">{formatMoney(point.total)}</p>
                    <div className="relative h-[176px] overflow-hidden rounded-t-xl bg-[#ece9e1]">
                      <div
                        className={`absolute inset-x-0 bottom-0 rounded-t-xl ${isCurrent ? "bg-[var(--sage)]" : "bg-[#afc9bf]"}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <p className={`mt-2 truncate text-center text-[9px] ${isCurrent ? "font-bold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{point.label}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="soft-card rounded-[22px] p-5 sm:p-6">
            <SectionHeader eyebrow="Allocation" title="Giving by fund" />
            <div className="mt-6 space-y-5">
              {demoFundBreakdown.map((fund, index) => {
                const barColors = ["bg-[var(--sage)]", "bg-[var(--gold)]", "bg-[#6e89a5]"];
                return (
                  <div key={fund.fundId}>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold">{fund.fundName}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{formatMoney(fund.total)}</p>
                      </div>
                      <p className="text-sm font-bold">{formatPercentage(fund.percentage)}</p>
                    </div>
                    <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#ece9e1]">
                      <div className={`h-full rounded-full ${barColors[index] ?? "bg-[var(--sage)]"}`} style={{ width: `${fund.percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-7 rounded-2xl bg-[var(--sage-pale)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--sage-dark)]">Largest allocation</p>
              <p className="mt-2 text-sm font-bold">Building Fund</p>
              <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">51% of recorded giving supported church facilities this week.</p>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="soft-card rounded-[22px] p-5 sm:p-6">
            <SectionHeader eyebrow="Reconciliation" title="Gross to net" />
            <dl className="mt-5 divide-y divide-[var(--line)]">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <dt className="text-xs text-[var(--muted)]">Gross giving</dt>
                <dd className="text-xs font-bold">{formatMoney({ amountMinor: grossGiving, currency: "BBD" })}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-xs text-[var(--muted)]">Estimated provider fees</dt>
                <dd className="text-xs font-bold text-[var(--coral)]">− {formatMoney({ amountMinor: processingFees, currency: "BBD" })}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-xs font-bold">Net recorded</dt>
                <dd className="text-sm font-bold text-[var(--sage-dark)]">{formatMoney({ amountMinor: netGiving, currency: "BBD" })}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-2xl bg-[#f3f1eb] px-4 py-3 text-[10px] leading-5 text-[var(--muted)]">Settlement mode: <strong className="text-[var(--ink)]">Direct to church</strong>. Final provider statements remain the accounting source of truth.</p>
          </section>

          <section className="soft-card rounded-[22px] p-5 sm:p-6">
            <SectionHeader eyebrow="Gift type" title="One-time and recurring" />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <article className="rounded-[18px] bg-[#f3f1eb] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">One-time</p>
                <p className="mt-3 text-lg font-bold">{formatMoney({ amountMinor: oneTimeAmount, currency: "BBD" })}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">{demoDonations.filter((item) => !item.recurringGiftId).length} gifts</p>
              </article>
              <article className="rounded-[18px] bg-[var(--sage-pale)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--sage-dark)]">Recurring</p>
                <p className="mt-3 text-lg font-bold">{formatMoney({ amountMinor: recurringAmount, currency: "BBD" })}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">{demoDonations.filter((item) => item.recurringGiftId).length} gifts</p>
              </article>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#ece9e1]" aria-label={`${formatPercentage((oneTimeAmount / grossGiving) * 100)} one-time and ${formatPercentage((recurringAmount / grossGiving) * 100)} recurring`} role="img">
              <div className="h-full bg-[var(--gold)]" style={{ width: `${(oneTimeAmount / grossGiving) * 100}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[9px] text-[var(--muted)]">
              <span>{formatPercentage((oneTimeAmount / grossGiving) * 100)} one-time</span>
              <span>{formatPercentage((recurringAmount / grossGiving) * 100)} recurring</span>
            </div>
          </section>
        </div>
    </main>
  );
}
