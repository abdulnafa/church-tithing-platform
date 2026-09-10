import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ChurchMark } from "@/components/brand";
import { GivingForm } from "@/components/giving-form";
import { ArrowRightIcon, HeartIcon, ShieldIcon } from "@/components/icons";
import { formatCampaignMinorAmount } from "@/lib/church-campaigns";
import { getPublicGivingPageBySlug } from "@/lib/public-giving-dal";
import type {
  PublicGivingCampaign,
  PublicGivingChurch,
} from "@/lib/public-giving";

export const dynamic = "force-dynamic";

type GivingPageProps = Readonly<{ params: Promise<{ slug: string }> }>;

const loadPublicGivingPage = cache(getPublicGivingPageBySlug);

export async function generateMetadata({
  params,
}: GivingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicGivingPage(slug);

  if (!result.ok) {
    return {
      title:
        result.reason === "not_found"
          ? "Giving page not found"
          : "Giving page temporarily unavailable",
      description: "This church giving page is not currently available.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Give to ${result.page.church.name}`,
    description: `View the current funds and campaigns for ${result.page.church.name}. Online payments are not enabled yet.`,
  };
}

export default async function GivingPage({ params }: GivingPageProps) {
  const { slug } = await params;
  const result = await loadPublicGivingPage(slug);

  if (!result.ok && result.reason === "not_found") notFound();
  if (!result.ok) return <GivingPageUnavailable slug={slug} />;

  const { campaigns, church, funds } = result.page;
  const featuredCampaign = campaigns[0] ?? null;
  const campaignOptions = campaigns.map(
    ({ description, fundId, id, name }) => ({ description, fundId, id, name }),
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#efebe3]">
      <div className="relative overflow-hidden bg-[var(--ink)] pb-28 text-white">
        <div className="noise absolute inset-0" />
        <div
          aria-hidden="true"
          className="absolute -right-36 -top-44 size-[440px] rounded-full border-[74px] border-white/[0.035]"
        />
        {church.primaryColor ? (
          <div
            aria-hidden="true"
            className="absolute -bottom-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
            style={{ backgroundColor: church.primaryColor }}
          />
        ) : null}
        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <ChurchIdentityLogo church={church} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold sm:text-sm">
                {church.name}
              </span>
              <span className="mt-0.5 block truncate text-[9px] text-white/50 sm:text-[10px]">
                Online giving options
              </span>
            </span>
          </div>
          <Link
            className="focus-ring shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] font-semibold text-white/80 sm:px-4 sm:text-xs"
            href="/login?next=%2Fdashboard"
          >
            <span className="sm:hidden">Sign in</span>
            <span className="hidden sm:inline">Member sign in</span>
          </Link>
        </header>
        <div className="relative mx-auto max-w-3xl px-5 pt-10 text-center sm:px-8 sm:pt-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a9cfc1]">
            A moment of generosity
          </p>
          <h1 className="font-display mt-4 break-words text-4xl tracking-[-0.04em] [overflow-wrap:anywhere] sm:text-5xl">
            Support {church.name}.
          </h1>
          <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-6 text-white/60 sm:text-base">
            Explore the church&apos;s current funds and campaigns. Online payment
            submission will be available after an approved provider is connected.
          </p>
        </div>
      </div>

      <div className="relative mx-auto -mt-16 grid min-w-0 max-w-6xl gap-6 px-4 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <GivingForm
          campaigns={campaignOptions}
          churchName={church.name}
          currency={church.currency}
          funds={funds}
        />
        <aside className="min-w-0 space-y-5">
          {featuredCampaign ? (
            <FeaturedCampaign
              campaign={featuredCampaign}
              church={church}
            />
          ) : (
            <section className="soft-card rounded-[24px] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
                Campaigns
              </p>
              <h2 className="mt-3 text-lg font-bold tracking-tight">
                No active campaigns right now
              </h2>
              <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                You can still review the church&apos;s available funds.
              </p>
            </section>
          )}

          {church.thankYouMessage ? (
            <section
              className="rounded-[24px] border-t-4 bg-[var(--paper)] p-5"
              style={{ borderTopColor: church.secondaryColor ?? "var(--gold)" }}
            >
              <p className="break-words text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)] [overflow-wrap:anywhere]">
                A message from {church.name}
              </p>
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
                {church.thankYouMessage}
              </p>
            </section>
          ) : null}

          <section className="rounded-[24px] bg-[var(--paper)] p-5 text-center">
            <ShieldIcon className="mx-auto text-[var(--sage)]" size={24} />
            <h2 className="mt-3 text-sm font-bold">No payment collection yet</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
              A name and email can be checked in an unsaved page draft, but they
              are not sent or used to look up an account. An optional prayer
              request and provisional consent can also be drafted locally, but
              nothing is submitted or saved. No card or bank information is
              requested. Future donations must settle directly to the church
              through its approved provider.
            </p>
          </section>
          <Link
            className="focus-ring flex items-center justify-center gap-2 rounded-lg text-xs font-bold text-[var(--sage-dark)]"
            href="/dashboard"
          >
            Open member portal <ArrowRightIcon size={15} />
          </Link>
        </aside>
      </div>
      <footer className="border-t border-[var(--line)] bg-[var(--paper)] px-5 py-6 text-center text-[10px] text-[var(--ink-soft)]">
        Powered by Kindred Giving - Digital giving for churches
      </footer>
    </main>
  );
}

function ChurchIdentityLogo({ church }: { church: PublicGivingChurch }) {
  if (!church.logoUrl) return <ChurchMark size="sm" />;

  return (
    <div className="relative size-10 shrink-0 overflow-hidden rounded-[14px] bg-white shadow-sm">
      <Image
        alt=""
        className="object-contain p-1"
        fill
        priority
        sizes="40px"
        src={church.logoUrl}
      />
    </div>
  );
}

function FeaturedCampaign({
  campaign,
  church,
}: {
  campaign: PublicGivingCampaign;
  church: PublicGivingChurch;
}) {
  const formattedGoal = campaign.goalAmountMinor
    ? formatCampaignMinorAmount(campaign.goalAmountMinor, church.currency)
    : null;

  return (
    <section className="soft-card overflow-hidden rounded-[24px]">
      <div className="relative h-32 overflow-hidden bg-[var(--sage)]">
        <div className="dot-grid absolute inset-0 opacity-20" />
        <div
          aria-hidden="true"
          className="absolute -bottom-12 -right-8 size-44 rounded-full opacity-35 blur-2xl"
          style={{ backgroundColor: church.secondaryColor ?? "var(--gold)" }}
        />
        <HeartIcon className="absolute bottom-5 left-5 text-white" size={28} />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
            Featured campaign
          </p>
          <span className="rounded-full bg-[var(--sage-pale)] px-2 py-1 text-[9px] font-bold text-[var(--sage-dark)]">
            Active
          </span>
        </div>
        <h2 className="mt-3 break-words text-lg font-bold tracking-tight [overflow-wrap:anywhere]">
          {campaign.name}
        </h2>
        {campaign.description ? (
          <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
            {campaign.description}
          </p>
        ) : null}
        {formattedGoal ? (
          <p className="mt-4 text-xs font-bold text-[var(--ink-soft)]">
            Goal: {formattedGoal}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function GivingPageUnavailable({ slug }: { slug: string }) {
  const retryHref = `/give/${encodeURIComponent(slug)}`;
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cream)] px-4 py-12">
      <section
        className="soft-card w-full max-w-lg rounded-[28px] p-6 text-center sm:p-9"
        role="alert"
      >
        <div className="flex justify-center">
          <ChurchMark size="lg" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Temporarily unavailable
        </p>
        <h1 className="font-display mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
          We could not load this giving page.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          No payment or personal information was submitted. Please try again in a
          moment.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            className="focus-ring rounded-full bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white"
            href={retryHref}
          >
            Try again
          </Link>
          <Link
            className="focus-ring rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold"
            href="/"
          >
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
