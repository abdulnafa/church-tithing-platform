"use client";

import { useActionState } from "react";

import { reviewPrayerRequestAction } from "@/app/church/prayers/actions";
import { CheckIcon } from "@/components/icons";
import { createInitialPrayerReviewActionState } from "@/lib/prayer-request";

export function PrayerReviewForm({
  expectedRevision,
  prayerRequestId,
  requestId,
}: Readonly<{
  expectedRevision: number;
  prayerRequestId: string;
  requestId: string;
}>) {
  const [state, formAction, isPending] = useActionState(
    reviewPrayerRequestAction,
    createInitialPrayerReviewActionState(
      requestId,
      prayerRequestId,
      expectedRevision,
    ),
  );
  const completed = state.status === "success";

  return (
    <form action={formAction} className="mt-5 border-t border-[var(--line)] pt-4">
      <input name="reviewRequestId" type="hidden" value={state.requestId} />
      <input
        name="prayerRequestId"
        type="hidden"
        value={state.prayerRequestId}
      />
      <input
        name="expectedPrayerRevision"
        type="hidden"
        value={state.expectedRevision}
      />

      <div aria-atomic="true" aria-live="polite">
        {state.status !== "idle" ? (
          <p
            className={`mb-3 rounded-2xl px-4 py-3 text-[10px] leading-5 ${
              state.status === "success"
                ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
                : "bg-[#f5e8e5] text-[#914137]"
            }`}
            key={state.responseEpoch}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {state.retryRequired ? (
        <p
          className="mb-3 rounded-2xl bg-[var(--gold-pale)] px-4 py-3 text-[10px] leading-5 text-[#79581f]"
          role="note"
        >
          The previous result is unknown. Retry this exact review without
          refreshing so the saved request reference can prevent duplication.
        </p>
      ) : null}

      <button
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
        disabled={isPending || completed}
        type="submit"
      >
        {completed
          ? "Review recorded"
          : isPending
          ? "Recording review..."
          : state.retryRequired
            ? "Retry unchanged review"
            : "Mark as reviewed"}
        {!isPending ? <CheckIcon size={15} /> : null}
      </button>
    </form>
  );
}
