import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChurchMark } from "@/components/brand";
import { formatCampaignMinorAmount } from "@/lib/church-campaigns";
import {
  MOCK_CHECKOUT_COOKIE,
  parseMockCheckoutCookie,
} from "@/lib/mock-checkout-cookie";
import { getMockGivingCheckout } from "@/lib/mock-giving-dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo giving result",
  description: "The verified result of a payment-free development simulation.",
  robots: { index: false, follow: false },
};

type ReturnPageProps = Readonly<{
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}>;

export default async function MockGivingReturnPage({
  params,
  searchParams,
}: ReturnPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const checkoutId =
    typeof query.checkout === "string" ? query.checkout : "";
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
  if (!result.ok) return <ReturnUnavailable slug={slug} />;
  if (result.checkout.churchSlug !== slug) notFound();

  const { checkout } = result;
  const amount = formatCampaignMinorAmount(
    checkout.amountMinor,
    checkout.currency,
  );
  if (!amount) return <ReturnUnavailable slug={slug} />;

  const message = getStatusMessage(checkout.checkoutStatus);
  return (
    <ReturnShell>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
        {message.eyebrow}
      </p>
      <h1 className="font-display mt-3 text-4xl tracking-[-0.04em]">
        {message.title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
        {message.description}
      </p>
      <div className="mt-7 rounded-[22px] border border-[var(--line)] bg-white/70 px-5 py-4">
        <p className="text-xs text-[var(--ink-soft)]">Synthetic demo gift</p>
        <p className="mt-1 text-2xl font-bold">{amount}</p>
        <p className="mt-1 break-words text-xs text-[var(--ink-soft)] [overflow-wrap:anywhere]">
          {checkout.campaignName ?? checkout.fundName} · {checkout.churchName}
        </p>
      </div>
      {checkout.checkoutStatus === "completed" && checkout.thankYouMessage ? (
        <p className="mt-6 whitespace-pre-line break-words text-sm leading-6 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
          {checkout.thankYouMessage}
        </p>
      ) : null}
      <Link
        className="focus-ring mt-7 inline-flex rounded-full bg-[var(--sage)] px-6 py-3 text-sm font-bold text-white"
        href={`/give/${encodeURIComponent(slug)}`}
      >
        Return to giving page
      </Link>
      <p className="mt-5 text-[10px] leading-5 text-[var(--ink-soft)]">
        This page reads the server-side demo record. It does not trust a success
        value from the URL, and it does not represent a real charge or settlement.
      </p>
    </ReturnShell>
  );
}

function getStatusMessage(status: "open" | "completed" | "canceled" | "expired") {
  if (status === "completed") {
    return {
      eyebrow: "Demo completed",
      title: "The mock gift succeeded.",
      description:
        "The signed development webhook updated synthetic records only. No money moved and no live donation was created.",
    } as const;
  }
  if (status === "canceled") {
    return {
      eyebrow: "Demo canceled",
      title: "The mock checkout was canceled.",
      description: "No payment was made and the synthetic pending gift was canceled.",
    } as const;
  }
  if (status === "expired") {
    return {
      eyebrow: "Demo expired",
      title: "This mock checkout expired.",
      description: "No payment was made. Start a new simulation from the giving page.",
    } as const;
  }
  return {
    eyebrow: "Demo still open",
    title: "The mock checkout is not complete.",
    description: "No payment was made. Return to the checkout to finish or cancel the simulation.",
  } as const;
}

function ReturnShell({ children }: { children: React.ReactNode }) {
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

function ReturnUnavailable({ slug }: { slug: string }) {
  return (
    <ReturnShell>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
        Temporarily unavailable
      </p>
      <h1 className="font-display mt-3 text-3xl tracking-[-0.035em]">
        We could not verify the demo result.
      </h1>
      <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
        This page does not assume success. No live payment is enabled.
      </p>
      <Link
        className="focus-ring mt-7 inline-flex rounded-full bg-[var(--sage)] px-6 py-3 text-sm font-bold text-white"
        href={`/give/${encodeURIComponent(slug)}`}
      >
        Return to giving page
      </Link>
    </ReturnShell>
  );
}
