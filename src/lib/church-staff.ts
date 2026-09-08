export const CHURCH_STAFF_EMAIL_MAX_LENGTH = 254;

export const MANAGED_CHURCH_STAFF_ROLES = [
  "finance_admin",
  "accountant",
  "staff",
] as const;

export const CHURCH_STAFF_ACTIONS = [
  "invite",
  "change_role",
  "remove",
] as const;

export type ManagedChurchStaffRole =
  (typeof MANAGED_CHURCH_STAFF_ROLES)[number];
export type ChurchStaffRole = "owner" | ManagedChurchStaffRole;
export type ChurchStaffStatus =
  | "invited"
  | "active"
  | "suspended"
  | "revoked";
export type ChurchStaffAction = (typeof CHURCH_STAFF_ACTIONS)[number];

export type ChurchStaffMember = Readonly<{
  membershipId: string;
  email: string;
  displayName: string | null;
  role: ChurchStaffRole;
  status: ChurchStaffStatus;
  accessEnabled: boolean;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
}>;

export type ChurchStaffSnapshot = Readonly<{
  churchId: string;
  staffRevision: number;
  staff: readonly ChurchStaffMember[];
}>;

export type ChurchStaffValues = Readonly<{
  email: string;
  role: string;
}>;

export type ChurchStaffFieldErrors = Readonly<
  Partial<Record<"email" | "role", string>>
>;

export type ChurchStaffActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  staffRevision: number;
  operation: ChurchStaffAction;
  membershipId: string | null;
  values: ChurchStaffValues;
  retryRequired: boolean;
  fieldErrors?: ChurchStaffFieldErrors;
}>;

export type ChurchStaffMutationInput = Readonly<{
  operation: ChurchStaffAction;
  membershipId: string | null;
  email: string | null;
  role: ManagedChurchStaffRole | null;
}>;

export type ChurchStaffFormValidation =
  | Readonly<{
      success: true;
      input: ChurchStaffMutationInput;
      values: ChurchStaffValues;
    }>
  | Readonly<{
      success: false;
      values: ChurchStaffValues;
      fieldErrors: ChurchStaffFieldErrors;
    }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;

export function isChurchStaffMembershipId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isChurchStaffRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isChurchStaffAction(value: unknown): value is ChurchStaffAction {
  return (
    typeof value === "string" &&
    (CHURCH_STAFF_ACTIONS as readonly string[]).includes(value)
  );
}

export function isManagedChurchStaffRole(
  value: unknown,
): value is ManagedChurchStaffRole {
  return (
    typeof value === "string" &&
    (MANAGED_CHURCH_STAFF_ROLES as readonly string[]).includes(value)
  );
}

export function isChurchStaffRole(value: unknown): value is ChurchStaffRole {
  return value === "owner" || isManagedChurchStaffRole(value);
}

export function isChurchStaffStatus(value: unknown): value is ChurchStaffStatus {
  return (
    value === "invited" ||
    value === "active" ||
    value === "suspended" ||
    value === "revoked"
  );
}

export function parseStaffRevision(value: unknown) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return null;
  }

  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

export function normalizeChurchStaffEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isCanonicalChurchStaffEmail(value: unknown): value is string {
  if (typeof value !== "string" || value !== normalizeChurchStaffEmail(value)) {
    return false;
  }

  const atIndex = value.indexOf("@");
  const localPart = value.slice(0, atIndex);

  return (
    value.length >= 3 &&
    value.length <= CHURCH_STAFF_EMAIL_MAX_LENGTH &&
    localPart.length >= 1 &&
    localPart.length <= 64 &&
    EMAIL_PATTERN.test(value) &&
    !value.includes("..") &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

export function createInitialChurchStaffActionState(
  requestId: string,
  staffRevision: number,
  operation: ChurchStaffAction,
  member: Pick<ChurchStaffMember, "membershipId" | "role"> | null = null,
): ChurchStaffActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    staffRevision,
    operation,
    membershipId: member?.membershipId ?? null,
    values: {
      email: "",
      role:
        operation === "change_role" &&
        member &&
        isManagedChurchStaffRole(member.role)
          ? member.role
          : operation === "invite"
            ? "staff"
            : "",
    },
    retryRequired: false,
  };
}

export function churchStaffValuesEqual(
  left: ChurchStaffValues,
  right: ChurchStaffValues,
) {
  return left.email === right.email && left.role === right.role;
}

function getText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function validateChurchStaffForm(
  formData: FormData,
  operation: ChurchStaffAction,
  membershipId: string | null,
): ChurchStaffFormValidation {
  if (operation !== "invite" && !isChurchStaffMembershipId(membershipId)) {
    return {
      success: false,
      values: { email: "", role: "" },
      fieldErrors: {},
    };
  }

  if (operation === "remove") {
    return {
      success: true,
      input: { operation, membershipId, email: null, role: null },
      values: { email: "", role: "" },
    };
  }

  const email =
    operation === "invite"
      ? normalizeChurchStaffEmail(getText(formData, "email"))
      : "";
  const role = getText(formData, "role");
  const values = { email, role };
  const fieldErrors: Partial<Record<"email" | "role", string>> = {};

  if (operation === "invite" && !isCanonicalChurchStaffEmail(email)) {
    fieldErrors.email = "Enter a valid staff email address.";
  }
  if (!isManagedChurchStaffRole(role)) {
    fieldErrors.role = "Choose Finance admin, Accountant, or Staff.";
  }

  if (
    Object.keys(fieldErrors).length > 0 ||
    !isManagedChurchStaffRole(role)
  ) {
    return { success: false, values, fieldErrors };
  }

  return {
    success: true,
    input: {
      operation,
      membershipId: operation === "invite" ? null : membershipId,
      email: operation === "invite" ? email : null,
      role,
    },
    values,
  };
}

export function getChurchStaffRoleLabel(role: ChurchStaffRole) {
  const labels: Readonly<Record<ChurchStaffRole, string>> = {
    owner: "Owner",
    finance_admin: "Finance admin",
    accountant: "Accountant",
    staff: "Staff",
  };
  return labels[role];
}

export function getChurchStaffStatusLabel(status: ChurchStaffStatus) {
  const labels: Readonly<Record<ChurchStaffStatus, string>> = {
    invited: "Invite recorded",
    active: "Active membership",
    suspended: "Suspended membership",
    revoked: "Access removed",
  };
  return labels[status];
}
