import { NextResponse, type NextRequest } from "next/server";

import { completeMockGivingCheckout } from "@/lib/mock-giving-dal";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 4_096;

function webhookResponse(status: number, body: Readonly<Record<string, unknown>>) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const checkoutId = request.headers.get("x-mock-checkout-id") ?? "";
  const capabilityToken = request.headers.get("x-mock-capability") ?? "";
  const signature = request.headers.get("x-mock-signature") ?? "";
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_WEBHOOK_BYTES) {
    return webhookResponse(400, { received: false });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return webhookResponse(400, { received: false });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
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
        : result.reason === "invalid_state"
          ? 409
          : 503,
      { received: false },
    );
  }

  return webhookResponse(200, {
    received: true,
    replayed: result.state.replayed,
    status: result.state.checkoutStatus,
  });
}
