import Link from "next/link";

import { ChurchMark } from "@/components/brand";

export default function GivingPageNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cream)] px-4 py-12">
      <section className="soft-card w-full max-w-lg rounded-[28px] p-6 text-center sm:p-9">
        <div className="flex justify-center">
          <ChurchMark size="lg" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Giving page not found
        </p>
        <h1 className="font-display mt-3 text-3xl tracking-[-0.035em] sm:text-4xl">
          This giving link is not available.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
          Check the link or contact the church directly for its current giving
          information.
        </p>
        <Link
          className="focus-ring mt-7 inline-flex rounded-full bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white"
          href="/"
        >
          Return home
        </Link>
      </section>
    </main>
  );
}
