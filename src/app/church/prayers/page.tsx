import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeader } from "@/components/dashboard-shell";
import { CheckIcon, HeartIcon, ShieldIcon } from "@/components/icons";
import { PrayerReviewForm } from "@/components/prayer-review-form";
import { requireChurchPermission } from "@/lib/auth/guards";
import { getPrayerRequestQueue } from "@/lib/church-prayer-requests-dal";
import type { ChurchPrayerRequest } from "@/lib/prayer-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church prayer requests",
  description: "Review the private prayer-request queue for the selected church.",
};

const timestampFormatter = new Intl.DateTimeFormat("en-BB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(value: string) {
  return `${timestampFormatter.format(new Date(value))} UTC`;
}

export default async function ChurchPrayerRequestsPage() {
  const { workspace } = await requireChurchPermission(
    "prayer_requests_review",
  );
  let result: Awaited<ReturnType<typeof getPrayerRequestQueue>>;
  try {
    const client = await createServerSupabaseClient();
    result = await getPrayerRequestQueue(client, workspace.churchId);
  } catch {
    return <PrayerQueueUnavailable />;
  }

  if (!result.ok) {
    return <PrayerQueueUnavailable />;
  }

  const awaitingReview = result.requests.filter(
    (request) => !request.isReviewed,
  ).length;
  const reviewed = result.requests.length - awaitingReview;

  return (
    <main className="mx-auto min-w-0 max-w-6xl pb-24" key={workspace.churchId}>
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Restricted church workspace
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
          Prayer requests
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
          Review sensitive prayer text in a dedicated pastoral queue, separate
          from transactions, receipts, statements, and accounting reports.
        </p>
      </header>

      <section
        className="mb-6 flex min-w-0 items-start gap-3 rounded-[22px] border border-[#c7dbd3] bg-[var(--sage-pale)] p-5 sm:p-6"
        role="note"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--sage-dark)]">
          <ShieldIcon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">Private review boundary</p>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            Access is limited to the church&apos;s authorized prayer reviewers.
            This queue does not include donor identity, donation amounts, funds,
            payment details, receipt details, or reviewer identity.
          </p>
        </div>
      </section>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="soft-card min-w-0 rounded-[22px] p-5 sm:p-6">
          <SectionHeader eyebrow="Pastoral care" title="Private review queue" />
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ink-soft)]">
            Showing up to 100 requests. Unreviewed requests are shown oldest
            first; reviewed requests follow with the most recently reviewed
            first.
          </p>

          {result.requests.length === 0 ? (
            <div
              className="mt-6 rounded-[22px] border border-dashed border-[var(--line)] bg-[#f7f5f0] px-5 py-9 text-center"
              role="status"
            >
              <HeartIcon className="mx-auto text-[var(--sage)]" size={24} />
              <h2 className="mt-3 text-sm font-bold">No saved prayer requests</h2>
              <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[var(--ink-soft)]">
                The public giving page currently provides an unsaved local draft
                only, so it cannot create a request in this queue.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {result.requests.map((request) => (
                <PrayerRequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24">
          <section className="soft-card rounded-[22px] p-5">
            <SectionHeader eyebrow="Queue status" title="Review summary" />
            <dl className="mt-4 divide-y divide-[var(--line)]">
              <QueueCount label="Shown awaiting review" value={awaitingReview} />
              <QueueCount label="Shown reviewed" value={reviewed} />
            </dl>
          </section>

          <section className="rounded-[22px] bg-[var(--ink)] p-5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b9d7cb]">
              Policy status
            </p>
            <h2 className="mt-2 text-base font-bold">Retention is pending</h2>
            <p className="mt-3 text-[10px] leading-5 text-white/70">
              No timer, automatic purge, deletion, redaction, donor self-service,
              or prayer-email workflow is enabled. Final access, retention,
              deletion, and email rules still require approval.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function PrayerRequestCard({
  request,
}: Readonly<{ request: ChurchPrayerRequest }>) {
  return (
    <article className="min-w-0 rounded-[22px] border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--sage)]">
            {request.isReviewed ? "Reviewed request" : "Awaiting review"}
          </p>
          <p className="mt-2 text-[10px] leading-5 text-[var(--ink-soft)]">
            Received {formatTimestamp(request.createdAt)}
          </p>
        </div>
        <span
          className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-bold ${
            request.isReviewed
              ? "bg-[#edf1f5] text-[#496785]"
              : "bg-[var(--gold-pale)] text-[#79581f]"
          }`}
        >
          {request.isReviewed ? <CheckIcon size={12} /> : <HeartIcon size={12} />}
          {request.isReviewed ? "Reviewed" : "New"}
        </span>
      </div>

      <p
        className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-[#f7f5f0] p-4 text-sm leading-6 text-[var(--ink)] [overflow-wrap:anywhere]"
        dir="auto"
      >
        {request.body}
      </p>

      <dl className="mt-4 grid min-w-0 gap-3 text-[9px] text-[var(--ink-soft)] sm:grid-cols-2">
        <div>
          <dt className="font-bold">Consent recorded</dt>
          <dd className="mt-1 break-words [overflow-wrap:anywhere]">
            {formatTimestamp(request.consentedAt)}
          </dd>
        </div>
        {request.reviewedAt ? (
          <div>
            <dt className="font-bold">Reviewed</dt>
            <dd className="mt-1 break-words [overflow-wrap:anywhere]">
              {formatTimestamp(request.reviewedAt)}
            </dd>
          </div>
        ) : null}
      </dl>

      {!request.isReviewed ? (
        <PrayerReviewForm
          expectedRevision={request.revision}
          prayerRequestId={request.id}
          requestId={randomUUID()}
        />
      ) : null}
    </article>
  );
}

function QueueCount({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-[10px] text-[var(--ink-soft)]">{label}</dt>
      <dd className="text-sm font-bold">{value}</dd>
    </div>
  );
}

function PrayerQueueUnavailable() {
  return (
    <main className="mx-auto min-w-0 max-w-3xl pb-24">
      <section
        className="soft-card rounded-[24px] p-6 text-center sm:p-8"
        role="alert"
      >
        <ShieldIcon className="mx-auto text-[var(--sage)]" size={24} />
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Private queue unavailable
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
          Prayer requests could not be loaded.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-5 text-[var(--ink-soft)]">
          No prayer text is displayed in this state. Refresh the protected page
          to retry the permission-checked request.
        </p>
        <Link
          className="focus-ring mt-6 inline-flex rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white"
          href="/church/prayers"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
