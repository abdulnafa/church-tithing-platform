import { describe, expect, it } from "vitest";

import {
  createInitialPlatformOnboardingDefaultsState,
  platformOnboardingDefaultsValuesEqual,
  validatePlatformOnboardingDefaultsForm,
} from "./platform-onboarding-defaults";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const SNAPSHOT = {
  defaultCurrency: "BBD",
  defaultTimezone: "America/Barbados",
  defaultPrimaryColor: "#1F6D60",
  defaultSecondaryColor: "#E1B85A",
  settingsRevision: 3,
  updatedAt: "2026-09-07T10:00:00+00:00",
} as const;

function form(overrides: Readonly<Record<string, string>> = {}) {
  const values = {
    defaultCurrency: " bbd ",
    defaultTimezone: " America/Barbados ",
    defaultPrimaryColor: " #1f6d60 ",
    defaultSecondaryColor: " #e1b85a ",
    ...overrides,
  };
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe("platform onboarding defaults model", () => {
  it("creates state only from an explicit persisted snapshot", () => {
    expect(createInitialPlatformOnboardingDefaultsState(REQUEST_ID, SNAPSHOT)).toEqual({
      status: "idle",
      message: "",
      responseEpoch: 0,
      requestId: REQUEST_ID,
      expectedRevision: 3,
      values: {
        defaultCurrency: "BBD",
        defaultTimezone: "America/Barbados",
        defaultPrimaryColor: "#1F6D60",
        defaultSecondaryColor: "#E1B85A",
      },
      retryRequired: false,
    });
  });

  it("normalizes and independently validates every submitted value", () => {
    const result = validatePlatformOnboardingDefaultsForm(form());

    expect(result).toEqual({
      success: true,
      data: {
        defaultCurrency: "BBD",
        defaultTimezone: "America/Barbados",
        defaultPrimaryColor: "#1F6D60",
        defaultSecondaryColor: "#E1B85A",
      },
      values: {
        defaultCurrency: "BBD",
        defaultTimezone: "America/Barbados",
        defaultPrimaryColor: "#1F6D60",
        defaultSecondaryColor: "#E1B85A",
      },
    });
  });

  it.each([
    ["defaultCurrency", "EUR"],
    ["defaultTimezone", "Barbados time"],
    ["defaultTimezone", "Factory"],
    ["defaultTimezone", "America/Barbados\nUTC"],
    ["defaultPrimaryColor", "#12345"],
    ["defaultSecondaryColor", "red"],
  ])("rejects invalid %s independently", (field, value) => {
    const result = validatePlatformOnboardingDefaultsForm(form({ [field]: value }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors[field as keyof typeof result.fieldErrors]).toBeDefined();
  });

  it("compares every canonical value for an exact retry", () => {
    const values = createInitialPlatformOnboardingDefaultsState(REQUEST_ID, SNAPSHOT).values;
    expect(platformOnboardingDefaultsValuesEqual(values, { ...values })).toBe(true);
    expect(
      platformOnboardingDefaultsValuesEqual(values, {
        ...values,
        defaultCurrency: "USD",
      }),
    ).toBe(false);
  });
});
