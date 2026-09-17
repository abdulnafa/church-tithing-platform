import "server-only";

import { createPrivilegedServerSupabaseClient } from "@/lib/supabase/privileged-server";
import { createPublicServerSupabaseClient } from "@/lib/supabase/public-server";

import type {
  MockGivingCheckoutInput,
  MockGivingFrequency,
} from "./giving-checkout";

export type MockCheckoutStatus = "open" | "completed" | "canceled" | "expired";

export type MockGivingCheckoutSnapshot = Readonly<{
  checkoutId: string;
  churchSlug: string;
  churchName: string;
  fundName: string;
  campaignName: string | null;
  amountMinor: string;
  currency: "BBD" | "USD" | "CAD" | "XCD";
  frequency: MockGivingFrequency;
  checkoutStatus: MockCheckoutStatus;
  expiresAt: string;
  providerPaymentReference: string;
  providerScheduleReference: string | null;
  thankYouMessage: string | null;
  createdAt: string;
}>;

export type MockGivingState = Readonly<{
  checkoutId: string;
  checkoutStatus: MockCheckoutStatus;
  donationStatus:
    | "pending"
    | "processing"
    | "succeeded"
    | "failed"
    | "partially_refunded"
    | "refunded"
    | "disputed"
    | "canceled";
  recurringStatus: "incomplete" | "active" | "canceled" | null;
  replayed: boolean;
}>;

export type MockGivingWebhookState = MockGivingState &
  Readonly<{
    webhookEventId: string;
    webhookStatus: "processed" | "ignored";
    webhookOutcome:
      | "donation_succeeded"
      | "donation_failed"
      | "ignored_older_event"
      | "ignored_terminal_state";
  }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
type PublicRpcClient = Readonly<{
  rpc: (name: string, args: Readonly<Record<string, unknown>>) => Promise<RpcResponse>;
}>;

export type BeginMockGivingResult =
  | Readonly<{
      ok: true;
      checkoutId: string;
      expiresAt: string;
      replayed: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: "invalid_request" | "idempotency_conflict" | "unavailable";
    }>;

export type ReadMockGivingResult =
  | Readonly<{ ok: true; checkout: MockGivingCheckoutSnapshot }>
  | Readonly<{ ok: false; reason: "not_found" | "unavailable" }>;

type MockGivingMutationFailure = Readonly<{
  ok: false;
  reason:
    | "forbidden"
    | "invalid_state"
    | "invalid_webhook"
    | "event_collision"
    | "handler_failed"
    | "unavailable";
}>;

export type MutateMockGivingResult =
  | Readonly<{ ok: true; state: MockGivingState }>
  | MockGivingMutationFailure;

export type CompleteMockGivingResult =
  | Readonly<{ ok: true; state: MockGivingWebhookState }>
  | MockGivingMutationFailure;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const POSITIVE_MINOR_PATTERN = /^[1-9][0-9]{0,8}$/;
const PROVIDER_PAYMENT_PATTERN = /^mock_payment_[0-9a-f]{32}$/;
const PROVIDER_SCHEDULE_PATTERN = /^mock_schedule_[0-9a-f]{32}$/;
const SAFE_SINGLE_LINE_PATTERN = /^[^\u0000-\u001f\u007f]{2,120}$/u;
const SAFE_MULTILINE_PATTERN = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]{1,500}$/u;
const CURRENCIES = new Set(["BBD", "USD", "CAD", "XCD"]);
const FREQUENCIES = new Set(["one_time", "weekly", "monthly"]);
const CHECKOUT_STATUSES = new Set(["open", "completed", "canceled", "expired"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSingleRow(data: unknown) {
  if (Array.isArray(data)) return data.length === 1 ? data[0] : undefined;
  return data;
}

function getSetRow(data: unknown) {
  if (!Array.isArray(data)) return undefined;
  if (data.length === 0) return null;
  return data.length === 1 ? data[0] : undefined;
}

function getErrorMessage(error: unknown) {
  return isRecord(error) && typeof error.message === "string"
    ? error.message
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCapabilityToken(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    RFC3339_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isSafeSingleLine(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().replace(/\s+/g, " ") &&
    SAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function isSafeOptionalMultiline(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value === value.trim() &&
      !value.includes("\r") &&
      SAFE_MULTILINE_PATTERN.test(value))
  );
}

function parseCheckoutSnapshot(value: unknown): MockGivingCheckoutSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    !isUuid(value.checkout_id) ||
    typeof value.church_slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.church_slug) ||
    !isSafeSingleLine(value.church_name) ||
    !isSafeSingleLine(value.fund_name) ||
    !(value.campaign_name === null || isSafeSingleLine(value.campaign_name)) ||
    typeof value.amount_minor_text !== "string" ||
    !POSITIVE_MINOR_PATTERN.test(value.amount_minor_text) ||
    !CURRENCIES.has(value.currency as string) ||
    !FREQUENCIES.has(value.frequency as string) ||
    !CHECKOUT_STATUSES.has(value.checkout_status as string) ||
    !isRfc3339(value.expires_at) ||
    !isRfc3339(value.created_at) ||
    typeof value.provider_payment_reference !== "string" ||
    !PROVIDER_PAYMENT_PATTERN.test(value.provider_payment_reference) ||
    !(
      value.provider_schedule_reference === null ||
      (typeof value.provider_schedule_reference === "string" &&
        PROVIDER_SCHEDULE_PATTERN.test(value.provider_schedule_reference))
    ) ||
    !isSafeOptionalMultiline(value.thank_you_message)
  ) {
    return null;
  }

  const frequency = value.frequency as MockGivingFrequency;
  if (
    (frequency === "one_time" && value.provider_schedule_reference !== null) ||
    (frequency !== "one_time" && value.provider_schedule_reference === null)
  ) {
    return null;
  }

  return {
    checkoutId: value.checkout_id,
    churchSlug: value.church_slug,
    churchName: value.church_name,
    fundName: value.fund_name,
    campaignName: value.campaign_name,
    amountMinor: value.amount_minor_text,
    currency: value.currency as MockGivingCheckoutSnapshot["currency"],
    frequency,
    checkoutStatus: value.checkout_status as MockCheckoutStatus,
    expiresAt: value.expires_at,
    providerPaymentReference: value.provider_payment_reference,
    providerScheduleReference: value.provider_schedule_reference,
    thankYouMessage: value.thank_you_message,
    createdAt: value.created_at,
  };
}

function parseState(value: unknown, checkoutId: string): MockGivingState | null {
  if (!isRecord(value) || value.checkout_id !== checkoutId) return null;
  if (
    !CHECKOUT_STATUSES.has(value.checkout_status as string) ||
    !new Set([
      "pending",
      "processing",
      "succeeded",
      "failed",
      "partially_refunded",
      "refunded",
      "disputed",
      "canceled",
    ]).has(value.donation_status as string) ||
    !new Set([null, "incomplete", "active", "canceled"]).has(
      value.recurring_status as string | null,
    ) ||
    typeof value.replayed !== "boolean"
  ) {
    return null;
  }

  return {
    checkoutId,
    checkoutStatus: value.checkout_status as MockCheckoutStatus,
    donationStatus: value.donation_status as MockGivingState["donationStatus"],
    recurringStatus: value.recurring_status as MockGivingState["recurringStatus"],
    replayed: value.replayed,
  };
}

function parseWebhookState(
  value: unknown,
  checkoutId: string,
): MockGivingWebhookState | "handler_failed" | null {
  const state = parseState(value, checkoutId);
  if (!state || !isRecord(value) || !isUuid(value.webhook_event_id)) return null;

  if (
    value.webhook_status === "failed" &&
    value.webhook_outcome === "handler_failed"
  ) {
    return "handler_failed";
  }

  const validOutcome =
    (value.webhook_status === "processed" &&
      (value.webhook_outcome === "donation_succeeded" ||
        value.webhook_outcome === "donation_failed")) ||
    (value.webhook_status === "ignored" &&
      (value.webhook_outcome === "ignored_older_event" ||
        value.webhook_outcome === "ignored_terminal_state"));
  if (!validOutcome) return null;

  return {
    ...state,
    webhookEventId: value.webhook_event_id,
    webhookStatus: value.webhook_status,
    webhookOutcome: value.webhook_outcome,
  } as MockGivingWebhookState;
}

function createClient() {
  return createPublicServerSupabaseClient() as unknown as PublicRpcClient;
}

function createPrivilegedClient() {
  return createPrivilegedServerSupabaseClient() as unknown as PublicRpcClient;
}

export async function beginMockGivingCheckout(
  input: MockGivingCheckoutInput,
): Promise<BeginMockGivingResult> {
  let response: RpcResponse;
  try {
    response = await createPrivilegedClient().rpc("begin_mock_giving_checkout", {
      church_slug: input.churchSlug,
      capability_token: input.requestId,
      target_kind: input.targetKind,
      target_id: input.targetId,
      amount_minor: input.amountMinor,
      frequency: input.frequency,
      donor_display_name: input.donor.fullName,
      donor_email: input.donor.email,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const message = getErrorMessage(response.error);
    if (message === "MOCK_CHECKOUT_INVALID_REQUEST") {
      return { ok: false, reason: "invalid_request" };
    }
    if (message === "MOCK_CHECKOUT_IDEMPOTENCY_CONFLICT") {
      return { ok: false, reason: "idempotency_conflict" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const row = getSingleRow(response.data);
  if (
    !isRecord(row) ||
    !isUuid(row.checkout_id) ||
    !isUuid(row.donation_id) ||
    !isRfc3339(row.expires_at) ||
    typeof row.replayed !== "boolean"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    checkoutId: row.checkout_id,
    expiresAt: row.expires_at,
    replayed: row.replayed,
  };
}

export async function getMockGivingCheckout(
  checkoutId: string,
  capabilityToken: string,
): Promise<ReadMockGivingResult> {
  if (!isUuid(checkoutId) || !isCapabilityToken(capabilityToken)) {
    return { ok: false, reason: "not_found" };
  }

  let response: RpcResponse;
  try {
    response = await createClient().rpc("get_mock_giving_checkout", {
      checkout_id: checkoutId,
      capability_token: capabilityToken,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) return { ok: false, reason: "unavailable" };

  const row = getSetRow(response.data);
  if (row === null) return { ok: false, reason: "not_found" };
  if (row === undefined) return { ok: false, reason: "unavailable" };
  const checkout = parseCheckoutSnapshot(row);
  return checkout
    ? { ok: true, checkout }
    : { ok: false, reason: "unavailable" };
}

async function mutateMockCheckout(
  functionName: "cancel_mock_giving_checkout",
  checkoutId: string,
  capabilityToken: string,
): Promise<MutateMockGivingResult> {
  if (!isUuid(checkoutId) || !isCapabilityToken(capabilityToken)) {
    return { ok: false, reason: "forbidden" };
  }

  let response: RpcResponse;
  try {
    response = await createClient().rpc(functionName, {
      checkout_id: checkoutId,
      capability_token: capabilityToken,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const message = getErrorMessage(response.error);
    if (message === "MOCK_CHECKOUT_FORBIDDEN") {
      return { ok: false, reason: "forbidden" };
    }
    if (message === "MOCK_CHECKOUT_INVALID_STATE") {
      return { ok: false, reason: "invalid_state" };
    }
    if (message === "MOCK_CHECKOUT_INVALID_WEBHOOK") {
      return { ok: false, reason: "invalid_webhook" };
    }
    if (message === "MOCK_WEBHOOK_EVENT_COLLISION") {
      return { ok: false, reason: "event_collision" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const state = parseState(getSingleRow(response.data), checkoutId);
  return state
    ? { ok: true, state }
    : { ok: false, reason: "unavailable" };
}

export function cancelMockGivingCheckout(
  checkoutId: string,
  capabilityToken: string,
) {
  return mutateMockCheckout(
    "cancel_mock_giving_checkout",
    checkoutId,
    capabilityToken,
  );
}

export async function completeMockGivingCheckout(
  checkoutId: string,
  capabilityToken: string,
  webhook: Readonly<{ rawBody: string; signature: string }>,
): Promise<CompleteMockGivingResult> {
  if (!isUuid(checkoutId) || !isCapabilityToken(capabilityToken)) {
    return { ok: false, reason: "forbidden" };
  }

  let response: RpcResponse;
  try {
    response = await createPrivilegedClient().rpc(
      "process_mock_giving_webhook",
      {
        checkout_id: checkoutId,
        capability_token: capabilityToken,
        raw_body: webhook.rawBody,
        signature: webhook.signature,
      },
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    const message = getErrorMessage(response.error);
    if (message === "MOCK_CHECKOUT_FORBIDDEN") {
      return { ok: false, reason: "forbidden" };
    }
    if (message === "MOCK_CHECKOUT_INVALID_STATE") {
      return { ok: false, reason: "invalid_state" };
    }
    if (message === "MOCK_CHECKOUT_INVALID_WEBHOOK") {
      return { ok: false, reason: "invalid_webhook" };
    }
    if (message === "MOCK_WEBHOOK_EVENT_LIMIT") {
      return { ok: false, reason: "invalid_webhook" };
    }
    if (message === "MOCK_WEBHOOK_EVENT_COLLISION") {
      return { ok: false, reason: "event_collision" };
    }
    return { ok: false, reason: "unavailable" };
  }

  const state = parseWebhookState(getSingleRow(response.data), checkoutId);
  if (state === "handler_failed") {
    return { ok: false, reason: "handler_failed" };
  }
  return state
    ? { ok: true, state }
    : { ok: false, reason: "unavailable" };
}
