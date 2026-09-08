"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireChurchPermission } from "@/lib/auth/guards";
import {
  churchFundValuesEqual,
  isChurchFundRequestId,
  parseFundsRevision,
  validateChurchFundForm,
  type ChurchFundAction,
  type ChurchFundActionState,
  type ChurchFundFieldErrors,
  type ChurchFundValues,
} from "@/lib/church-funds";
import {
  mutateChurchFund,
  type ChurchFundMutationFailureReason,
} from "@/lib/church-funds-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<
  Record<ChurchFundMutationFailureReason, string>
> = {
  forbidden:
    "Your permission to manage funds could not be verified. Refresh the page and try again.",
  invalid_request:
    "The fund change was not accepted. Check the details and try again.",
  idempotency_conflict:
    "This change reference was already used for different details. Refresh the page before making another change.",
  revision_conflict:
    "The fund list changed in another session. Refresh the page and review the latest order before trying again.",
  not_found:
    "This fund is no longer available. Refresh the page to view the latest list.",
  no_changes: "No fund changes were detected.",
  name_conflict:
    "That fund name is already in use, including archived funds. Choose another name.",
  slug_conflict:
    "A category with the same internal URL already exists. Use a more distinct fund name.",
  not_active:
    "This action requires an active fund. Refresh the page to view its latest status.",
  not_archived:
    "This fund has already been restored. Refresh the page to view its latest status.",
  order_boundary:
    "This fund is already at the requested end of the active list.",
  order_exhausted:
    "The fund order needs maintenance before another category can be appended. Please contact platform support.",
  default_required:
    "The default fund cannot be archived. Choose another default fund first.",
  open_campaigns:
    "This fund cannot be archived while it has a draft or active campaign.",
  active_recurring_gifts:
    "This fund cannot be archived while it has a non-final recurring gift.",
  unavailable:
    "The fund change could not be confirmed. Keep this form unchanged and retry the same request; its reference prevents a duplicate update.",
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
  previousState: ChurchFundActionState,
  options: Readonly<{
    message: string;
    values?: ChurchFundValues;
    fieldErrors?: ChurchFundFieldErrors;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): ChurchFundActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.rotateRequestId ? randomUUID() : previousState.requestId,
    fundsRevision: previousState.fundsRevision,
    operation: previousState.operation,
    fundId: previousState.fundId,
    values: options.values ?? previousState.values,
    retryRequired: options.retryRequired ?? previousState.retryRequired,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

async function runFundMutation(
  workspace: AuthorizedWorkspace,
  previousState: ChurchFundActionState,
  formData: FormData,
  operation: ChurchFundAction,
): Promise<ChurchFundActionState> {
  const submittedRequestId = formData.get("requestId");
  const submittedRevision = parseFundsRevision(
    formData.get("expectedFundsRevision"),
  );
  if (
    previousState.operation !== operation ||
    !isChurchFundRequestId(previousState.requestId) ||
    submittedRequestId !== previousState.requestId ||
    !isStateRevision(previousState.fundsRevision) ||
    submittedRevision !== previousState.fundsRevision
  ) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "This fund change reference is invalid. Refresh the page and try again.",
    });
  }

  const validation = validateChurchFundForm(
    formData,
    operation,
    previousState.fundId,
  );
  if (!validation.success) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "Check the highlighted fund details and try again.",
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
    !churchFundValuesEqual(previousState.values, validation.values)
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
        "Fund management is temporarily unavailable. Try this request again.",
      values: validation.values,
    });
  }

  let result: Awaited<ReturnType<typeof mutateChurchFund>>;
  try {
    result = await mutateChurchFund(
      supabase,
      previousState.requestId,
      workspace.churchId,
      previousState.fundsRevision,
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

    if (result.reason === "revision_conflict" || result.reason === "not_found") {
      revalidatePath("/church/campaigns");
    }

    return buildErrorState(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      values: validation.values,
      retryRequired: false,
      rotateRequestId: true,
      ...(result.reason === "slug_conflict"
        ? { fieldErrors: { name: FAILURE_MESSAGES.slug_conflict } }
        : result.reason === "name_conflict"
          ? { fieldErrors: { name: FAILURE_MESSAGES.name_conflict } }
          : {}),
    });
  }

  revalidatePath("/church");
  revalidatePath("/church/campaigns");

  return {
    status: "success",
    message: result.replayed
      ? "The original fund change was recovered without applying it twice."
      : getSuccessMessage(operation, result.fund.name),
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    fundsRevision: result.fundsRevision,
    operation: previousState.operation,
    fundId: previousState.fundId,
    values: validation.values,
    retryRequired: false,
  };
}

function getSuccessMessage(operation: ChurchFundAction, fundName: string) {
  const messages: Readonly<Record<ChurchFundAction, string>> = {
    create: `${fundName} was created and added to the end of the active list.`,
    update: `${fundName} was updated. Its identity and history stay unchanged.`,
    set_default: `${fundName} is now the default for future giving visits.`,
    move_up: `${fundName} moved up one position.`,
    move_down: `${fundName} moved down one position.`,
    archive: `${fundName} was archived. Historical gifts remain unchanged.`,
    restore: `${fundName} was restored at the end of the active list.`,
  };
  return messages[operation];
}

export async function createFundAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "create");
}

export async function updateFundAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "update");
}

export async function setDefaultFundAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "set_default");
}

export async function moveFundUpAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "move_up");
}

export async function moveFundDownAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "move_down");
}

export async function archiveFundAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "archive");
}

export async function restoreFundAction(
  previousState: ChurchFundActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("funds_manage");
  return runFundMutation(workspace, previousState, formData, "restore");
}
