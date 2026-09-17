import { describe, expect, it } from "vitest";

import {
  MOCK_GIVING_LIMITS,
  parseGivingAmountToMinor,
  parseMockGivingTarget,
  validateMockGivingCheckoutRequest,
} from "./giving-checkout";

const FUND_ID = "20000000-0000-4000-8000-000000000001";

function validRequest(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    requestId: "90000000-0000-4000-8000-000000000001",
    churchSlug: "harbour-grace",
    givingTarget: `fund:${FUND_ID}`,
    amount: "50.25",
    frequency: "one_time",
    fullName: " Guest   Donor ",
    email: " Guest@Example.Test ",
    ...overrides,
  };
}

describe("mock giving checkout validation", () => {
  it.each([
    ["1", 100],
    ["1.1", 110],
    ["19.99", 1_999],
    ["1000000.00", MOCK_GIVING_LIMITS.maximumAmountMinor],
  ])("converts %s to exact integer minor units", (input, expected) => {
    expect(parseGivingAmountToMinor(input)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "0.00",
    "0.01",
    "0.99",
    ".50",
    "01.00",
    "1.",
    "1.001",
    "1e2",
    " 5",
    "1000000.01",
    "10000000",
  ])("rejects ambiguous or out-of-range amount %s", (input) => {
    expect(parseGivingAmountToMinor(input)).toBeNull();
  });

  it("accepts only a canonical fund or campaign UUID target", () => {
    expect(parseMockGivingTarget(`fund:${FUND_ID}`)).toEqual({
      kind: "fund",
      id: FUND_ID,
    });
    expect(parseMockGivingTarget(`campaign:${FUND_ID}`)).toEqual({
      kind: "campaign",
      id: FUND_ID,
    });
    expect(parseMockGivingTarget(`church:${FUND_ID}`)).toBeNull();
    expect(parseMockGivingTarget(`fund:${FUND_ID}:extra`)).toBeNull();
    expect(parseMockGivingTarget("fund:not-a-uuid")).toBeNull();
  });

  it("normalizes the donor identity and returns an allowlisted checkout DTO", () => {
    expect(validateMockGivingCheckoutRequest(validRequest())).toEqual({
      success: true,
      data: {
        requestId: "90000000-0000-4000-8000-000000000001",
        churchSlug: "harbour-grace",
        targetKind: "fund",
        targetId: FUND_ID,
        amountMinor: 5_025,
        frequency: "one_time",
        donor: {
          fullName: "Guest Donor",
          email: "guest@example.test",
        },
      },
    });
  });

  it.each([
    ["invalid_request", { requestId: "90000000-0000-1000-8000-000000000001" }],
    ["invalid_church", { churchSlug: "Another Church" }],
    ["invalid_target", { givingTarget: `church:${FUND_ID}` }],
    ["invalid_amount", { amount: "NaN" }],
    ["invalid_frequency", { frequency: "daily" }],
    ["invalid_donor", { email: "not-an-email" }],
  ])("fails closed with %s", (code, override) => {
    expect(validateMockGivingCheckoutRequest(validRequest(override))).toEqual({
      success: false,
      code,
    });
  });

  it.each(["prayerRequest", "prayerRequestDraft", "prayerConsent", "prayerConsentDraft"])(
    "rejects %s so prayer content cannot cross the checkout boundary",
    (key) => {
      expect(
        validateMockGivingCheckoutRequest(validRequest({ [key]: "private" })),
      ).toEqual({ success: false, code: "invalid_request" });
    },
  );
});
