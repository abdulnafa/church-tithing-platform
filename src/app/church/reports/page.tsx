import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import {
  CalendarIcon,
  CardIcon,
  ChartIcon,
  DownloadIcon,
  HeartIcon,
  ShieldIcon,
} from "@/components/icons";
import { requireChurchPermissions } from "@/lib/auth/guards";
import { hasChurchPermission } from "@/lib/auth/permissions";
import {
  CHURCH_GIVING_REPORT_PERIOD_OPTIONS,
  formatChurchGivingReportAmount,
  formatChurchGivingReportPercentage,
  getChurchGivingReportPercentageBasisPoints,
  getChurchGivingReportPeriodDescription,
  getChurchGivingReportPeriodLabel,
  parseChurchGivingReportSearchParams,
  type ChurchGivingReport,
  type ChurchGivingReportCurrency,
  type ChurchGivingReportPeriod,
} from "@/lib/church-giving-report";
import { getChurchGivingReport } from "@/lib/church-giving-report-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church giving reports",
  description:
    "Review saved church giving totals, trends, fees, refunds, and recorded net amounts.",
};

type ChurchReportsPageProps = Readonly<{
  searchParams?: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}>;

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function toUrlSearchParams(
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
) {
  const result = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === "string") result.append(name, value);
    else if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    }
  }
  return result;
}

function createReportHref(
  pathname: string,
  period: ChurchGivingReportPeriod,
  asOfDate: string | null,
) {
  const params = new URLSearchParams({ period });
  if (asOfDate) params.set("asOf", asOfDate);
  return `${pathname}?${params.toString()}`;
}

function formatReportDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return REPORT_DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

function formatReportRange(report: ChurchGivingReport) {
  return report.periodStartDate === null
    ? `Through ${formatReportDate(report.periodEndDate)}`
    : `${formatReportDate(report.periodStartDate)} - ${formatReportDate(report.periodEndDate)}`;
}

function maximumAmount(values: readonly bigint[]) {
  return values.reduce(
    (maximum, value) => (value > maximum ? value : maximum),
    BigInt(0),
  );
}

function percentageWidth(part: bigint, total: bigint) {
  return getChurchGivingReportPercentageBasisPoints(part, total) / 100;
}

export default async function ChurchReportsPage({
  searchParams = Promise.resolve({}),
}: ChurchReportsPageProps = {}) {
  const { workspace } = await requireChurchPermissions([
    "financial_read",
    "reports_read",
  ]);
  const parsed = parseChurchGivingReportSearchParams(
    toUrlSearchParams(await searchParams),
  );

  if (!parsed.ok) return <ReportPageState state="invalid" />;
  const retryHref = createReportHref(
    "/church/reports",
    parsed.selection.period,
    parsed.selection.asOfDate,
  );

  let result: Awaited<ReturnType<typeof getChurchGivingReport>>;
  try {
    const client = await createServerSupabaseClient();
    result = await getChurchGivingReport(
      client,
      workspace.churchId,
      parsed.selection,
    );
  } catch {
    return <ReportPageState retryHref={retryHref} state="unavailable" />;
  }

  if (!result.ok) {
    return (
      <ReportPageState
        retryHref={retryHref}
        state={result.reason === "invalid_request" ? "invalid" : "unavailable"}
      />
    );
  }

  const report = result.report;
  const canExport = hasChurchPermission(
    workspace.permissions,
    "reports_export",
  );
  const exportHref = createReportHref(
    "/church/reports/export",
    report.period,
    report.asOfDate,
  );

  return (
    <main
      className="mx-auto min-w-0 max-w-[1320px] pb-24"
      key={workspace.churchId}
    >
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:hidden">
        <div>
          <p className="text-xs font-semibold text-[var(--sage)]">
            Saved financial records
          </p>
          <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">
            Giving reports
          </h1>
        </div>
        {canExport ? <ExportLink href={exportHref} /> : null}
      </header>

      <section className="mb-6 rounded-[22px] border border-[#cddfd8] bg-[var(--sage-pale)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--sage)] text-white">
            <CalendarIcon size={19} />
          </span>
          <div>
            <h2 className="text-sm font-bold">Choose a reporting period</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Period boundaries use the church timezone: {report.churchTimezone}.
            </p>
          </div>
        </div>
        <nav
          aria-label="Giving report period"
          className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {CHURCH_GIVING_REPORT_PERIOD_OPTIONS.map((option) => (
            <Link
              aria-current={option.value === report.period ? "page" : undefined}
              className={`focus-ring rounded-2xl border px-4 py-3 text-left ${
                option.value === report.period
                  ? "border-[var(--sage)] bg-white shadow-sm"
                  : "border-transparent bg-white/55 hover:border-[#b8d2c7] hover:bg-white"
              }`}
              href={createReportHref(
                "/church/reports",
                option.value,
                report.asOfDate,
              )}
              key={option.value}
            >
              <span className="block text-xs font-bold">{option.label}</span>
              <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">
                {option.description}
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section className="mb-6 flex flex-col gap-4 rounded-[22px] bg-[var(--ink)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8fd0c0]">
            {getChurchGivingReportPeriodLabel(report.period)}
          </p>
          <h2 className="mt-2 text-lg font-bold">{formatReportRange(report)}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-white/65">
            {getChurchGivingReportPeriodDescription(report.period)} Totals use
            confirmed post-capture records through the selected local date.
          </p>
        </div>
        {canExport ? (
          <div className="hidden shrink-0 lg:block">
            <ExportLink href={exportHref} light />
          </div>
        ) : null}
      </section>

      {report.currencySummaries.length === 0 ? (
        <section className="soft-card rounded-[22px] p-6 text-center sm:p-8">
          <ChartIcon className="mx-auto text-[var(--sage)]" size={25} />
          <h2 className="font-display mt-4 text-2xl tracking-[-0.03em]">
            No captured gifts in this period
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">
            Choose another period or export the current empty report. Pending,
            failed, and canceled payment attempts are not financial totals.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {report.currencySummaries.map((summary) => (
            <CurrencyReport
              currency={summary.currency}
              key={summary.currency}
              report={report}
            />
          ))}
        </div>
      )}

      <section className="mt-8 flex min-w-0 items-start gap-3 rounded-[22px] bg-[var(--ink)] p-5 text-white sm:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.08] text-[#b9d7cb]">
          <ShieldIcon size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold">How to read these totals</h2>
          <p className="mt-1 max-w-4xl text-[10px] leading-5 text-white/65">
            These are current saved-ledger totals, not settlement or payout
            totals. Refund amounts are cumulative current values and do not
            reconstruct the date each refund occurred. Provider statements
            remain the accounting source of truth, and currencies are never
            combined.
          </p>
        </div>
      </section>
    </main>
  );
}

function ExportLink({
  href,
  light = false,
}: Readonly<{ href: string; light?: boolean }>) {
  return (
    <a
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-bold ${
        light
          ? "bg-white !text-[#122235]"
          : "bg-[var(--ink)] text-white"
      }`}
      href={href}
    >
      <DownloadIcon size={16} /> Export CSV
    </a>
  );
}

function CurrencyReport({
  currency,
  report,
}: Readonly<{
  currency: ChurchGivingReportCurrency;
  report: ChurchGivingReport;
}>) {
  const summary = report.currencySummaries.find(
    (item) => item.currency === currency,
  );
  if (!summary) return null;

  const trend = report.trendPoints.filter((item) => item.currency === currency);
  const funds = report.fundSummaries.filter((item) => item.currency === currency);
  const giftTypes = report.giftTypeSummaries.filter(
    (item) => item.currency === currency,
  );
  const trendMaximum = maximumAmount(
    trend.map((item) => item.grossAmountMinor),
  );

  return (
    <section aria-labelledby={`currency-${currency}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-full bg-[var(--sage-pale)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--sage-dark)]">
          {currency}
        </span>
        <h2
          className="font-display text-2xl tracking-[-0.03em]"
          id={`currency-${currency}`}
        >
          Recorded ledger totals
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={<HeartIcon size={19} />}
          label="Gross giving"
          note={`${summary.giftCount.toString()} captured gifts`}
          value={formatChurchGivingReportAmount(
            summary.grossAmountMinor,
            currency,
          )}
        />
        <StatCard
          icon={<CardIcon size={19} />}
          label="Processing fees"
          note="Saved provider fee value"
          tone="gold"
          value={formatChurchGivingReportAmount(
            summary.processingFeeMinor,
            currency,
          )}
        />
        <StatCard
          icon={<CalendarIcon size={19} />}
          label="Refunded"
          note="Cumulative current value"
          tone="coral"
          value={formatChurchGivingReportAmount(
            summary.refundedAmountMinor,
            currency,
          )}
        />
        <StatCard
          icon={<ChartIcon size={19} />}
          label="Recorded net"
          note="Gross minus fees and refunds"
          tone="blue"
          value={formatChurchGivingReportAmount(
            summary.recordedNetAmountMinor,
            currency,
          )}
        />
        <StatCard
          icon={<ShieldIcon size={19} />}
          label="Gift count"
          note="Post-capture records only"
          value={summary.giftCount.toString()}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.85fr)]">
        <section className="soft-card min-w-0 rounded-[22px] p-5 sm:p-6">
          <SectionHeader eyebrow={`${currency} trend`} title="Gross giving over time" />
          {trend.length === 0 ? (
            <p className="mt-6 text-xs text-[var(--muted)]">
              No trend points are available for this period.
            </p>
          ) : (
            <div className="mt-6">
              <table className="sr-only">
                <caption>{currency} gross giving trend details</caption>
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">Gross</th>
                    <th scope="col">Fees</th>
                    <th scope="col">Refunded</th>
                    <th scope="col">Recorded net</th>
                    <th scope="col">Gifts</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((point) => (
                    <tr key={`accessible-${point.bucketStart}-${point.currency}`}>
                      <th scope="row">{point.bucketStart}</th>
                      <td>
                        {formatChurchGivingReportAmount(
                          point.grossAmountMinor,
                          currency,
                        )}
                      </td>
                      <td>
                        {formatChurchGivingReportAmount(
                          point.processingFeeMinor,
                          currency,
                        )}
                      </td>
                      <td>
                        {formatChurchGivingReportAmount(
                          point.refundedAmountMinor,
                          currency,
                        )}
                      </td>
                      <td>
                        {formatChurchGivingReportAmount(
                          point.recordedNetAmountMinor,
                          currency,
                        )}
                      </td>
                      <td>{point.giftCount.toString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                aria-hidden="true"
                className="overflow-x-auto pb-2"
              >
                <div className="flex h-64 min-w-max items-end gap-3">
                {trend.map((point) => (
                  <div
                    className="flex h-full w-20 shrink-0 flex-col justify-end"
                    key={`${point.bucketStart}-${point.currency}`}
                  >
                    <p className="mb-2 truncate text-center text-[9px] font-bold text-[var(--muted)]">
                      {formatChurchGivingReportAmount(
                        point.grossAmountMinor,
                        currency,
                      )}
                    </p>
                    <div className="relative h-[176px] overflow-hidden rounded-t-xl bg-[#ece9e1]">
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-xl bg-[var(--sage)]"
                        style={{
                          height: `${Math.max(
                            2,
                            percentageWidth(
                              point.grossAmountMinor,
                              trendMaximum,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-center text-[9px] text-[var(--muted)]">
                      {point.bucketStart}
                    </p>
                  </div>
                ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="soft-card rounded-[22px] p-5 sm:p-6">
          <SectionHeader eyebrow={`${currency} allocation`} title="Giving by fund" />
          <div className="mt-6 space-y-5">
            {funds.map((fund) => {
              const percentage = getChurchGivingReportPercentageBasisPoints(
                fund.grossAmountMinor,
                summary.grossAmountMinor,
              );
              return (
                <div key={`${fund.currency}-${fund.fundId}`}>
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{fund.fundName}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {formatChurchGivingReportAmount(
                          fund.grossAmountMinor,
                          currency,
                        )}{" "}
                        across {fund.giftCount.toString()} gifts
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold">
                      {formatChurchGivingReportPercentage(percentage)}
                    </p>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#ece9e1]">
                    <div
                      className="h-full rounded-full bg-[var(--sage)]"
                      style={{ width: `${percentage / 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="soft-card mt-6 rounded-[22px] p-5 sm:p-6">
        <SectionHeader
          eyebrow={`${currency} gift type`}
          title="One-time and recurring"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(["one_time", "recurring"] as const).map((giftType) => {
            const item = giftTypes.find((entry) => entry.giftType === giftType);
            return (
              <article
                className={
                  giftType === "recurring"
                    ? "rounded-[18px] bg-[var(--sage-pale)] p-4"
                    : "rounded-[18px] bg-[#f3f1eb] p-4"
                }
                key={giftType}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {giftType === "one_time" ? "One-time" : "Recurring"}
                </p>
                <p className="mt-3 text-lg font-bold">
                  {formatChurchGivingReportAmount(
                    item?.grossAmountMinor ?? BigInt(0),
                    currency,
                  )}
                </p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {(item?.giftCount ?? BigInt(0)).toString()} captured gifts
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function ReportPageState({
  retryHref = "/church/reports?period=all",
  state,
}: Readonly<{
  retryHref?: string;
  state: "invalid" | "unavailable";
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
          {invalid ? "Invalid report link" : "Reports unavailable"}
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
          {invalid
            ? "This report link is invalid."
            : "Giving reports could not be loaded."}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-[var(--muted)]">
          {invalid
            ? "Open the full-history report and choose the period again."
            : "No financial totals are displayed in this state. Retry the permission-checked request."}
        </p>
        <Link
          className="focus-ring mt-6 inline-flex rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white"
          href={invalid ? "/church/reports?period=all" : retryHref}
        >
          {invalid ? "Open reports" : "Try again"}
        </Link>
      </section>
    </main>
  );
}
