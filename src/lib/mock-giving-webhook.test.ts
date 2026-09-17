import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMockPaymentSucceededWebhook } from "./mock-giving-webhook";

const CHECKOUT_ID = "90000000-0000-4000-8000-000000000002";
const CAPABILITY_TOKEN = "90000000-0000-4000-8000-000000000001";

describe("mock payment webhook signing", () => {
  it("signs one exact allowlisted event with the per-checkout capability", () => {
    const result = createMockPaymentSucceededWebhook(
      {
        checkoutId: CHECKOUT_ID,
        churchSlug: "harbour-grace",
        churchName: "Harbour Grace Church",
        fundName: "Tithes",
        campaignName: null,
        amountMinor: "5000",
        currency: "BBD",
        frequency: "one_time",
        checkoutStatus: "open",
        expiresAt: "2026-09-17T12:30:00+00:00",
        providerPaymentReference: `mock_payment_${CHECKOUT_ID.replaceAll("-", "")}`,
        providerScheduleReference: null,
        thankYouMessage: null,
      },
      CAPABILITY_TOKEN,
    );

    expect(JSON.parse(result.rawBody)).toEqual({
      checkoutId: CHECKOUT_ID,
      eventId: `mock_event_${CHECKOUT_ID.replaceAll("-", "")}`,
      paymentReference: `mock_payment_${CHECKOUT_ID.replaceAll("-", "")}`,
      type: "payment.succeeded",
    });
    expect(result.signature).toBe(
      createHmac("sha256", CAPABILITY_TOKEN)
        .update(result.rawBody, "utf8")
        .digest("hex"),
    );
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(result.rawBody).not.toMatch(
      /donor|email|prayer|token|signature|card|bank/i,
    );
  });
});
