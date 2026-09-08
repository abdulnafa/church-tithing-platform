import { describe, expect, it } from "vitest";

import {
  CHURCH_PROVISIONING_LIMITS,
  createInitialChurchProvisioningState,
  isChurchProvisioningRequestId,
  validateChurchProvisioningForm,
} from "./church-provisioning";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const DEFAULTS = {
  currency: "BBD",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: "#E1B85A",
} as const;

function validForm(overrides: Record<string, string | boolean> = {}) {
  const values: Record<string, string | boolean> = {
    displayName: "Harbour Grace Church",
    legalName: "Harbour Grace Church Inc.",
    ownerEmail: "owner@example.test",
    supportEmail: "office@example.test",
    slug: "harbour-grace",
    currency: "BBD",
    timezone: "America/Barbados",
    primaryColor: "#1F6D60",
    secondaryColor: "#E1B85A",
    thankYouMessage: "Thank you for giving.",
    acknowledgement: true,
    ...overrides,
  };
  const data = new FormData();

  Object.entries(values).forEach(([name, value]) => {
    if (value === true) data.set(name, "on");
    if (typeof value === "string") data.set(name, value);
  });

  return data;
}

describe("church provisioning form validation", () => {
  it("creates safe Barbados-first defaults with the server request reference", () => {
    expect(createInitialChurchProvisioningState(REQUEST_ID, DEFAULTS)).toEqual({
      status: "idle",
      message: "",
      requestId: REQUEST_ID,
      values: {
        displayName: "",
        legalName: "",
        ownerEmail: "",
        supportEmail: "",
        slug: "",
        currency: "BBD",
        timezone: "America/Barbados",
        primaryColor: "#1F6D60",
        secondaryColor: "#E1B85A",
        thankYouMessage: "",
        acknowledgement: false,
      },
    });
  });

  it("normalizes only the fields covered by the database contract", () => {
    const result = validateChurchProvisioningForm(
      validForm({
        displayName: "  Harbour   Grace   Church  ",
        legalName: "  Harbour   Grace Church Inc.  ",
        ownerEmail: " OWNER@Example.Test ",
        supportEmail: " OFFICE@Example.Test ",
        currency: " bbd ",
        timezone: " America/Barbados ",
        primaryColor: " #1f6d60 ",
        secondaryColor: " #e1b85a ",
        thankYouMessage: "  Thank you.\r\n\r\nPlease visit again.  ",
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      displayName: "Harbour Grace Church",
      legalName: "Harbour Grace Church Inc.",
      ownerEmail: "owner@example.test",
      supportEmail: "office@example.test",
      slug: "harbour-grace",
      currency: "BBD",
      timezone: "America/Barbados",
      primaryColor: "#1F6D60",
      secondaryColor: "#E1B85A",
      thankYouMessage: "Thank you.\n\nPlease visit again.",
    });
  });

  it("does not silently repair an invalid slug", () => {
    const result = validateChurchProvisioningForm(
      validForm({ slug: " Harbour-Grace " }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.values.slug).toBe(" Harbour-Grace ");
    expect(result.fieldErrors.slug).toContain("lowercase");
  });

  it.each(["Harbour\nGrace", "Harbour\tGrace", "Harbour\u0000Grace"])(
    "rejects raw display-name control characters %#",
    (displayName) => {
      const result = validateChurchProvisioningForm(validForm({ displayName }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.displayName).toBeDefined();
    },
  );

  it.each(["Harbour\nGrace Inc.", "Harbour\tGrace Inc.", "Harbour\u0000Grace Inc."])(
    "rejects raw legal-name control characters %#",
    (legalName) => {
      const result = validateChurchProvisioningForm(validForm({ legalName }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.legalName).toBeDefined();
    },
  );

  it.each(["BBD", "USD", "CAD", "XCD", "usd"])(
    "accepts supported currency %s",
    (currency) => {
      const result = validateChurchProvisioningForm(validForm({ currency }));
      expect(result.success).toBe(true);
    },
  );

  it.each(["EUR", "GBP", "", "US"])(
    "rejects unsupported currency %s",
    (currency) => {
      const result = validateChurchProvisioningForm(validForm({ currency }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.currency).toBeDefined();
    },
  );

  it("enforces exact name and thank-you bounds", () => {
    const atBounds = validateChurchProvisioningForm(
      validForm({
        displayName: "D".repeat(CHURCH_PROVISIONING_LIMITS.displayName),
        legalName: "L".repeat(CHURCH_PROVISIONING_LIMITS.legalName),
        thankYouMessage: "T".repeat(
          CHURCH_PROVISIONING_LIMITS.thankYouMessage,
        ),
      }),
    );
    expect(atBounds.success).toBe(true);

    const overBounds = validateChurchProvisioningForm(
      validForm({
        displayName: "D".repeat(CHURCH_PROVISIONING_LIMITS.displayName + 1),
        legalName: "L".repeat(CHURCH_PROVISIONING_LIMITS.legalName + 1),
        thankYouMessage: "T".repeat(
          CHURCH_PROVISIONING_LIMITS.thankYouMessage + 1,
        ),
      }),
    );
    expect(overBounds.success).toBe(false);
    if (overBounds.success) return;
    expect(Object.keys(overBounds.fieldErrors)).toEqual(
      expect.arrayContaining(["displayName", "legalName", "thankYouMessage"]),
    );
  });

  it("allows a blank optional thank-you message and converts it to null", () => {
    const result = validateChurchProvisioningForm(
      validForm({ thankYouMessage: "   " }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.thankYouMessage).toBeNull();
  });

  it("preserves allowed thank-you line breaks and tabs", () => {
    const result = validateChurchProvisioningForm(
      validForm({ thankYouMessage: "Line one\r\n\tLine two" }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.thankYouMessage).toBe("Line one\n\tLine two");
  });

  it.each(["Thank\u0000you", "Thank\u0008you", "Thank\u000byou", "Thank\u007fyou"])(
    "rejects disallowed thank-you control characters %#",
    (thankYouMessage) => {
      const result = validateChurchProvisioningForm(
        validForm({ thankYouMessage }),
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.thankYouMessage).toBeDefined();
    },
  );

  it.each([
    "owner..name@example.test",
    ".owner@example.test",
    "owner.@example.test",
    "owner@example",
    "owner@-example.test",
    "owner@example-.test",
    "owner:admin@example.test",
    "owner@example.test!",
    "own\u00e9r@example.test",
  ])("rejects unsafe or non-dotted email %s", (ownerEmail) => {
    const result = validateChurchProvisioningForm(validForm({ ownerEmail }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.ownerEmail).toBeDefined();
  });

  it("accepts the database-approved email local-part characters", () => {
    const result = validateChurchProvisioningForm(
      validForm({ ownerEmail: "owner+pilot/2026@example.test" }),
    );

    expect(result.success).toBe(true);
  });

  it("enforces the database email local-part bound", () => {
    const atBound = validateChurchProvisioningForm(
      validForm({ ownerEmail: `${"a".repeat(64)}@example.test` }),
    );
    expect(atBound.success).toBe(true);

    const overBound = validateChurchProvisioningForm(
      validForm({ ownerEmail: `${"a".repeat(65)}@example.test` }),
    );
    expect(overBound.success).toBe(false);
    if (overBound.success) return;
    expect(overBound.fieldErrors.ownerEmail).toBeDefined();
  });

  it("rejects invalid timezone, colours, and missing acknowledgement", () => {
    const result = validateChurchProvisioningForm(
      validForm({
        timezone: "Barbados/Imaginary",
        primaryColor: "#12345Z",
        secondaryColor: "red",
        acknowledgement: false,
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toMatchObject({
      timezone: expect.any(String),
      primaryColor: expect.any(String),
      secondaryColor: expect.any(String),
      acknowledgement: expect.any(String),
    });
  });

  it("recognizes only structurally valid UUID request references", () => {
    expect(isChurchProvisioningRequestId(REQUEST_ID)).toBe(true);
    expect(isChurchProvisioningRequestId("not-a-uuid")).toBe(false);
    expect(isChurchProvisioningRequestId(null)).toBe(false);
  });
});
