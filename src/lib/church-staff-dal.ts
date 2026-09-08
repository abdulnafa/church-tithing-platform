import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  isCanonicalChurchStaffEmail,
  isChurchStaffAction,
  isChurchStaffMembershipId,
  isChurchStaffRequestId,
  isChurchStaffRole,
  isChurchStaffStatus,
  isManagedChurchStaffRole,
  type ChurchStaffMember,
  type ChurchStaffMutationInput,
  type ChurchStaffSnapshot,
} from "./church-staff";

export type ChurchStaffReadFailureReason = "forbidden" | "unavailable";
export type ChurchStaffReadResult =
  | Readonly<{ ok: true; snapshot: ChurchStaffSnapshot }>
  | Readonly<{ ok: false; reason: ChurchStaffReadFailureReason }>;

export type ChurchStaffMutationFailureReason =
  | "forbidden"
  | "invalid_request"
  | "idempotency_conflict"
  | "revision_conflict"
  | "not_found"
  | "owner_protected"
  | "self_protected"
  | "email_conflict"
  | "already_invited"
  | "already_removed"
  | "not_manageable"
  | "no_changes"
  | "unavailable";

export type ChurchStaffMutationResult =
  | Readonly<{
      ok: true;
      membershipId: string;
      role: Exclude<ChurchStaffMember["role"], "owner">;
      status: ChurchStaffMember["status"];
      staffRevision: number;
      replayed: boolean;
    }>
  | Readonly<{ ok: false; reason: ChurchStaffMutationFailureReason }>;

type RpcError = Readonly<{ message?: unknown }>;
type GeneratedMutateArgs =
  Database["public"]["Functions"]["mutate_church_staff"]["Args"];
type NullableMutateArgs = Omit<
  GeneratedMutateArgs,
  "staff_email" | "staff_role" | "target_membership_id"
> &
  Readonly<{
    staff_email: string | null;
    staff_role: string | null;
    target_membership_id: string | null;
  }>;

const INVALID_REQUEST_IDENTIFIERS = new Set([
  "STAFF_INVALID_REQUEST_ID",
  "STAFF_INVALID_EXPECTED_REVISION",
  "STAFF_INVALID_OPERATION",
  "STAFF_INVALID_ARGUMENTS",
  "STAFF_INVALID_EMAIL",
  "STAFF_INVALID_ROLE",
]);
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const RFC3339_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function adaptNullableMutateArgs(args: NullableMutateArgs) {
  // Typegen marks supplied defaulted SQL parameters as non-null. The database
  // RPC deliberately requires explicit nulls for one canonical operation shape.
  return args as GeneratedMutateArgs;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    RFC3339_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isOptionalTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function getCodePointLength(value: string) {
  return Array.from(value).length;
}

function isDisplayName(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      getCodePointLength(value) >= 1 &&
      getCodePointLength(value) <= 120 &&
      value === value.trim().replace(/\s+/g, " ") &&
      !UNSAFE_SINGLE_LINE_PATTERN.test(value))
  );
}

function parseStaffRecord(value: unknown): ChurchStaffMember | null {
  if (typeof value !== "object" || value === null) return null;

  const row = value as Record<string, unknown>;
  if (
    !isChurchStaffMembershipId(row.membership_id) ||
    !isCanonicalChurchStaffEmail(row.email) ||
    !isDisplayName(row.display_name) ||
    !isChurchStaffRole(row.role) ||
    !isChurchStaffStatus(row.status) ||
    typeof row.access_enabled !== "boolean" ||
    typeof row.is_current_user !== "boolean" ||
    !isTimestamp(row.invited_at) ||
    !isOptionalTimestamp(row.accepted_at) ||
    !isOptionalTimestamp(row.revoked_at) ||
    (row.access_enabled && row.status !== "active") ||
    (row.is_current_user && !row.access_enabled)
  ) {
    return null;
  }

  return {
    membershipId: row.membership_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    accessEnabled: row.access_enabled,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    isCurrent: row.is_current_user,
  };
}

function unwrapSingleComposite(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.length === 1 ? value[0] : null;
}

function getErrorIdentifier(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as RpcError).message
    : undefined;
}

function mapMutationError(error: unknown): ChurchStaffMutationFailureReason {
  const identifier = getErrorIdentifier(error);

  if (identifier === "STAFF_FORBIDDEN") return "forbidden";
  if (identifier === "STAFF_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "STAFF_REVISION_CONFLICT") return "revision_conflict";
  if (identifier === "STAFF_MEMBERSHIP_NOT_FOUND") return "not_found";
  if (identifier === "STAFF_OWNER_PROTECTED") return "owner_protected";
  if (identifier === "STAFF_SELF_PROTECTED") return "self_protected";
  if (identifier === "STAFF_EMAIL_CONFLICT") return "email_conflict";
  if (identifier === "STAFF_ALREADY_INVITED") return "already_invited";
  if (identifier === "STAFF_ALREADY_REMOVED") return "already_removed";
  if (identifier === "STAFF_MEMBERSHIP_NOT_MANAGEABLE") {
    return "not_manageable";
  }
  if (identifier === "STAFF_NO_CHANGES") return "no_changes";
  if (
    typeof identifier === "string" &&
    INVALID_REQUEST_IDENTIFIERS.has(identifier)
  ) {
    return "invalid_request";
  }

  return "unavailable";
}

function hasValidMutationShape(input: ChurchStaffMutationInput) {
  if (!isChurchStaffAction(input.operation)) return false;

  if (input.operation === "invite") {
    return (
      input.membershipId === null &&
      isCanonicalChurchStaffEmail(input.email) &&
      isManagedChurchStaffRole(input.role)
    );
  }

  if (!isChurchStaffMembershipId(input.membershipId) || input.email !== null) {
    return false;
  }

  if (input.operation === "change_role") {
    return isManagedChurchStaffRole(input.role);
  }

  return input.role === null;
}

function parseMutationResult(
  value: unknown,
  churchId: string,
  expectedStaffRevision: number,
  input: ChurchStaffMutationInput,
) {
  const unwrapped = unwrapSingleComposite(value);
  if (typeof unwrapped !== "object" || unwrapped === null) return null;

  const row = unwrapped as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isChurchStaffMembershipId(row.membership_id) ||
    !isManagedChurchStaffRole(row.role) ||
    !isChurchStaffStatus(row.status) ||
    !isRevision(row.staff_revision) ||
    row.staff_revision !== expectedStaffRevision + 1 ||
    typeof row.replayed !== "boolean" ||
    (input.operation !== "invite" &&
      row.membership_id !== input.membershipId) ||
    (input.operation === "invite" &&
      (row.role !== input.role || row.status !== "invited")) ||
    (input.operation === "change_role" &&
      (row.role !== input.role ||
        (row.status !== "invited" && row.status !== "active"))) ||
    (input.operation === "remove" && row.status !== "revoked")
  ) {
    return null;
  }

  return {
    membershipId: row.membership_id,
    role: row.role,
    status: row.status,
    staffRevision: row.staff_revision,
    replayed: row.replayed,
  } satisfies Omit<Extract<ChurchStaffMutationResult, { ok: true }>, "ok">;
}

/** Read the complete private staff roster for an authorized church manager. */
export async function getChurchStaff(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<ChurchStaffReadResult> {
  if (!isChurchStaffMembershipId(churchId)) {
    return { ok: false, reason: "unavailable" };
  }

  let response;
  try {
    response = await client.rpc("get_church_staff", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorIdentifier(response.error) === "STAFF_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }

  const unwrapped = unwrapSingleComposite(response.data);
  if (typeof unwrapped !== "object" || unwrapped === null) {
    return { ok: false, reason: "unavailable" };
  }

  const row = unwrapped as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isRevision(row.staff_revision) ||
    !Array.isArray(row.staff)
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const staff: ChurchStaffMember[] = [];
  const membershipIds = new Set<string>();
  const emails = new Set<string>();
  let currentCount = 0;

  for (const value of row.staff) {
    const member = parseStaffRecord(value);
    if (
      !member ||
      membershipIds.has(member.membershipId) ||
      emails.has(member.email)
    ) {
      return { ok: false, reason: "unavailable" };
    }

    membershipIds.add(member.membershipId);
    emails.add(member.email);
    if (member.isCurrent) currentCount += 1;
    staff.push(member);
  }

  if (currentCount !== 1) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    snapshot: {
      churchId,
      staffRevision: row.staff_revision,
      staff,
    },
  };
}

/** Call the single atomic staff mutation boundary with canonical arguments. */
export async function mutateChurchStaff(
  client: SupabaseClient<Database>,
  requestId: string,
  churchId: string,
  expectedStaffRevision: number,
  input: ChurchStaffMutationInput,
): Promise<ChurchStaffMutationResult> {
  if (
    !isChurchStaffRequestId(requestId) ||
    !isChurchStaffMembershipId(churchId) ||
    !isRevision(expectedStaffRevision) ||
    !hasValidMutationShape(input)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  let response;
  try {
    response = await client.rpc(
      "mutate_church_staff",
      adaptNullableMutateArgs({
        staff_request_id: requestId,
        target_church_id: churchId,
        expected_staff_revision: expectedStaffRevision,
        staff_operation: input.operation,
        target_membership_id: input.membershipId,
        staff_email: input.email,
        staff_role: input.role,
      }),
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return { ok: false, reason: mapMutationError(response.error) };
  }

  const result = parseMutationResult(
    response.data,
    churchId,
    expectedStaffRevision,
    input,
  );
  return result ? { ok: true, ...result } : { ok: false, reason: "unavailable" };
}
