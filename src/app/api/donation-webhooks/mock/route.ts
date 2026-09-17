import { NextResponse, type NextRequest } from "next/server";

import { completeMockGivingCheckout } from "@/lib/mock-giving-dal";
import { hasJsonContentType } from "@/lib/mock-giving-http";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 4_096;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const EVENT_ID_PATTERN = /^mock_event_[0-9a-f]{32}$/;
const PAYMENT_REFERENCE_PATTERN = /^mock_payment_[0-9a-f]{32}$/;
const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EVENT_KEYS = [
  "checkoutId",
  "eventId",
  "occurredAt",
  "paymentReference",
  "type",
] as const;

function webhookResponse(status: number, body: Readonly<Record<string, unknown>>) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  // Provider-to-server deliveries do not carry browser provenance headers.
  if (origin === null) return fetchSite === null;
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isValidEventBody(value: unknown, checkoutId: string) {
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).sort().join("\u0000") !==
    [...EVENT_KEYS].sort().join("\u0000")
  ) {
    return false;
  }

  return (
    value.checkoutId === checkoutId &&
    typeof value.eventId === "string" &&
    EVENT_ID_PATTERN.test(value.eventId) &&
    isCanonicalTimestamp(value.occurredAt) &&
    typeof value.paymentReference === "string" &&
    PAYMENT_REFERENCE_PATTERN.test(value.paymentReference) &&
    (value.type === "payment.succeeded" || value.type === "payment.failed")
  );
}

export async function POST(request: NextRequest) {
  const checkoutId = request.headers.get("x-mock-checkout-id") ?? "";
  const capabilityToken = request.headers.get("x-mock-capability") ?? "";
  const signature = request.headers.get("x-mock-signature") ?? "";
  const declaredLengthHeader = request.headers.get("content-length");
  if (
    !hasJsonContentType(request) ||
    !hasAllowedOrigin(request) ||
    !UUID_PATTERN.test(checkoutId) ||
    !UUID_V4_PATTERN.test(capabilityToken) ||
    !SIGNATURE_PATTERN.test(signature) ||
    (declaredLengthHeader !== null &&
      (!/^(?:0|[1-9][0-9]*)$/.test(declaredLengthHeader) ||
        Number(declaredLengthHeader) > MAX_WEBHOOK_BYTES))
  ) {
    return webhookResponse(400, { received: false });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return webhookResponse(400, { received: false });
  }
  const actualLength = new TextEncoder().encode(rawBody).byteLength;
  if (
    actualLength > MAX_WEBHOOK_BYTES ||
    (declaredLengthHeader !== null &&
      Number(declaredLengthHeader) !== actualLength)
  ) {
    return webhookResponse(400, { received: false });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return webhookResponse(400, { received: false });
  }
  if (!isValidEventBody(body, checkoutId)) {
    return webhookResponse(400, { received: false });
  }

  const result = await completeMockGivingCheckout(
    checkoutId,
    capabilityToken,
    { rawBody, signature },
  );
  if (!result.ok) {
    return webhookResponse(
      result.reason === "forbidden" || result.reason === "invalid_webhook"
        ? 400
        : result.reason === "event_collision"
          ? 409
          : 503,
      { received: false },
    );
  }

  return webhookResponse(200, { received: true });
}
