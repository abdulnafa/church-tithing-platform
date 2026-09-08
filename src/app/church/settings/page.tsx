import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { ChurchSettingsForm } from "@/components/church-settings-form";
import { SectionHeader } from "@/components/dashboard-shell";
import { CheckIcon, SettingsIcon } from "@/components/icons";
import { requireChurchPermission } from "@/lib/auth/guards";
import {
  getChurchLogoPublicUrl,
  getChurchSettings,
} from "@/lib/church-settings-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church settings",
  description: "Manage the persisted profile and branding for your church.",
};

const editableSettings = [
  "Church display and registered legal names",
  "Support email and IANA timezone",
  "Optional brand colours and thank-you message",
  "A sanitized, size-bounded church logo",
];

export default async function ChurchSettingsPage() {
  const { workspace } = await requireChurchPermission("settings_manage");
  const supabase = await createServerSupabaseClient();
  const result = await getChurchSettings(supabase, workspace.churchId);

  if (!result.ok) {
    // The route guard already handles known access failures. Keep malformed or
    // unavailable database responses fail-closed without exposing internals.
    throw new Error("Church settings are temporarily unavailable.");
  }

  const { settings } = result;
  const logoPublicUrl = getChurchLogoPublicUrl(
    supabase,
    workspace.churchId,
    settings.logoStoragePath,
  );

  return (
    <main
      className="mx-auto grid min-w-0 max-w-6xl gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start"
      key={workspace.churchId}
    >
      <div className="min-w-0">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
            Church workspace
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
            Profile and branding
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Manage the saved identity and appearance for this church. Updates use
            version checks so another administrator&apos;s newer changes are not
            overwritten.
          </p>
        </div>

        <section className="mb-6 flex items-start gap-3 rounded-[22px] border border-[#c7dbd3] bg-[var(--sage-pale)] p-5 sm:p-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--sage-dark)]">
            <SettingsIcon size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Persisted church settings</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Changes are validated on the server and saved only for your current
              church workspace.
            </p>
          </div>
        </section>

        <ChurchSettingsForm
          logoPublicUrl={logoPublicUrl}
          requestId={randomUUID()}
          settings={settings}
        />
      </div>

      <aside className="min-w-0 space-y-6 lg:sticky lg:top-24">
        <section className="soft-card rounded-[22px] p-5">
          <SectionHeader eyebrow="Workspace" title="Stored identity" />
          <dl className="mt-5 divide-y divide-[var(--line)]">
            <Detail label="Church slug" value={settings.slug} />
            <Detail label="Status" value={formatStatus(settings.status)} />
            <Detail label="Default currency" value={settings.defaultCurrency} />
          </dl>
          <p className="mt-4 text-[10px] leading-5 text-[var(--muted)]">
            These identity fields are read-only here and cannot be changed by a
            profile save.
          </p>
        </section>

        <section className="soft-card rounded-[22px] p-5">
          <SectionHeader eyebrow="This page" title="Editable settings" />
          <div className="mt-5 space-y-3">
            {editableSettings.map((item) => (
              <p
                className="flex items-start gap-2 text-[10px] leading-5 text-[var(--muted)]"
                key={item}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage-dark)]">
                  <CheckIcon size={12} />
                </span>
                {item}
              </p>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-[10px] text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[10px] font-bold">
        {value}
      </dd>
    </div>
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
