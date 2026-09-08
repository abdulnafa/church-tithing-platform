"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireChurchPermission } from "@/lib/auth/guards";
import {
  churchStaffValuesEqual,
  getChurchStaffRoleLabel,
  isChurchStaffRequestId,
  parseStaffRevision,
  validateChurchStaffForm,
  type ChurchStaffAction,
  type ChurchStaffActionState,
  type ChurchStaffFieldErrors,
  type ChurchStaffValues,
  type ManagedChurchStaffRole,
} from "@/lib/church-staff";
import {
  mutateChurchStaff,
  type ChurchStaffMutationFailureReason,
} from "@/lib/church-staff-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<
  Record<ChurchStaffMutationFailureReason, string>
> = {
  forbidden:
    "Your permission to manage staff could not be verified. Refresh the page and try again.",
  invalid_request:
    "The staff change was not accepted. Check the details and try again.",
  idempotency_conflict:
    "This change reference was already used for different details. Refresh the page before making another change.",
  revision_conflict:
    "The staff list changed in another session. Refresh the page and review the latest version before trying again.",
  not_found:
    "This staff membership is no longer available. Refresh the page to view the latest list.",
  owner_protected:
    "Owner memberships are protected. Owner transfer is not available in this workflow.",
  self_protected:
    "You cannot invite your own email or change your own membership through this workflow.",
  email_conflict:
    "That email is already associated with another staff membership for this church.",
  already_invited:
    "A pending invitation is already recorded for that email address.",
  already_removed:
    "This staff membership has already been removed.",
  not_manageable:
    "This membership cannot be changed in its current state. Refresh the page to review it.",
  no_changes: "No staff changes were detected.",
  unavailable:
    "The staff change could not be confirmed. Keep this form unchanged and retry the same request; its reference prevents a duplicate update.",
};

const RETRY_MISMATCH_MESSAGE =
  "This unconfirmed request must be retried with exactly the same details. Restore the previous values and retry without refreshing the page.";

type AuthorizedWorkspace = Awaited<
  ReturnType<typeof requireChurchPermission>
>["workspace"];

function isStateRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function buildErrorState(
  previousState: ChurchStaffActionState,
  options: Readonly<{
    message: string;
    values?: ChurchStaffValues;
    fieldErrors?: ChurchStaffFieldErrors;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): ChurchStaffActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.rotateRequestId ? randomUUID() : previousState.requestId,
    staffRevision: previousState.staffRevision,
    operation: previousState.operation,
    membershipId: previousState.membershipId,
    values: options.values ?? previousState.values,
    retryRequired: options.retryRequired ?? previousState.retryRequired,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

function shouldRefreshAfterFailure(reason: ChurchStaffMutationFailureReason) {
  return (
    reason === "idempotency_conflict" ||
    reason === "revision_conflict" ||
    reason === "not_found" ||
    reason === "already_invited" ||
    reason === "already_removed" ||
    reason === "not_manageable" ||
    reason === "no_changes"
  );
}

async function runStaffMutation(
  workspace: AuthorizedWorkspace,
  previousState: ChurchStaffActionState,
  formData: FormData,
  operation: ChurchStaffAction,
): Promise<ChurchStaffActionState> {
  const submittedRequestId = formData.get("requestId");
  const submittedRevision = parseStaffRevision(
    formData.get("expectedStaffRevision"),
  );
  if (
    previousState.operation !== operation ||
    !isChurchStaffRequestId(previousState.requestId) ||
    submittedRequestId !== previousState.requestId ||
    !isStateRevision(previousState.staffRevision) ||
    submittedRevision !== previousState.staffRevision
  ) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "This staff change reference is invalid. Refresh the page and try again.",
    });
  }

  const validation = validateChurchStaffForm(
    formData,
    operation,
    previousState.membershipId,
  );
  if (!validation.success) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "Check the highlighted staff details and try again.",
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
    !churchStaffValuesEqual(previousState.values, validation.values)
  ) {
    return buildErrorState(previousState, {
      message: RETRY_MISMATCH_MESSAGE,
      values: previousState.values,
      retryRequired: true,
    });
  }

  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return buildErrorState(previousState, {
      message:
        "Staff management is temporarily unavailable. Try this request again.",
      values: validation.values,
    });
  }

  let result: Awaited<ReturnType<typeof mutateChurchStaff>>;
  try {
    result = await mutateChurchStaff(
      supabase,
      previousState.requestId,
      workspace.churchId,
      previousState.staffRevision,
      validation.input,
    );
  } catch {
    return buildErrorState(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      values: validation.values,
      retryRequired: true,
    });
  }

  if (!result.ok) {
    if (result.reason === "unavailable") {
      return buildErrorState(previousState, {
        message: FAILURE_MESSAGES.unavailable,
        values: validation.values,
        retryRequired: true,
      });
    }

    if (shouldRefreshAfterFailure(result.reason)) {
      revalidatePath("/church/members");
    }

    return buildErrorState(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      values: validation.values,
      retryRequired: false,
      rotateRequestId: true,
      ...(operation === "invite" &&
      (result.reason === "email_conflict" ||
        result.reason === "already_invited" ||
        result.reason === "self_protected")
        ? { fieldErrors: { email: FAILURE_MESSAGES[result.reason] } }
        : {}),
      ...(operation === "change_role" && result.reason === "no_changes"
        ? { fieldErrors: { role: FAILURE_MESSAGES.no_changes } }
        : {}),
    });
  }

  revalidatePath("/church/members");

  return {
    status: "success",
    message: result.replayed
      ? "The original staff change was recovered without applying it twice."
      : getSuccessMessage(operation, validation.values, result.role),
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    staffRevision: result.staffRevision,
    operation: previousState.operation,
    membershipId: previousState.membershipId,
    values: validation.values,
    retryRequired: false,
  };
}

function getSuccessMessage(
  operation: ChurchStaffAction,
  values: ChurchStaffValues,
  resultRole: ManagedChurchStaffRole,
) {
  if (operation === "invite") {
    return `${values.email} was recorded as a pending ${getChurchStaffRoleLabel(resultRole).toLowerCase()} invitation. No email was sent, and this action did not create an account. Delivery remains unavailable until transactional email and invitation setup is configured.`;
  }
  if (operation === "change_role") {
    return `The staff role was changed to ${getChurchStaffRoleLabel(resultRole)}.`;
  }
  return "Staff access was removed. The membership remains in management history.";
}

export async function inviteChurchStaffAction(
  previousState: ChurchStaffActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("staff_manage");
  return runStaffMutation(workspace, previousState, formData, "invite");
}

export async function changeChurchStaffRoleAction(
  previousState: ChurchStaffActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("staff_manage");
  return runStaffMutation(workspace, previousState, formData, "change_role");
}

export async function removeChurchStaffAction(
  previousState: ChurchStaffActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("staff_manage");
  return runStaffMutation(workspace, previousState, formData, "remove");
}
