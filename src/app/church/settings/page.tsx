import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader } from "@/components/dashboard-shell";
import { ArrowRightIcon, CardIcon, CheckIcon, HeartIcon, QrIcon, SettingsIcon, UsersIcon } from "@/components/icons";
import { demoChurch, demoChurchStaff, demoFunds, formatMoney, getInitials } from "@/lib";

export const metadata: Metadata = {
  title: "Church settings",
  description: "Review church profile, branding, giving, billing and staff settings.",
};

function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="text-[11px] text-[var(--muted)]">{label}</dt>
      <dd className="text-[11px] font-semibold sm:max-w-[65%] sm:text-right">
        {value}
        {note && <span className="mt-1 block text-[9px] font-normal leading-4 text-[var(--muted)]">{note}</span>}
      </dd>
    </div>
  );
}

function formatRole(role: string) {
  return role.split("_").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

export default function ChurchSettingsPage() {
  return (
    <main className="mx-auto max-w-[1180px] pb-24">
        <div className="mb-6 lg:hidden">
          <p className="text-xs text-[var(--muted)]">Workspace configuration</p>
          <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Church settings</h1>
        </div>

        <section className="mb-6 flex flex-col gap-4 rounded-[22px] border border-[#d8ceb8] bg-[var(--gold-pale)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[#9a6d20]"><SettingsIcon size={20} /></span>
            <div>
              <p className="text-sm font-bold">Settings preview</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">This demo shows the full configuration structure. Editing unlocks after the church account and administrator access are connected.</p>
            </div>
          </div>
          <Link className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-2.5 text-xs font-bold text-white" href={`/give/${demoChurch.slug}`}>
            View public page <ArrowRightIcon size={15} />
          </Link>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="soft-card rounded-[24px] p-5 sm:p-6">
            <SectionHeader eyebrow="Identity" title="Church profile" />
            <dl className="mt-5 divide-y divide-[var(--line)]">
              <DetailRow label="Display name" value={demoChurch.name} />
              <DetailRow label="Legal name" value={demoChurch.legalName} />
              <DetailRow label="Church email" value={demoChurch.email} />
              <DetailRow label="Phone" value={demoChurch.phone ?? "Not provided"} />
              <DetailRow label="Location" value={demoChurch.address} />
              <DetailRow label="Public page" value={`/give/${demoChurch.slug}`} />
            </dl>
          </section>

          <section className="soft-card rounded-[24px] p-5 sm:p-6">
            <SectionHeader eyebrow="Appearance" title="Branding" />
            <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[#f3f1eb] p-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-[var(--ink)] text-sm font-bold text-white">HG</span>
              <div>
                <p className="text-xs font-bold">Text logo</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Upload not yet connected in demo mode</p>
              </div>
            </div>
            <dl className="mt-5 divide-y divide-[var(--line)]">
              <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0">
                <dt className="text-[11px] text-[var(--muted)]">Brand colours</dt>
                <dd className="flex items-center gap-2">
                  <span aria-label={`Primary colour ${demoChurch.branding.primaryColor}`} className="size-7 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: demoChurch.branding.primaryColor }} />
                  <span aria-label={`Accent colour ${demoChurch.branding.accentColor}`} className="size-7 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: demoChurch.branding.accentColor }} />
                </dd>
              </div>
              <DetailRow label="Thank-you message" note="Shown after a confirmed donation." value={demoChurch.branding.thankYouMessage} />
            </dl>
          </section>

          <section className="soft-card rounded-[24px] p-5 sm:p-6">
            <SectionHeader eyebrow="Giving" title="Donation preferences" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <article className="rounded-2xl bg-[var(--sage-pale)] p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-white text-[var(--sage-dark)]"><HeartIcon size={17} /></span>
                <p className="mt-3 text-xl font-bold">{demoFunds.filter((fund) => fund.isActive).length}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Active funds</p>
              </article>
              <article className="rounded-2xl bg-[var(--gold-pale)] p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-white text-[#9a6d20]"><CardIcon size={17} /></span>
                <p className="mt-3 text-xl font-bold">{demoChurch.defaultCurrency}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Default currency</p>
              </article>
            </div>
            <dl className="mt-5 divide-y divide-[var(--line)]">
              <DetailRow label="Default fund" value={demoFunds.find((fund) => fund.isDefault)?.name ?? "Not selected"} />
              <DetailRow label="Supported currencies" value={demoChurch.supportedCurrencies.join(", ")} />
              <DetailRow label="Recurring options" value="Weekly and monthly" />
              <DetailRow label="Timezone" value={demoChurch.timezone} />
            </dl>
            <Link className="focus-ring mt-5 inline-flex w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[11px] font-bold transition hover:border-[var(--sage)]" href="/church/campaigns">
              Manage funds and campaigns <ArrowRightIcon size={15} />
            </Link>
          </section>

          <section className="soft-card rounded-[24px] p-5 sm:p-6">
            <SectionHeader eyebrow="Payments" title="Merchant and billing" />
            <div className="mt-5 rounded-2xl border border-[#dfd0b2] bg-[var(--gold-pale)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold">Local merchant connection</p>
                  <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Live checkout remains locked until verification is complete.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold capitalize text-[#8b621f]">{demoChurch.paymentConnection.status}</span>
              </div>
            </div>
            <dl className="mt-5 divide-y divide-[var(--line)]">
              <DetailRow label="Settlement" value="Direct to church" note="The platform never holds donation funds." />
              <DetailRow label="Plan" value={demoChurch.subscription.planName} />
              <DetailRow label="Monthly price" value={formatMoney(demoChurch.subscription.monthlyPrice)} />
              <DetailRow label="Subscription status" value={demoChurch.subscription.status.replace("_", " ")} />
            </dl>
          </section>
        </div>

        <section className="soft-card mt-6 rounded-[24px] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader eyebrow="Access" title="Church staff" />
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--sage-pale)] px-3 py-1.5 text-[9px] font-bold text-[var(--sage-dark)]"><CheckIcon size={13} /> {demoChurchStaff.length} active staff</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {demoChurchStaff.map((staff) => (
              <article className="rounded-[18px] border border-[var(--line)] bg-white p-4" key={staff.id}>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-[10px] font-bold text-[var(--sage-dark)]">{getInitials(`${staff.firstName} ${staff.lastName}`)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{staff.firstName} {staff.lastName}</p>
                    <p className="mt-1 truncate text-[9px] text-[var(--muted)]">{staff.email}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-[#f3f1eb] px-2.5 py-1 text-[8px] font-bold text-[var(--ink-soft)]">{formatRole(staff.role)}</span>
                  <span className="inline-flex items-center gap-1 text-[8px] font-bold capitalize text-[var(--sage-dark)]"><span className="size-1.5 rounded-full bg-[var(--sage)]" />{staff.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link className="focus-ring flex items-center gap-4 rounded-[22px] bg-[var(--ink)] p-5 text-white transition hover:-translate-y-0.5" href="/church/qr">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10"><QrIcon size={20} /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold">Giving QR</p><p className="mt-1 text-[10px] text-white/60">Download the permanent church code.</p></div>
            <ArrowRightIcon size={17} />
          </Link>
          <Link className="focus-ring flex items-center gap-4 rounded-[22px] border border-[var(--line)] bg-white p-5 transition hover:-translate-y-0.5" href="/church/members">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--sage-pale)] text-[var(--sage-dark)]"><UsersIcon size={20} /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold">Staff and member access</p><p className="mt-1 text-[10px] text-[var(--muted)]">Review people connected to this church.</p></div>
            <ArrowRightIcon size={17} />
          </Link>
        </section>
    </main>
  );
}
