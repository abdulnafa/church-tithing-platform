import { NextResponse, type NextRequest } from "next/server";

import { validateMockGivingCheckoutRequest } from "@/lib/giving-checkout";
import {
  createMockCheckoutCookieValue,
  MOCK_CHECKOUT_COOKIE,
} from "@/lib/mock-checkout-cookie";
import { beginMockGivingCheckout } from "@/lib/mock-giving-dal";
import {
  hasJsonContentType,
  isSameOriginMockGivingMutation,
} from "@/lib/mock-giving-http";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4_096;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMockGivingMutation(request) || !hasJsonContentType(request)) {
    return jsonError("Invalid checkout request.", 400);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_REQUEST_BYTES) {
    return jsonError("Invalid checkout request.", 400);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonError("Invalid checkout request.", 400);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError("Invalid checkout request.", 400);
  }

  const validation = validateMockGivingCheckoutRequest(body);
  if (!validation.success) {
    return jsonError("Check the giving details and try again.", 400);
  }

  const result = await beginMockGivingCheckout(validation.data);
  if (!result.ok) {
    if (result.reason === "idempotency_conflict") {
      return jsonError("Retry the original checkout details.", 409);
    }
    if (result.reason === "invalid_request") {
      return jsonError("Check the giving details and try again.", 400);
    }
    return jsonError("The demo checkout is temporarily unavailable.", 503);
  }

  const cookieValue = createMockCheckoutCookieValue(
    result.checkoutId,
    validation.data.requestId,
  );
  if (!cookieValue) {
    return jsonError("The demo checkout is temporarily unavailable.", 503);
  }

  const checkoutPath = `/give/${encodeURIComponent(
    validation.data.churchSlug,
  )}/checkout/${encodeURIComponent(result.checkoutId)}`;
  const response = NextResponse.json(
    { checkoutPath },
    { status: result.replayed ? 200 : 201 },
  );
  response.headers.set("cache-control", "private, no-store");
  response.cookies.set(MOCK_CHECKOUT_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    expires: new Date(result.expiresAt),
  });
  return response;
}
