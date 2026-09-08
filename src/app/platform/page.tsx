import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeader, StatCard } from "@/components/dashboard-shell";
import { CheckIcon, SettingsIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { PlatformTenantManager } from "@/components/platform-tenant-manager";
import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import {
  getPlatformTenantPage,
  type PlatformTenantPageResult,
} from "@/lib/platform/platform-management-dal";
import { isPlatformTenantCursor } from "@/lib/platform/platform-tenant-management";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Platform dashboard",
};

type PlatformPageProps = Readonly<{
  searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>;

export default async function PlatformDashboardPage({
  searchParams = Promise.resolve({}),
}: PlatformPageProps) {
  const { workspace } = await requirePlatformSuperAdmin();
  const query = await searchParams;
  const cursorIsEmpty =
    query.cursorCreatedAt === undefined && query.cursorChurchId === undefined;
  const cursorCandidate = {
    createdAt: query.cursorCreatedAt,
    churchId: query.cursorChurchId,
  };
  const cursorIsValid = !cursorIsEmpty && isPlatformTenantCursor(cursorCandidate);
  let result: PlatformTenantPageResult = cursorIsValid || cursorIsEmpty
    ? { ok: false, reason: "unavailable" }
    : { ok: false, reason: "invalid_request" };

  if (cursorIsValid || cursorIsEmpty) {
    try {
      const client = await createServerSupabaseClient();
      result = await getPlatformTenantPage(client, {
        pageSize: 20,
        cursor: cursorIsValid ? cursorCandidate : null,
      });
    } catch {
      result = { ok: false, reason: "unavailable" };
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] pb-24" key={workspace.key}>
      <div className="mb-7 lg:hidden">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">
          Platform Admin
        </p>
        <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">
          Platform overview
        </h1>
      </div>

      <section className="mb-6 grid gap-4 rounded-[22px] border border-[#cddfd8] bg-[var(--sage-pale)] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--sage)] text-white">
            <ShieldIcon size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Database-backed tenant controls</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">
              Activation, suspension, and restoration change only the saved
              tenant/public status. The preview /give and /q routes will enforce it
              when those live workflows are connected.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--sage-dark)]">
          Audited changes
        </span>
      </section>

      {result.ok ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<UsersIcon size={19} />}
              label="All churches"
              note="Every saved tenant status"
              value={String(result.page.totalTenantCount)}
            />
            <StatCard
              icon={<SettingsIcon size={19} />}
              label="Onboarding"
              note="Foundation checks in progress"
              tone="gold"
              value={String(result.page.onboardingCount)}
            />
            <StatCard
              icon={<CheckIcon size={19} />}
              label="Active"
              note="Saved tenant/public status"
              value={String(result.page.activeCount)}
            />
            <StatCard
              icon={<ShieldIcon size={19} />}
              label="Suspended"
              note="Restoration available after review"
              tone="coral"
              value={String(result.page.suspendedCount)}
            />
          </div>

          <section className="soft-card mt-6 rounded-[22px] p-5 sm:p-6" id="churches">
            <SectionHeader
              action={
                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    className="focus-ring rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[10px] font-bold"
                    href="/platform/settings"
                  >
                    Settings
                  </Link>
                  <Link
                    className="focus-ring rounded-full bg-[var(--ink)] px-4 py-2.5 text-[10px] font-bold !text-white"
                    href="/platform/onboarding"
                  >
                    + Add church
                  </Link>
                </div>
              }
              eyebrow="Tenant management"
              title="Churches"
            />

            <PlatformTenantManager
              items={result.page.tenants.map((tenant) => ({
                tenant,
                requestId:
                  tenant.status === "active" ||
                  ((tenant.status === "onboarding" ||
                    tenant.status === "suspended") &&
                    tenant.foundationReady)
                    ? randomUUID()
                    : null,
              }))}
              key={result.page.tenants
                .map((tenant) => `${tenant.churchId}:${tenant.lifecycleRevision}`)
                .join("|")}
            />

            <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] text-[var(--muted)]">
                Showing {result.page.tenants.length} tenant
                {result.page.tenants.length === 1 ? "" : "s"} on this page.
              </p>
              <div className="flex flex-wrap gap-2">
                {cursorIsValid ? (
                  <Link
                    className="focus-ring rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-[10px] font-bold"
                    href="/platform"
                  >
                    First page
                  </Link>
                ) : null}
                {result.page.hasMore &&
                result.page.nextCursorCreatedAt &&
                result.page.nextCursorChurchId ? (
                  <Link
                    className="focus-ring rounded-full bg-[var(--sage)] px-4 py-2.5 text-[10px] font-bold text-white"
                    href={createNextPageHref(
                      result.page.nextCursorCreatedAt,
                      result.page.nextCursorChurchId,
                    )}
                  >
                    Next tenants
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[22px] border border-[#ead8ad] bg-[var(--gold-pale)] p-5 sm:p-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8a641f]">
              Planned church plan
            </p>
            <p className="mt-2 text-sm font-bold">USD $99 per month</p>
            <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#79581f]">
              This price remains pending final client confirmation and the future
              billing phase. No charge or external account change is created by these
              tenant controls.
            </p>
          </section>
        </>
      ) : (
        <section
          className="soft-card rounded-[22px] border border-[#ead8ad] p-6 sm:p-8"
          role="alert"
        >
          <h2 className="text-base font-bold">
            {result.reason === "invalid_request"
              ? "This tenant-list link is invalid"
              : "Tenant data is unavailable"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {result.reason === "invalid_request"
              ? "Open the first tenant page and continue from a fresh pagination link."
              : "The database-backed tenant snapshot could not be confirmed. Refresh the page before making a status change."}
          </p>
          <Link
            className="focus-ring mt-5 inline-flex rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white"
            href="/platform"
          >
            Open first tenant page
          </Link>
        </section>
      )}
    </div>
  );
}

function createNextPageHref(createdAt: string, churchId: string) {
  const query = new URLSearchParams({
    cursorCreatedAt: createdAt,
    cursorChurchId: churchId,
  });
  return `/platform?${query.toString()}`;
}
