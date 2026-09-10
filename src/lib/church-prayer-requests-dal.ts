import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCanonicalPrayerRequestBody,
  isPrayerRequestId,
  isPrayerRequestRevision,
  isPrayerReviewRequestId,
  type ChurchPrayerRequest,
} from "./prayer-request";
import type { Database } from "./supabase/database.types";

export type PrayerRequestQueueResult =
  | Readonly<{ ok: true; requests: readonly ChurchPrayerRequest[] }>
  | Readonly<{ ok: false; reason: "forbidden" | "unavailable" }>;

export type PrayerReviewFailureReason =
  | "forbidden"
  | "invalid_request"
  | "idempotency_conflict"
  | "not_found"
  | "revision_conflict"
  | "already_reviewed"
  | "unavailable";

export type PrayerReviewResult =
  | Readonly<{
      ok: true;
      prayerRequestId: string;
      reviewedAt: string;
      revision: number;
      replayed: boolean;
    }>
  | Readonly<{ ok: false; reason: PrayerReviewFailureReason }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;

const RFC3339_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const MAX_QUEUE_SIZE = 100;
const QUEUE_ROW_KEYS = new Set([
  "prayer_request_id",
  "body",
  "is_reviewed",
  "consented_at",
  "created_at",
  "reviewed_at",
  "updated_at",
  "revision",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ParsedTimestamp = Readonly<{
  displayValue: string;
  epochMicroseconds: bigint;
}>;

type ParsedQueueRequest = Readonly<{
  request: ChurchPrayerRequest;
  consentedAtMicroseconds: bigint;
  createdAtMicroseconds: bigint;
  reviewedAtMicroseconds: bigint | null;
  updatedAtMicroseconds: bigint;
}>;

function parseRfc3339Timestamp(value: unknown): ParsedTimestamp | null {
  if (typeof value !== "string") return null;
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return null;

  const [, seconds, fraction = "", offset] = match;
  const epochMillisecondsAtSecond = Date.parse(`${seconds}${offset}`);
  if (!Number.isFinite(epochMillisecondsAtSecond)) return null;

  return {
    displayValue: new Date(value).toISOString(),
    epochMicroseconds:
      BigInt(epochMillisecondsAtSecond) * BigInt(1_000) +
      BigInt(fraction.padEnd(6, "0")),
  };
}

function isRfc3339(value: unknown): value is string {
  return parseRfc3339Timestamp(value) !== null;
}

function getErrorMessage(error: unknown) {
  return isRecord(error) && typeof error.message === "string"
    ? error.message
    : null;
}

function parseQueueRow(value: unknown): ParsedQueueRequest | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !QUEUE_ROW_KEYS.has(key))) return null;
  const consentedAt = parseRfc3339Timestamp(value.consented_at);
  const createdAt = parseRfc3339Timestamp(value.created_at);
  const reviewedAt =
    value.reviewed_at === null
      ? null
      : parseRfc3339Timestamp(value.reviewed_at);
  const updatedAt = parseRfc3339Timestamp(value.updated_at);

  if (
    !isPrayerRequestId(value.prayer_request_id) ||
    !isCanonicalPrayerRequestBody(value.body) ||
    typeof value.is_reviewed !== "boolean" ||
    !consentedAt ||
    !createdAt ||
    (value.reviewed_at !== null && !reviewedAt) ||
    !updatedAt ||
    !isPrayerRequestRevision(value.revision) ||
    value.is_reviewed !== (reviewedAt !== null) ||
    value.revision !== (value.is_reviewed ? 1 : 0)
  ) {
    return null;
  }

  if (
    consentedAt.epochMicroseconds > createdAt.epochMicroseconds ||
    updatedAt.epochMicroseconds < createdAt.epochMicroseconds ||
    (reviewedAt !== null &&
      (reviewedAt.epochMicroseconds < createdAt.epochMicroseconds ||
        reviewedAt.epochMicroseconds > updatedAt.epochMicroseconds))
  ) {
    return null;
  }

  return {
    request: {
      id: value.prayer_request_id,
      body: value.body,
      isReviewed: value.is_reviewed,
      consentedAt: consentedAt.displayValue,
      createdAt: createdAt.displayValue,
      reviewedAt: reviewedAt?.displayValue ?? null,
      updatedAt: updatedAt.displayValue,
      revision: value.revision,
    },
    consentedAtMicroseconds: consentedAt.epochMicroseconds,
    createdAtMicroseconds: createdAt.epochMicroseconds,
    reviewedAtMicroseconds: reviewedAt?.epochMicroseconds ?? null,
    updatedAtMicroseconds: updatedAt.epochMicroseconds,
  };
}

function isQueueOrderValid(
  previous: ParsedQueueRequest | undefined,
  current: ParsedQueueRequest,
) {
  if (!previous) return true;
  if (previous.request.isReviewed !== current.request.isReviewed) {
    return !previous.request.isReviewed && current.request.isReviewed;
  }
  if (previous.request.isReviewed) {
    if (
      previous.reviewedAtMicroseconds !== current.reviewedAtMicroseconds
    ) {
      return (
        previous.reviewedAtMicroseconds! > current.reviewedAtMicroseconds!
      );
    }
    return previous.request.id > current.request.id;
  }
  if (previous.createdAtMicroseconds !== current.createdAtMicroseconds) {
    return previous.createdAtMicroseconds < current.createdAtMicroseconds;
  }
  return previous.request.id < current.request.id;
}

/** Read only the owner-authorized, privacy-minimized prayer queue projection. */
export async function getPrayerRequestQueue(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<PrayerRequestQueueResult> {
  if (!isPrayerRequestId(churchId)) {
    return { ok: false, reason: "unavailable" };
  }

  let response: RpcResponse;
  try {
    response = await client.rpc("get_prayer_request_queue", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorMessage(response.error) === "PRAYER_QUEUE_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }
  if (!Array.isArray(response.data) || response.data.length > MAX_QUEUE_SIZE) {
    return { ok: false, reason: "unavailable" };
  }

  const requests: ChurchPrayerRequest[] = [];
  const ids = new Set<string>();
  let previous: ParsedQueueRequest | undefined;
  for (const value of response.data) {
    const parsed = parseQueueRow(value);
    if (
      !parsed ||
      ids.has(parsed.request.id) ||
      !isQueueOrderValid(previous, parsed)
    ) {
      return { ok: false, reason: "unavailable" };
    }
    ids.add(parsed.request.id);
    requests.push(parsed.request);
    previous = parsed;
  }
  return { ok: true, requests };
}

/** Mark one request reviewed through the audited, one-way RPC boundary. */
export async function reviewPrayerRequest(
  client: SupabaseClient<Database>,
  input: Readonly<{
    churchId: string;
    prayerRequestId: string;
    requestId: string;
    expectedRevision: number;
  }>,
): Promise<PrayerReviewResult> {
  if (
    !isPrayerRequestId(input.churchId) ||
    !isPrayerRequestId(input.prayerRequestId) ||
    !isPrayerReviewRequestId(input.requestId) ||
    !isPrayerRequestRevision(input.expectedRevision)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  let response: RpcResponse;
  try {
    response = await client.rpc("review_prayer_request", {
      target_church_id: input.churchId,
      target_prayer_request_id: input.prayerRequestId,
      review_request_id: input.requestId,
      expected_revision: input.expectedRevision,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    const reasonByMessage: Readonly<Record<string, PrayerReviewFailureReason>> = {
      PRAYER_REVIEW_FORBIDDEN: "forbidden",
      PRAYER_REVIEW_INVALID_REQUEST_ID: "invalid_request",
      PRAYER_REVIEW_INVALID_EXPECTED_REVISION: "invalid_request",
      PRAYER_REVIEW_NOT_FOUND: "not_found",
      PRAYER_REVIEW_REVISION_CONFLICT: "revision_conflict",
      PRAYER_REVIEW_ALREADY_REVIEWED: "already_reviewed",
      PRAYER_REVIEW_IDEMPOTENCY_CONFLICT: "idempotency_conflict",
    };
    return {
      ok: false,
      reason:
        reasonByMessage[getErrorMessage(response.error) ?? ""] ?? "unavailable",
    };
  }

  const value = Array.isArray(response.data)
    ? response.data.length === 1
      ? response.data[0]
      : null
    : response.data;
  if (!isRecord(value)) return { ok: false, reason: "unavailable" };
  if (
    value.prayer_request_id !== input.prayerRequestId ||
    !isRfc3339(value.reviewed_at) ||
    !isPrayerRequestRevision(value.revision) ||
    value.revision !== input.expectedRevision + 1 ||
    typeof value.replayed !== "boolean"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    prayerRequestId: value.prayer_request_id,
    reviewedAt: new Date(value.reviewed_at).toISOString(),
    revision: value.revision,
    replayed: value.replayed,
  };
}
