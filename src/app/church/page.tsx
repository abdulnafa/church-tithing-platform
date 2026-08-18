import Link from "next/link";
import { ChurchTransactions } from "@/components/church-transactions";
import { DashboardShell, SectionHeader, StatCard } from "@/components/dashboard-shell";
import { GivingQr } from "@/components/giving-qr";
import { ArrowRightIcon, CalendarIcon, CardIcon, CheckIcon, HeartIcon, SettingsIcon, UsersIcon } from "@/components/icons";
import {
  calculateProgress,
  demoCampaigns,
  demoChurch,
  demoDonations,
  demoFundBreakdown,
  demoFunds,
  demoGivingSummary,
  demoGivingTrend,
  demoMembers,
  demoQrCode,
  demoRecurringGifts,
  formatMoney,
  formatPercentage,
} from "@/lib";

export default function ChurchDashboardPage() {
  const maximumTrend = Math.max(...demoGivingTrend.map((point) => point.total.amountMinor));
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const givingUrl = `${appUrl}/q/${demoQrCode}`;
  const netGiving = demoDonations.reduce((sum, donation) => sum + donation.netAmount.amountMinor, 0);

  return (
    <DashboardShell kind="church" subtitle="Harbour Grace Church · 11–17 August 2026" title="Church overview">
      <div className="mx-auto max-w-[1320px] pb-24">
        <div className="mb-6 flex flex-col gap-4 lg:hidden">
          <div><p className="text-xs text-[var(--muted)]">Good morning, Miriam</p><h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Church overview</h1></div>
        </div>

        <section className="mb-6 flex flex-col gap-4 overflow-hidden rounded-[22px] bg-[var(--ink)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#2f796b] text-white"><CheckIcon size={19} /></span>
            <div><p className="text-sm font-bold">Giving-page preview is ready</p><p className="mt-1 max-w-2xl text-xs leading-5 text-white/55">This workspace uses demo data. Live checkout stays locked until the church&apos;s Barbados merchant connection is verified.</p></div>
          </div>
          <Link className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold !text-[#122235]" href={`/give/${demoChurch.slug}`}>Preview giving page <ArrowRightIcon size={15} /></Link>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<HeartIcon size={19} />} label="Demo giving this week" note="Seeded preview data" value={formatMoney(demoGivingSummary.total)} />
          <StatCard icon={<CardIcon size={19} />} label="Demo donations" note={`${demoGivingSummary.uniqueDonorCount} unique donors`} tone="blue" value={String(demoGivingSummary.transactionCount)} />
          <StatCard icon={<CalendarIcon size={19} />} label="Demo recurring gifts" note="Weekly and monthly plans" tone="gold" value={String(demoGivingSummary.activeRecurringCount)} />
          <StatCard icon={<UsersIcon size={19} />} label="Registered members" note="Verified demo profiles" tone="coral" value={String(demoMembers.length)} />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="min-w-0 space-y-6">
            <section className="soft-card rounded-[22px] p-5 sm:p-6" id="reports">
              <SectionHeader
                action={<button className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[9px] font-bold">Last 6 weeks</button>}
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

            <section className="soft-card rounded-[22px] p-5 sm:p-6" id="transactions">
              <SectionHeader eyebrow="Bookkeeping" title="Recent transactions" />
              <ChurchTransactions donations={demoDonations} funds={demoFunds} />
            </section>

            <section className="soft-card rounded-[22px] p-5 sm:p-6" id="campaigns">
              <SectionHeader
                action={<button className="text-[10px] font-bold text-[var(--sage)]">+ New campaign</button>}
                eyebrow="Funds & campaigns"
                title="Active campaigns"
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {demoCampaigns.map((campaign, index) => {
                  const progress = calculateProgress(campaign.raised, campaign.goal);
                  return (
                    <article className={`rounded-[20px] border p-5 ${index === 0 ? "border-[#c7dbd3] bg-[var(--sage-pale)]/55" : "border-[var(--line)] bg-white"}`} key={campaign.id}>
                      <div className="flex items-center justify-between gap-3"><span className={`grid size-10 place-items-center rounded-2xl ${index === 0 ? "bg-[var(--sage)] text-white" : "bg-[var(--gold-pale)] text-[#a97722]"}`}><HeartIcon size={18} /></span><span className="rounded-full bg-white px-2.5 py-1 text-[8px] font-bold uppercase text-[var(--sage-dark)]">Active</span></div>
                      <h3 className="mt-5 text-sm font-bold">{campaign.name}</h3>
                      <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-[var(--muted)]">{campaign.description}</p>
                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white"><div className={index === 0 ? "h-full rounded-full bg-[var(--sage)]" : "h-full rounded-full bg-[var(--gold)]"} style={{ width: `${progress}%` }} /></div>
                      <div className="mt-2 flex items-center justify-between text-[9px]"><strong>{formatMoney(campaign.raised)}</strong><span className="text-[var(--muted)]">{formatPercentage(progress)} of goal</span></div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="soft-card rounded-[22px] p-5 sm:p-6" id="qr">
              <SectionHeader eyebrow="Sunday ready" title="Giving QR code" />
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">One permanent code for your giving homepage. Download it for screens and print.</p>
              <div className="mt-5 rounded-[22px] bg-[#eeece5] p-5 text-center">
                <GivingQr churchName={demoChurch.name} value={givingUrl} />
              </div>
              <p className="mt-3 break-all text-center text-[9px] text-[var(--muted)]">{givingUrl}</p>
              {appUrl.includes("localhost") && <p className="mt-2 rounded-xl bg-[var(--gold-pale)] px-3 py-2 text-center text-[9px] leading-4 text-[#8a641f]">Local preview QR. Set NEXT_PUBLIC_APP_URL to the approved public domain before printing.</p>}
            </section>

            <section className="soft-card rounded-[22px] p-5" id="members">
              <SectionHeader action={<button className="text-[9px] font-bold text-[var(--sage)]">View all</button>} title="Recurring members" />
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

            <section className="rounded-[22px] bg-[var(--ink)] p-5 text-white" id="settings">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-white/[0.08] text-[#b9d7cb]"><SettingsIcon size={19} /></span><div><p className="text-xs font-bold">Payment connection</p><p className="mt-1 text-[9px] text-white/45">Pilot adapter</p></div></div>
              <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/[0.06] p-3"><div><p className="text-[9px] uppercase tracking-wider text-white/45">Current mode</p><p className="mt-1 text-[10px] font-bold">Mock · no live settlement</p></div><span className="size-2 rounded-full bg-[var(--gold)]" /></div>
              <p className="mt-4 text-[9px] leading-4 text-white/45">Live gateway activation remains locked until the approved Barbados provider and sandbox credentials are supplied.</p>
            </section>

            <section className="soft-card rounded-[22px] p-5">
              <SectionHeader title="Fund mix" />
              <div className="mt-4 space-y-4">
                {demoFundBreakdown.map((fund, index) => <div key={fund.fundId}><div className="flex justify-between text-[10px]"><span className="font-bold">{fund.fundName}</span><span className="text-[var(--muted)]">{fund.percentage}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ece9e1]"><div className={index === 0 ? "h-full bg-[var(--sage)]" : index === 1 ? "h-full bg-[var(--gold)]" : "h-full bg-[#7294ad]"} style={{ width: `${fund.percentage}%` }} /></div></div>)}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
