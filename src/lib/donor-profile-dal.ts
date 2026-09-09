import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getDonorDisplayNameError,
  getDonorEmailError,
  normalizeDonorDisplayName,
  normalizeDonorEmail,
} from "./donor-identity";
import {
  isDonorProfileRequestId,
  isDonorProfileRevision,
  type DonorProfileSnapshot,
} from "./donor-profile";
import type { Database } from "./supabase/database.types";

export type DonorProfileReadResult =
  | Readonly<{ ok: true; profile: DonorProfileSnapshot }>
  | Readonly<{
      ok: false;
      reason: "forbidden" | "not_found" | "unavailable";
    }>;

export type DonorProfileMutationFailureReason =
  | "forbidden"
  | "idempotency_conflict"
  | "invalid_request"
  | "no_changes"
  | "revision_conflict"
  | "unavailable";

export type DonorProfileMutationResult =
  | Readonly<{
      ok: true;
      profileRevision: number;
      operation: "created" | "updated";
      replayed: boolean;
    }>
  | Readonly<{ ok: false; reason: DonorProfileMutationFailureReason }>;

type DatabaseClient = SupabaseClient<Database>;

type DonorProfileRow = Readonly<{
  churchId: string;
  donorId: string;
  profile: DonorProfileSnapshot;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    RFC3339_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function getErrorMessage(error: unknown) {
  if (!isRecord(error)) return null;
  return typeof error.message === "string" ? error.message : null;
}

function getSetRow(data: unknown) {
  if (!Array.isArray(data)) return undefined;
  if (data.length === 0) return null;
  return data.length === 1 ? data[0] : undefined;
}

function getCompositeRow(data: unknown) {
  if (Array.isArray(data)) return data.length === 1 ? data[0] : undefined;
  return data;
}

function parseProfileRow(value: unknown): DonorProfileRow | null {
  if (!isRecord(value)) return null;
  const displayName = value.display_name;
  const email = value.email;

  if (
    !isUuid(value.church_id) ||
    !isUuid(value.donor_id) ||
    typeof displayName !== "string" ||
    getDonorDisplayNameError(displayName) !== undefined ||
    normalizeDonorDisplayName(displayName) !== displayName ||
    typeof email !== "string" ||
    getDonorEmailError(email) !== undefined ||
    normalizeDonorEmail(email) !== email ||
    !isDonorProfileRevision(value.profile_revision) ||
    !isRfc3339(value.updated_at)
  ) {
    return null;
  }

  return {
    churchId: value.church_id,
    donorId: value.donor_id,
    profile: {
      displayName,
      email,
      profileRevision: value.profile_revision,
    },
  };
}

function parseMutationRow(
  value: unknown,
  expectedChurchId: string,
  expectedDonorId: string | null,
  expectedRevision: number,
): Exclude<DonorProfileMutationResult, { ok: false }> | null {
  if (!isRecord(value)) return null;
  const operation = value.operation;
  const profileRevision = value.profile_revision;

  if (
    value.church_id !== expectedChurchId ||
    !isUuid(value.donor_id) ||
    (expectedDonorId !== null && value.donor_id !== expectedDonorId) ||
    (operation !== "created" && operation !== "updated") ||
    typeof value.replayed !== "boolean" ||
    !isDonorProfileRevision(profileRevision)
  ) {
    return null;
  }

  if (
    (operation === "created" &&
      (expectedDonorId !== null ||
        expectedRevision !== 0 ||
        profileRevision !== 0)) ||
    (operation === "updated" &&
      (expectedDonorId === null || profileRevision !== expectedRevision + 1))
  ) {
    return null;
  }

  return {
    ok: true,
    profileRevision,
    operation,
    replayed: value.replayed,
  };
}

/**
 * Reads only the selected signed-in donor's church-scoped name and verified
 * Auth email. Church and donor IDs are verified here and never enter the client
 * DTO.
 */
export async function getMyDonorProfile(
  client: DatabaseClient,
  churchId: string,
  expectedDonorId: string,
): Promise<DonorProfileReadResult> {
  if (!isUuid(churchId) || !isUuid(expectedDonorId)) {
    return { ok: false, reason: "unavailable" };
  }

  const response = await client.rpc("get_my_donor_profile", {
    target_church_id: churchId,
  });
  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorMessage(response.error) === "DONOR_PROFILE_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }

  const candidate = getSetRow(response.data);
  if (candidate === null) return { ok: false, reason: "not_found" };
  if (candidate === undefined) return { ok: false, reason: "unavailable" };
  const row = parseProfileRow(candidate);
  if (
    !row ||
    row.churchId !== churchId ||
    row.donorId !== expectedDonorId
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, profile: row.profile };
}

/**
 * Supports the database's conservative create branch for later authenticated
 * enrollment work without accepting email, donor ID, or user ID as RPC input.
 * P15's dashboard calls only the already-linked update branch.
 */
export async function mutateMyDonorProfile(
  client: DatabaseClient,
  context: Readonly<{ churchId: string; expectedDonorId: string | null }>,
  requestId: string,
  expectedRevision: number,
  input: Readonly<{ displayName: string }>,
): Promise<DonorProfileMutationResult> {
  if (
    !isUuid(context.churchId) ||
    (context.expectedDonorId !== null && !isUuid(context.expectedDonorId)) ||
    !isDonorProfileRequestId(requestId) ||
    !isDonorProfileRevision(expectedRevision) ||
    getDonorDisplayNameError(input.displayName) !== undefined ||
    normalizeDonorDisplayName(input.displayName) !== input.displayName
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const response = await client.rpc("mutate_my_donor_profile", {
    target_church_id: context.churchId,
    profile_request_id: requestId,
    expected_profile_revision: expectedRevision,
    profile_display_name: input.displayName,
  });
  if (response.error) {
    const reasonByMessage: Readonly<
      Record<string, DonorProfileMutationFailureReason>
    > = {
      DONOR_PROFILE_FORBIDDEN: "forbidden",
      DONOR_PROFILE_IDEMPOTENCY_CONFLICT: "idempotency_conflict",
      DONOR_PROFILE_INVALID_REQUEST_ID: "invalid_request",
      DONOR_PROFILE_INVALID_EXPECTED_REVISION: "invalid_request",
      DONOR_PROFILE_INVALID_DISPLAY_NAME: "invalid_request",
      DONOR_PROFILE_REVISION_CONFLICT: "revision_conflict",
      DONOR_PROFILE_NO_CHANGES: "no_changes",
    };
    return {
      ok: false,
      reason: reasonByMessage[getErrorMessage(response.error) ?? ""] ?? "unavailable",
    };
  }

  const mutation = parseMutationRow(
    getCompositeRow(response.data),
    context.churchId,
    context.expectedDonorId,
    expectedRevision,
  );
  return mutation ?? { ok: false, reason: "unavailable" };
}
