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
const WEBHOOK_EVENT_ID = "30000000-0000-4000-8000-000000000005";
const SIGNATURE = "a".repeat(64);
const EVENT = {
  checkoutId: CHECKOUT_ID,
  eventId: "mock_event_10000000000040008000000000000001",
  occurredAt: "2026-09-17T12:00:00.000Z",
  paymentReference: "mock_payment_10000000000040008000000000000001",
  type: "payment.succeeded",
} as const;
const RAW_BODY = JSON.stringify(EVENT);

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

function successfulState(
  override: Readonly<Record<string, unknown>> = {},
) {
  return {
    checkoutId: CHECKOUT_ID,
    checkoutStatus: "completed",
    donationStatus: "succeeded",
    recurringStatus: null,
    replayed: false,
    webhookEventId: WEBHOOK_EVENT_ID,
    webhookStatus: "processed",
    webhookOutcome: "donation_succeeded",
    ...override,
  };
}

describe("POST /api/donation-webhooks/mock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      state: successfulState(),
    });
  });

  it("forwards the exact verified raw body and returns a generic no-store acknowledgement", async () => {
    const response = await POST(webhookRequest());

    expect(dynamic).toBe("force-dynamic");
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
      { rawBody: RAW_BODY, signature: SIGNATURE },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it.each([
    ["exact duplicate", { replayed: true }],
    [
      "older event",
      {
        webhookStatus: "ignored",
        webhookOutcome: "ignored_older_event",
      },
    ],
    [
      "terminal-state event",
      {
        webhookStatus: "ignored",
        webhookOutcome: "ignored_terminal_state",
      },
    ],
    [
      "provider-declared payment failure",
      {
        checkoutStatus: "open",
        donationStatus: "failed",
        webhookOutcome: "donation_failed",
      },
    ],
  ])("acknowledges a safe %s outcome without exposing state", async (_label, state) => {
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      state: successfulState(state),
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledOnce();
  });

  it("accepts the exact payment.failed event contract", async () => {
    const body = JSON.stringify({ ...EVENT, type: "payment.failed" });
    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(200);
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
      { rawBody: body, signature: SIGNATURE },
    );
  });

  it.each([
    ["non-JSON content", { "content-type": "text/plain" }, RAW_BODY],
    ["missing capability", { "x-mock-capability": "" }, RAW_BODY],
    ["malformed signature", { "x-mock-signature": "A".repeat(64) }, RAW_BODY],
    ["malformed body", {}, "{"],
    [
      "extra body key",
      {},
      JSON.stringify({ ...EVENT, prayer: "private" }),
    ],
    [
      "noncanonical event time",
      {},
      JSON.stringify({ ...EVENT, occurredAt: "2026-09-17T12:00:00Z" }),
    ],
    [
      "mismatched checkout",
      {},
      JSON.stringify({
        ...EVENT,
        checkoutId: "10000000-0000-4000-8000-000000000099",
      }),
    ],
  ])("rejects %s before the DAL boundary", async (_label, headers, body) => {
    const response = await POST(webhookRequest(body, headers));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ received: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(completeMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it.each([
    ["declared oversized", "4097"],
    ["invalid declared length", "-1"],
    ["mismatched declared length", "1"],
  ])("rejects a %s body length before processing", async (_label, length) => {
    const response = await POST(
      webhookRequest(RAW_BODY, { "content-length": length }),
    );

    expect(response.status).toBe(400);
    expect(completeMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it("accepts an exact declared UTF-8 byte length", async () => {
    const response = await POST(
      webhookRequest(RAW_BODY, {
        "content-length": String(new TextEncoder().encode(RAW_BODY).byteLength),
      }),
    );

    expect(response.status).toBe(200);
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledOnce();
  });

  it("rejects browser cross-origin delivery while allowing header-free server delivery", async () => {
    const response = await POST(
      webhookRequest(RAW_BODY, {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      }),
    );

    expect(response.status).toBe(400);
    expect(completeMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it("allows an exact same-origin browser simulation", async () => {
    const response = await POST(
      webhookRequest(RAW_BODY, {
        origin: "https://giving.example",
        "sec-fetch-site": "same-origin",
      }),
    );

    expect(response.status).toBe(200);
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledOnce();
  });

  it("returns a generic conflict for an event-ID collision", async () => {
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: false,
      reason: "event_collision",
      raw: "private fingerprint detail",
    });

    const response = await POST(webhookRequest());
    const text = await response.text();

    expect(response.status).toBe(409);
    expect(text).toBe('{"received":false}');
    expect(text).not.toMatch(/fingerprint|event|database|signature/i);
  });

  it.each(["invalid_webhook", "forbidden"])(
    "fails closed for %s without leaking DAL details",
    async (reason) => {
      completeMockGivingCheckoutMock.mockResolvedValue({
        ok: false,
        reason,
        raw: "secret HMAC database detail",
      });

      const response = await POST(webhookRequest());
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(text).toBe('{"received":false}');
      expect(text).not.toMatch(/secret|hmac|database|signature/i);
    },
  );

  it.each(["handler_failed", "invalid_state", "unavailable"])(
    "keeps %s retryable with the same generic response",
    async (reason) => {
      completeMockGivingCheckoutMock.mockResolvedValue({ ok: false, reason });

      const response = await POST(webhookRequest());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ received: false });
    },
  );
});
