"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireMemberWorkspace } from "@/lib/auth/guards";
import {
  mutateMyDonorProfile,
  type DonorProfileMutationFailureReason,
} from "@/lib/donor-profile-dal";
import {
  donorProfileValuesEqual,
  isDonorProfileRequestId,
  isDonorProfileRevision,
  validateDonorProfileForm,
  type DonorProfileActionState,
  type DonorProfileFieldErrors,
  type DonorProfileValues,
} from "@/lib/donor-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<
  Record<DonorProfileMutationFailureReason, string>
> = {
  forbidden:
    "Your member profile access could not be confirmed. Refresh the page and try again.",
  idempotency_conflict:
    "This save reference was already used for different details. Reload your profile before trying again.",
  invalid_request:
    "Your profile details were not accepted. Check the name and try again.",
  no_changes: "Your giving profile already has this name.",
  revision_conflict:
    "Your giving profile changed in another session. Reload the page and review the current name.",
  unavailable:
    "The profile save could not be confirmed. Keep the name unchanged and retry this exact request.",
};

const RETRY_MISMATCH_MESSAGE =
  "This unconfirmed save must be retried with exactly the same name. Restore the previous value and retry without refreshing the page.";

function parseRevision(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const revision = Number(value);
  return isDonorProfileRevision(revision) ? revision : null;
}

function errorState(
  previousState: DonorProfileActionState,
  options: Readonly<{
    message: string;
    values?: DonorProfileValues;
    fieldErrors?: DonorProfileFieldErrors;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): DonorProfileActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.rotateRequestId ? randomUUID() : previousState.requestId,
    expectedRevision: previousState.expectedRevision,
    values: options.values ?? previousState.values,
    retryRequired: options.retryRequired ?? previousState.retryRequired,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

function revalidateMemberProfile() {
  try {
    revalidatePath("/dashboard");
  } catch {
    // A confirmed database result stays confirmed if cache invalidation fails.
  }
}

export async function updateDonorProfileAction(
  previousState: DonorProfileActionState,
  formData: FormData,
): Promise<DonorProfileActionState> {
  // Re-authorize independently before reading any untrusted action state/input.
  const { workspace } = await requireMemberWorkspace();

  const submittedRevision = parseRevision(formData.get("expectedProfileRevision"));
  if (
    !isDonorProfileRequestId(previousState.requestId) ||
    !isDonorProfileRevision(previousState.expectedRevision) ||
    formData.get("requestId") !== previousState.requestId ||
    submittedRevision !== previousState.expectedRevision
  ) {
    return errorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "This save reference is invalid. Reload your profile and try again.",
    });
  }

  const validation = validateDonorProfileForm(formData);
  if (!validation.success) {
    return errorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "Check the highlighted field and try again.",
      values: previousState.retryRequired
        ? previousState.values
        : validation.values,
      ...(previousState.retryRequired
        ? {}
        : { fieldErrors: validation.fieldErrors }),
    });
  }

  if (
    previousState.retryRequired &&
    !donorProfileValuesEqual(previousState.values, validation.values)
  ) {
    return errorState(previousState, {
      message: RETRY_MISMATCH_MESSAGE,
      retryRequired: true,
    });
  }

  let client: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    client = await createServerSupabaseClient();
  } catch {
    return errorState(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      values: validation.values,
      retryRequired: true,
    });
  }

  let result: Awaited<ReturnType<typeof mutateMyDonorProfile>>;
  try {
    result = await mutateMyDonorProfile(
      client,
      {
        churchId: workspace.churchId,
        expectedDonorId: workspace.donorId,
      },
      previousState.requestId,
      previousState.expectedRevision,
      validation.data,
    );
  } catch {
    return errorState(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      values: validation.values,
      retryRequired: true,
    });
  }

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return errorState(previousState, {
        message: FAILURE_MESSAGES.unavailable,
        values: validation.values,
        retryRequired: true,
      });
    }

    revalidateMemberProfile();
    if (result.reason === "no_changes") {
      return {
        status: "success",
        message: FAILURE_MESSAGES.no_changes,
        responseEpoch: previousState.responseEpoch + 1,
        requestId: randomUUID(),
        expectedRevision: previousState.expectedRevision,
        values: validation.values,
        retryRequired: false,
      };
    }

    return errorState(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      values: validation.values,
      retryRequired: false,
      rotateRequestId: true,
    });
  }

  revalidateMemberProfile();
  return {
    status: "success",
    message: result.replayed
      ? "The original profile save was recovered without applying it twice."
      : "Your giving profile name was saved for this church.",
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    expectedRevision: result.profileRevision,
    values: validation.values,
    retryRequired: false,
    replayed: result.replayed,
  };
}
