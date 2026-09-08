"use client";

import Link from "next/link";

import { ChurchMark } from "@/components/brand";

export default function GivingPageError({ reset }: { reset: () => void }) {
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
          We could not display this giving page.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          No payment or personal information was submitted. Please try again.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            className="focus-ring rounded-full bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
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
