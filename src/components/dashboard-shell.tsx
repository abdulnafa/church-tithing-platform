"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { Brand, ChurchMark } from "@/components/brand";
import { BellIcon, CalendarIcon, CardIcon, ChartIcon, HeartIcon, HomeIcon, QrIcon, SettingsIcon, UsersIcon } from "@/components/icons";
import type { ShellIdentity, ShellWorkspace } from "@/lib/auth/identity-types";
import type { ChurchPermission } from "@/lib/auth/permissions";
import {
  hasAnyChurchPermission,
  hasEveryChurchPermission,
} from "@/lib/auth/permissions";

export type ShellKind = "member" | "church" | "platform";

type NavigationItem = Readonly<{
  label: string;
  href: string;
  Icon: typeof HomeIcon;
  permissions?: readonly ChurchPermission[];
  permissionMode?: "all" | "any";
}>;

const navByKind = {
  member: [
    { label: "Overview", href: "/dashboard", Icon: HomeIcon },
    { label: "Giving history", href: "/dashboard#history", Icon: HeartIcon },
    { label: "Recurring gifts", href: "/dashboard#recurring", Icon: CalendarIcon },
    { label: "Payment methods", href: "/dashboard#payments", Icon: CardIcon },
    { label: "Profile", href: "/dashboard#profile", Icon: SettingsIcon },
  ],
  church: [
    { label: "Overview", href: "/church", Icon: HomeIcon, permissions: ["workspace_read"] },
    { label: "Transactions", href: "/church/transactions", Icon: CardIcon, permissions: ["financial_read"] },
    { label: "Members & staff", href: "/church/members", Icon: UsersIcon, permissions: ["members_read", "staff_manage"], permissionMode: "any" },
    { label: "Funds & campaigns", href: "/church/campaigns", Icon: HeartIcon, permissions: ["funds_read", "campaigns_read"], permissionMode: "any" },
    { label: "Reports", href: "/church/reports", Icon: ChartIcon, permissions: ["reports_read"] },
    { label: "Giving QR", href: "/church/qr", Icon: QrIcon, permissions: ["qr_read"] },
    { label: "Settings", href: "/church/settings", Icon: SettingsIcon, permissions: ["settings_manage"] },
  ],
  platform: [
    { label: "Overview", href: "/platform", Icon: HomeIcon },
    { label: "Churches", href: "/platform#churches", Icon: UsersIcon },
    { label: "Add church", href: "/platform/onboarding", Icon: UsersIcon },
    { label: "Settings", href: "/platform/settings", Icon: SettingsIcon },
  ],
} as const satisfies Readonly<Record<ShellKind, readonly NavigationItem[]>>;

const churchRouteHeaders: Readonly<Record<string, readonly [title: string, subtitle: string]>> = {
  "/church": ["Church overview", "Current giving summary"],
  "/church/transactions": ["Transactions", "Search, filter and export church giving"],
  "/church/members": ["Members & staff", "Saved staff access and demo member activity"],
  "/church/campaigns": ["Funds & campaigns", "Giving categories and campaign progress"],
  "/church/reports": ["Reports", "Giving performance and bookkeeping"],
  "/church/qr": ["Giving QR", "Permanent giving link for screens and print"],
  "/church/settings": ["Settings", "Church profile, branding and payment readiness"],
};

const platformRouteHeaders: Readonly<
  Record<string, readonly [title: string, subtitle: string]>
> = {
  "/platform": ["Platform overview", "Tenant readiness and lifecycle controls"],
  "/platform/onboarding": ["Add a church", "Create an onboarding workspace"],
  "/platform/settings": ["Platform settings", "Future church onboarding defaults"],
};

type DashboardShellProps = {
  children: ReactNode;
  identity: ShellIdentity;
  kind: ShellKind;
  workspace: ShellWorkspace;
  title: string;
  subtitle: string;
};

export function DashboardShell({ children, identity, kind, workspace, title, subtitle }: DashboardShellProps) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState(pathname);
  const mobileNavRef = useRef<HTMLElement>(null);
  const isPlatform = kind === "platform";
  const isMember = kind === "member";
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  const navigation = navByKind[kind].filter(
    (item: NavigationItem) =>
      !item.permissions ||
      (item.permissionMode === "any"
        ? hasAnyChurchPermission(workspace.permissions, item.permissions)
        : hasEveryChurchPermission(workspace.permissions, item.permissions)),
  );
  const [resolvedTitle, routeSubtitle] =
    kind === "church"
      ? (churchRouteHeaders[pathname] ?? [title, subtitle])
      : kind === "platform"
        ? (platformRouteHeaders[pathname] ?? [title, subtitle])
        : [title, subtitle];
  const resolvedSubtitle =
    kind === "church"
      ? `${workspace.displayName} | ${routeSubtitle}`
      : routeSubtitle;

  function isActiveNavItem(href: string) {
    if (kind === "church") {
      return pathname === href || (href !== "/church" && pathname.startsWith(`${href}/`));
    }

    return activeHref === href;
  }

  useEffect(() => {
    if (kind === "church") return;

    function syncActiveHref() {
      setActiveHref(`${window.location.pathname}${window.location.hash}`);
    }

    syncActiveHref();
    window.addEventListener("hashchange", syncActiveHref);
    return () => window.removeEventListener("hashchange", syncActiveHref);
  }, [kind, pathname]);

  useEffect(() => {
    const activeMobileLink = mobileNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activeMobileLink?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeHref, pathname]);

  return (
    <div className="min-h-screen bg-[#f3f1eb] lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-[var(--ink)] px-4 py-5 text-white lg:flex">
        <div className="px-2"><Brand inverted /></div>
        {!isPlatform && (
          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3">
            <ChurchMark size="sm" />
            <div className="min-w-0"><p className="truncate text-xs font-bold">{workspace.displayName}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-white/65">{isMember ? "My church" : "Church workspace"}</p></div>
          </div>
        )}
        {isPlatform && <div className="mx-2 mt-7 rounded-2xl border border-[var(--gold)]/25 bg-[var(--gold)]/10 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#e0bd7b]">Platform workspace</div>}
        <nav className="mt-7 space-y-1">
          {navigation.map(({ label, href, Icon }) => (
            <Link aria-current={isActiveNavItem(href) ? "page" : undefined} className={`focus-ring flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold transition ${isActiveNavItem(href) ? "bg-white !text-[#122235]" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`} href={href} key={label} onClick={kind === "church" ? undefined : () => setActiveHref(href)}>
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-2 py-2"><span className="grid size-9 place-items-center rounded-full bg-[var(--sage)] text-xs font-bold">{identity.initials}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{identity.displayName}</p><p className="mt-0.5 text-[10px] text-white/65">{identity.roleLabel}</p></div></div>
          <form action={signOutAction}>
            <button className="focus-ring mt-2 w-full rounded-lg px-2 py-2 text-left text-[10px] font-semibold text-white/65 hover:text-white" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#f3f1eb]/90 backdrop-blur-xl">
          <div className="flex h-17 items-center justify-between px-4 sm:px-7 lg:px-9">
            <div className="flex items-center gap-3 lg:hidden"><Brand compact /><p className="text-xs font-bold">{kind === "platform" ? "Platform" : kind === "church" ? "Church" : "My giving"}</p></div>
            <div className="hidden lg:block"><h1 className="text-base font-bold tracking-tight">{resolvedTitle}</h1><p className="mt-0.5 text-[10px] text-[var(--muted)]">{resolvedSubtitle}</p></div>
            <div className="flex items-center gap-2">
              {isDemoMode && !isPlatform && <span className="inline-flex rounded-full bg-[var(--gold-pale)] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8b621f] sm:px-3"><span className="sm:hidden">Demo</span><span className="hidden sm:inline">Demo workspace</span></span>}
              <form action={signOutAction} className="lg:hidden">
                <button className="focus-ring rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[9px] font-bold text-[var(--ink-soft)]" type="submit">Sign out</button>
              </form>
              <button aria-label="Notifications coming soon" className="relative grid size-10 cursor-not-allowed place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--muted)] opacity-60" disabled title="Notifications coming soon"><BellIcon size={18} /></button>
              <span className="grid size-10 place-items-center rounded-full bg-[var(--sage)] text-[10px] font-bold text-white">{identity.initials}</span>
            </div>
          </div>
        </header>
        <div className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
          {isDemoMode && !isPlatform ? (
            <p className="mb-6 rounded-2xl border border-[#ead8ad] bg-[var(--gold-pale)] px-4 py-3 text-[10px] leading-5 text-[#79581f]" role="note">
              <strong>Preview workspace:</strong> Only sections explicitly labelled Demo or Preview use shared examples. Saved church settings, fund categories, campaigns, and staff access are tenant-scoped; live donation payment processing remains disabled for {workspace.displayName}.
            </p>
          ) : null}
          {children}
        </div>
        <nav aria-label="Dashboard sections" className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-[var(--line)] bg-white px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden" ref={mobileNavRef}>
          {navigation.map(({ label, href, Icon }) => <Link aria-current={isActiveNavItem(href) ? "page" : undefined} className={`focus-ring flex min-h-14 min-w-[86px] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold ${isActiveNavItem(href) ? "text-[var(--sage)]" : "text-[var(--muted)]"}`} href={href} key={label} onClick={kind === "church" ? undefined : () => setActiveHref(href)}><Icon size={18} /><span className="max-w-20 truncate">{label}</span></Link>)}
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
