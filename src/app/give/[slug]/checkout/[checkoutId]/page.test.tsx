import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, getMockGivingCheckoutMock, notFoundMock } = vi.hoisted(
  () => ({
    cookiesMock: vi.fn(),
    getMockGivingCheckoutMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/mock-giving-dal", () => ({
  getMockGivingCheckout: getMockGivingCheckoutMock,
}));
vi.mock("@/components/brand", () => ({
  ChurchMark: () => <span>Church mark</span>,
}));
vi.mock("@/components/icons", () => ({
  ShieldIcon: () => <span aria-hidden="true">shield</span>,
}));

import MockCheckoutPage, { dynamic, metadata } from "./page";

const CHECKOUT_ID = "10000000-0000-4000-8000-000000000001";
const CAPABILITY_TOKEN = "20000000-0000-4000-8000-000000000004";

function snapshot(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
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
    providerPaymentReference:
      "mock_payment_10000000000040008000000000000001",
    providerScheduleReference: null,
    thankYouMessage: "Thank you.",
    ...overrides,
  };
}

function props(slug = "harbour-grace") {
  return {
    params: Promise.resolve({ slug, checkoutId: CHECKOUT_ID }),
  };
}

describe("mock hosted checkout page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({
        value: `${CHECKOUT_ID}.${CAPABILITY_TOKEN}`,
      })),
    });
    getMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      checkout: snapshot(),
    });
  });

  it("renders a payment-free server snapshot with only complete/cancel actions", async () => {
    const markup = renderToStaticMarkup(await MockCheckoutPage(props()));

    expect(dynamic).toBe("force-dynamic");
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(getMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
    );
    expect(markup).toContain("Harbour Grace Church");
    expect(markup).toContain("BBD $25.00");
    expect(markup).toContain("Tithes");
    expect(markup).toContain(
      `action="/api/mock-giving/checkouts/${CHECKOUT_ID}/complete"`,
    );
    expect(markup).toContain(
      `action="/api/mock-giving/checkouts/${CHECKOUT_ID}/cancel"`,
    );
    expect(markup.match(/method="post"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/<input|card number|cvc|cvv|expiry/i);
    expect(markup).not.toMatch(/prayer|demo@example\.test|Demo Donor/i);
    expect(markup).toContain("no card details, charge, transfer");
  });

  it("fails closed before data access when the capability cookie is missing", async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });

    await expect(MockCheckoutPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(getMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it("makes a slug mismatch indistinguishable from a missing checkout", async () => {
    await expect(MockCheckoutPage(props("different-church"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("renders closed state from the server record rather than client input", async () => {
    getMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      checkout: snapshot({ checkoutStatus: "completed" }),
    });

    const markup = renderToStaticMarkup(await MockCheckoutPage(props()));

    expect(markup).toContain("This simulation is already completed");
    expect(markup).toContain(
      `/give/harbour-grace/return?checkout=${CHECKOUT_ID}`,
    );
    expect(markup).not.toContain("Simulate successful payment");
  });

  it("shows a generic unavailable state without leaking database errors", async () => {
    getMockGivingCheckoutMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      raw: "postgres secret policy detail",
    });

    const markup = renderToStaticMarkup(await MockCheckoutPage(props()));

    expect(markup).toContain("We could not load this demo checkout");
    expect(markup).toContain("No payment was made");
    expect(markup).not.toMatch(/postgres|secret|policy|supabase|rpc/i);
  });
});
