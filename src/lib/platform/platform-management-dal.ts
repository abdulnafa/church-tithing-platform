import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  PLATFORM_READINESS_CODES,
  PLATFORM_TENANT_STATUSES,
  isPlatformTenantCursor,
  type PlatformLifecycleMutationInput,
  type PlatformLifecycleMutationSummary,
  type PlatformReadinessCode,
  type PlatformTenantCursor,
  type PlatformTenantPage,
  type PlatformTenantStatus,
  type PlatformTenantSummary,
} from "./platform-tenant-management";
import type {
  PlatformOnboardingDefaults,
  PlatformOnboardingDefaultsSnapshot,
} from "./platform-onboarding-defaults";

export type PlatformTenantPageFailureReason =
  | "forbidden"
  | "invalid_request"
  | "unavailable";

export type PlatformTenantPageResult =
  | Readonly<{ ok: true; page: PlatformTenantPage }>
  | Readonly<{ ok: false; reason: PlatformTenantPageFailureReason }>;

export type PlatformLifecycleFailureReason =
  | "forbidden"
  | "idempotency_conflict"
  | "invalid_request"
  | "not_found"
  | "not_ready"
  | "stale"
  | "transition_not_allowed"
  | "unavailable";

export type PlatformLifecycleResult =
  | Readonly<{ ok: true; mutation: PlatformLifecycleMutationSummary }>
  | Readonly<{ ok: false; reason: PlatformLifecycleFailureReason }>;

export type PlatformOnboardingDefaultsReadResult =
  | Readonly<{ ok: true; defaults: PlatformOnboardingDefaultsSnapshot }>
  | Readonly<{ ok: false; reason: "forbidden" | "unavailable" }>;

export type PlatformOnboardingDefaultsFailureReason =
  | "forbidden"
  | "idempotency_conflict"
  | "invalid_request"
  | "no_changes"
  | "stale"
  | "unavailable";

export type PlatformOnboardingDefaultsUpdateResult =
  | Readonly<{ ok: true; defaults: PlatformOnboardingDefaultsSnapshot; replayed: boolean }>
  | Readonly<{ ok: false; reason: PlatformOnboardingDefaultsFailureReason }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
type RpcError = Readonly<{ message?: unknown }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const SAFE_NAME_PATTERN = /^[^\u0000-\u001f\u007f]+$/;
const CURRENCIES = new Set(["BBD", "USD", "CAD", "XCD"]);
const READINESS_CODE_INDEX = new Map(
  PLATFORM_READINESS_CODES.map((code, index) => [code, index]),
);

function getErrorIdentifier(error: unknown) {
  const message =
    typeof error === "object" && error !== null
      ? (error as RpcError).message
      : undefined;
  return typeof message === "string" ? message : null;
}

function getSingleRow(data: unknown) {
  if (!Array.isArray(data)) return data;
  return data.length === 1 ? data[0] : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isSafeProjectedTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 64 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isStatus(value: unknown): value is PlatformTenantStatus {
  return PLATFORM_TENANT_STATUSES.some((status) => status === value);
}

function parseReadinessCodes(value: unknown): readonly PlatformReadinessCode[] | null {
  if (!Array.isArray(value)) return null;

  let previousIndex = -1;
  const seen = new Set<PlatformReadinessCode>();
  const result: PlatformReadinessCode[] = [];

  for (const candidate of value) {
    const index =
      typeof candidate === "string"
        ? READINESS_CODE_INDEX.get(candidate as PlatformReadinessCode)
        : undefined;
    if (index === undefined || index <= previousIndex || seen.has(candidate)) {
      return null;
    }
    previousIndex = index;
    seen.add(candidate as PlatformReadinessCode);
    result.push(candidate as PlatformReadinessCode);
  }

  return result;
}

function parseTenant(value: unknown): PlatformTenantSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const missingReadinessCodes = parseReadinessCodes(row.missing_readiness_codes);

  if (
    !isUuid(row.church_id) ||
    typeof row.display_name !== "string" ||
    [...row.display_name].length < 1 ||
    [...row.display_name].length > 120 ||
    !SAFE_NAME_PATTERN.test(row.display_name) ||
    typeof row.slug !== "string" ||
    row.slug.length < 2 ||
    row.slug.length > 63 ||
    !SLUG_PATTERN.test(row.slug) ||
    !isStatus(row.status) ||
    !(
      row.default_currency === null ||
      (typeof row.default_currency === "string" && CURRENCIES.has(row.default_currency))
    ) ||
    !(row.timezone === null || isSafeProjectedTimezone(row.timezone)) ||
    typeof row.foundation_ready !== "boolean" ||
    missingReadinessCodes === null ||
    row.foundation_ready !== (missingReadinessCodes.length === 0) ||
    !isSafeInteger(row.lifecycle_revision) ||
    !isTimestamp(row.created_at) ||
    !isNullableTimestamp(row.activated_at) ||
    !isNullableTimestamp(row.suspended_at)
  ) {
    return null;
  }
  if (
    (row.default_currency === null || row.timezone === null) &&
    !missingReadinessCodes.includes("church_profile")
  ) {
    return null;
  }
  const createdTime = Date.parse(row.created_at);
  const activatedTime =
    row.activated_at === null ? null : Date.parse(row.activated_at);
  const suspendedTime =
    row.suspended_at === null ? null : Date.parse(row.suspended_at);
  if (
    ((row.status === "active" || row.status === "suspended") &&
      (activatedTime as number) < createdTime) ||
    (row.status === "suspended" &&
      (suspendedTime as number) < (activatedTime as number))
  ) {
    return null;
  }

  if (
    (row.status === "onboarding" &&
      (row.activated_at !== null || row.suspended_at !== null)) ||
    (row.status === "active" &&
      (row.activated_at === null || row.suspended_at !== null)) ||
    (row.status === "suspended" &&
      (row.activated_at === null || row.suspended_at === null))
  ) {
    return null;
  }

  return {
    churchId: row.church_id,
    displayName: row.display_name,
    slug: row.slug,
    status: row.status,
    defaultCurrency: row.default_currency,
    timezone: row.timezone,
    foundationReady: row.foundation_ready,
    missingReadinessCodes,
    lifecycleRevision: row.lifecycle_revision,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    suspendedAt: row.suspended_at,
  };
}

function parseTenantPage(
  value: unknown,
  pageSize: number,
  cursor: PlatformTenantCursor | null,
): PlatformTenantPage | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.tenants) || row.tenants.length > pageSize) return null;

  const tenants = row.tenants.map(parseTenant);
  if (tenants.some((tenant) => tenant === null)) return null;
  const parsedTenants = tenants as PlatformTenantSummary[];
  if (new Set(parsedTenants.map((tenant) => tenant.churchId)).size !== parsedTenants.length) {
    return null;
  }

  for (let index = 1; index < parsedTenants.length; index += 1) {
    const previous = parsedTenants[index - 1];
    const current = parsedTenants[index];
    const previousTime = Date.parse(previous.createdAt);
    const currentTime = Date.parse(current.createdAt);
    if (
      previousTime < currentTime ||
      (previous.createdAt === current.createdAt &&
        previous.churchId <= current.churchId)
    ) {
      return null;
    }
  }
  const firstTenant = parsedTenants[0];
  if (cursor && firstTenant) {
    const cursorTime = Date.parse(cursor.createdAt);
    const firstTime = Date.parse(firstTenant.createdAt);
    if (
      firstTime > cursorTime ||
      (firstTenant.createdAt === cursor.createdAt &&
        firstTenant.churchId >= cursor.churchId)
    ) {
      return null;
    }
  }

  if (
    !isSafeInteger(row.total_tenant_count) ||
    !isSafeInteger(row.onboarding_count) ||
    !isSafeInteger(row.active_count) ||
    !isSafeInteger(row.suspended_count) ||
    typeof row.has_more !== "boolean" ||
    !isNullableTimestamp(row.next_cursor_created_at) ||
    !(row.next_cursor_church_id === null || isUuid(row.next_cursor_church_id)) ||
    (row.next_cursor_created_at === null) !==
      (row.next_cursor_church_id === null) ||
    row.onboarding_count + row.active_count + row.suspended_count >
      row.total_tenant_count
  ) {
    return null;
  }

  const lastTenant = parsedTenants.at(-1);
  if (
    row.has_more !== (row.next_cursor_created_at !== null) ||
    (row.has_more &&
      (!lastTenant ||
        row.next_cursor_created_at !== lastTenant.createdAt ||
        row.next_cursor_church_id !== lastTenant.churchId))
  ) {
    return null;
  }

  return {
    tenants: parsedTenants,
    totalTenantCount: row.total_tenant_count,
    onboardingCount: row.onboarding_count,
    activeCount: row.active_count,
    suspendedCount: row.suspended_count,
    nextCursorCreatedAt: row.next_cursor_created_at,
    nextCursorChurchId: row.next_cursor_church_id,
    hasMore: row.has_more,
  };
}

function parseDefaults(value: unknown): PlatformOnboardingDefaultsSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.default_currency !== "string" ||
    !CURRENCIES.has(row.default_currency) ||
    !isSafeProjectedTimezone(row.default_timezone) ||
    typeof row.default_primary_color !== "string" ||
    !HEX_COLOR_PATTERN.test(row.default_primary_color) ||
    typeof row.default_secondary_color !== "string" ||
    !HEX_COLOR_PATTERN.test(row.default_secondary_color) ||
    !isSafeInteger(row.settings_revision) ||
    !isTimestamp(row.updated_at)
  ) {
    return null;
  }

  return {
    defaultCurrency: row.default_currency as PlatformOnboardingDefaults["defaultCurrency"],
    defaultTimezone: row.default_timezone,
    defaultPrimaryColor: row.default_primary_color,
    defaultSecondaryColor: row.default_secondary_color,
    settingsRevision: row.settings_revision,
    updatedAt: row.updated_at,
  };
}

export async function getPlatformTenantPage(
  client: SupabaseClient<Database>,
  options: Readonly<{
    pageSize?: number;
    cursor?: PlatformTenantCursor | null;
  }> = {},
): Promise<PlatformTenantPageResult> {
  const pageSize = options.pageSize ?? 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return { ok: false, reason: "invalid_request" };
  }
  const cursor = options.cursor ?? null;
  if (cursor && !isPlatformTenantCursor(cursor)) {
    return { ok: false, reason: "invalid_request" };
  }

  let response: RpcResponse;
  try {
    response = await client.rpc("get_platform_tenants", {
      tenant_page_size: pageSize,
      ...(cursor
        ? {
            tenant_cursor_created_at: cursor.createdAt,
            tenant_cursor_church_id: cursor.churchId,
          }
        : {}),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const identifier = getErrorIdentifier(response.error);
    if (identifier === "PLATFORM_TENANTS_FORBIDDEN") {
      return { ok: false, reason: "forbidden" };
    }
    if (identifier?.startsWith("PLATFORM_TENANTS_INVALID_")) {
      return { ok: false, reason: "invalid_request" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const page = parseTenantPage(getSingleRow(response.data), pageSize, cursor);
  return page ? { ok: true, page } : { ok: false, reason: "unavailable" };
}

function mapLifecycleError(error: unknown): PlatformLifecycleFailureReason {
  const identifier = getErrorIdentifier(error);
  if (identifier === "PLATFORM_LIFECYCLE_FORBIDDEN") return "forbidden";
  if (identifier === "PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "PLATFORM_LIFECYCLE_TENANT_NOT_FOUND") return "not_found";
  if (identifier === "PLATFORM_LIFECYCLE_TENANT_NOT_READY") return "not_ready";
  if (identifier === "PLATFORM_LIFECYCLE_REVISION_CONFLICT") return "stale";
  if (identifier === "PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED") {
    return "transition_not_allowed";
  }
  if (identifier?.startsWith("PLATFORM_LIFECYCLE_INVALID_")) {
    return "invalid_request";
  }
  return "unavailable";
}

export async function mutatePlatformTenantLifecycle(
  client: SupabaseClient<Database>,
  input: PlatformLifecycleMutationInput,
): Promise<PlatformLifecycleResult> {
  let response: RpcResponse;
  try {
    response = await client.rpc("mutate_platform_tenant_lifecycle", {
      lifecycle_request_id: input.requestId,
      target_church_id: input.churchId,
      expected_lifecycle_revision: input.expectedRevision,
      lifecycle_operation: input.operation,
      ...(input.suspensionReasonCode === null
        ? {}
        : { suspension_reason_code: input.suspensionReasonCode }),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    return { ok: false, reason: mapLifecycleError(response.error) };
  }

  const value = getSingleRow(response.data);
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "unavailable" };
  }
  const row = value as Record<string, unknown>;
  const expectedStatus = input.operation === "suspend" ? "suspended" : "active";
  if (
    row.church_id !== input.churchId ||
    row.status !== expectedStatus ||
    row.lifecycle_revision !== input.expectedRevision + 1 ||
    !isNullableTimestamp(row.activated_at) ||
    !isNullableTimestamp(row.suspended_at) ||
    (expectedStatus === "active" && row.activated_at === null) ||
    (expectedStatus === "active" && row.suspended_at !== null) ||
    (expectedStatus === "suspended" && row.suspended_at === null) ||
    (expectedStatus === "suspended" && row.activated_at === null) ||
    (expectedStatus === "suspended" &&
      Date.parse(row.suspended_at as string) <
        Date.parse(row.activated_at as string)) ||
    typeof row.replayed !== "boolean"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    mutation: {
      churchId: row.church_id,
      status: expectedStatus,
      lifecycleRevision: row.lifecycle_revision,
      activatedAt: row.activated_at,
      suspendedAt: row.suspended_at,
      replayed: row.replayed,
    },
  };
}

export async function getPlatformOnboardingDefaults(
  client: SupabaseClient<Database>,
): Promise<PlatformOnboardingDefaultsReadResult> {
  let response: RpcResponse;
  try {
    response = await client.rpc("get_platform_onboarding_defaults");
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    return getErrorIdentifier(response.error) === "PLATFORM_DEFAULTS_FORBIDDEN"
      ? { ok: false, reason: "forbidden" }
      : { ok: false, reason: "unavailable" };
  }

  const defaults = parseDefaults(getSingleRow(response.data));
  return defaults
    ? { ok: true, defaults }
    : { ok: false, reason: "unavailable" };
}

function mapDefaultsUpdateError(
  error: unknown,
): PlatformOnboardingDefaultsFailureReason {
  const identifier = getErrorIdentifier(error);
  if (identifier === "PLATFORM_DEFAULTS_FORBIDDEN") return "forbidden";
  if (identifier === "PLATFORM_DEFAULTS_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "PLATFORM_DEFAULTS_REVISION_CONFLICT") return "stale";
  if (identifier === "PLATFORM_DEFAULTS_NO_CHANGES") return "no_changes";
  if (identifier?.startsWith("PLATFORM_DEFAULTS_INVALID_")) {
    return "invalid_request";
  }
  return "unavailable";
}

export async function updatePlatformOnboardingDefaults(
  client: SupabaseClient<Database>,
  requestId: string,
  expectedRevision: number,
  input: PlatformOnboardingDefaults,
): Promise<PlatformOnboardingDefaultsUpdateResult> {
  let response: RpcResponse;
  try {
    response = await client.rpc("update_platform_onboarding_defaults", {
      settings_request_id: requestId,
      expected_settings_revision: expectedRevision,
      default_currency: input.defaultCurrency,
      default_timezone: input.defaultTimezone,
      default_primary_color: input.defaultPrimaryColor,
      default_secondary_color: input.defaultSecondaryColor,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    return { ok: false, reason: mapDefaultsUpdateError(response.error) };
  }

  const value = getSingleRow(response.data);
  const defaults = parseDefaults(value);
  const replayed =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).replayed
      : null;
  if (
    !defaults ||
    defaults.settingsRevision !== expectedRevision + 1 ||
    defaults.defaultCurrency !== input.defaultCurrency ||
    defaults.defaultTimezone !== input.defaultTimezone ||
    defaults.defaultPrimaryColor !== input.defaultPrimaryColor ||
    defaults.defaultSecondaryColor !== input.defaultSecondaryColor ||
    typeof replayed !== "boolean"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, defaults, replayed };
}
