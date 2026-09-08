import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type {
  ChurchProvisioningInput,
  ProvisionedChurchSummary,
} from "./church-provisioning";

export type ChurchProvisioningFailureReason =
  | "forbidden"
  | "idempotency_conflict"
  | "invalid_request"
  | "owner_profile_inactive"
  | "slug_unavailable"
  | "tenant_records_incomplete"
  | "unavailable";

export type ChurchProvisioningResult =
  | Readonly<{ ok: true; church: ProvisionedChurchSummary }>
  | Readonly<{ ok: false; reason: ChurchProvisioningFailureReason }>;

type ProvisionChurchRpcResponse = Readonly<{
  data: unknown;
  error: unknown;
}>;

type RpcError = Readonly<{ message?: unknown }>;

const INVALID_REQUEST_IDENTIFIERS = new Set([
  "PROVISION_REQUEST_ID_REQUIRED",
  "PROVISION_INVALID_CHURCH_NAME",
  "PROVISION_INVALID_LEGAL_NAME",
  "PROVISION_INVALID_SLUG",
  "PROVISION_INVALID_OWNER_EMAIL",
  "PROVISION_INVALID_SUPPORT_EMAIL",
  "PROVISION_INVALID_CURRENCY",
  "PROVISION_INVALID_TIMEZONE",
  "PROVISION_INVALID_PRIMARY_COLOR",
  "PROVISION_INVALID_SECONDARY_COLOR",
  "PROVISION_INVALID_THANK_YOU_MESSAGE",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHURCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QR_SHORT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{6,62}[a-z0-9]$/;

function mapRpcError(error: unknown): ChurchProvisioningFailureReason {
  const identifier =
    typeof error === "object" && error !== null
      ? (error as RpcError).message
      : undefined;

  if (identifier === "PROVISION_FORBIDDEN") return "forbidden";
  if (identifier === "PROVISION_OWNER_PROFILE_INACTIVE") {
    return "owner_profile_inactive";
  }
  if (identifier === "PROVISION_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "PROVISION_SLUG_UNAVAILABLE") {
    return "slug_unavailable";
  }
  if (identifier === "PROVISION_INTERNAL_CHILD_RECORDS") {
    return "tenant_records_incomplete";
  }
  if (typeof identifier === "string" && INVALID_REQUEST_IDENTIFIERS.has(identifier)) {
    return "invalid_request";
  }

  return "unavailable";
}

function isResultRow(
  value: unknown,
  expectedSlug: string,
): value is Readonly<{
  church_id: string;
  church_slug: string;
  owner_membership_id: string;
  owner_membership_status: "active" | "invited";
  default_fund_id: string;
  qr_short_code: string;
  replayed: boolean;
}> {
  if (typeof value !== "object" || value === null) return false;

  const row = value as Record<string, unknown>;
  return (
    typeof row.church_id === "string" &&
    UUID_PATTERN.test(row.church_id) &&
    typeof row.church_slug === "string" &&
    row.church_slug.length >= 2 &&
    row.church_slug.length <= 63 &&
    CHURCH_SLUG_PATTERN.test(row.church_slug) &&
    row.church_slug === expectedSlug &&
    typeof row.owner_membership_id === "string" &&
    UUID_PATTERN.test(row.owner_membership_id) &&
    (row.owner_membership_status === "active" ||
      row.owner_membership_status === "invited") &&
    typeof row.default_fund_id === "string" &&
    UUID_PATTERN.test(row.default_fund_id) &&
    typeof row.qr_short_code === "string" &&
    QR_SHORT_CODE_PATTERN.test(row.qr_short_code) &&
    typeof row.replayed === "boolean"
  );
}

/**
 * Calls the user-scoped provisioning RPC. This adapter intentionally exposes
 * only the small result needed by the onboarding UI and never returns raw
 * database errors.
 */
export async function provisionChurch(
  client: SupabaseClient<Database>,
  requestId: string,
  input: ChurchProvisioningInput,
): Promise<ChurchProvisioningResult> {
  let response: ProvisionChurchRpcResponse;

  try {
    response = await client.rpc("provision_church", {
      provisioning_request_id: requestId,
      church_display_name: input.displayName,
      church_slug: input.slug,
      owner_email: input.ownerEmail,
      church_legal_name: input.legalName,
      church_support_email: input.supportEmail,
      church_currency: input.currency,
      church_timezone: input.timezone,
      church_primary_color: input.primaryColor,
      church_secondary_color: input.secondaryColor,
      ...(input.thankYouMessage === null
        ? {}
        : { church_thank_you_message: input.thankYouMessage }),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return { ok: false, reason: mapRpcError(response.error) };
  }

  const row = Array.isArray(response.data)
    ? response.data.length === 1
      ? response.data[0]
      : null
    : response.data;

  if (!isResultRow(row, input.slug)) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    church: {
      churchId: row.church_id,
      displayName: input.displayName,
      slug: row.church_slug,
      status: "onboarding",
      ownerMembershipStatus: row.owner_membership_status,
      qrShortCode: row.qr_short_code,
      replayed: row.replayed,
    },
  };
}
