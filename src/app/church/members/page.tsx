import type { Metadata } from "next";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { CalendarIcon, CardIcon, CheckIcon, HeartIcon, UsersIcon } from "@/components/icons";
import {
  demoDonations,
  demoMembers,
  demoRecurringGifts,
  formatDate,
  formatGivingFrequency,
  formatMoney,
} from "@/lib";

export const metadata: Metadata = {
  title: "Church members",
  description: "View Harbour Grace Church members and their recurring giving status.",
};

export default function ChurchMembersPage() {
  const verifiedMembers = demoMembers.filter((member) => member.emailVerifiedAt !== null).length;
  const recurringMemberIds = new Set(demoRecurringGifts.map((gift) => gift.memberId));
  const guestDonors = new Set(
    demoDonations
      .filter((donation) => donation.donor.memberId === null)
      .map((donation) => donation.donor.email),
  ).size;

  return (
    <main className="mx-auto max-w-[1320px] pb-24">
        <header className="mb-6 lg:hidden">
          <p className="text-xs font-semibold text-[var(--sage)]">Church community</p>
          <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Members</h1>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">
            Review verified profiles, giving history and recurring-plan details in one place.
          </p>
        </header>

        <section aria-label="Member summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<UsersIcon size={19} />}
            label="Registered members"
            note="Demo church profiles"
            value={String(demoMembers.length)}
          />
          <StatCard
            icon={<CheckIcon size={19} />}
            label="Verified profiles"
            note="Email address confirmed"
            tone="blue"
            value={String(verifiedMembers)}
          />
          <StatCard
            icon={<CalendarIcon size={19} />}
            label="Recurring members"
            note="Active weekly or monthly plans"
            tone="gold"
            value={String(recurringMemberIds.size)}
          />
          <StatCard
            icon={<HeartIcon size={19} />}
            label="Guest donors"
            note="Gave without an account"
            tone="coral"
            value={String(guestDonors)}
          />
        </section>

        <section className="soft-card mt-6 rounded-[22px] p-5 sm:p-6">
          <SectionHeader eyebrow="Directory" title="All members" />
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
            Giving totals below use the seeded transactions currently available in this demo workspace.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {demoMembers.map((member) => {
              const memberDonations = demoDonations.filter(
                (donation) => donation.donor.memberId === member.id,
              );
              const totalGiving = memberDonations.reduce(
                (total, donation) => total + donation.amount.amountMinor,
                0,
              );
              const recurringGift = demoRecurringGifts.find(
                (gift) => gift.memberId === member.id,
              );

              return (
                <article className="rounded-[20px] border border-[var(--line)] bg-white p-4 sm:p-5" key={member.id}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-xs font-bold text-[var(--sage-dark)]">
                      {member.firstName[0]}{member.lastName[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="truncate text-sm font-bold">{member.firstName} {member.lastName}</h2>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sage-pale)] px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--sage-dark)]">
                          <CheckIcon size={11} /> Verified
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{member.email}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">Joined {formatDate(member.joinedAt)}</p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4">
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Demo giving</dt>
                      <dd className="mt-1 text-xs font-bold">{formatMoney({ amountMinor: totalGiving, currency: "BBD" })}</dd>
                      <p className="mt-0.5 text-[9px] text-[var(--muted)]">{memberDonations.length} {memberDonations.length === 1 ? "gift" : "gifts"}</p>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Recurring plan</dt>
                      {recurringGift ? (
                        <>
                          <dd className="mt-1 text-xs font-bold">{formatMoney(recurringGift.amount)}</dd>
                          <p className="mt-0.5 text-[9px] text-[var(--muted)]">{formatGivingFrequency(recurringGift.frequency)}</p>
                        </>
                      ) : (
                        <dd className="mt-1 text-xs font-semibold text-[var(--muted)]">No active plan</dd>
                      )}
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="soft-card rounded-[22px] p-5 sm:p-6">
            <SectionHeader eyebrow="Recurring giving" title="Active plans" />
            <div className="mt-5 divide-y divide-[var(--line)]">
              {demoRecurringGifts.map((gift) => {
                const member = demoMembers.find((item) => item.id === gift.memberId);
                return (
                  <article className="grid gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={gift.id}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--gold-pale)] text-[#9b6b1d]"><CardIcon size={17} /></span>
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-bold">{member?.firstName} {member?.lastName}</h3>
                        <p className="mt-1 text-[9px] text-[var(--muted)]">{gift.paymentMethod.brand} ending {gift.paymentMethod.last4}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold">{formatMoney(gift.amount)}</p>
                      <p className="mt-1 text-[9px] text-[var(--muted)]">{formatGivingFrequency(gift.frequency)}</p>
                    </div>
                    <div className="sm:text-right">
                      <span className="rounded-full bg-[var(--sage-pale)] px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--sage-dark)]">Active</span>
                      <p className="mt-2 text-[9px] text-[var(--muted)]">Next {gift.nextChargeAt ? formatDate(gift.nextChargeAt) : "not scheduled"}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="rounded-[22px] bg-[var(--ink)] p-5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b9d7cb]">Member privacy</p>
            <h2 className="mt-1 text-base font-bold">Safe account view</h2>
            <p className="mt-3 text-[10px] leading-5 text-white/60">
              Church staff can see donor contact details, giving records and card brand with the last four digits only. Full card information is never stored here.
            </p>
            <dl className="mt-5 divide-y divide-white/10 rounded-2xl bg-white/[0.06] px-4">
              <div className="flex justify-between gap-4 py-3 text-[10px]"><dt className="text-white/55">Verified accounts</dt><dd className="font-bold">{verifiedMembers}</dd></div>
              <div className="flex justify-between gap-4 py-3 text-[10px]"><dt className="text-white/55">Active plans</dt><dd className="font-bold">{demoRecurringGifts.length}</dd></div>
              <div className="flex justify-between gap-4 py-3 text-[10px]"><dt className="text-white/55">Stored full card data</dt><dd className="font-bold text-[#b9d7cb]">None</dd></div>
            </dl>
          </aside>
        </div>
    </main>
  );
}
