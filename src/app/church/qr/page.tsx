import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeader } from "@/components/dashboard-shell";
import { GivingQr } from "@/components/giving-qr";
import {
  ArrowRightIcon,
  CheckIcon,
  QrIcon,
  ShieldIcon,
} from "@/components/icons";
import { requireChurchPermission } from "@/lib/auth/guards";
import {
  getPublicAppUrl,
  isLocalAppUrl,
  isVercelPreviewEnvironment,
} from "@/lib/public-app-url";
import {
  createPublicGivingPath,
  createPublicQrUrl,
} from "@/lib/public-church-routing";
import {
  getChurchQrSnapshot,
  type ChurchQrSnapshot,
  type ChurchQrSnapshotResult,
} from "@/lib/qr-routing-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church giving QR",
  description: "View and download the selected church's permanent giving QR code.",
};

const printChecklist = [
  "Keep a clear white border around the code.",
  "Print at least 3 cm wide for handouts and pew cards.",
  "Test the final printed version with two different phones.",
  "Place a short giving instruction beside the QR code.",
] as const;

export default async function ChurchQrPage() {
  const { workspace } = await requireChurchPermission("qr_read");
  let result: ChurchQrSnapshotResult;
  try {
    const supabase = await createServerSupabaseClient();
    result = await getChurchQrSnapshot(supabase, workspace.churchId);
  } catch {
    result = { ok: false, reason: "unavailable" };
  }

  if (!result.ok) {
    return (
      <ChurchQrUnavailable
        churchId={workspace.churchId}
        reason={result.reason}
      />
    );
  }

  let appUrl: string;
  try {
    appUrl = getPublicAppUrl();
  } catch {
    return (
      <ChurchQrUnavailable
        churchId={workspace.churchId}
        reason="unavailable"
      />
    );
  }

  const givingPath = createPublicGivingPath(result.snapshot.churchSlug);
  const givingUrl = createPublicQrUrl(appUrl, result.snapshot.shortCode);
  if (!givingPath || !givingUrl) {
    return (
      <ChurchQrUnavailable
        churchId={workspace.churchId}
        reason="unavailable"
      />
    );
  }

  const publiclyAvailable =
    workspace.churchStatus === "active" && result.snapshot.isActive;
  const isPreviewDeployment = isVercelPreviewEnvironment();

  return (
    <main className="mx-auto max-w-[1180px] pb-24" key={workspace.churchId}>
      <div className="mb-6 lg:hidden">
        <p className="text-xs text-[var(--ink-soft)]">Permanent giving link</p>
        <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">
          Giving QR
        </h1>
      </div>

      <section className="mb-6 flex flex-col gap-4 rounded-[22px] bg-[var(--ink)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#2f796b]">
            <QrIcon size={20} />
          </span>
          <div>
            <p className="text-sm font-bold">One permanent QR code</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/75">
              Use this resolver code on screens, bulletins and signage. It opens
              the church&apos;s current giving-page path without storing member,
              card or merchant information.
            </p>
          </div>
        </div>
        {publiclyAvailable ? (
          <Link
            className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold !text-[#122235]"
            href={givingPath}
          >
            Preview giving page <ArrowRightIcon size={15} />
          </Link>
        ) : null}
      </section>

      {!publiclyAvailable ? (
        <QrAvailabilityNotice
          churchStatus={workspace.churchStatus}
          qrActive={result.snapshot.isActive}
        />
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,.85fr)_minmax(0,1.15fr)]">
        <section className="soft-card rounded-[24px] p-5 sm:p-7">
          <SectionHeader
            eyebrow="Preview artwork"
            title={`${workspace.displayName} giving code`}
          />
          {publiclyAvailable ? (
            <div className="mt-6 rounded-[24px] bg-[#eeece5] p-5 text-center sm:p-8">
              <GivingQr
                churchName={workspace.displayName}
                churchSlug={result.snapshot.churchSlug}
                value={givingUrl}
              />
            </div>
          ) : (
            <div
              className="mt-6 rounded-[24px] border border-[var(--line)] bg-[#eeece5] p-6 text-center"
              role="status"
            >
              <p className="text-sm font-bold">Download unavailable</p>
              <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                QR artwork is hidden until both the church and its permanent QR
                resolver are active.
              </p>
            </div>
          )}
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              Permanent resolver URL
            </p>
            <p className="mt-2 break-all text-[10px] leading-5 text-[var(--ink-soft)]">
              {givingUrl}
            </p>
          </div>
          {isLocalAppUrl(appUrl) ? (
            <p className="mt-3 rounded-xl bg-[var(--gold-pale)] px-3 py-2.5 text-center text-[10px] leading-4 text-[#8a641f]">
              Local preview QR. Set NEXT_PUBLIC_APP_URL to the approved public
              origin before printing.
            </p>
          ) : null}
        </section>

        <div className="space-y-6">
          <QrStatusCard
            givingPath={givingPath}
            publiclyAvailable={publiclyAvailable}
            snapshot={result.snapshot}
          />

          <section className="soft-card rounded-[24px] p-5 sm:p-7">
            <SectionHeader eyebrow="Print guide" title="Before you publish" />
            <p className="mt-3 rounded-xl bg-[var(--gold-pale)] px-3 py-2.5 text-[10px] leading-5 text-[#76521b]">
              {isPreviewDeployment
                ? "Preview deployment configuration — do not print until this release is promoted and the approved origin is verified."
                : "Preview validation only. Do not publish or print the permanent QR until the final platform domain and DNS are approved."}
            </p>
            <ul className="mt-5 space-y-3">
              {printChecklist.map((item) => (
                <li
                  className="flex items-start gap-3 rounded-2xl bg-[#f3f1eb] px-4 py-3"
                  key={item}
                >
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--sage)] text-white">
                    <CheckIcon size={12} />
                  </span>
                  <span className="text-[11px] leading-5 text-[var(--ink-soft)]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[24px] border border-[#c9dbd4] bg-[var(--sage-pale)] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-[var(--sage-dark)]">
                <ShieldIcon size={19} />
              </span>
              <div>
                <h2 className="text-sm font-bold">Safe public destination</h2>
                <p className="mt-1 text-[10px] leading-5 text-[var(--ink-soft)]">
                  The resolver redirects only to a validated same-origin giving
                  path. Subdomain routing remains disabled until the final
                  platform domain and DNS are approved.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function QrAvailabilityNotice({
  churchStatus,
  qrActive,
}: Readonly<{
  churchStatus: "onboarding" | "active";
  qrActive: boolean;
}>) {
  const copy =
    churchStatus === "onboarding"
      ? "This stable QR is reserved for testing, but public resolution stays unavailable until the church is activated."
      : qrActive
        ? "Public resolution is not available right now."
        : "This permanent QR resolver is inactive and will not open a public giving page.";

  return (
    <section
      className="mb-6 rounded-[22px] border border-[#e5cf9d] bg-[var(--gold-pale)] p-4 text-[#76521b]"
      role="status"
    >
      <p className="text-xs font-bold">Resolver unavailable</p>
      <p className="mt-1 text-[10px] leading-5">{copy}</p>
    </section>
  );
}

function QrStatusCard({
  givingPath,
  publiclyAvailable,
  snapshot,
}: Readonly<{
  givingPath: string;
  publiclyAvailable: boolean;
  snapshot: ChurchQrSnapshot;
}>) {
  return (
    <section className="soft-card rounded-[24px] p-5 sm:p-7">
      <SectionHeader eyebrow="Status" title="QR destination" />
      <dl className="mt-5 divide-y divide-[var(--line)]">
        <div className="flex items-start justify-between gap-5 py-4 first:pt-0">
          <dt>
            <p className="text-xs font-bold">Permanent resolver</p>
            <p className="mt-1 text-[10px] leading-5 text-[var(--ink-soft)]">
              The stable short route stored in the database.
            </p>
          </dt>
          <dd
            className={
              publiclyAvailable
                ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--sage-pale)] px-3 py-1.5 text-[9px] font-bold text-[var(--sage-dark)]"
                : "rounded-full bg-[var(--gold-pale)] px-3 py-1.5 text-[9px] font-bold text-[#8b621f]"
            }
          >
            {publiclyAvailable ? (
              <>
                <CheckIcon size={13} /> Configured
              </>
            ) : snapshot.isActive ? (
              "Reserved"
            ) : (
              "Inactive"
            )}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-5 py-4">
          <dt>
            <p className="text-xs font-bold">Destination page</p>
            <p className="mt-1 text-[10px] leading-5 text-[var(--ink-soft)]">
              Current same-origin church giving path.
            </p>
          </dt>
          <dd className="max-w-44 break-all text-right text-[10px] font-semibold text-[var(--sage-dark)]">
            {givingPath}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-5 py-4 last:pb-0">
          <dt>
            <p className="text-xs font-bold">Checkout status</p>
            <p className="mt-1 text-[10px] leading-5 text-[var(--ink-soft)]">
              Requires a verified church merchant connection.
            </p>
          </dt>
          <dd className="rounded-full bg-[var(--gold-pale)] px-3 py-1.5 text-[9px] font-bold text-[#8b621f]">
            Preview only
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ChurchQrUnavailable({
  churchId,
  reason,
}: Readonly<{
  churchId: string;
  reason: "forbidden" | "unavailable";
}>) {
  return (
    <main
      className="mx-auto grid min-h-[60vh] max-w-[1180px] place-items-center pb-24"
      key={churchId}
    >
      <section
        className="soft-card w-full max-w-xl rounded-[24px] p-6 text-center sm:p-8"
        role="alert"
      >
        <QrIcon className="mx-auto text-[var(--sage)]" size={28} />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          QR temporarily unavailable
        </p>
        <h1 className="font-display mt-3 text-3xl tracking-[-0.035em]">
          We could not load this church&apos;s QR code.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {reason === "forbidden"
            ? "Your current access could not be confirmed. Refresh the page or choose the church workspace again."
            : "No QR artwork was generated. Refresh the page and try again."}
        </p>
      </section>
    </main>
  );
}
