import "server-only";

import { createHmac } from "node:crypto";

import type { MockGivingCheckoutSnapshot } from "./mock-giving-dal";

export type MockPaymentSucceededEvent = Readonly<{
  checkoutId: string;
  eventId: string;
  paymentReference: string;
  type: "payment.succeeded";
}>;

export function createMockPaymentSucceededWebhook(
  checkout: MockGivingCheckoutSnapshot,
  capabilityToken: string,
) {
  const event: MockPaymentSucceededEvent = {
    checkoutId: checkout.checkoutId,
    eventId: `mock_event_${checkout.checkoutId.replaceAll("-", "")}`,
    paymentReference: checkout.providerPaymentReference,
    type: "payment.succeeded",
  };
  const rawBody = JSON.stringify(event);
  const signature = createHmac("sha256", capabilityToken)
    .update(rawBody, "utf8")
    .digest("hex");

  return { rawBody, signature } as const;
}
