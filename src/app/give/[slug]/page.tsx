import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChurchMark } from "@/components/brand";
import { GivingForm } from "@/components/giving-form";
import { ArrowRightIcon, HeartIcon, ShieldIcon } from "@/components/icons";
import { calculateProgress, demoCampaigns, demoChurch, demoFunds, formatMoney } from "@/lib";

export const metadata: Metadata = {
  title: `Give to ${demoChurch.name}`,
  description: `Make a secure one-time or recurring gift to ${demoChurch.name}.`,
};

export function generateStaticParams() {
  return [{ slug: demoChurch.slug }];
}

export default async function GivingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== demoChurch.slug) notFound();
  const campaign = demoCampaigns[0];
  const progress = calculateProgress(campaign.raised, campaign.goal);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#efebe3]">
      <div className="relative overflow-hidden bg-[var(--ink)] pb-28 text-white">
        <div className="noise absolute inset-0" />
        <div className="absolute -right-36 -top-44 size-[440px] rounded-full border-[74px] border-white/[0.035]" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
          <Link className="focus-ring flex min-w-0 items-center gap-3 rounded-xl" href="/">
            <ChurchMark size="sm" />
            <span className="min-w-0"><span className="block truncate text-xs font-bold sm:text-sm">{demoChurch.name}</span><span className="mt-0.5 block truncate text-[9px] text-white/50 sm:text-[10px]">Bridgetown, Barbados</span></span>
          </Link>
          <Link className="focus-ring shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-semibold text-white/80 sm:px-4 sm:text-xs" href="/login"><span className="sm:hidden">Sign in</span><span className="hidden sm:inline">Member sign in</span></Link>
        </header>
        <div className="relative mx-auto max-w-3xl px-5 pt-10 text-center sm:px-8 sm:pt-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a9cfc1]">A moment of generosity</p>
          <h1 className="font-display mt-4 text-4xl tracking-[-0.04em] sm:text-5xl">Give with purpose.</h1>
          <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-6 text-white/60 sm:text-base">Your gift helps us worship, serve and care for our community—today and for the future.</p>
        </div>
      </div>

      <div className="relative mx-auto -mt-16 grid min-w-0 max-w-6xl gap-6 px-4 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <GivingForm campaigns={demoCampaigns} churchName={demoChurch.name} currency={demoChurch.defaultCurrency} funds={demoFunds} />
        <aside className="space-y-5">
          <section className="soft-card overflow-hidden rounded-[24px]">
            <div className="relative h-32 overflow-hidden bg-[var(--sage)]">
              <div className="dot-grid absolute inset-0 opacity-20" />
              <div className="absolute -bottom-12 -right-8 size-44 rounded-full bg-[var(--gold)]/35 blur-2xl" />
              <HeartIcon className="absolute bottom-5 left-5 text-white" size={28} />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">Featured campaign</p><span className="rounded-full bg-[var(--sage-pale)] px-2 py-1 text-[9px] font-bold text-[var(--sage-dark)]">Active</span></div>
              <h2 className="mt-3 text-lg font-bold tracking-tight">{campaign.name}</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{campaign.description}</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#ebe7df]"><div className="h-full rounded-full bg-[var(--gold)]" style={{ width: `${progress}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-[10px]"><strong>{formatMoney(campaign.raised)} raised</strong><span className="text-[var(--muted)]">of {formatMoney(campaign.goal)}</span></div>
            </div>
          </section>
          <section className="rounded-[24px] bg-[var(--paper)] p-5 text-center">
            <ShieldIcon className="mx-auto text-[var(--sage)]" size={24} />
            <h2 className="mt-3 text-sm font-bold">Safe and direct</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Your payment is processed by the church&apos;s approved provider and settles directly to the church.</p>
          </section>
          <Link className="flex items-center justify-center gap-2 text-xs font-bold text-[var(--sage-dark)]" href="/dashboard">Preview member portal <ArrowRightIcon size={15} /></Link>
        </aside>
      </div>
      <footer className="border-t border-[var(--line)] bg-[var(--paper)] px-5 py-6 text-center text-[10px] text-[var(--muted)]">Powered by Kindred Giving · Secure digital giving for churches</footer>
    </main>
  );
}
