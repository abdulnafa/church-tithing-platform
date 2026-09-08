import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { PlatformOnboardingDefaultsForm } from "@/components/platform-onboarding-defaults-form";
import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import {
  getPlatformOnboardingDefaults,
  type PlatformOnboardingDefaultsReadResult,
} from "@/lib/platform/platform-management-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Platform settings",
};

export default async function PlatformSettingsPage() {
  const { workspace } = await requirePlatformSuperAdmin();
  let result: PlatformOnboardingDefaultsReadResult = {
    ok: false,
    reason: "unavailable",
  };

  try {
    const client = await createServerSupabaseClient();
    result = await getPlatformOnboardingDefaults(client);
  } catch {
    // Render the explicit unavailable state below; never invent fallback values.
  }

  return (
    <div className="mx-auto max-w-4xl pb-24" key={workspace.key}>
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Platform settings
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
          Church onboarding defaults
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Manage the saved currency, timezone, and optional colour values used to
          prefill future church setup forms.
        </p>
      </div>

      {result.ok ? (
        <PlatformOnboardingDefaultsForm
          key={`platform-defaults:${result.defaults.settingsRevision}`}
          requestId={randomUUID()}
          snapshot={result.defaults}
        />
      ) : (
        <section
          className="soft-card rounded-[24px] border border-[#ead8ad] p-6 sm:p-8"
          role="alert"
        >
          <h2 className="text-base font-bold">Saved defaults are unavailable</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            The database-backed onboarding defaults could not be confirmed. No
            fallback values are being displayed or saved; refresh the page before
            making changes.
          </p>
        </section>
      )}
    </div>
  );
}
