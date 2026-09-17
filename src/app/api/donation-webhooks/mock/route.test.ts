import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeMockGivingCheckoutMock } = vi.hoisted(() => ({
  completeMockGivingCheckoutMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mock-giving-dal", () => ({
  completeMockGivingCheckout: completeMockGivingCheckoutMock,
}));

import { dynamic, POST } from "./route";

const CHECKOUT_ID = "10000000-0000-4000-8000-000000000001";
const CAPABILITY_TOKEN = "20000000-0000-4000-8000-000000000004";
const SIGNATURE = "a".repeat(64);
const RAW_BODY = JSON.stringify({
  checkoutId: CHECKOUT_ID,
  eventId: "mock_event_10000000000040008000000000000001",
  paymentReference: "mock_payment_10000000000040008000000000000001",
  type: "payment.succeeded",
});

function webhookRequest(
  body = RAW_BODY,
  headers: Readonly<Record<string, string>> = {},
) {
  return new NextRequest(
    "https://giving.example/api/donation-webhooks/mock",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mock-checkout-id": CHECKOUT_ID,
        "x-mock-capability": CAPABILITY_TOKEN,
        "x-mock-signature": SIGNATURE,
        ...headers,
      },
      body,
    },
  );
}

describe("POST /api/donation-webhooks/mock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      state: {
        checkoutId: CHECKOUT_ID,
        checkoutStatus: "completed",
        donationStatus: "succeeded",
        recurringStatus: null,
        replayed: false,
      },
    });
  });

  it("forwards the exact signed raw body and returns a no-store acknowledgement", async () => {
    const response = await POST(webhookRequest());

    expect(dynamic).toBe("force-dynamic");
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
      { rawBody: RAW_BODY, signature: SIGNATURE },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      received: true,
      replayed: false,
      status: "completed",
    });
  });

  it("acknowledges a verified replay without changing the public response contract", async () => {
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      state: {
        checkoutId: CHECKOUT_ID,
        checkoutStatus: "completed",
        donationStatus: "succeeded",
        recurringStatus: null,
        replayed: true,
      },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      replayed: true,
      status: "completed",
    });
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledOnce();
  });

  it("rejects oversized bodies before forwarding them", async () => {
    const response = await POST(
      webhookRequest("{}", { "content-length": "4097" }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(completeMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing capability", { "x-mock-capability": "" }],
    ["missing signature", { "x-mock-signature": "" }],
    ["malformed body", {}, "{"],
  ])("fails closed for %s without leaking supplied or DAL details", async (
    _label,
    headers,
    body = RAW_BODY,
  ) => {
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: false,
      reason: "invalid_webhook",
      raw: "secret HMAC database detail",
    });

    const response = await POST(webhookRequest(body, headers));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toBe('{"received":false}');
    expect(text).not.toMatch(/secret|hmac|database|signature/i);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("uses retryable and state-conflict status codes with the same generic body", async () => {
    completeMockGivingCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_state",
    });
    const conflict = await POST(webhookRequest());
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ received: false });

    completeMockGivingCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const unavailable = await POST(webhookRequest());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ received: false });
  });
});
