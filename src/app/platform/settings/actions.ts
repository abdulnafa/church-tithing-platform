"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import {
  updatePlatformOnboardingDefaults,
  type PlatformOnboardingDefaultsFailureReason,
} from "@/lib/platform/platform-management-dal";
import {
  platformOnboardingDefaultsValuesEqual,
  validatePlatformOnboardingDefaultsForm,
  type PlatformOnboardingDefaultsActionState,
  type PlatformOnboardingDefaultsFieldErrors,
  type PlatformOnboardingDefaultsValues,
} from "@/lib/platform/platform-onboarding-defaults";
import {
  isPlatformLifecycleRevision,
  isPlatformRequestId,
} from "@/lib/platform/platform-tenant-management";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<
  Record<PlatformOnboardingDefaultsFailureReason, string>
> = {
  forbidden:
    "Your Platform Admin access could not be verified. Refresh the page and try again.",
  idempotency_conflict:
    "This save reference was already used for different values. Reload the settings before trying again.",
  invalid_request:
    "The onboarding defaults were not accepted. Check the fields and try again.",
  no_changes: "No onboarding default values changed.",
  stale:
    "These defaults changed in another session. Reload the page and review the latest values before trying again.",
  unavailable:
    "The onboarding-default save could not be confirmed. Keep every field unchanged and retry this exact request.",
};

const RETRY_MISMATCH_MESSAGE =
  "This unconfirmed save must be retried with exactly the same values. Restore the previous values and retry without refreshing the page.";

function parseRevision(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const revision = Number(value);
  return isPlatformLifecycleRevision(revision) ? revision : null;
}

function errorState(
  previousState: PlatformOnboardingDefaultsActionState,
  options: Readonly<{
    message: string;
    values?: PlatformOnboardingDefaultsValues;
    fieldErrors?: PlatformOnboardingDefaultsFieldErrors;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): PlatformOnboardingDefaultsActionState {
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

function revalidateDefaultsConsumers() {
  try {
    revalidatePath("/platform");
    revalidatePath("/platform/settings");
    revalidatePath("/platform/onboarding");
  } catch {
    // The save is already confirmed; cache invalidation cannot make it
    // ambiguous or safe to repeat under a new request reference.
  }
}

export async function updatePlatformOnboardingDefaultsAction(
  previousState: PlatformOnboardingDefaultsActionState,
  formData: FormData,
): Promise<PlatformOnboardingDefaultsActionState> {
  // Re-authorize before parsing platform-wide settings submitted by the client.
  await requirePlatformSuperAdmin();

  const submittedRevision = parseRevision(formData.get("expectedSettingsRevision"));
  if (
    !isPlatformRequestId(previousState.requestId) ||
    !isPlatformLifecycleRevision(previousState.expectedRevision) ||
    formData.get("requestId") !== previousState.requestId ||
    submittedRevision !== previousState.expectedRevision
  ) {
    return errorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "This save reference is invalid. Reload the page and try again.",
    });
  }

  const validation = validatePlatformOnboardingDefaultsForm(formData);
  if (!validation.success) {
    return errorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "Check the highlighted fields and try again.",
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
    !platformOnboardingDefaultsValuesEqual(
      previousState.values,
      validation.values,
    )
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
      message: "Platform settings are temporarily unavailable. Try this save again.",
      values: validation.values,
    });
  }

  let result: Awaited<ReturnType<typeof updatePlatformOnboardingDefaults>>;
  try {
    result = await updatePlatformOnboardingDefaults(
      client,
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

    revalidateDefaultsConsumers();
    return errorState(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      values: validation.values,
      retryRequired: false,
      rotateRequestId: true,
    });
  }

  revalidateDefaultsConsumers();
  return {
    status: "success",
    message: result.replayed
      ? "The original onboarding-default save was recovered without applying it twice."
      : "Onboarding defaults were saved for future church setup forms.",
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    expectedRevision: result.defaults.settingsRevision,
    values: {
      defaultCurrency: result.defaults.defaultCurrency,
      defaultTimezone: result.defaults.defaultTimezone,
      defaultPrimaryColor: result.defaults.defaultPrimaryColor,
      defaultSecondaryColor: result.defaults.defaultSecondaryColor,
    },
    retryRequired: false,
    replayed: result.replayed,
  };
}
