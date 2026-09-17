import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChurchMark } from "@/components/brand";
import { ShieldIcon } from "@/components/icons";
import { formatCampaignMinorAmount } from "@/lib/church-campaigns";
import {
  MOCK_CHECKOUT_COOKIE,
  parseMockCheckoutCookie,
} from "@/lib/mock-checkout-cookie";
import { getMockGivingCheckout } from "@/lib/mock-giving-dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo checkout",
  description: "A payment-free development checkout simulation.",
  robots: { index: false, follow: false },
};

type CheckoutPageProps = Readonly<{
  params: Promise<{ slug: string; checkoutId: string }>;
}>;

export default async function MockCheckoutPage({ params }: CheckoutPageProps) {
  const { checkoutId, slug } = await params;
  const cookieStore = await cookies();
  const capability = parseMockCheckoutCookie(
    cookieStore.get(MOCK_CHECKOUT_COOKIE)?.value,
    checkoutId,
  );
  if (!capability) notFound();

  const result = await getMockGivingCheckout(
    checkoutId,
    capability.capabilityToken,
  );
  if (!result.ok && result.reason === "not_found") notFound();
  if (!result.ok) return <CheckoutUnavailable slug={slug} />;
  if (result.checkout.churchSlug !== slug) notFound();

  const { checkout } = result;
  const amount = formatCampaignMinorAmount(
    checkout.amountMinor,
    checkout.currency,
  );
  if (!amount) return <CheckoutUnavailable slug={slug} />;

  if (checkout.checkoutStatus !== "open") {
    return (
      <CheckoutShell>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Demo checkout closed
        </p>
        <h1 className="font-display mt-3 text-3xl tracking-[-0.035em]">
          This simulation is already {checkout.checkoutStatus}.
        </h1>
        <Link
          className="focus-ring mt-7 inline-flex rounded-full bg-[var(--sage)] px-6 py-3 text-sm font-bold text-white"
          href={`/give/${encodeURIComponent(slug)}/return?checkout=${encodeURIComponent(checkoutId)}`}
        >
          View demo result
        </Link>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell>
      <div className="rounded-2xl border border-[#bfd8cf] bg-[#edf7f3] px-4 py-3 text-xs font-semibold leading-5 text-[#174f45]">
        Test simulation only — no card details, charge, transfer, or real recurring
        instruction will be created.
      </div>
      <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
        Mock hosted checkout
      </p>
      <h1 className="font-display mt-3 break-words text-4xl tracking-[-0.04em] [overflow-wrap:anywhere]">
        {checkout.churchName}
      </h1>

      <dl className="mt-7 divide-y divide-[var(--line)] rounded-[22px] border border-[var(--line)] bg-white/70 px-5">
        <CheckoutDetail label="Demo amount" value={amount} />
        <CheckoutDetail
          label="Giving option"
          value={checkout.campaignName ?? checkout.fundName}
        />
        <CheckoutDetail
          label="Frequency"
          value={
            checkout.frequency === "one_time"
              ? "One time"
              : `${checkout.frequency[0]?.toUpperCase()}${checkout.frequency.slice(1)}`
          }
        />
      </dl>

      <form
        action={`/api/mock-giving/checkouts/${encodeURIComponent(checkoutId)}/complete`}
        className="mt-7"
        method="post"
      >
        <button
          className="focus-ring inline-flex w-full items-center justify-center rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white hover:bg-[var(--sage-dark)]"
          type="submit"
        >
          Simulate successful payment
        </button>
      </form>
      <form
        action={`/api/mock-giving/checkouts/${encodeURIComponent(checkoutId)}/cancel`}
        className="mt-3"
        method="post"
      >
        <button
          className="focus-ring inline-flex w-full items-center justify-center rounded-full border border-[var(--line)] bg-white px-5 py-4 text-sm font-bold text-[var(--ink)] hover:bg-[var(--cream)]"
          type="submit"
        >
          Cancel demo checkout
        </button>
      </form>
      <p className="mt-5 flex items-start justify-center gap-2 text-center text-[10px] leading-5 text-[var(--ink-soft)]">
        <ShieldIcon className="mt-1 shrink-0 text-[var(--sage)]" size={13} />
        Clicking success generates a signed mock webhook and updates synthetic
        development records only.
      </p>
    </CheckoutShell>
  );
}

function CheckoutDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-4">
      <dt className="text-xs text-[var(--ink-soft)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-bold [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cream)] px-4 py-12">
      <section className="soft-card w-full max-w-xl rounded-[28px] p-6 text-center sm:p-9">
        <div className="flex justify-center">
          <ChurchMark size="lg" />
        </div>
        {children}
      </section>
    </main>
  );
}

function CheckoutUnavailable({ slug }: { slug: string }) {
  return (
    <CheckoutShell>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
        Temporarily unavailable
      </p>
      <h1 className="font-display mt-3 text-3xl tracking-[-0.035em]">
        We could not load this demo checkout.
      </h1>
      <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
        No payment was made. Please return to the giving page and try again.
      </p>
      <Link
        className="focus-ring mt-7 inline-flex rounded-full bg-[var(--sage)] px-6 py-3 text-sm font-bold text-white"
        href={`/give/${encodeURIComponent(slug)}`}
      >
        Return to giving page
      </Link>
    </CheckoutShell>
  );
}
