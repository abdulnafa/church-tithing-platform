"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import {
  mutatePlatformTenantLifecycle,
  type PlatformLifecycleFailureReason,
} from "@/lib/platform/platform-management-dal";
import {
  isPlatformChurchId,
  isPlatformLifecycleOperation,
  isPlatformLifecycleRevision,
  isPlatformRequestId,
  isPlatformSuspensionReasonCode,
  type PlatformLifecycleActionState,
  type PlatformLifecycleMutationInput,
} from "@/lib/platform/platform-tenant-management";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<Record<PlatformLifecycleFailureReason, string>> = {
  forbidden:
    "Your Platform Admin access could not be verified. Refresh the page and try again.",
  idempotency_conflict:
    "This change reference was already used for different details. Refresh the tenant list before trying again.",
  invalid_request:
    "The tenant status change was not accepted. Check the confirmation and try again.",
  not_found:
    "This church is no longer available. Refresh the tenant list to review the latest state.",
  not_ready:
    "This church does not yet meet every required activation check. Review the current readiness list before trying again.",
  stale:
    "This church changed in another session. Refresh the tenant list and review the latest state before trying again.",
  transition_not_allowed:
    "That status change is no longer available for this church. Refresh the tenant list to review its current state.",
  unavailable:
    "The tenant status change could not be confirmed. Keep the same selection and retry this exact request.",
};

const RETRY_MISMATCH_MESSAGE =
  "This unconfirmed status request must be retried with exactly the same details. Restore the previous selection and retry without refreshing the page.";

function parseRevision(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const revision = Number(value);
  return isPlatformLifecycleRevision(revision) ? revision : null;
}

function buildErrorState(
  previousState: PlatformLifecycleActionState,
  options: Readonly<{
    message: string;
    suspensionReasonCode?: string;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): PlatformLifecycleActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.rotateRequestId ? randomUUID() : previousState.requestId,
    churchId: previousState.churchId,
    expectedRevision: previousState.expectedRevision,
    operation: previousState.operation,
    suspensionReasonCode:
      options.suspensionReasonCode ?? previousState.suspensionReasonCode,
    retryRequired: options.retryRequired ?? previousState.retryRequired,
  };
}

function revalidatePlatformPages() {
  try {
    revalidatePath("/platform");
  } catch {
    // A confirmed database result must not become an ambiguous retry merely
    // because cache invalidation failed.
  }
}

export async function mutatePlatformTenantLifecycleAction(
  previousState: PlatformLifecycleActionState,
  formData: FormData,
): Promise<PlatformLifecycleActionState> {
  // The layout and page guards do not authorize a Server Action. Re-check
  // before inspecting even submitted tenant identifiers or reason codes.
  await requirePlatformSuperAdmin();

  const submittedRevision = parseRevision(
    formData.get("expectedLifecycleRevision"),
  );
  if (
    !isPlatformRequestId(previousState.requestId) ||
    !isPlatformChurchId(previousState.churchId) ||
    !isPlatformLifecycleRevision(previousState.expectedRevision) ||
    !isPlatformLifecycleOperation(previousState.operation) ||
    formData.get("requestId") !== previousState.requestId ||
    formData.get("churchId") !== previousState.churchId ||
    formData.get("operation") !== previousState.operation ||
    submittedRevision !== previousState.expectedRevision
  ) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "This status change reference is invalid. Refresh the tenant list and try again.",
    });
  }

  const submittedReason = formData.get("suspensionReasonCode");
  const reasonText = typeof submittedReason === "string" ? submittedReason : "";
  const suspensionReasonCode =
    previousState.operation === "suspend" &&
    isPlatformSuspensionReasonCode(reasonText)
      ? reasonText
      : null;
  const confirmation = formData.get("confirmation") === "on";
  const locallyValid =
    confirmation &&
    (previousState.operation === "suspend"
      ? suspensionReasonCode !== null
      : reasonText === "");

  if (!locallyValid) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : previousState.operation === "suspend" && suspensionReasonCode === null
          ? "Choose a suspension reason and confirm the status change."
          : "Confirm the tenant status change before continuing.",
      suspensionReasonCode: previousState.retryRequired
        ? previousState.suspensionReasonCode
        : reasonText,
    });
  }

  if (
    previousState.retryRequired &&
    previousState.suspensionReasonCode !== (suspensionReasonCode ?? "")
  ) {
    return buildErrorState(previousState, {
      message: RETRY_MISMATCH_MESSAGE,
      retryRequired: true,
    });
  }

  const input: PlatformLifecycleMutationInput = {
    requestId: previousState.requestId,
    churchId: previousState.churchId,
    expectedRevision: previousState.expectedRevision,
    operation: previousState.operation,
    suspensionReasonCode,
  };

  let client: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return buildErrorState(previousState, {
      message: "Tenant management is temporarily unavailable. Try this request again.",
      suspensionReasonCode: suspensionReasonCode ?? "",
    });
  }

  let result: Awaited<ReturnType<typeof mutatePlatformTenantLifecycle>>;
  try {
    result = await mutatePlatformTenantLifecycle(client, input);
  } catch {
    return buildErrorState(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      suspensionReasonCode: suspensionReasonCode ?? "",
      retryRequired: true,
    });
  }

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return buildErrorState(previousState, {
        message: FAILURE_MESSAGES.unavailable,
        suspensionReasonCode: suspensionReasonCode ?? "",
        retryRequired: true,
      });
    }

    revalidatePlatformPages();
    return buildErrorState(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      suspensionReasonCode: suspensionReasonCode ?? "",
      retryRequired: false,
      rotateRequestId: true,
    });
  }

  revalidatePlatformPages();
  const operationLabel =
    previousState.operation === "activate"
      ? "activated"
      : previousState.operation === "suspend"
        ? "suspended"
        : "restored";

  return {
    status: "success",
    message: result.mutation.replayed
      ? `The original ${operationLabel} status change was recovered without applying it twice.`
      : `The church was ${operationLabel}. This changes its database tenant and public status only.`,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    churchId: previousState.churchId,
    expectedRevision: result.mutation.lifecycleRevision,
    operation: previousState.operation,
    suspensionReasonCode: suspensionReasonCode ?? "",
    retryRequired: false,
    result: result.mutation,
  };
}
