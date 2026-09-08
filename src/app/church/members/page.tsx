import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  ChurchStaffManager,
  type ChurchStaffManagerRequestIds,
  type ChurchStaffManagerSnapshot,
} from "@/components/church-staff-manager";
import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import {
  CalendarIcon,
  CardIcon,
  CheckIcon,
  HeartIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";
import { requireAnyChurchPermission } from "@/lib/auth/guards";
import { hasChurchPermission } from "@/lib/auth/permissions";
import type { ChurchStaffMember } from "@/lib/church-staff";
import { getChurchStaff } from "@/lib/church-staff-dal";
import {
  demoDonations,
  demoMembers,
  demoRecurringGifts,
  formatDate,
  formatGivingFrequency,
  formatMoney,
} from "@/lib";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church members & staff",
  description:
    "Manage saved church staff access and review clearly labelled demo member activity.",
};

export default async function ChurchMembersPage() {
  const { workspace } = await requireAnyChurchPermission([
    "members_read",
    "staff_manage",
  ]);
  const canReadMembers = hasChurchPermission(
    workspace.permissions,
    "members_read",
  );
  const canManageStaff = hasChurchPermission(
    workspace.permissions,
    "staff_manage",
  );
  let staffManager: ReactNode = null;

  if (canManageStaff) {
    const supabase = await createServerSupabaseClient();
    const result = await getChurchStaff(supabase, workspace.churchId);
    if (!result.ok) {
      throw new Error("Church staff management is temporarily unavailable.");
    }

    staffManager = (
      <ChurchStaffManager
        key={`${workspace.churchId}:${result.snapshot.staffRevision}`}
        requestIds={createStaffRequestIds(result.snapshot.staff)}
        snapshot={createStaffManagerSnapshot(result.snapshot)}
      />
    );
  }

  return (
    <main
      className="mx-auto min-w-0 max-w-[1320px] space-y-6 pb-24"
      key={workspace.churchId}
    >
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
            Church community
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
            Members & staff
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {canManageStaff
              ? "Manage saved staff access for this church. Donor-member information remains clearly labelled as demo data until its persisted-data phase."
              : "Review the clearly labelled demo member activity available to your current role."}
          </p>
        </div>
        {canManageStaff ? (
          <p className="flex max-w-sm items-start gap-2 rounded-2xl bg-[var(--sage-pale)] px-4 py-3 text-[10px] leading-5 text-[var(--sage-dark)]">
            <ShieldIcon className="mt-0.5 shrink-0" size={14} />
            Staff data is tenant-scoped, and every invitation, role change, or
            removal rechecks staff-management permission on the server.
          </p>
        ) : null}
      </header>

      {staffManager}

      {canReadMembers ? <DemoMemberActivity /> : null}
    </main>
  );
}

function createStaffManagerSnapshot(
  snapshot: Readonly<{
    staffRevision: number;
    staff: readonly ChurchStaffMember[];
  }>,
): ChurchStaffManagerSnapshot {
  return {
    staffRevision: snapshot.staffRevision,
    staff: snapshot.staff.map((member) => ({
      membershipId: member.membershipId,
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      status: member.status,
      accessEnabled: member.accessEnabled,
      invitedAt: member.invitedAt,
      acceptedAt: member.acceptedAt,
      revokedAt: member.revokedAt,
      isCurrent: member.isCurrent,
    })),
  };
}

function createStaffRequestIds(
  staff: readonly ChurchStaffMember[],
): ChurchStaffManagerRequestIds {
  return {
    invite: randomUUID(),
    staff: staff.flatMap((member) => {
      if (
        member.role === "owner" ||
        member.isCurrent ||
        member.status === "revoked"
      ) {
        return [];
      }

      return [
        {
          membershipId: member.membershipId,
          changeRole:
            member.status === "active" || member.status === "invited"
              ? randomUUID()
              : null,
          remove: randomUUID(),
        },
      ];
    }),
  };
}

function DemoMemberActivity() {
  const verifiedMembers = demoMembers.filter(
    (member) => member.emailVerifiedAt !== null,
  ).length;
  const recurringMemberIds = new Set(
    demoRecurringGifts.map((gift) => gift.memberId),
  );
  const guestDonors = new Set(
    demoDonations
      .filter((donation) => donation.donor.memberId === null)
      .map((donation) => donation.donor.email),
  ).size;

  return (
    <section aria-labelledby="demo-member-activity-heading" className="space-y-6">
      <div
        className="rounded-2xl border border-[#ead8ad] bg-[var(--gold-pale)] px-4 py-3 text-xs leading-5 text-[#79581f]"
        role="note"
      >
        <strong id="demo-member-activity-heading">Demo member activity:</strong>{" "}
        The directory, giving totals, recurring plans, and guest counts below
        are shared examples. They are not persisted records for this church.
      </div>

      <section aria-label="Demo member summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<UsersIcon size={19} />}
          label="Demo registered members"
          note="Shared example profiles"
          value={String(demoMembers.length)}
        />
        <StatCard
          icon={<CheckIcon size={19} />}
          label="Demo verified profiles"
          note="Example email confirmations"
          tone="blue"
          value={String(verifiedMembers)}
        />
        <StatCard
          icon={<CalendarIcon size={19} />}
          label="Demo recurring members"
          note="Example weekly or monthly plans"
          tone="gold"
          value={String(recurringMemberIds.size)}
        />
        <StatCard
          icon={<HeartIcon size={19} />}
          label="Demo guest donors"
          note="Example gifts without accounts"
          tone="coral"
          value={String(guestDonors)}
        />
      </section>

      <section className="soft-card rounded-[22px] p-5 sm:p-6">
        <SectionHeader eyebrow="Demo directory" title="Example members" />
        <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
          Giving totals below use shared seeded examples and are not live or
          tenant-scoped member records.
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
              <article
                className="min-w-0 rounded-[20px] border border-[var(--line)] bg-white p-4 sm:p-5"
                key={member.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-xs font-bold text-[var(--sage-dark)]">
                    {member.firstName[0]}
                    {member.lastName[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold [overflow-wrap:anywhere]">
                        {member.firstName} {member.lastName}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sage-pale)] px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--sage-dark)]">
                        <CheckIcon size={11} /> Demo verified
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--muted)] [overflow-wrap:anywhere]">
                      {member.email}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      Demo joined {formatDate(member.joinedAt)}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4">
                  <div>
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      Demo giving
                    </dt>
                    <dd className="mt-1 text-xs font-bold">
                      {formatMoney({
                        amountMinor: totalGiving,
                        currency: "BBD",
                      })}
                    </dd>
                    <p className="mt-0.5 text-[9px] text-[var(--muted)]">
                      {memberDonations.length}{" "}
                      {memberDonations.length === 1 ? "gift" : "gifts"}
                    </p>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      Demo recurring plan
                    </dt>
                    {recurringGift ? (
                      <>
                        <dd className="mt-1 text-xs font-bold">
                          {formatMoney(recurringGift.amount)}
                        </dd>
                        <p className="mt-0.5 text-[9px] text-[var(--muted)]">
                          {formatGivingFrequency(recurringGift.frequency)}
                        </p>
                      </>
                    ) : (
                      <dd className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        No example plan
                      </dd>
                    )}
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="soft-card min-w-0 rounded-[22px] p-5 sm:p-6">
          <SectionHeader
            eyebrow="Demo recurring giving"
            title="Example active plans"
          />
          <div className="mt-5 divide-y divide-[var(--line)]">
            {demoRecurringGifts.map((gift) => {
              const member = demoMembers.find(
                (item) => item.id === gift.memberId,
              );
              return (
                <article
                  className="grid min-w-0 gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  key={gift.id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--gold-pale)] text-[#9b6b1d]">
                      <CardIcon size={17} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold [overflow-wrap:anywhere]">
                        {member?.firstName} {member?.lastName}
                      </h3>
                      <p className="mt-1 text-[9px] text-[var(--muted)]">
                        Example {gift.paymentMethod.brand} ending{" "}
                        {gift.paymentMethod.last4}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold">
                      {formatMoney(gift.amount)}
                    </p>
                    <p className="mt-1 text-[9px] text-[var(--muted)]">
                      {formatGivingFrequency(gift.frequency)}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <span className="rounded-full bg-[var(--sage-pale)] px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--sage-dark)]">
                      Demo active
                    </span>
                    <p className="mt-2 text-[9px] text-[var(--muted)]">
                      Example next{" "}
                      {gift.nextChargeAt
                        ? formatDate(gift.nextChargeAt)
                        : "not scheduled"}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="rounded-[22px] bg-[var(--ink)] p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b9d7cb]">
            Demo privacy preview
          </p>
          <h2 className="mt-1 text-base font-bold">Example safe account view</h2>
          <p className="mt-3 text-[10px] leading-5 text-white/60">
            These examples show contact details, giving records, and card brand
            with last four digits only. Full card information is never stored
            here.
          </p>
          <dl className="mt-5 divide-y divide-white/10 rounded-2xl bg-white/[0.06] px-4">
            <div className="flex justify-between gap-4 py-3 text-[10px]">
              <dt className="text-white/55">Demo verified accounts</dt>
              <dd className="font-bold">{verifiedMembers}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3 text-[10px]">
              <dt className="text-white/55">Demo active plans</dt>
              <dd className="font-bold">{demoRecurringGifts.length}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3 text-[10px]">
              <dt className="text-white/55">Stored full card data</dt>
              <dd className="font-bold text-[#b9d7cb]">None</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
