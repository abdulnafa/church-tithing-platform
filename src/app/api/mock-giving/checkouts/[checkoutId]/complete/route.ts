import { NextResponse, type NextRequest } from "next/server";

import {
  MOCK_CHECKOUT_COOKIE,
  parseMockCheckoutCookie,
} from "@/lib/mock-checkout-cookie";
import {
  completeMockGivingCheckout,
  getMockGivingCheckout,
} from "@/lib/mock-giving-dal";
import { isSameOriginMockGivingMutation } from "@/lib/mock-giving-http";
import { createMockPaymentSucceededWebhook } from "@/lib/mock-giving-webhook";

export const dynamic = "force-dynamic";

type RouteContext = Readonly<{
  params: Promise<{ checkoutId: string }>;
}>;

function errorResponse(status: number) {
  return new NextResponse("Demo checkout unavailable.", {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isSameOriginMockGivingMutation(request)) return errorResponse(400);

  const { checkoutId } = await params;
  const capability = parseMockCheckoutCookie(
    request.cookies.get(MOCK_CHECKOUT_COOKIE)?.value,
    checkoutId,
  );
  if (!capability) return errorResponse(404);

  const checkoutResult = await getMockGivingCheckout(
    checkoutId,
    capability.capabilityToken,
  );
  if (!checkoutResult.ok) {
    return errorResponse(checkoutResult.reason === "not_found" ? 404 : 503);
  }

  const webhook = createMockPaymentSucceededWebhook(
    checkoutResult.checkout,
    capability.capabilityToken,
  );
  const result = await completeMockGivingCheckout(
    checkoutId,
    capability.capabilityToken,
    webhook,
  );
  if (!result.ok) {
    return errorResponse(
      result.reason === "forbidden" || result.reason === "invalid_webhook"
        ? 404
        : result.reason === "invalid_state" ||
            result.reason === "event_collision"
          ? 409
          : 503,
    );
  }

  const returnUrl = new URL(
    `/give/${encodeURIComponent(
      checkoutResult.checkout.churchSlug,
    )}/return?checkout=${encodeURIComponent(checkoutId)}`,
    request.url,
  );
  const response = NextResponse.redirect(returnUrl, 303);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
