import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelMockGivingCheckoutMock,
  completeMockGivingCheckoutMock,
  createMockPaymentSucceededWebhookMock,
  getMockGivingCheckoutMock,
} = vi.hoisted(() => ({
  cancelMockGivingCheckoutMock: vi.fn(),
  completeMockGivingCheckoutMock: vi.fn(),
  createMockPaymentSucceededWebhookMock: vi.fn(),
  getMockGivingCheckoutMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mock-giving-dal", () => ({
  cancelMockGivingCheckout: cancelMockGivingCheckoutMock,
  completeMockGivingCheckout: completeMockGivingCheckoutMock,
  getMockGivingCheckout: getMockGivingCheckoutMock,
}));
vi.mock("@/lib/mock-giving-webhook", () => ({
  createMockPaymentSucceededWebhook: createMockPaymentSucceededWebhookMock,
}));

import { POST as cancelCheckout } from "./cancel/route";
import { POST as completeCheckout } from "./complete/route";

const CHECKOUT_ID = "10000000-0000-4000-8000-000000000001";
const CAPABILITY_TOKEN = "20000000-0000-4000-8000-000000000004";
const COOKIE = `cwe_mock_checkout=${CHECKOUT_ID}.${CAPABILITY_TOKEN}`;
const WEBHOOK = {
  rawBody: JSON.stringify({
    checkoutId: CHECKOUT_ID,
    eventId: "mock_event_10000000000040008000000000000001",
    paymentReference: "mock_payment_10000000000040008000000000000001",
    type: "payment.succeeded",
  }),
  signature: "a".repeat(64),
};

const checkout = {
  checkoutId: CHECKOUT_ID,
  churchSlug: "harbour-grace",
  churchName: "Harbour Grace Church",
  fundName: "Tithes",
  campaignName: null,
  amountMinor: "2500",
  currency: "BBD",
  frequency: "one_time",
  checkoutStatus: "open",
  expiresAt: "2026-09-17T12:30:00.000Z",
  providerPaymentReference: "mock_payment_10000000000040008000000000000001",
  providerScheduleReference: null,
  thankYouMessage: "Thank you.",
} as const;

function mutationRequest(
  route: "complete" | "cancel",
  headers: Readonly<Record<string, string>> = {},
) {
  return new NextRequest(
    `https://giving.example/api/mock-giving/checkouts/${CHECKOUT_ID}/${route}`,
    {
      method: "POST",
      headers: {
        origin: "https://giving.example",
        "sec-fetch-site": "same-origin",
        cookie: COOKIE,
        ...headers,
      },
    },
  );
}

const context = {
  params: Promise.resolve({ checkoutId: CHECKOUT_ID }),
};

describe("mock checkout complete and cancel routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMockGivingCheckoutMock.mockResolvedValue({ ok: true, checkout });
    createMockPaymentSucceededWebhookMock.mockReturnValue(WEBHOOK);
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
    cancelMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      state: {
        checkoutId: CHECKOUT_ID,
        checkoutStatus: "canceled",
        donationStatus: "canceled",
        recurringStatus: null,
        replayed: false,
      },
    });
  });

  it("forwards the exact signed webhook and redirects completion with no-store", async () => {
    const response = await completeCheckout(
      mutationRequest("complete"),
      context,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://giving.example/give/harbour-grace/return?checkout=${CHECKOUT_ID}`,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
    );
    expect(createMockPaymentSucceededWebhookMock).toHaveBeenCalledWith(
      checkout,
      CAPABILITY_TOKEN,
    );
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
      WEBHOOK,
    );
    expect(response.headers.get("location")).not.toContain(CAPABILITY_TOKEN);
  });

  it("treats a successful completion replay as the same safe redirect", async () => {
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

    const response = await completeCheckout(
      mutationRequest("complete"),
      context,
    );

    expect(response.status).toBe(303);
    expect(completeMockGivingCheckoutMock).toHaveBeenCalledOnce();
  });

  it("cancels through the capability boundary without generating a webhook", async () => {
    const response = await cancelCheckout(mutationRequest("cancel"), context);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://giving.example/give/harbour-grace/return?checkout=${CHECKOUT_ID}`,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cancelMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
    );
    expect(createMockPaymentSucceededWebhookMock).not.toHaveBeenCalled();
    expect(completeMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it.each(["complete", "cancel"] as const)(
    "rejects cross-origin %s before reading checkout state",
    async (route) => {
      const handler = route === "complete" ? completeCheckout : cancelCheckout;
      const response = await handler(
        mutationRequest(route, {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        }),
        context,
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(getMockGivingCheckoutMock).not.toHaveBeenCalled();
    },
  );

  it.each(["complete", "cancel"] as const)(
    "fails closed when the %s capability cookie is absent or malformed",
    async (route) => {
      const handler = route === "complete" ? completeCheckout : cancelCheckout;
      const response = await handler(
        mutationRequest(route, { cookie: "cwe_mock_checkout=malformed" }),
        context,
      );

      expect(response.status).toBe(404);
      expect(getMockGivingCheckoutMock).not.toHaveBeenCalled();
    },
  );

  it("returns generic errors without leaking DAL, provider, or signature detail", async () => {
    completeMockGivingCheckoutMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      raw: "postgres secret signature provider detail",
    });

    const response = await completeCheckout(
      mutationRequest("complete"),
      context,
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Demo checkout unavailable.");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
