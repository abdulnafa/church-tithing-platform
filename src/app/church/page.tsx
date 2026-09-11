import type { Metadata } from "next";
import Link from "next/link";
import { ChurchTransactions } from "@/components/church-transactions";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { GivingQr } from "@/components/giving-qr";
import { ArrowRightIcon, CalendarIcon, CardIcon, CheckIcon, HeartIcon, SettingsIcon, UsersIcon } from "@/components/icons";
import { getChurchOverviewVisibility } from "@/lib/auth/church-overview-access";
import { requireChurchPermission } from "@/lib/auth/guards";
import { createShellIdentity } from "@/lib/auth/workspaces";
import {
  createChurchTransactionExportDetails,
  createChurchTransactionFundOptions,
  createChurchTransactionRows,
} from "@/lib/church-transaction-view";
import {
  getPublicAppUrl,
  isLocalAppUrl,
  isVercelPreviewEnvironment,
} from "@/lib/public-app-url";
import {
  createPublicGivingPath,
  createPublicQrUrl,
} from "@/lib/public-church-routing";
import { getChurchQrSnapshot } from "@/lib/qr-routing-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculateProgress,
  demoCampaigns,
  demoDonations,
  demoFundBreakdown,
  demoFunds,
  demoGivingSummary,
  demoGivingTrend,
  demoMembers,
  demoRecurringGifts,
  formatMoney,
  formatPercentage,
} from "@/lib";

export const metadata: Metadata = {
  title: "Church overview",
};

export default async function ChurchDashboardPage() {
  const { identity, workspace } =
    await requireChurchPermission("workspace_read");
  const shellIdentity = createShellIdentity(identity, workspace);
  const visibility = getChurchOverviewVisibility(workspace.permissions);
  const maximumTrend = visibility.givingTrend
    ? Math.max(...demoGivingTrend.map((point) => point.total.amountMinor))
    : 0;
  const publicGivingPath = createPublicGivingPath(workspace.churchSlug);
  const givingQr = visibility.givingQr
    ? await loadOverviewGivingQr(
        workspace.churchId,
        workspace.churchStatus,
      )
    : null;
  const netGiving = visibility.givingTrend
    ? demoDonations.reduce(
        (sum, donation) => sum + donation.netAmount.amountMinor,
        0,
      )
    : 0;
  const transactionRows = visibility.recentTransactions
    ? createChurchTransactionRows(demoDonations)
    : [];
  const transactionFunds = visibility.recentTransactions
    ? createChurchTransactionFundOptions(demoFunds)
    : [];
  const transactionExportDetails = visibility.reportsExport
    ? createChurchTransactionExportDetails(demoDonations)
    : null;

  return (
    <div className="mx-auto max-w-[1320px] pb-24" key={workspace.churchId}>
        <div className="mb-6 flex flex-col gap-4 lg:hidden">
          <div><p className="text-xs text-[var(--muted)]">Welcome, {shellIdentity.displayName}</p><h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Church overview</h1></div>
        </div>

        <section className="mb-6 flex flex-col gap-4 overflow-hidden rounded-[22px] bg-[var(--ink)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#2f796b] text-white"><CheckIcon size={19} /></span>
            <div><p className="text-sm font-bold">Giving-page preview</p><p className="mt-1 max-w-2xl text-xs leading-5 text-white/75">{visibility.providerStatus ? "Review this church's giving-page path. Live checkout stays locked until its Barbados merchant connection is verified." : "Review this church's public giving-page path while the remaining dashboard figures use shared demo data."}</p></div>
          </div>
          {publicGivingPath && workspace.churchStatus === "active" ? <Link className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold !text-[#122235]" href={publicGivingPath}>Preview giving page <ArrowRightIcon size={15} /></Link> : <span className="rounded-full border border-white/15 px-4 py-2 text-[10px] font-bold text-white/80">Unavailable until activation</span>}
        </section>

        {visibility.financialSummary || visibility.registeredMembers ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibility.financialSummary ? (
              <>
                <StatCard icon={<HeartIcon size={19} />} label="Demo giving this week" note="Seeded preview data" value={formatMoney(demoGivingSummary.total)} />
                <StatCard icon={<CardIcon size={19} />} label="Demo donations" note={`${demoGivingSummary.uniqueDonorCount} unique donors`} tone="blue" value={String(demoGivingSummary.transactionCount)} />
                <StatCard icon={<CalendarIcon size={19} />} label="Demo recurring gifts" note="Weekly and monthly plans" tone="gold" value={String(demoGivingSummary.activeRecurringCount)} />
              </>
            ) : null}
            {visibility.registeredMembers ? (
              <StatCard icon={<UsersIcon size={19} />} label="Registered members" note="Verified demo profiles" tone="coral" value={String(demoMembers.length)} />
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="min-w-0 space-y-6">
            {visibility.givingTrend ? (
              <section className="soft-card rounded-[22px] p-5 sm:p-6" id="reports">
              <SectionHeader
                action={visibility.fullReportLink ? <Link className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[10px] font-bold text-[var(--sage)]" href="/church/reports">Full report →</Link> : undefined}
                eyebrow="Giving trend"
                title="Weekly giving"
              />
              <div className="mt-6 grid h-56 grid-cols-6 items-end gap-2 sm:gap-4">
                {demoGivingTrend.map((point, index) => {
                  const height = Math.max(18, Math.round((point.total.amountMinor / maximumTrend) * 100));
                  const isCurrent = index === demoGivingTrend.length - 1;
                  return (
                    <div className="flex h-full min-w-0 flex-col justify-end" key={point.label}>
                      <p className="mb-2 hidden text-center text-[9px] font-bold text-[var(--muted)] sm:block">{formatMoney(point.total)}</p>
                      <div className="relative h-[154px] overflow-hidden rounded-t-xl bg-[#ece9e1]">
                        <div className={`absolute inset-x-0 bottom-0 rounded-t-xl ${isCurrent ? "bg-[var(--sage)]" : "bg-[#afc9bf]"}`} style={{ height: `${height}%` }} />
                      </div>
                      <p className={`mt-2 truncate text-center text-[9px] ${isCurrent ? "font-bold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{point.label}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-col gap-2 border-t border-[var(--line)] pt-4 text-[10px] text-[var(--muted)] sm:flex-row sm:justify-between">
                <span>Net after provider fees: <strong className="text-[var(--ink)]">{formatMoney({ amountMinor: netGiving, currency: "BBD" })}</strong></span>
                <span>Target settlement mode: <strong className="text-[var(--sage-dark)]">Direct to church</strong></span>
              </div>
              </section>
            ) : null}

            {visibility.recentTransactions ? (
              <section className="soft-card rounded-[22px] p-5 sm:p-6" id="transactions">
                <SectionHeader action={<Link className="text-[10px] font-bold text-[var(--sage)]" href="/church/transactions">View all →</Link>} eyebrow="Bookkeeping" title="Recent transactions" />
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
            ) : null}

            {visibility.campaigns ? (
              <section className="soft-card rounded-[22px] p-5 sm:p-6" id="campaigns">
              <SectionHeader
                action={<Link className="text-[10px] font-bold text-[var(--sage)]" href="/church/campaigns">Manage campaigns →</Link>}
                eyebrow="Demo campaign preview"
                title="Example active campaigns"
              />
              <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">
                Shared examples for layout preview. Open campaign management to view this church&apos;s saved campaigns.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {demoCampaigns.map((campaign, index) => {
                  const progress = visibility.financialSummary
                    ? calculateProgress(campaign.raised, campaign.goal)
                    : 0;
                  return (
                    <article className={`rounded-[20px] border p-5 ${index === 0 ? "border-[#c7dbd3] bg-[var(--sage-pale)]/55" : "border-[var(--line)] bg-white"}`} key={campaign.id}>
                      <div className="flex items-center justify-between gap-3"><span className={`grid size-10 place-items-center rounded-2xl ${index === 0 ? "bg-[var(--sage)] text-white" : "bg-[var(--gold-pale)] text-[#a97722]"}`}><HeartIcon size={18} /></span><span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-bold uppercase text-[var(--sage-dark)]">Active</span></div>
                      <h3 className="mt-5 text-sm font-bold">{campaign.name}</h3>
                      <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{campaign.description}</p>
                      {visibility.financialSummary ? (
                        <>
                          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white"><div className={index === 0 ? "h-full rounded-full bg-[var(--sage)]" : "h-full rounded-full bg-[var(--gold)]"} style={{ width: `${progress}%` }} /></div>
                          <div className="mt-2 flex items-center justify-between text-[9px]"><strong>{formatMoney(campaign.raised)}</strong><span className="text-[var(--muted)]">{formatPercentage(progress)} of goal</span></div>
                        </>
                      ) : (
                        <p className="mt-4 text-[9px] text-[var(--muted)]">Goal <strong className="text-[var(--ink)]">{formatMoney(campaign.goal)}</strong></p>
                      )}
                    </article>
                  );
                })}
              </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            {visibility.givingQr ? (
              <section className="soft-card rounded-[22px] p-5 sm:p-6" id="qr">
              <SectionHeader action={<Link className="text-[10px] font-bold text-[var(--sage)]" href="/church/qr">Open →</Link>} eyebrow="Permanent giving link" title="Giving QR code" />
              <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">One stable resolver code for this church&apos;s current giving-page path.</p>
              {givingQr?.state === "enabled" ? (
                <>
                  <div className="mt-5 rounded-[22px] bg-[#eeece5] p-5 text-center">
                    <GivingQr churchName={workspace.displayName} churchSlug={givingQr.churchSlug} value={givingQr.url} />
                  </div>
                  <p className="mt-3 break-all text-center text-[9px] text-[var(--ink-soft)]">{givingQr.url}</p>
                  <p className="mt-2 rounded-xl bg-[var(--gold-pale)] px-3 py-2 text-center text-[10px] leading-4 text-[#76521b]">{isVercelPreviewEnvironment() ? "Preview deployment configuration — do not print until this release is promoted and the approved origin is verified." : isLocalAppUrl(givingQr.appUrl) ? "Local preview QR. Set NEXT_PUBLIC_APP_URL to the approved public origin before printing." : "Preview validation only. Do not publish or print until the final platform domain and DNS are approved."}</p>
                </>
              ) : (
                <div className="mt-5 rounded-[22px] border border-[var(--line)] bg-[#eeece5] p-5 text-center" role="status">
                  <p className="text-xs font-bold">QR preview unavailable</p>
                  <p className="mt-2 text-[10px] leading-5 text-[var(--ink-soft)]">{givingQr?.state === "inactive" ? givingQr.message : "The saved QR details could not be loaded. Open the QR page and try again."}</p>
                </div>
              )}
              </section>
            ) : null}

            {visibility.recurringMembers ? (
              <section className="soft-card rounded-[22px] p-5" id="members">
              <SectionHeader action={<Link className="text-[10px] font-bold text-[var(--sage)]" href="/church/members">View members →</Link>} title="Recurring members" />
              <div className="mt-4 divide-y divide-[var(--line)]">
                {demoRecurringGifts.map((gift) => {
                  const member = demoMembers.find((item) => item.id === gift.memberId);
                  return (
                    <div className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0" key={gift.id}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-[10px] font-bold text-[var(--sage-dark)]">{member?.firstName[0]}{member?.lastName[0]}</span>
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{member?.firstName} {member?.lastName}</p><p className="mt-1 text-[9px] capitalize text-[var(--muted)]">{gift.paymentMethod.brand} {gift.paymentMethod.last4}</p></div>
                      <p className="text-right text-[10px] font-bold">{formatMoney(gift.amount)}<span className="mt-0.5 block text-[8px] font-medium text-[var(--muted)]">/{gift.frequency === "weekly" ? "week" : "month"}</span></p>
                    </div>
                  );
                })}
              </div>
              </section>
            ) : null}

            {visibility.providerStatus ? (
              <section className="rounded-[22px] bg-[var(--ink)] p-5 text-white" id="settings">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-white/[0.08] text-[#b9d7cb]"><SettingsIcon size={19} /></span><div><p className="text-xs font-bold">Payment connection</p><p className="mt-1 text-[9px] text-white/45">Pilot adapter</p></div></div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/[0.06] p-3"><div><p className="text-[9px] uppercase tracking-wider text-white/45">Current mode</p><p className="mt-1 text-[10px] font-bold">Mock · no live settlement</p></div><span className="size-2 rounded-full bg-[var(--gold)]" /></div>
              <p className="mt-4 text-[9px] leading-4 text-white/45">Live gateway activation remains locked until the approved Barbados provider and sandbox credentials are supplied.</p>
              {visibility.providerSettingsLink ? <Link className="mt-4 inline-flex text-[10px] font-bold text-[#b9d7cb]" href="/church/settings">Open settings →</Link> : null}
              </section>
            ) : null}

            {visibility.fundMix ? (
              <section className="soft-card rounded-[22px] p-5">
              <SectionHeader title={visibility.financialSummary ? "Fund mix" : "Giving funds"} />
              {visibility.financialSummary ? (
                <div className="mt-4 space-y-4">
                  {demoFundBreakdown.map((fund, index) => <div key={fund.fundId}><div className="flex justify-between text-[10px]"><span className="font-bold">{fund.fundName}</span><span className="text-[var(--muted)]">{fund.percentage}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ece9e1]"><div className={index === 0 ? "h-full bg-[var(--sage)]" : index === 1 ? "h-full bg-[var(--gold)]" : "h-full bg-[#7294ad]"} style={{ width: `${fund.percentage}%` }} /></div></div>)}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {demoFunds.map((fund) => <div className="rounded-xl bg-[#f3f1eb] px-3 py-2.5" key={fund.id}><p className="text-[10px] font-bold">{fund.name}</p><p className="mt-1 line-clamp-1 text-[9px] text-[var(--muted)]">{fund.description}</p></div>)}
                </div>
              )}
              </section>
            ) : null}
          </aside>
        </div>
    </div>
  );
}

type OverviewGivingQr =
  | Readonly<{
      state: "enabled";
      appUrl: string;
      churchSlug: string;
      url: string;
    }>
  | Readonly<{ state: "inactive"; message: string }>
  | Readonly<{ state: "unavailable" }>;

async function loadOverviewGivingQr(
  churchId: string,
  churchStatus: "onboarding" | "active",
): Promise<OverviewGivingQr> {
  try {
    const supabase = await createServerSupabaseClient();
    const result = await getChurchQrSnapshot(supabase, churchId);
    if (!result.ok) return { state: "unavailable" };

    if (churchStatus !== "active") {
      return {
        state: "inactive",
        message:
          "The stable QR is reserved, but its public resolver remains unavailable until church activation.",
      };
    }
    if (!result.snapshot.isActive) {
      return {
        state: "inactive",
        message: "The permanent QR resolver is currently inactive.",
      };
    }

    const appUrl = getPublicAppUrl();
    const url = createPublicQrUrl(appUrl, result.snapshot.shortCode);
    if (!url) return { state: "unavailable" };

    return {
      state: "enabled",
      appUrl,
      churchSlug: result.snapshot.churchSlug,
      url,
    };
  } catch {
    return { state: "unavailable" };
  }
}
