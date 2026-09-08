import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { ChurchOnboardingForm } from "@/components/church-onboarding-form";
import { SectionHeader } from "@/components/dashboard-shell";
import { CheckIcon } from "@/components/icons";
import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import { getPlatformOnboardingDefaults } from "@/lib/platform/platform-management-dal";
import type { PlatformOnboardingDefaultsReadResult } from "@/lib/platform/platform-management-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const outcomes = [
  "Creates an onboarding church workspace",
  "Adds the required default Tithes fund",
  "Reserves one permanent church QR record",
  "Creates or reserves the owner membership",
];

export const metadata: Metadata = {
  title: "Add a church",
};

export default async function ChurchOnboardingPage() {
  const { workspace } = await requirePlatformSuperAdmin();
  const requestId = randomUUID();
  let defaultsResult: PlatformOnboardingDefaultsReadResult = {
    ok: false,
    reason: "unavailable",
  };
  try {
    const client = await createServerSupabaseClient();
    defaultsResult = await getPlatformOnboardingDefaults(client);
  } catch {
    // The form stays closed when persisted defaults cannot be confirmed.
  }

  return (
    <div
      className="mx-auto grid max-w-6xl gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start"
      key={workspace.key}
    >
      <div>
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
            New tenant
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
            Set up a church workspace.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Create the non-sensitive church record and owner access in one
            protected transaction. Billing and merchant credentials are handled
            separately.
          </p>
        </div>
        {defaultsResult.ok ? (
          <ChurchOnboardingForm
            defaults={{
              currency: defaultsResult.defaults.defaultCurrency,
              timezone: defaultsResult.defaults.defaultTimezone,
              primaryColor: defaultsResult.defaults.defaultPrimaryColor,
              secondaryColor: defaultsResult.defaults.defaultSecondaryColor,
            }}
            requestId={requestId}
          />
        ) : (
          <section
            className="soft-card rounded-[24px] border border-[#ead8ad] p-6 sm:p-8"
            role="alert"
          >
            <h2 className="text-base font-bold">Church setup is unavailable</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              The saved onboarding defaults could not be confirmed, so this form
              has not been opened with fallback values. Refresh the page before
              creating a church.
            </p>
          </section>
        )}
      </div>
      <aside className="soft-card rounded-[22px] p-5 lg:sticky lg:top-24">
        <SectionHeader eyebrow="On save" title="What this creates" />
        <div className="mt-5 space-y-3">
          {outcomes.map((outcome) => (
            <p
              className="flex items-start gap-2 text-[10px] leading-5 text-[var(--muted)]"
              key={outcome}
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage)]">
                <CheckIcon size={12} />
              </span>
              {outcome}
            </p>
          ))}
        </div>
        <div className="mt-6 rounded-2xl bg-[var(--gold-pale)] p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#8a641f]">
            Still required
          </p>
          <p className="mt-2 text-[10px] leading-5 text-[#79581f]">
            Invitation email delivery, public QR resolution, logo upload,
            subscription billing, and the church donation provider remain disabled.
          </p>
        </div>
      </aside>
    </div>
  );
}
