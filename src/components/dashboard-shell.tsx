"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand, ChurchMark } from "@/components/brand";
import { BellIcon, CalendarIcon, CardIcon, ChartIcon, HeartIcon, HomeIcon, QrIcon, SettingsIcon, UsersIcon } from "@/components/icons";

export type ShellKind = "member" | "church" | "platform";

const navByKind = {
  member: [
    ["Overview", "/dashboard", HomeIcon],
    ["Giving history", "/dashboard#history", HeartIcon],
    ["Recurring gifts", "/dashboard#recurring", CalendarIcon],
    ["Payment methods", "/dashboard#payments", CardIcon],
    ["Profile", "/dashboard#profile", SettingsIcon],
  ],
  church: [
    ["Overview", "/church", HomeIcon],
    ["Transactions", "/church#transactions", CardIcon],
    ["Members", "/church#members", UsersIcon],
    ["Funds & campaigns", "/church#campaigns", HeartIcon],
    ["Reports", "/church#reports", ChartIcon],
    ["Giving QR", "/church#qr", QrIcon],
    ["Settings", "/church#settings", SettingsIcon],
  ],
  platform: [
    ["Overview", "/platform", HomeIcon],
    ["Churches", "/platform#churches", UsersIcon],
    ["Subscriptions", "/platform#subscriptions", CardIcon],
    ["Platform reports", "/platform#reports", ChartIcon],
    ["Settings", "/platform#settings", SettingsIcon],
  ],
} as const;

type DashboardShellProps = {
  children: ReactNode;
  kind: ShellKind;
  title: string;
  subtitle: string;
};

export function DashboardShell({ children, kind, title, subtitle }: DashboardShellProps) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState(pathname);
  const isPlatform = kind === "platform";
  const isMember = kind === "member";
  const userName = isPlatform ? "Noah Williams" : isMember ? "Alicia Clarke" : "Miriam Jordan";
  const role = isPlatform ? "Platform Admin" : isMember ? "Member" : "Church Owner";
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  useEffect(() => {
    function syncActiveHref() {
      setActiveHref(`${window.location.pathname}${window.location.hash}`);
    }

    syncActiveHref();
    window.addEventListener("hashchange", syncActiveHref);
    return () => window.removeEventListener("hashchange", syncActiveHref);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#f3f1eb] lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-[var(--ink)] px-4 py-5 text-white lg:flex">
        <div className="px-2"><Brand inverted /></div>
        {!isPlatform && (
          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3">
            <ChurchMark size="sm" />
            <div className="min-w-0"><p className="truncate text-xs font-bold">Harbour Grace</p><p className="mt-1 text-[10px] uppercase tracking-wider text-white/65">{isMember ? "My church" : "Church workspace"}</p></div>
          </div>
        )}
        {isPlatform && <div className="mx-2 mt-7 rounded-2xl border border-[var(--gold)]/25 bg-[var(--gold)]/10 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#e0bd7b]">Platform workspace</div>}
        <nav className="mt-7 space-y-1">
          {navByKind[kind].map(([label, href, Icon]) => (
            <Link aria-current={activeHref === href ? "page" : undefined} className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold transition ${activeHref === href ? "bg-white !text-[#122235]" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`} href={href} key={label} onClick={() => setActiveHref(href)}>
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-2 py-2"><span className="grid size-9 place-items-center rounded-full bg-[var(--sage)] text-xs font-bold">{userName.split(" ").map((word) => word[0]).join("")}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{userName}</p><p className="mt-0.5 text-[10px] text-white/65">{role}</p></div></div>
          <Link className="mt-2 block rounded-lg px-2 py-2 text-[10px] font-semibold text-white/65 hover:text-white" href="/">← Exit demo</Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#f3f1eb]/90 backdrop-blur-xl">
          <div className="flex h-17 items-center justify-between px-4 sm:px-7 lg:px-9">
            <div className="flex items-center gap-3 lg:hidden"><Brand compact /><p className="text-xs font-bold">{kind === "platform" ? "Platform" : kind === "church" ? "Church" : "My giving"}</p></div>
            <div className="hidden lg:block"><h1 className="text-base font-bold tracking-tight">{title}</h1><p className="mt-0.5 text-[10px] text-[var(--muted)]">{subtitle}</p></div>
            <div className="flex items-center gap-2">
              {isDemoMode && <span className="inline-flex rounded-full bg-[var(--gold-pale)] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8b621f] sm:px-3"><span className="sm:hidden">Demo</span><span className="hidden sm:inline">Demo workspace</span></span>}
              {isDemoMode && <Link className="focus-ring hidden rounded-full border border-[var(--line)] bg-white px-4 py-2 text-[10px] font-bold text-[var(--ink-soft)] md:block" href={kind === "member" ? "/church" : kind === "church" ? "/platform" : "/dashboard"}>Switch demo role</Link>}
              <button aria-label="Notifications coming soon" className="relative grid size-10 cursor-not-allowed place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--muted)] opacity-60" disabled title="Notifications coming soon"><BellIcon size={18} /></button>
              <span className="grid size-10 place-items-center rounded-full bg-[var(--sage)] text-[10px] font-bold text-white">{userName.split(" ").map((word) => word[0]).join("")}</span>
            </div>
          </div>
        </header>
        <div className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</div>
        <nav aria-label="Dashboard sections" className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-[var(--line)] bg-white px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
          {navByKind[kind].map(([label, href, Icon]) => <Link aria-current={activeHref === href ? "page" : undefined} className={`flex min-h-14 min-w-[86px] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold ${activeHref === href ? "text-[var(--sage)]" : "text-[var(--muted)]"}`} href={href} key={label} onClick={() => setActiveHref(href)}><Icon size={18} /><span className="max-w-20 truncate">{label}</span></Link>)}
        </nav>
      </div>
    </div>
  );
}

export function StatCard({ label, value, note, icon, tone = "sage" }: { label: string; value: string; note: string; icon: ReactNode; tone?: "sage" | "gold" | "blue" | "coral" }) {
  const colors = { sage: "bg-[var(--sage-pale)] text-[var(--sage)]", gold: "bg-[var(--gold-pale)] text-[#a97722]", blue: "bg-[#e7edf5] text-[#496785]", coral: "bg-[#f5e8e5] text-[var(--coral)]" };
  return <article className="soft-card rounded-[20px] p-5"><div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--muted)]">{label}</p><p className="mt-3 text-2xl font-bold tracking-[-0.04em]">{value}</p></div><span className={`grid size-10 place-items-center rounded-2xl ${colors[tone]}`}>{icon}</span></div><p className="mt-3 text-[11px] text-[var(--muted)]">{note}</p></article>;
}

export function SectionHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return <div className="flex items-end justify-between gap-4"><div>{eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">{eyebrow}</p>}<h2 className="mt-1 text-base font-bold tracking-tight">{title}</h2></div>{action}</div>;
}
