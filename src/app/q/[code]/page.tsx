import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChurchMark } from "@/components/brand";
import {
  createPublicGivingPath,
  createPublicQrPath,
} from "@/lib/public-church-routing";
import { resolvePublicQr } from "@/lib/qr-routing-dal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Church giving link",
  description: "Open a church's current giving page from its permanent QR link.",
  robots: { index: false, follow: false },
};

export default async function GivingQrResolverPage({
  params,
}: Readonly<{ params: Promise<{ code: string }> }>) {
  const { code } = await params;
  const result = await resolvePublicQr(code);

  if (!result.ok && result.reason === "not_found") notFound();
  if (!result.ok) return <QrResolverUnavailable code={code} />;

  const destination = createPublicGivingPath(result.churchSlug);
  if (!destination) return <QrResolverUnavailable code={code} />;

  // Keep this temporary and same-origin: printed codes continue resolving to
  // the church's current slug without caching a mutable destination or trusting
  // a request Host header as tenant identity.
  redirect(destination);
}

function QrResolverUnavailable({ code }: Readonly<{ code: string }>) {
  const retryHref = createPublicQrPath(code) ?? "/";

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
          We could not open this giving link.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          No payment or personal information was submitted. Please try again in
          a moment.
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
