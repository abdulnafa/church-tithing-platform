import type { ReactNode } from "react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { CheckIcon, HeartIcon } from "@/components/icons";

type AuthPageShellProps = Readonly<{
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}>;

export function AuthPageShell({
  children,
  description,
  eyebrow,
  title,
}: AuthPageShellProps) {
  return (
    <main className="grid min-h-screen bg-[var(--paper)] lg:grid-cols-[.92fr_1.08fr]">
      <section className="relative hidden overflow-hidden bg-[var(--ink)] p-12 text-white lg:flex lg:flex-col">
        <div className="noise absolute inset-0" />
        <div className="absolute -bottom-40 -left-24 size-[520px] rounded-full bg-[var(--sage)]/30 blur-[100px]" />
        <div className="absolute -right-24 -top-28 size-80 rounded-full bg-[var(--gold)]/18 blur-[90px]" />
        <div className="relative">
          <Brand inverted />
        </div>
        <div className="relative my-auto max-w-lg py-12">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/[0.08] text-[#b9d7cb]">
            <HeartIcon size={23} />
          </span>
          <h1 className="font-display mt-7 text-5xl leading-[1.08] tracking-[-0.04em]">
            Giving that feels as welcoming as your church.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/60">
            One secure home for donors, church teams and the people supporting
            every church on the platform.
          </p>
          <div className="mt-9 space-y-3 text-xs text-white/65">
            <p className="flex items-center gap-3">
              <CheckIcon className="text-[#9dd0bd]" size={16} /> Email-verified
              accounts
            </p>
            <p className="flex items-center gap-3">
              <CheckIcon className="text-[#9dd0bd]" size={16} /> Accounts for
              donors and church teams
            </p>
            <p className="flex items-center gap-3">
              <CheckIcon className="text-[#9dd0bd]" size={16} /> No card details
              stored by the platform
            </p>
          </div>
        </div>
        <p className="relative text-[10px] text-white/35">
          Kindred Giving | Barbados pilot | 2026
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between lg:hidden">
            <Brand />
            <Link className="text-xs font-bold text-[var(--sage)]" href="/">
              Back home
            </Link>
          </div>
          <div className="mt-12 lg:mt-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--sage)]">
              {eyebrow}
            </p>
            <h2 className="font-display mt-3 text-4xl tracking-[-0.04em]">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              {description}
            </p>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
