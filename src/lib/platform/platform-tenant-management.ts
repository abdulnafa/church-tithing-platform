export const PLATFORM_TENANT_STATUSES = [
  "onboarding",
  "active",
  "suspended",
  "canceled",
  "archived",
] as const;

export type PlatformTenantStatus = (typeof PLATFORM_TENANT_STATUSES)[number];

export const PLATFORM_READINESS_CODES = [
  "active_owner",
  "church_profile",
  "default_fund",
  "permanent_qr",
] as const;

export type PlatformReadinessCode =
  (typeof PLATFORM_READINESS_CODES)[number];

export const PLATFORM_READINESS_LABELS: Readonly<
  Record<PlatformReadinessCode, string>
> = {
  active_owner: "Active church owner",
  church_profile: "Required church profile",
  default_fund: "Default giving category",
  permanent_qr: "Permanent QR record",
};

export const PLATFORM_LIFECYCLE_OPERATIONS = [
  "activate",
  "suspend",
  "restore",
] as const;

export type PlatformLifecycleOperation =
  (typeof PLATFORM_LIFECYCLE_OPERATIONS)[number];

export const PLATFORM_SUSPENSION_REASON_CODES = [
  "administrative_hold",
  "compliance_review",
  "security_review",
  "church_request",
] as const;

export type PlatformSuspensionReasonCode =
  (typeof PLATFORM_SUSPENSION_REASON_CODES)[number];

export const PLATFORM_SUSPENSION_REASON_LABELS: Readonly<
  Record<PlatformSuspensionReasonCode, string>
> = {
  administrative_hold: "Administrative hold",
  compliance_review: "Compliance review",
  security_review: "Security review",
  church_request: "Church request",
};

export type PlatformTenantSummary = Readonly<{
  churchId: string;
  displayName: string;
  slug: string;
  status: PlatformTenantStatus;
  defaultCurrency: string | null;
  timezone: string | null;
  foundationReady: boolean;
  missingReadinessCodes: readonly PlatformReadinessCode[];
  lifecycleRevision: number;
  createdAt: string;
  activatedAt: string | null;
  suspendedAt: string | null;
}>;

export type PlatformTenantPage = Readonly<{
  tenants: readonly PlatformTenantSummary[];
  totalTenantCount: number;
  onboardingCount: number;
  activeCount: number;
  suspendedCount: number;
  nextCursorCreatedAt: string | null;
  nextCursorChurchId: string | null;
  hasMore: boolean;
}>;

export type PlatformTenantCursor = Readonly<{
  createdAt: string;
  churchId: string;
}>;

export type PlatformLifecycleMutationInput = Readonly<{
  requestId: string;
  churchId: string;
  expectedRevision: number;
  operation: PlatformLifecycleOperation;
  suspensionReasonCode: PlatformSuspensionReasonCode | null;
}>;

export type PlatformLifecycleMutationSummary = Readonly<{
  churchId: string;
  status: "active" | "suspended";
  lifecycleRevision: number;
  activatedAt: string | null;
  suspendedAt: string | null;
  replayed: boolean;
}>;

export type PlatformLifecycleActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  churchId: string;
  expectedRevision: number;
  operation: PlatformLifecycleOperation;
  suspensionReasonCode: string;
  retryRequired: boolean;
  result?: PlatformLifecycleMutationSummary;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isPlatformRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isPlatformChurchId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPlatformTenantCursor(
  value: unknown,
): value is PlatformTenantCursor {
  if (typeof value !== "object" || value === null) return false;
  const cursor = value as Record<string, unknown>;
  return (
    isPlatformChurchId(cursor.churchId) &&
    typeof cursor.createdAt === "string" &&
    TIMESTAMP_PATTERN.test(cursor.createdAt) &&
    Number.isFinite(Date.parse(cursor.createdAt))
  );
}

export function isPlatformLifecycleRevision(
  value: unknown,
): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isPlatformLifecycleOperation(
  value: unknown,
): value is PlatformLifecycleOperation {
  return (
    typeof value === "string" &&
    PLATFORM_LIFECYCLE_OPERATIONS.some((operation) => operation === value)
  );
}

export function isPlatformSuspensionReasonCode(
  value: unknown,
): value is PlatformSuspensionReasonCode {
  return (
    typeof value === "string" &&
    PLATFORM_SUSPENSION_REASON_CODES.some((reason) => reason === value)
  );
}

export function createInitialPlatformLifecycleState(
  input: Omit<PlatformLifecycleMutationInput, "suspensionReasonCode">,
): PlatformLifecycleActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId: input.requestId,
    churchId: input.churchId,
    expectedRevision: input.expectedRevision,
    operation: input.operation,
    suspensionReasonCode: "",
    retryRequired: false,
  };
}

export function getPlatformLifecycleOperationForStatus(
  status: PlatformTenantStatus,
): PlatformLifecycleOperation | null {
  if (status === "onboarding") return "activate";
  if (status === "active") return "suspend";
  if (status === "suspended") return "restore";
  return null;
}
