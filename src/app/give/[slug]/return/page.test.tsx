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

import MockGivingReturnPage, { dynamic, metadata } from "./page";

const CHECKOUT_ID = "10000000-0000-4000-8000-000000000001";
const CAPABILITY_TOKEN = "20000000-0000-4000-8000-000000000004";

function snapshot(status: "open" | "completed" | "canceled" | "expired") {
  return {
    checkoutId: CHECKOUT_ID,
    churchSlug: "harbour-grace",
    churchName: "Harbour Grace Church",
    fundName: "Tithes",
    campaignName: null,
    amountMinor: "2500",
    currency: "BBD",
    frequency: "one_time",
    checkoutStatus: status,
    expiresAt: "2026-09-17T12:30:00.000Z",
    providerPaymentReference:
      "mock_payment_10000000000040008000000000000001",
    providerScheduleReference: null,
    thankYouMessage: "Thank you for the synthetic demo.",
  } as const;
}

function props(
  checkout: string | string[] | undefined = CHECKOUT_ID,
  slug = "harbour-grace",
) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ checkout }),
  };
}

describe("mock giving return page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({
        value: `${CHECKOUT_ID}.${CAPABILITY_TOKEN}`,
      })),
    });
    getMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      checkout: snapshot("completed"),
    });
  });

  it("renders the completed state read from the server and remains non-indexed", async () => {
    const markup = renderToStaticMarkup(await MockGivingReturnPage(props()));

    expect(dynamic).toBe("force-dynamic");
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(getMockGivingCheckoutMock).toHaveBeenCalledWith(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
    );
    expect(markup).toContain("The mock gift succeeded");
    expect(markup).toContain("BBD $25.00");
    expect(markup).toContain("Thank you for the synthetic demo");
    expect(markup).toContain("does not trust a success value from the URL");
    expect(markup).not.toMatch(/<input|card number|cvc|cvv|prayer/i);
  });

  it.each([
    ["open", "The mock checkout is not complete"],
    ["canceled", "The mock checkout was canceled"],
    ["expired", "This mock checkout expired"],
  ] as const)("renders server-trusted %s state", async (status, expected) => {
    getMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      checkout: snapshot(status),
    });

    const markup = renderToStaticMarkup(await MockGivingReturnPage(props()));

    expect(markup).toContain(expected);
    expect(markup).not.toContain("The mock gift succeeded");
  });

  it("does not accept an array, missing ID, or mismatched capability as success", async () => {
    await expect(MockGivingReturnPage(props([CHECKOUT_ID]))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(
      MockGivingReturnPage({
        params: Promise.resolve({ slug: "harbour-grace" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it("uses not-found for a missing record or wrong church without revealing which failed", async () => {
    getMockGivingCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    });
    await expect(MockGivingReturnPage(props())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    getMockGivingCheckoutMock.mockResolvedValueOnce({
      ok: true,
      checkout: snapshot("completed"),
    });
    await expect(
      MockGivingReturnPage(props(CHECKOUT_ID, "different-church")),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders generic failure copy without trusting or leaking DAL details", async () => {
    getMockGivingCheckoutMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      raw: "postgres secret provider signature",
    });

    const markup = renderToStaticMarkup(await MockGivingReturnPage(props()));

    expect(markup).toContain("We could not verify the demo result");
    expect(markup).toContain("does not assume success");
    expect(markup).not.toMatch(/postgres|secret|provider signature|supabase|rpc/i);
  });
});
