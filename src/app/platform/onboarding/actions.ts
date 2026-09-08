"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import {
  isChurchProvisioningRequestId,
  validateChurchProvisioningForm,
  type ChurchProvisioningActionState,
} from "@/lib/platform/church-provisioning";
import {
  provisionChurch,
  type ChurchProvisioningFailureReason,
} from "@/lib/platform/church-provisioning-dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<Record<ChurchProvisioningFailureReason, string>> = {
  forbidden:
    "Your Platform Admin access could not be verified. Refresh the page and try again.",
  idempotency_conflict:
    "This setup request was already used with different details. Reload the page before creating another church.",
  invalid_request:
    "The church details were not accepted. Check the form and try again.",
  owner_profile_inactive:
    "The selected owner email belongs to an inactive account. Restore that account or use another owner email.",
  slug_unavailable:
    "That subdomain slug is already in use. Choose another slug and try again.",
  tenant_records_incomplete:
    "The required Tithes fund and QR record could not be confirmed, so no church was created. Try again.",
  unavailable:
    "Church setup could not be confirmed. Keep these details unchanged and try again; the same request reference will prevent a duplicate.",
};

function errorState(
  previousState: ChurchProvisioningActionState,
  message: string,
): ChurchProvisioningActionState {
  return {
    status: "error",
    message,
    requestId: previousState.requestId,
    values: previousState.values,
  };
}

export async function provisionChurchAction(
  previousState: ChurchProvisioningActionState,
  formData: FormData,
): Promise<ChurchProvisioningActionState> {
  // A page guard does not authorize a Server Action. Re-check before parsing
  // or touching any submitted tenant data.
  await requirePlatformSuperAdmin();

  const submittedRequestId = formData.get("requestId");
  const requestId = isChurchProvisioningRequestId(submittedRequestId)
    ? submittedRequestId
    : previousState.requestId;

  if (!isChurchProvisioningRequestId(requestId)) {
    return errorState(
      previousState,
      "This setup reference is invalid. Reload the page and try again.",
    );
  }

  const validation = validateChurchProvisioningForm(formData);

  if (!validation.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      requestId,
      values: validation.values,
      fieldErrors: validation.fieldErrors,
    };
  }

  let result: Awaited<ReturnType<typeof provisionChurch>>;

  try {
    const supabase = await createServerSupabaseClient();
    result = await provisionChurch(supabase, requestId, validation.data);
  } catch {
    return {
      status: "error",
      message: FAILURE_MESSAGES.unavailable,
      requestId,
      values: validation.values,
    };
  }

  if (!result.ok) {
    return {
      status: "error",
      message: FAILURE_MESSAGES[result.reason],
      requestId,
      values: validation.values,
      ...(result.reason === "slug_unavailable"
        ? { fieldErrors: { slug: FAILURE_MESSAGES.slug_unavailable } }
        : {}),
    };
  }

  revalidatePath("/platform");

  return {
    status: "success",
    message: result.church.replayed
      ? "The original church setup was recovered without creating a duplicate."
      : "The church workspace was created.",
    requestId,
    values: validation.values,
    result: result.church,
  };
}
