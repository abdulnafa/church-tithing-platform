export const PRAYER_REQUEST_LIMITS = {
  body: 2_000,
} as const;

export type ChurchPrayerRequest = Readonly<{
  id: string;
  body: string;
  isReviewed: boolean;
  consentedAt: string;
  createdAt: string;
  reviewedAt: string | null;
  updatedAt: string;
  revision: number;
}>;

export type PrayerReviewActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  prayerRequestId: string;
  expectedRevision: number;
  retryRequired: boolean;
  replayed?: boolean;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UNSAFE_BODY_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/;
const OUTER_PRAYER_WHITESPACE_PATTERN = /^[ \t\n]+|[ \t\n]+$/g;

export function getPrayerRequestCodePointLength(value: string) {
  return Array.from(value).length;
}

/**
 * Keep the transient public draft within the same Unicode code-point boundary
 * used by PostgreSQL. HTML maxLength counts UTF-16 units and would reject some
 * valid astral characters too early.
 */
export function limitPrayerRequestDraft(value: string) {
  const codePoints = Array.from(value);
  return codePoints.length <= PRAYER_REQUEST_LIMITS.body
    ? value
    : codePoints.slice(0, PRAYER_REQUEST_LIMITS.body).join("");
}

export function normalizePrayerRequestBody(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(OUTER_PRAYER_WHITESPACE_PATTERN, "");
}

export function isCanonicalPrayerRequestBody(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value === normalizePrayerRequestBody(value) &&
    getPrayerRequestCodePointLength(value) >= 1 &&
    getPrayerRequestCodePointLength(value) <= PRAYER_REQUEST_LIMITS.body &&
    !UNSAFE_BODY_PATTERN.test(value)
  );
}

export function getPrayerDraftConsentBoundary(
  value: string,
  consented: boolean,
) {
  const normalizedBody = normalizePrayerRequestBody(value);
  const hasText = normalizedBody.length > 0;
  const canConsent =
    hasText && isCanonicalPrayerRequestBody(normalizedBody);

  return {
    normalizedBody,
    hasText,
    canConsent,
    consented: canConsent && consented,
  } as const;
}

export function isPrayerRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPrayerReviewRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isPrayerRequestRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parsePrayerRequestRevision(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]*)$/.test(value)
  ) {
    return null;
  }
  const revision = Number(value);
  return isPrayerRequestRevision(revision) ? revision : null;
}

export function createInitialPrayerReviewActionState(
  requestId: string,
  prayerRequestId: string,
  expectedRevision: number,
): PrayerReviewActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    prayerRequestId,
    expectedRevision,
    retryRequired: false,
  };
}
