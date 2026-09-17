import { describe, expect, it } from "vitest";

import {
  createMockCheckoutCookieValue,
  MOCK_CHECKOUT_COOKIE,
  parseMockCheckoutCookie,
} from "./mock-checkout-cookie";

const CHECKOUT_ID = "10000000-0000-4000-8000-000000000001";
const CAPABILITY_TOKEN = "abcdefab-cdef-4abc-8def-abcdefabcdef";

describe("mock checkout capability cookie", () => {
  it("round-trips only an exact checkout ID and UUID-v4 capability", () => {
    const value = createMockCheckoutCookieValue(
      CHECKOUT_ID,
      CAPABILITY_TOKEN,
    );

    expect(MOCK_CHECKOUT_COOKIE).toBe("cwe_mock_checkout");
    expect(value).toBe(`${CHECKOUT_ID}.${CAPABILITY_TOKEN}`);
    expect(parseMockCheckoutCookie(value ?? undefined, CHECKOUT_ID)).toEqual({
      checkoutId: CHECKOUT_ID,
      capabilityToken: CAPABILITY_TOKEN,
    });
  });

  it.each([
    ["bad checkout", "not-a-uuid", CAPABILITY_TOKEN],
    [
      "non-v4 capability",
      CHECKOUT_ID,
      "20000000-0000-3000-8000-000000000004",
    ],
    ["uppercase capability", CHECKOUT_ID, CAPABILITY_TOKEN.toUpperCase()],
  ])("refuses to create a cookie for a %s", (_label, checkoutId, token) => {
    expect(createMockCheckoutCookieValue(checkoutId, token)).toBeNull();
  });

  it("fails closed for missing, malformed, extra-part, or cross-checkout cookies", () => {
    expect(parseMockCheckoutCookie(undefined, CHECKOUT_ID)).toBeNull();
    expect(parseMockCheckoutCookie("not-a-cookie", CHECKOUT_ID)).toBeNull();
    expect(
      parseMockCheckoutCookie(
        `${CHECKOUT_ID}.${CAPABILITY_TOKEN}.extra`,
        CHECKOUT_ID,
      ),
    ).toBeNull();
    expect(
      parseMockCheckoutCookie(
        `${CHECKOUT_ID}.${CAPABILITY_TOKEN}`,
        "30000000-0000-4000-8000-000000000003",
      ),
    ).toBeNull();
  });
});
