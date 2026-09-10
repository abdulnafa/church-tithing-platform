"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireChurchPermission } from "@/lib/auth/guards";
import {
  reviewPrayerRequest,
  type PrayerReviewFailureReason,
} from "@/lib/church-prayer-requests-dal";
import {
  isPrayerRequestId,
  isPrayerRequestRevision,
  isPrayerReviewRequestId,
  parsePrayerRequestRevision,
  type PrayerReviewActionState,
} from "@/lib/prayer-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<Record<PrayerReviewFailureReason, string>> = {
  forbidden:
    "Your permission to review prayer requests could not be confirmed. Refresh the page and try again.",
  invalid_request:
    "This review request is invalid. Refresh the page before trying again.",
  idempotency_conflict:
    "This review reference was already used for a different request. Refresh the page before trying again.",
  not_found:
    "This prayer request is no longer available. Refresh the page to update the queue.",
  revision_conflict:
    "This prayer request changed in another session. Refresh the page before reviewing it.",
  already_reviewed:
    "This prayer request was already reviewed in another session. Refresh the page to update the queue.",
  unavailable:
    "The review could not be confirmed. Keep this request unchanged and retry the same review.",
};

function actionError(
  previousState: PrayerReviewActionState,
  options: Readonly<{
    message: string;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): PrayerReviewActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.rotateRequestId ? randomUUID() : previousState.requestId,
    prayerRequestId: previousState.prayerRequestId,
    expectedRevision: previousState.expectedRevision,
    retryRequired: options.retryRequired ?? previousState.retryRequired,
  };
}

function revalidatePrayerQueue() {
  try {
    revalidatePath("/church/prayers");
  } catch {
    // A confirmed database result remains confirmed if cache refresh fails.
  }
}

export async function reviewPrayerRequestAction(
  previousState: PrayerReviewActionState,
  formData: FormData,
): Promise<PrayerReviewActionState> {
  // Treat this action as an independently reachable endpoint: authorize before
  // reading any client-controlled action state or form values.
  const { workspace } = await requireChurchPermission(
    "prayer_requests_review",
  );

  const submittedRevision = parsePrayerRequestRevision(
    formData.get("expectedPrayerRevision"),
  );
  if (
    !isPrayerReviewRequestId(previousState.requestId) ||
    !isPrayerRequestId(previousState.prayerRequestId) ||
    !isPrayerRequestRevision(previousState.expectedRevision) ||
    formData.get("reviewRequestId") !== previousState.requestId ||
    formData.get("prayerRequestId") !== previousState.prayerRequestId ||
    submittedRevision !== previousState.expectedRevision
  ) {
    return actionError(previousState, {
      message: previousState.retryRequired
        ? "Retry the unchanged prayer review. If this continues, refresh the page."
        : FAILURE_MESSAGES.invalid_request,
    });
  }

  let client: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return actionError(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      retryRequired: true,
    });
  }

  let result: Awaited<ReturnType<typeof reviewPrayerRequest>>;
  try {
    result = await reviewPrayerRequest(client, {
      churchId: workspace.churchId,
      prayerRequestId: previousState.prayerRequestId,
      requestId: previousState.requestId,
      expectedRevision: previousState.expectedRevision,
    });
  } catch {
    return actionError(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      retryRequired: true,
    });
  }

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return actionError(previousState, {
        message: FAILURE_MESSAGES.unavailable,
        retryRequired: true,
      });
    }
    revalidatePrayerQueue();
    return actionError(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      retryRequired: false,
      rotateRequestId: true,
    });
  }

  revalidatePrayerQueue();
  return {
    status: "success",
    message: result.replayed
      ? "The original review was recovered without recording it twice."
      : "The prayer request was marked as reviewed.",
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    prayerRequestId: result.prayerRequestId,
    expectedRevision: result.revision,
    retryRequired: false,
    replayed: result.replayed,
  };
}
