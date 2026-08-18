import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { ArrowRightIcon, CalendarIcon, ChartIcon, HeartIcon, UsersIcon } from "@/components/icons";
import {
  calculateProgress,
  demoCampaigns,
  demoChurch,
  demoDonations,
  demoFunds,
  formatDate,
  formatMoney,
  formatPercentage,
} from "@/lib";

export const metadata: Metadata = {
  title: "Church funds & campaigns",
  description: "Track Harbour Grace Church giving funds and active campaign progress.",
};

export default function ChurchCampaignsPage() {
  const combinedRaised = demoCampaigns.reduce(
    (total, campaign) => total + campaign.raised.amountMinor,
    0,
  );
  const combinedGoal = demoCampaigns.reduce(
    (total, campaign) => total + campaign.goal.amountMinor,
    0,
  );
  const campaignDonors = new Set(
    demoDonations
      .filter((donation) => donation.campaignId !== null)
      .map((donation) => donation.donor.email),
  ).size;

  return (
    <main className="mx-auto max-w-[1320px] pb-24">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:hidden">
          <div>
            <p className="text-xs font-semibold text-[var(--sage)]">Giving destinations</p>
            <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Funds & campaigns</h1>
            <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">Review each fund and see exactly how active campaigns are progressing.</p>
          </div>
          <Link className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-xs font-bold text-white" href={`/give/${demoChurch.slug}`}>
            Preview giving page <ArrowRightIcon size={15} />
          </Link>
        </header>

        <section aria-label="Campaign summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<HeartIcon size={19} />}
            label="Active campaigns"
            note="Open for demo giving"
            value={String(demoCampaigns.filter((campaign) => campaign.status === "active").length)}
          />
          <StatCard
            icon={<ChartIcon size={19} />}
            label="Campaign giving"
            note={`${formatPercentage((combinedRaised / combinedGoal) * 100)} of combined goal`}
            tone="blue"
            value={formatMoney({ amountMinor: combinedRaised, currency: "BBD" })}
          />
          <StatCard
            icon={<CalendarIcon size={19} />}
            label="Combined goal"
            note="Across active campaigns"
            tone="gold"
            value={formatMoney({ amountMinor: combinedGoal, currency: "BBD" })}
          />
          <StatCard
            icon={<UsersIcon size={19} />}
            label="Campaign donors"
            note="Visible in seeded transactions"
            tone="coral"
            value={String(campaignDonors)}
          />
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">Campaign performance</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight">Active campaigns</h2>
            </div>
            <Link className="focus-ring hidden items-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[10px] font-bold text-[var(--ink)] shadow-sm lg:inline-flex" href={`/give/${demoChurch.slug}`}>
              Preview donor experience <ArrowRightIcon size={14} />
            </Link>
          </div>

          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            {demoCampaigns.map((campaign, index) => {
              const progress = calculateProgress(campaign.raised, campaign.goal);
              const fund = demoFunds.find((item) => item.id === campaign.fundId);
              const campaignGiftCount = demoDonations.filter(
                (donation) => donation.campaignId === campaign.id,
              ).length;

              return (
                <article className="soft-card overflow-hidden rounded-[24px]" key={campaign.id}>
                  <div className={`relative overflow-hidden p-5 sm:p-6 ${index === 0 ? "bg-[var(--sage-pale)]" : "bg-[var(--gold-pale)]"}`}>
                    <div className="absolute -right-10 -top-12 size-40 rounded-full border-[24px] border-white/35" />
                    <div className="relative flex items-start justify-between gap-4">
                      <span className={`grid size-12 place-items-center rounded-2xl ${index === 0 ? "bg-[var(--sage)] text-white" : "bg-[var(--gold)] text-[var(--ink)]"}`}><HeartIcon size={20} /></span>
                      <span className="rounded-full bg-white/80 px-3 py-1.5 text-[8px] font-bold uppercase tracking-wider text-[var(--sage-dark)]">{campaign.status}</span>
                    </div>
                    <h3 className="relative mt-6 text-lg font-bold tracking-tight">{campaign.name}</h3>
                    <p className="relative mt-2 max-w-xl text-xs leading-5 text-[var(--ink-soft)]">{campaign.description}</p>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Raised</p>
                        <p className="mt-1 text-xl font-bold tracking-tight">{formatMoney(campaign.raised)}</p>
                      </div>
                      <p className="text-right text-[10px] text-[var(--muted)]">Goal <strong className="block text-xs text-[var(--ink)]">{formatMoney(campaign.goal)}</strong></p>
                    </div>
                    <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[#ece9e1]" role="progressbar" aria-label={`${campaign.name} funding progress`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(progress)}>
                      <div className={`h-full rounded-full ${index === 0 ? "bg-[var(--sage)]" : "bg-[var(--gold)]"}`} style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <strong>{formatPercentage(progress)} funded</strong>
                      <span className="text-[var(--muted)]">{campaignGiftCount} demo {campaignGiftCount === 1 ? "gift" : "gifts"}</span>
                    </div>

                    <dl className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-3">
                      <div><dt className="text-[9px] uppercase tracking-wider text-[var(--muted)]">Fund</dt><dd className="mt-1 text-[10px] font-bold">{fund?.name}</dd></div>
                      <div><dt className="text-[9px] uppercase tracking-wider text-[var(--muted)]">Started</dt><dd className="mt-1 text-[10px] font-bold">{formatDate(campaign.startsAt)}</dd></div>
                      <div><dt className="text-[9px] uppercase tracking-wider text-[var(--muted)]">Ends</dt><dd className="mt-1 text-[10px] font-bold">{campaign.endsAt ? formatDate(campaign.endsAt) : "No end date"}</dd></div>
                    </dl>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="soft-card mt-6 rounded-[22px] p-5 sm:p-6">
          <SectionHeader eyebrow="Giving categories" title="All funds" />
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">These categories appear on the church&apos;s public giving page in display order.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {demoFunds.map((fund) => {
              const fundTotal = demoDonations
                .filter((donation) => donation.fundId === fund.id)
                .reduce((total, donation) => total + donation.amount.amountMinor, 0);
              const linkedCampaigns = demoCampaigns.filter((campaign) => campaign.fundId === fund.id).length;

              return (
                <article className="rounded-[18px] border border-[var(--line)] bg-white p-4" key={fund.id}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--sage-pale)] text-[var(--sage-dark)]"><HeartIcon size={16} /></span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {fund.isDefault && <span className="rounded-full bg-[var(--gold-pale)] px-2 py-1 text-[7px] font-bold uppercase tracking-wider text-[#8a641f]">Default</span>}
                      <span className="rounded-full bg-[var(--sage-pale)] px-2 py-1 text-[7px] font-bold uppercase tracking-wider text-[var(--sage-dark)]">Active</span>
                    </div>
                  </div>
                  <h3 className="mt-4 text-xs font-bold">{fund.name}</h3>
                  <p className="mt-2 min-h-10 text-[10px] leading-5 text-[var(--muted)]">{fund.description}</p>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
                    <div><p className="text-[8px] uppercase tracking-wider text-[var(--muted)]">Demo giving</p><p className="mt-1 text-[10px] font-bold">{formatMoney({ amountMinor: fundTotal, currency: "BBD" })}</p></div>
                    <p className="text-right text-[9px] text-[var(--muted)]">{linkedCampaigns} linked {linkedCampaigns === 1 ? "campaign" : "campaigns"}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
    </main>
  );
}
