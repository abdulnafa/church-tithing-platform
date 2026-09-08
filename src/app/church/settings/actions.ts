"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireChurchPermission } from "@/lib/auth/guards";
import {
  churchSettingsValuesEqual,
  createChurchLogoStoragePath,
  isChurchSettingsRequestId,
  parseChurchSettingsRevision,
  validateChurchSettingsForm,
  type ChurchLogoAction,
  type ChurchSettingsActionState,
  type ChurchSettingsFieldErrors,
  type ChurchSettingsInput,
  type ChurchSettingsValues,
} from "@/lib/church-settings";
import {
  completeChurchLogoCleanup,
  getChurchLogoPublicUrl,
  getChurchSettings,
  getPendingChurchLogoCleanups,
  removeChurchLogoObject,
  stageChurchLogo,
  updateChurchSettings,
  type ChurchSettingsFailureReason,
  type PendingChurchLogoCleanup,
} from "@/lib/church-settings-dal";
import type {
  ChurchLogoFailureReason,
  ChurchLogoSanitizationResult,
} from "@/lib/church-logo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_MESSAGES: Readonly<Record<ChurchSettingsFailureReason, string>> = {
  forbidden:
    "Your permission to manage these settings could not be verified. Refresh the page and try again.",
  idempotency_conflict:
    "This save reference was already used with different details. Reload the page before making another change.",
  invalid_request:
    "The church settings were not accepted. Check the form and try again.",
  logo_not_ready:
    "The replacement logo is not ready yet. Keep every detail unchanged and try again with the same logo.",
  no_changes: "No settings changes were detected.",
  revision_conflict:
    "These settings changed in another session. Reload the page, review the latest values, and try again.",
  unavailable:
    "The save could not be confirmed. Keep every detail unchanged and try again; the same request reference prevents a duplicate update.",
};

const LOGO_FAILURE_MESSAGES: Readonly<Record<ChurchLogoFailureReason, string>> = {
  empty: "Choose a non-empty PNG, JPEG, or WebP logo.",
  too_large: "Choose a logo smaller than 750 KB.",
  unsupported_type: "Choose a PNG, JPEG, or WebP logo.",
  format_mismatch: "The logo contents do not match its declared image type.",
  malformed: "The logo file is damaged or contains unsupported extra content.",
  animated: "Choose a still image. Animated logos are not supported.",
  dimensions: "Choose a logo no larger than 4096 pixels or 4 megapixels.",
  output_too_large: "This logo could not be reduced below the safe storage limit.",
};
const MAX_LOGO_CLEANUPS_PER_SAVE = 5;

function errorState(
  previousState: ChurchSettingsActionState,
  options: Readonly<{
    message: string;
    requestId?: string;
    settingsRevision?: number;
    values?: ChurchSettingsValues;
    fieldErrors?: ChurchSettingsFieldErrors;
    retryLogoAction?: ChurchLogoAction;
    clearRetryLogoAction?: boolean;
    cleanupPending?: boolean;
  }>,
): ChurchSettingsActionState {
  return {
    status: "error",
    message: options.message,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: options.requestId ?? previousState.requestId,
    settingsRevision:
      options.settingsRevision ?? previousState.settingsRevision,
    values: options.values ?? previousState.values,
    logoPublicUrl: previousState.logoPublicUrl,
    logoChanged: previousState.logoChanged,
    cleanupPending: options.cleanupPending ?? previousState.cleanupPending,
    ...(options.clearRetryLogoAction
      ? {}
      : options.retryLogoAction ?? previousState.retryLogoAction
        ? { retryLogoAction: options.retryLogoAction ?? previousState.retryLogoAction }
      : {}),
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  };
}

function getEffectiveLogoAction(
  submittedAction: ChurchLogoAction,
  retryAction: ChurchSettingsActionState["retryLogoAction"],
) {
  if (!retryAction) return submittedAction;
  return submittedAction === "keep" ? retryAction : submittedAction;
}

async function deleteAndAcknowledge(
  client: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  churchId: string,
  activeLogoPath: string | null,
  cleanup: PendingChurchLogoCleanup,
) {
  if (cleanup.logoStoragePath === activeLogoPath) return false;
  const removed = await removeChurchLogoObject(
    client,
    churchId,
    cleanup.logoStoragePath,
  );
  if (!removed) return false;
  return completeChurchLogoCleanup(client, churchId, cleanup);
}

async function drainLogoCleanups(
  client: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  churchId: string,
  requestId: string,
  activeLogoPath: string | null,
  currentCleanupPath: string | null,
) {
  let cleanupPending = false;
  const handled = new Set<string>();
  let attempts = 0;

  if (currentCleanupPath) {
    const cleanup = { requestId, logoStoragePath: currentCleanupPath };
    handled.add(`${requestId}:${currentCleanupPath}`);
    attempts += 1;
    cleanupPending = !(await deleteAndAcknowledge(
      client,
      churchId,
      activeLogoPath,
      cleanup,
    ));
  }

  const backlog = await getPendingChurchLogoCleanups(client, churchId);
  if (backlog === null) return true;

  for (const cleanup of backlog) {
    const key = `${cleanup.requestId}:${cleanup.logoStoragePath}`;
    if (handled.has(key)) continue;
    if (attempts >= MAX_LOGO_CLEANUPS_PER_SAVE) {
      cleanupPending = true;
      break;
    }
    attempts += 1;
    if (
      !(await deleteAndAcknowledge(
        client,
        churchId,
        activeLogoPath,
        cleanup,
      ))
    ) {
      cleanupPending = true;
    }
  }

  return cleanupPending;
}

export async function updateChurchSettingsAction(
  previousState: ChurchSettingsActionState,
  formData: FormData,
): Promise<ChurchSettingsActionState> {
  // The page guard does not authorize this mutation. Re-check before parsing,
  // decoding a file, creating a client, or trusting any submitted tenant data.
  const { workspace } = await requireChurchPermission("settings_manage");
  const churchId = workspace.churchId;

  const submittedRequestId = formData.get("requestId");
  if (
    !isChurchSettingsRequestId(previousState.requestId) ||
    submittedRequestId !== previousState.requestId
  ) {
    return errorState(previousState, {
      message: previousState.retryLogoAction
        ? "This save reference is invalid. Keep the locked request unchanged and retry it."
        : "This save reference is invalid. Reload the page and try again.",
    });
  }
  const requestId = previousState.requestId;

  const expectedRevision = parseChurchSettingsRevision(
    formData.get("expectedSettingsRevision"),
  );
  if (
    expectedRevision === null ||
    expectedRevision !== previousState.settingsRevision
  ) {
    return errorState(previousState, {
      message: previousState.retryLogoAction
        ? "The settings version is invalid. Keep the locked request unchanged and retry it."
        : "The settings version is invalid. Reload the page and try again.",
      requestId,
    });
  }

  const validation = validateChurchSettingsForm(formData);
  if (!validation.success) {
    return errorState(previousState, {
      message: previousState.retryLogoAction
        ? "This request has an unknown result. Restore the unchanged values and retry the same request."
        : "Check the highlighted fields and try again.",
      requestId,
      settingsRevision: expectedRevision,
      values: previousState.retryLogoAction
        ? previousState.values
        : validation.values,
      fieldErrors: validation.fieldErrors,
    });
  }

  const effectiveLogoAction = getEffectiveLogoAction(
    validation.data.logoAction,
    previousState.retryLogoAction,
  );
  const retryValues: ChurchSettingsValues = {
    ...validation.values,
    removeLogo: effectiveLogoAction === "remove",
  };

  if (
    previousState.retryLogoAction &&
    (effectiveLogoAction !== previousState.retryLogoAction ||
      !churchSettingsValuesEqual(retryValues, previousState.values))
  ) {
    return errorState(previousState, {
      message:
        "An earlier save has an unknown result. Keep every field unchanged and retry the same request.",
      requestId,
      settingsRevision: expectedRevision,
      values: previousState.values,
      retryLogoAction: previousState.retryLogoAction,
    });
  }

  let logoStoragePath: string | null = null;
  let client: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    client = await createServerSupabaseClient();
  } catch {
    return errorState(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      requestId,
      settingsRevision: expectedRevision,
      values: retryValues,
    });
  }

  if (effectiveLogoAction === "replace") {
    logoStoragePath = createChurchLogoStoragePath(churchId, requestId);
    if (!logoStoragePath) {
      return errorState(previousState, {
        message: FAILURE_MESSAGES.invalid_request,
        requestId,
        settingsRevision: expectedRevision,
        values: retryValues,
      });
    }

    if (validation.logoFile) {
      let sanitized: ChurchLogoSanitizationResult;
      try {
        const { sanitizeChurchLogo } = await import("@/lib/church-logo");
        sanitized = await sanitizeChurchLogo(validation.logoFile);
      } catch {
        return errorState(previousState, {
          message: "The logo could not be processed safely. Choose the file again.",
          requestId,
          settingsRevision: expectedRevision,
          values: retryValues,
          fieldErrors: { logo: "Choose a valid PNG, JPEG, or WebP logo." },
        });
      }
      if (!sanitized.ok) {
        return errorState(previousState, {
          message: "Check the replacement logo and try again.",
          requestId,
          settingsRevision: expectedRevision,
          values: retryValues,
          fieldErrors: { logo: LOGO_FAILURE_MESSAGES[sanitized.reason] },
        });
      }

      const staged = await stageChurchLogo(
        client,
        churchId,
        logoStoragePath,
        sanitized.logo.bytes,
      );
      if (!staged.ok) {
        return errorState(previousState, {
          message:
            staged.reason === "path_conflict"
              ? previousState.retryLogoAction
                ? "The staged logo does not match the locked request. Select the original logo and retry every field unchanged."
                : "This save reference already has a different logo. Contact support before starting a new save."
              : "The logo upload could not be confirmed. Select the same logo and retry with every field unchanged.",
          requestId,
          settingsRevision: expectedRevision,
          values: retryValues,
          ...(staged.reason === "path_conflict"
            ? {}
            : { retryLogoAction: "replace" }),
          fieldErrors: {
            logo:
              staged.reason === "path_conflict"
                ? previousState.retryLogoAction
                  ? "Select the exact logo used in the original request."
                  : "A different logo already exists for this save reference."
                : "Select the same logo again if the file field is empty.",
          },
        });
      }
    } else if (previousState.retryLogoAction !== "replace") {
      return errorState(previousState, {
        message: "Choose a replacement logo before saving.",
        requestId,
        settingsRevision: expectedRevision,
        values: retryValues,
        fieldErrors: { logo: "Choose a PNG, JPEG, or WebP logo." },
      });
    }
  }

  const input: ChurchSettingsInput = {
    ...validation.data,
    logoAction: effectiveLogoAction,
    logoStoragePath,
  };
  let updateResult: Awaited<ReturnType<typeof updateChurchSettings>>;
  try {
    updateResult = await updateChurchSettings(
      client,
      requestId,
      churchId,
      expectedRevision,
      input,
    );
  } catch {
    return errorState(previousState, {
      message: FAILURE_MESSAGES.unavailable,
      requestId,
      settingsRevision: expectedRevision,
      values: retryValues,
      retryLogoAction: effectiveLogoAction,
    });
  }

  if (!updateResult.ok) {
    const ambiguous =
      updateResult.reason === "unavailable" ||
      updateResult.reason === "logo_not_ready";

    if (updateResult.reason === "no_changes" && effectiveLogoAction === "keep") {
      const latest = await getChurchSettings(client, churchId);
      if (latest.ok) {
        const cleanupPending = await drainLogoCleanups(
          client,
          churchId,
          requestId,
          latest.settings.logoStoragePath,
          null,
        );
        return {
          status: "success",
          message: cleanupPending
            ? "No setting values changed. A previous logo is still queued for safe cleanup."
            : "No setting values changed. The logo cleanup queue is clear.",
          responseEpoch: previousState.responseEpoch + 1,
          requestId: randomUUID(),
          settingsRevision: latest.settings.settingsRevision,
          values: { ...retryValues, removeLogo: false },
          logoPublicUrl: getChurchLogoPublicUrl(
            client,
            churchId,
            latest.settings.logoStoragePath,
          ),
          logoChanged: false,
          cleanupPending,
        };
      }
    }

    let compensationFailed = false;
    if (!ambiguous && logoStoragePath) {
      compensationFailed = !(await removeChurchLogoObject(
        client,
        churchId,
        logoStoragePath,
      ));
    }

    return errorState(previousState, {
      message: `${FAILURE_MESSAGES[updateResult.reason]}${
        compensationFailed
          ? " The staged logo could not be cleared, so keep this request unchanged and retry."
          : ""
      }`,
      requestId,
      settingsRevision: expectedRevision,
      values: retryValues,
      ...(ambiguous ? { retryLogoAction: effectiveLogoAction } : {}),
      ...(!ambiguous && !compensationFailed
        ? { clearRetryLogoAction: true }
        : {}),
      ...(compensationFailed
        ? {
            cleanupPending: true,
            retryLogoAction: "replace" as const,
          }
        : {}),
      ...(updateResult.reason === "revision_conflict"
        ? {
            fieldErrors: {
              logo:
                effectiveLogoAction === "replace"
                  ? "Reload and select the logo again after reviewing current settings."
                  : undefined,
            },
          }
        : {}),
    });
  }

  const currentCleanupPath =
    updateResult.logoCleanupStatus === "pending"
      ? updateResult.logoCleanupPath
      : null;
  const cleanupPending = await drainLogoCleanups(
    client,
    churchId,
    requestId,
    updateResult.logoStoragePath,
    currentCleanupPath,
  );
  const logoPublicUrl = getChurchLogoPublicUrl(
    client,
    churchId,
    updateResult.logoStoragePath,
  );

  try {
    revalidatePath("/church/settings");
  } catch {
    // The database save is already confirmed. Cache invalidation failure must
    // not turn a committed mutation into an ambiguous retry for the user.
  }

  return {
    status: "success",
    message: `${
      updateResult.replayed
        ? "The original settings save was recovered without applying it twice."
        : "Church settings were saved."
    }${
      cleanupPending
        ? " A previous logo is still queued for safe cleanup."
        : ""
    }`,
    responseEpoch: previousState.responseEpoch + 1,
    requestId: randomUUID(),
    settingsRevision: updateResult.settingsRevision,
    values: { ...retryValues, removeLogo: false },
    logoPublicUrl,
    logoChanged: effectiveLogoAction !== "keep",
    cleanupPending,
  };
}
