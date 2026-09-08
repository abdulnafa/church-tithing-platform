import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHURCH_LOGO_BUCKET,
  CHURCH_SETTINGS_LIMITS,
  createChurchLogoStoragePath,
  isChurchId,
  isChurchSettingsRequestId,
  isManagedChurchLogoStoragePath,
  type ChurchSettingsInput,
  type ChurchSettingsSnapshot,
  type ChurchStatus,
} from "./church-settings";
import type { Database } from "./supabase/database.types";

export type ChurchSettingsFailureReason =
  | "forbidden"
  | "idempotency_conflict"
  | "invalid_request"
  | "logo_not_ready"
  | "no_changes"
  | "revision_conflict"
  | "unavailable";

export type ChurchSettingsReadResult =
  | Readonly<{ ok: true; settings: ChurchSettingsSnapshot }>
  | Readonly<{ ok: false; reason: "forbidden" | "unavailable" }>;

export type ChurchSettingsUpdateResult =
  | Readonly<{
      ok: true;
      settingsRevision: number;
      logoStoragePath: string | null;
      logoCleanupPath: string | null;
      logoCleanupStatus: "not_required" | "pending" | "completed";
      replayed: boolean;
    }>
  | Readonly<{ ok: false; reason: ChurchSettingsFailureReason }>;

export type ChurchLogoStageResult =
  | Readonly<{ ok: true; created: boolean }>
  | Readonly<{ ok: false; reason: "invalid_path" | "path_conflict" | "unavailable" }>;

export type PendingChurchLogoCleanup = Readonly<{
  requestId: string;
  logoStoragePath: string;
}>;

type RpcError = Readonly<{ message?: unknown }>;
type GeneratedUpdateArgs =
  Database["public"]["Functions"]["update_church_settings"]["Args"];
type NullableUpdateArgs = Omit<
  GeneratedUpdateArgs,
  | "church_logo_storage_path"
  | "church_primary_color"
  | "church_secondary_color"
  | "church_thank_you_message"
> &
  Readonly<{
    church_logo_storage_path: string | null;
    church_primary_color: string | null;
    church_secondary_color: string | null;
    church_thank_you_message: string | null;
  }>;

const CHURCH_STATUSES = new Set<ChurchStatus>([
  "onboarding",
  "active",
  "suspended",
  "canceled",
  "archived",
]);
const CHURCH_CURRENCIES = new Set(["BBD", "USD", "CAD", "XCD"]);
const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const INVALID_REQUEST_IDENTIFIERS = new Set([
  "SETTINGS_REQUEST_ID_REQUIRED",
  "SETTINGS_INVALID_EXPECTED_REVISION",
  "SETTINGS_INVALID_CHURCH_NAME",
  "SETTINGS_INVALID_LEGAL_NAME",
  "SETTINGS_INVALID_SUPPORT_EMAIL",
  "SETTINGS_INVALID_TIMEZONE",
  "SETTINGS_INVALID_PRIMARY_COLOR",
  "SETTINGS_INVALID_SECONDARY_COLOR",
  "SETTINGS_INVALID_THANK_YOU_MESSAGE",
  "SETTINGS_INVALID_LOGO_ACTION",
  "SETTINGS_INVALID_LOGO_PATH",
]);

function adaptNullableUpdateArgs(args: NullableUpdateArgs) {
  // Supabase typegen marks required SQL text parameters as non-null even when
  // PostgreSQL accepts null. Limit the adaptation to these four optional values.
  return args as GeneratedUpdateArgs;
}

function getSingleComposite(data: unknown) {
  if (!Array.isArray(data)) return data;
  return data.length === 1 ? data[0] : null;
}

function isCanonicalName(value: unknown, maximum: number) {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= maximum &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value) &&
    value.trim().replace(/\s+/g, " ") === value
  );
}

function isCanonicalEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const separator = value.indexOf("@");
  const localPart = separator >= 0 ? value.slice(0, separator) : "";

  return (
    value === value.toLowerCase() &&
    value.length >= 3 &&
    value.length <= CHURCH_SETTINGS_LIMITS.email &&
    localPart.length >= 1 &&
    localPart.length <= 64 &&
    EMAIL_PATTERN.test(value) &&
    !value.includes("..") &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".")
  );
}

function isTimezone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > CHURCH_SETTINGS_LIMITS.timezone ||
    value.trim() !== value
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isOptionalColor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && HEX_COLOR_PATTERN.test(value));
}

function isOptionalThankYou(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length >= 1 &&
      value.length <= CHURCH_SETTINGS_LIMITS.thankYouMessage &&
      value.trim() === value &&
      !UNSAFE_MULTILINE_PATTERN.test(value))
  );
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSnapshotRow(value: unknown, expectedChurchId: string) {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;

  return (
    row.church_id === expectedChurchId &&
    isCanonicalName(row.display_name, CHURCH_SETTINGS_LIMITS.displayName) &&
    (row.legal_name === null ||
      isCanonicalName(row.legal_name, CHURCH_SETTINGS_LIMITS.legalName)) &&
    typeof row.slug === "string" &&
    row.slug.length >= 2 &&
    row.slug.length <= 63 &&
    SLUG_PATTERN.test(row.slug) &&
    typeof row.status === "string" &&
    CHURCH_STATUSES.has(row.status as ChurchStatus) &&
    typeof row.default_currency === "string" &&
    CHURCH_CURRENCIES.has(row.default_currency) &&
    (row.support_email === null || isCanonicalEmail(row.support_email)) &&
    isTimezone(row.timezone) &&
    isOptionalColor(row.primary_color) &&
    isOptionalColor(row.secondary_color) &&
    isOptionalThankYou(row.thank_you_message) &&
    (row.logo_storage_path === null ||
      isManagedChurchLogoStoragePath(row.logo_storage_path, expectedChurchId)) &&
    isRevision(row.settings_revision)
  );
}

function mapRpcError(error: unknown): ChurchSettingsFailureReason {
  const identifier =
    typeof error === "object" && error !== null
      ? (error as RpcError).message
      : undefined;

  if (identifier === "SETTINGS_FORBIDDEN") return "forbidden";
  if (identifier === "SETTINGS_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "SETTINGS_REVISION_CONFLICT") return "revision_conflict";
  if (identifier === "SETTINGS_NO_CHANGES") return "no_changes";
  if (identifier === "SETTINGS_LOGO_OBJECT_NOT_READY") return "logo_not_ready";
  if (typeof identifier === "string" && INVALID_REQUEST_IDENTIFIERS.has(identifier)) {
    return "invalid_request";
  }
  return "unavailable";
}

export async function getChurchSettings(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<ChurchSettingsReadResult> {
  if (!isChurchId(churchId)) return { ok: false, reason: "unavailable" };

  let response;
  try {
    response = await client.rpc("get_church_settings", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return {
      ok: false,
      reason: mapRpcError(response.error) === "forbidden" ? "forbidden" : "unavailable",
    };
  }

  const row = getSingleComposite(response.data);
  if (!isSnapshotRow(row, churchId)) return { ok: false, reason: "unavailable" };
  const stored = row as Record<string, unknown>;

  return {
    ok: true,
    settings: {
      churchId,
      displayName: stored.display_name as string,
      legalName: (stored.legal_name as string | null) ?? "",
      slug: stored.slug as string,
      status: stored.status as ChurchStatus,
      defaultCurrency: stored.default_currency as string,
      supportEmail: (stored.support_email as string | null) ?? "",
      timezone: stored.timezone as string,
      primaryColor: stored.primary_color as string | null,
      secondaryColor: stored.secondary_color as string | null,
      thankYouMessage: stored.thank_you_message as string | null,
      logoStoragePath: stored.logo_storage_path as string | null,
      settingsRevision: stored.settings_revision as number,
    },
  };
}

function isUpdateRow(
  value: unknown,
  churchId: string,
  expectedRevision: number,
  input: ChurchSettingsInput,
) {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  const activePath = row.logo_storage_path;
  const cleanupPath = row.logo_cleanup_path;
  const cleanupStatus = row.logo_cleanup_status;

  if (
    row.church_id !== churchId ||
    !isRevision(row.settings_revision) ||
    row.settings_revision !== expectedRevision + 1 ||
    (activePath !== null &&
      !isManagedChurchLogoStoragePath(activePath, churchId)) ||
    (cleanupPath !== null &&
      !isManagedChurchLogoStoragePath(cleanupPath, churchId)) ||
    !["not_required", "pending", "completed"].includes(
      cleanupStatus as string,
    ) ||
    typeof row.replayed !== "boolean"
  ) {
    return false;
  }

  if (cleanupStatus === "not_required" && cleanupPath !== null) return false;
  if (
    (cleanupStatus === "pending" || cleanupStatus === "completed") &&
    cleanupPath === null
  ) {
    return false;
  }
  if (cleanupPath !== null && cleanupPath === activePath) return false;
  if (input.logoAction === "replace" && activePath !== input.logoStoragePath) {
    return false;
  }
  if (input.logoAction === "remove" && activePath !== null) return false;
  return true;
}

export async function updateChurchSettings(
  client: SupabaseClient<Database>,
  requestId: string,
  churchId: string,
  expectedRevision: number,
  input: ChurchSettingsInput,
): Promise<ChurchSettingsUpdateResult> {
  const expectedLogoPath = createChurchLogoStoragePath(churchId, requestId);
  const validLogoInput =
    (input.logoAction === "replace" &&
      input.logoStoragePath !== null &&
      input.logoStoragePath === expectedLogoPath) ||
    ((input.logoAction === "keep" || input.logoAction === "remove") &&
      input.logoStoragePath === null);

  if (
    !isChurchSettingsRequestId(requestId) ||
    !isChurchId(churchId) ||
    !isRevision(expectedRevision) ||
    !validLogoInput
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  let response;
  try {
    response = await client.rpc("update_church_settings", adaptNullableUpdateArgs({
      settings_request_id: requestId,
      target_church_id: churchId,
      expected_settings_revision: expectedRevision,
      church_display_name: input.displayName,
      church_legal_name: input.legalName,
      church_support_email: input.supportEmail,
      church_timezone: input.timezone,
      church_primary_color: input.primaryColor,
      church_secondary_color: input.secondaryColor,
      church_thank_you_message: input.thankYouMessage,
      church_logo_action: input.logoAction,
      church_logo_storage_path: input.logoStoragePath,
    }));
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) return { ok: false, reason: mapRpcError(response.error) };

  const row = getSingleComposite(response.data);
  if (!isUpdateRow(row, churchId, expectedRevision, input)) {
    return { ok: false, reason: "unavailable" };
  }
  const stored = row as Record<string, unknown>;

  return {
    ok: true,
    settingsRevision: stored.settings_revision as number,
    logoStoragePath: stored.logo_storage_path as string | null,
    logoCleanupPath: stored.logo_cleanup_path as string | null,
    logoCleanupStatus: stored.logo_cleanup_status as
      | "not_required"
      | "pending"
      | "completed",
    replayed: stored.replayed as boolean,
  };
}

function getStorageStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = candidate.statusCode ?? candidate.status;
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^[0-9]{3}$/.test(value)) return Number(value);
  return null;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export async function stageChurchLogo(
  client: SupabaseClient<Database>,
  churchId: string,
  storagePath: string,
  bytes: Uint8Array,
): Promise<ChurchLogoStageResult> {
  if (!isManagedChurchLogoStoragePath(storagePath, churchId)) {
    return { ok: false, reason: "invalid_path" };
  }

  const bucket = client.storage.from(CHURCH_LOGO_BUCKET);
  try {
    const upload = await bucket.upload(storagePath, bytes, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });

    if (!upload.error) return { ok: true, created: true };
    if (getStorageStatus(upload.error) !== 409) {
      return { ok: false, reason: "unavailable" };
    }

    const existing = await bucket.download(storagePath);
    if (existing.error || !existing.data) {
      return { ok: false, reason: "unavailable" };
    }
    const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
    return equalBytes(existingBytes, bytes)
      ? { ok: true, created: false }
      : { ok: false, reason: "path_conflict" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function removeChurchLogoObject(
  client: SupabaseClient<Database>,
  churchId: string,
  storagePath: string,
) {
  if (!isManagedChurchLogoStoragePath(storagePath, churchId)) return false;

  try {
    const result = await client.storage.from(CHURCH_LOGO_BUCKET).remove([storagePath]);
    return !result.error;
  } catch {
    return false;
  }
}

export function getChurchLogoPublicUrl(
  client: SupabaseClient<Database>,
  churchId: string,
  storagePath: string | null,
) {
  if (!storagePath || !isManagedChurchLogoStoragePath(storagePath, churchId)) {
    return null;
  }

  try {
    const { data } = client.storage
      .from(CHURCH_LOGO_BUCKET)
      .getPublicUrl(storagePath);
    const parsed = new URL(data.publicUrl);
    const expectedPath = `/storage/v1/object/public/${CHURCH_LOGO_BUCKET}/${storagePath}`;

    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password &&
      decodeURIComponent(parsed.pathname) === expectedPath
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export async function getPendingChurchLogoCleanups(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<readonly PendingChurchLogoCleanup[] | null> {
  if (!isChurchId(churchId)) return null;

  let response;
  try {
    response = await client.rpc(
      "get_pending_church_logo_cleanups",
      { target_church_id: churchId },
    );
  } catch {
    return null;
  }

  if (response.error || !Array.isArray(response.data) || response.data.length > 100) {
    return null;
  }

  const cleanups: PendingChurchLogoCleanup[] = [];
  const keys = new Set<string>();
  for (const value of response.data) {
    if (typeof value !== "object" || value === null) return null;
    const row = value as Record<string, unknown>;
    if (
      !isChurchSettingsRequestId(row.settings_request_id) ||
      !isManagedChurchLogoStoragePath(row.logo_storage_path, churchId)
    ) {
      return null;
    }

    const key = `${row.settings_request_id}:${row.logo_storage_path}`;
    if (keys.has(key)) return null;
    keys.add(key);
    cleanups.push({
      requestId: row.settings_request_id,
      logoStoragePath: row.logo_storage_path,
    });
  }

  return cleanups;
}

export async function completeChurchLogoCleanup(
  client: SupabaseClient<Database>,
  churchId: string,
  cleanup: PendingChurchLogoCleanup,
) {
  if (
    !isChurchId(churchId) ||
    !isChurchSettingsRequestId(cleanup.requestId) ||
    !isManagedChurchLogoStoragePath(cleanup.logoStoragePath, churchId)
  ) {
    return false;
  }

  try {
    const response = await client.rpc(
      "complete_church_logo_cleanup",
      {
        target_church_id: churchId,
        settings_request_id: cleanup.requestId,
        logo_cleanup_path: cleanup.logoStoragePath,
      },
    );
    return !response.error && response.data === true;
  } catch {
    return false;
  }
}
