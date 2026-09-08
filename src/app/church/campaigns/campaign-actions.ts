"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireChurchPermission } from "@/lib/auth/guards";
import {
  churchCampaignValuesEqual,
  isChurchCampaignRequestId,
  parseCampaignsRevision,
  validateChurchCampaignForm,
  type ChurchCampaignAction,
  type ChurchCampaignActionState,
  type ChurchCampaignFieldErrors,
  type ChurchCampaignValues,
} from "@/lib/church-campaigns";
import {
  mutateChurchCampaign,
  type ChurchCampaignMutationFailureReason,
} from "@/lib/church-campaigns-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<
  Record<ChurchCampaignMutationFailureReason, string>
> = {
  forbidden:
    "Your permission to manage campaigns could not be verified. Refresh the page and try again.",
  invalid_request:
    "The campaign change was not accepted. Check the details and try again.",
  idempotency_conflict:
    "This change reference was already used for different details. Refresh the page before making another change.",
  revision_conflict:
    "The campaign list changed in another session. Refresh the page and review the latest version before trying again.",
  not_found:
    "This campaign is no longer available. Refresh the page to view the latest list.",
  no_changes: "No campaign changes were detected.",
  name_conflict:
    "That campaign name is already in use, including archived campaigns. Choose another name.",
  slug_conflict:
    "A campaign with the same internal URL already exists. Use a more distinct campaign name.",
  fund_not_active:
    "The assigned fund is no longer active. Choose an active fund for a new campaign, or contact support for an existing draft.",
  currency_mismatch:
    "This legacy campaign no longer matches the church currency and cannot be activated. Contact platform support.",
  window_ended:
    "This campaign's legacy visibility window has already ended. Its dates are read-only in this release; contact platform support.",
  not_draft:
    "Only a draft campaign can be edited or activated. Refresh the page to view its latest status.",
  not_active:
    "Only an active campaign can be closed. Refresh the page to view its latest status.",
  not_closed:
    "Only a closed campaign can be archived. Refresh the page to view its latest status.",
  not_archived:
    "This campaign has already been restored. Refresh the page to view its latest status.",
  active_recurring_gifts:
    "This campaign cannot close while it has an incomplete, active, paused, or past-due recurring gift.",
  unavailable:
    "The campaign change could not be confirmed. Keep this form unchanged and retry the same request; its reference prevents a duplicate update.",
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
  previousState: ChurchCampaignActionState,
  options: Readonly<{
    message: string;
    values?: ChurchCampaignValues;
    fieldErrors?: ChurchCampaignFieldErrors;
    retryRequired?: boolean;
    rotateRequestId?: boolean;
  }>,
): ChurchCampaignActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.rotateRequestId ? randomUUID() : previousState.requestId,
    campaignsRevision: previousState.campaignsRevision,
    operation: previousState.operation,
    campaignId: previousState.campaignId,
    values: options.values ?? previousState.values,
    retryRequired: options.retryRequired ?? previousState.retryRequired,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

async function runCampaignMutation(
  workspace: AuthorizedWorkspace,
  previousState: ChurchCampaignActionState,
  formData: FormData,
  operation: ChurchCampaignAction,
): Promise<ChurchCampaignActionState> {
  const submittedRequestId = formData.get("requestId");
  const submittedRevision = parseCampaignsRevision(
    formData.get("expectedCampaignsRevision"),
  );
  if (
    previousState.operation !== operation ||
    !isChurchCampaignRequestId(previousState.requestId) ||
    submittedRequestId !== previousState.requestId ||
    !isStateRevision(previousState.campaignsRevision) ||
    submittedRevision !== previousState.campaignsRevision
  ) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "This campaign change reference is invalid. Refresh the page and try again.",
    });
  }

  // A draft's fund is display-only after creation. Restore the rendered
  // snapshot value before validation so the ordinary form cannot imply or
  // submit a fund change; the database still verifies this immutable ID.
  if (operation === "update") {
    formData.set("fundId", previousState.values.fundId);
  }

  const validation = validateChurchCampaignForm(
    formData,
    operation,
    previousState.campaignId,
  );
  if (!validation.success) {
    return buildErrorState(previousState, {
      message: previousState.retryRequired
        ? RETRY_MISMATCH_MESSAGE
        : "Check the highlighted campaign details and try again.",
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
    !churchCampaignValuesEqual(previousState.values, validation.values)
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
        "Campaign management is temporarily unavailable. Try this request again.",
      values: validation.values,
    });
  }

  let result: Awaited<ReturnType<typeof mutateChurchCampaign>>;
  try {
    result = await mutateChurchCampaign(
      supabase,
      previousState.requestId,
      workspace.churchId,
      previousState.campaignsRevision,
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

    if (
      result.reason === "revision_conflict" ||
      result.reason === "not_found" ||
      result.reason === "fund_not_active"
    ) {
      revalidatePath("/church/campaigns");
    }

    const fieldErrors = getFailureFieldErrors(result.reason);
    return buildErrorState(previousState, {
      message: FAILURE_MESSAGES[result.reason],
      values: validation.values,
      retryRequired: false,
      rotateRequestId: true,
      ...(fieldErrors ? { fieldErrors } : {}),
    });
  }

  revalidatePath("/church");
  revalidatePath("/church/campaigns");

  return {
    status: "success",
    message: result.replayed
      ? "The original campaign change was recovered without applying it twice."
      : getSuccessMessage(operation, result.campaign.name),
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    campaignsRevision: result.campaignsRevision,
    operation: previousState.operation,
    campaignId: previousState.campaignId,
    values: validation.values,
    retryRequired: false,
  };
}

function getFailureFieldErrors(
  reason: ChurchCampaignMutationFailureReason,
): ChurchCampaignFieldErrors | null {
  if (reason === "name_conflict" || reason === "slug_conflict") {
    return { name: FAILURE_MESSAGES[reason] };
  }
  if (reason === "fund_not_active") {
    return { fundId: FAILURE_MESSAGES.fund_not_active };
  }
  return null;
}

function getSuccessMessage(
  operation: ChurchCampaignAction,
  campaignName: string,
) {
  const messages: Readonly<Record<ChurchCampaignAction, string>> = {
    create: `${campaignName} was created as a draft. Review it before activation.`,
    update: `${campaignName} was updated. Its fund and stable identity remain unchanged.`,
    activate: `${campaignName} is active. Its configuration is now locked.`,
    close: `${campaignName} was closed. It cannot be reopened in this release.`,
    archive: `${campaignName} was archived. Historical gifts remain unchanged.`,
    restore: `${campaignName} was restored to closed status and was not reopened.`,
  };
  return messages[operation];
}

export async function createCampaignAction(
  previousState: ChurchCampaignActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("campaigns_manage");
  return runCampaignMutation(workspace, previousState, formData, "create");
}

export async function updateCampaignAction(
  previousState: ChurchCampaignActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("campaigns_manage");
  return runCampaignMutation(workspace, previousState, formData, "update");
}

export async function activateCampaignAction(
  previousState: ChurchCampaignActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("campaigns_manage");
  return runCampaignMutation(workspace, previousState, formData, "activate");
}

export async function closeCampaignAction(
  previousState: ChurchCampaignActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("campaigns_manage");
  return runCampaignMutation(workspace, previousState, formData, "close");
}

export async function archiveCampaignAction(
  previousState: ChurchCampaignActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("campaigns_manage");
  return runCampaignMutation(workspace, previousState, formData, "archive");
}

export async function restoreCampaignAction(
  previousState: ChurchCampaignActionState,
  formData: FormData,
) {
  const { workspace } = await requireChurchPermission("campaigns_manage");
  return runCampaignMutation(workspace, previousState, formData, "restore");
}
