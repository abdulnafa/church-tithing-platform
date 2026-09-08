import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { ArrowRightIcon, CalendarIcon, CardIcon, DownloadIcon, HeartIcon } from "@/components/icons";
import { requireMemberWorkspace } from "@/lib/auth/guards";
import { createShellIdentity } from "@/lib/auth/workspaces";
import { demoDonations, demoFunds, demoRecurringGifts, formatDate, formatGivingFrequency, formatMoney } from "@/lib";

export const metadata: Metadata = {
  title: "Member dashboard",
};

export default async function MemberDashboardPage() {
  const { identity, workspace } = await requireMemberWorkspace();
  const shellIdentity = createShellIdentity(identity, workspace);
  const memberDonations = demoDonations.filter((donation) => donation.donor.memberId === "member_alicia");
  const recurring = demoRecurringGifts[0];
  const recurringFund = demoFunds.find((fund) => fund.id === recurring.fundId);

  return (
    <div className="mx-auto max-w-6xl pb-24">
        <div className="mb-7 lg:hidden"><p className="text-xs text-[var(--muted)]">Welcome, {shellIdentity.displayName}</p><h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Your giving</h1></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<HeartIcon size={19} />} label="Given this year" note="Across 24 gifts" value="BBD $4,850.00" />
          <StatCard icon={<CalendarIcon size={19} />} label="Active recurring" note="Next gift 23 Aug" tone="gold" value="1" />
          <StatCard icon={<HeartIcon size={19} />} label="Funds supported" note="Tithes and 2 campaigns" tone="blue" value="3" />
          <StatCard icon={<DownloadIcon size={19} />} label="2025 statement" note="Demo statement layout" tone="coral" value="Preview" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.18fr_.82fr]">
          <section className="soft-card rounded-[22px] p-5 sm:p-6" id="history">
            <SectionHeader action={<span className="text-[10px] font-bold text-[var(--muted)]">Latest activity</span>} eyebrow="Recent activity" title="Giving history" />
            <div className="mt-5 divide-y divide-[var(--line)]">
              {memberDonations.map((donation) => {
                const fund = demoFunds.find((item) => item.id === donation.fundId);
                return (
                  <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0" key={donation.id}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--sage-pale)] text-[var(--sage)]"><HeartIcon size={18} /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{fund?.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{formatDate(donation.createdAt)} | {formatGivingFrequency(donation.frequency)}</p></div>
                    <div className="text-right"><p className="text-sm font-bold">{formatMoney(donation.amount)}</p><span className="mt-1 inline-block rounded-full bg-[var(--sage-pale)] px-2 py-0.5 text-[8px] font-bold uppercase text-[var(--sage-dark)]">Received</span></div>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--gold-pale)] text-[#a97722]"><HeartIcon size={18} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">Community Care Centre</p><p className="mt-1 text-[10px] text-[var(--muted)]">2 Aug 2026 | One-time</p></div>
                <div className="text-right"><p className="text-sm font-bold">BBD $150.00</p><span className="mt-1 inline-block rounded-full bg-[var(--sage-pale)] px-2 py-0.5 text-[8px] font-bold uppercase text-[var(--sage-dark)]">Received</span></div>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-[22px] bg-[var(--ink)] p-5 text-white sm:p-6" id="recurring">
              <div className="flex items-start justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#a9cfc1]">Recurring gift</p><h2 className="mt-2 text-base font-bold">{recurringFund?.name}</h2></div><span className="rounded-full bg-[#83b8a4]/20 px-2.5 py-1 text-[9px] font-bold text-[#b9d7cb]">Active</span></div>
              <p className="font-display mt-6 text-4xl tracking-[-0.04em]">{formatMoney(recurring.amount)}</p>
              <p className="mt-1 text-xs text-white/50">Every week | Next on {recurring.nextChargeAt ? formatDate(recurring.nextChargeAt) : "—"}</p>
              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3"><CardIcon className="text-white/55" size={19} /><div><p className="text-[10px] font-bold">{recurring.paymentMethod.brand} ending {recurring.paymentMethod.last4}</p><p className="mt-0.5 text-[9px] text-white/40">Expires {recurring.paymentMethod.expiryMonth}/{recurring.paymentMethod.expiryYear}</p></div></div>
              <div className="mt-5 grid grid-cols-2 gap-2"><button className="cursor-not-allowed rounded-full bg-white px-4 py-2.5 text-[10px] font-bold text-[var(--ink)] opacity-55" disabled title="Recurring gift management is coming soon">Manage | Soon</button><button className="cursor-not-allowed rounded-full border border-white/15 px-4 py-2.5 text-[10px] font-bold text-white/55" disabled title="Recurring gift controls are coming soon">Pause | Soon</button></div>
            </section>

            <section className="soft-card rounded-[22px] p-5" id="payments">
              <SectionHeader title="Payment method" />
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f0eee8] p-4"><span className="grid size-10 place-items-center rounded-xl bg-white text-[var(--sage)]"><CardIcon size={18} /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold">Visa ending 4242</p><p className="mt-1 text-[9px] text-[var(--muted)]">Demo card | Expires 09/2029</p></div><button className="cursor-not-allowed text-[9px] font-bold text-[var(--muted)] opacity-70" disabled title="Payment method management is coming soon">Demo only</button></div>
            </section>

            <section className="soft-card rounded-[22px] p-5" id="statements">
              <SectionHeader title="Annual statement" />
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Preview the annual statement layout. PDF generation is coming soon.</p>
              <button className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-4 py-3 text-[10px] font-bold opacity-55" disabled title="PDF generation is coming soon"><DownloadIcon size={15} /> PDF coming soon</button>
            </section>
          </div>
        </div>

        <section className="soft-card mt-6 flex flex-col gap-4 rounded-[22px] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" id="profile"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">Personal details</p><p className="mt-2 text-sm font-bold">{shellIdentity.displayName}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Signed-in profile | Contact editing is coming in a later phase</p></div><button className="cursor-not-allowed rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[10px] font-bold opacity-55" disabled title="Profile editing is coming soon">Edit profile | Soon</button></section>

        <Link className="mt-6 flex items-center justify-between rounded-[22px] bg-[var(--sage)] p-5 text-white sm:p-6" href={`/give/${workspace.churchSlug}`}><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Make an impact</p><p className="mt-2 text-base font-bold">Give again to {workspace.displayName}</p></div><span className="grid size-10 place-items-center rounded-full bg-white !text-[#155247]"><ArrowRightIcon size={18} /></span></Link>
    </div>
  );
}
