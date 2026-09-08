import { describe, expect, it } from "vitest";

import {
  CHURCH_LOGO_MAX_BYTES,
  CHURCH_SETTINGS_LIMITS,
  churchSettingsValuesEqual,
  createChurchLogoStoragePath,
  createInitialChurchSettingsState,
  isChurchSettingsRequestId,
  isManagedChurchLogoStoragePath,
  parseChurchSettingsRevision,
  validateChurchSettingsForm,
  type ChurchSettingsSnapshot,
} from "./church-settings";

const REQUEST_ID = "a0000000-0000-4000-8000-000000000901";

const snapshot: ChurchSettingsSnapshot = {
  churchId: "10000000-0000-4000-8000-000000000001",
  displayName: "Harbour Grace Church",
  legalName: "Harbour Grace Church Inc.",
  slug: "harbour-grace",
  status: "active",
  defaultCurrency: "BBD",
  supportEmail: "office@example.test",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: null,
  thankYouMessage: "Thank you.",
  logoStoragePath: null,
  settingsRevision: 0,
};

function validForm(overrides: Record<string, string | boolean | File> = {}) {
  const entries: Record<string, string | boolean | File> = {
    displayName: "Harbour Grace Church",
    legalName: "Harbour Grace Church Inc.",
    supportEmail: "office@example.test",
    timezone: "America/Barbados",
    primaryColor: "#1F6D60",
    secondaryColor: "",
    thankYouMessage: "Thank you.",
    ...overrides,
  };
  const formData = new FormData();

  Object.entries(entries).forEach(([name, value]) => {
    if (value === true) formData.set(name, "on");
    if (typeof value === "string" || value instanceof File) {
      formData.set(name, value);
    }
  });

  return formData;
}

describe("church settings validation", () => {
  it("creates serializable state from the stored snapshot", () => {
    expect(createInitialChurchSettingsState(REQUEST_ID, snapshot, null)).toEqual({
      status: "idle",
      message: "",
      responseEpoch: 0,
      requestId: REQUEST_ID,
      settingsRevision: 0,
      values: {
        displayName: "Harbour Grace Church",
        legalName: "Harbour Grace Church Inc.",
        supportEmail: "office@example.test",
        timezone: "America/Barbados",
        primaryColor: "#1F6D60",
        secondaryColor: "",
        thankYouMessage: "Thank you.",
        removeLogo: false,
      },
      logoPublicUrl: null,
      logoChanged: false,
      cleanupPending: false,
    });
  });

  it("normalizes exactly the editable database fields", () => {
    const result = validateChurchSettingsForm(
      validForm({
        displayName: "  Harbour   Grace Church  ",
        legalName: "  Harbour   Grace Church Inc.  ",
        supportEmail: " OFFICE@Example.Test ",
        timezone: " America/Barbados ",
        primaryColor: " #1f6d60 ",
        secondaryColor: " #e1b85a ",
        thankYouMessage: "  Thank you.\r\n\tGod bless.  ",
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      displayName: "Harbour Grace Church",
      legalName: "Harbour Grace Church Inc.",
      supportEmail: "office@example.test",
      timezone: "America/Barbados",
      primaryColor: "#1F6D60",
      secondaryColor: "#E1B85A",
      thankYouMessage: "Thank you.\r\n\tGod bless.",
      logoAction: "keep",
    });
  });

  it.each(["Church\nName", "Church\tName", "Church\u0000Name"]) (
    "rejects display-name control characters %#",
    (displayName) => {
      const result = validateChurchSettingsForm(validForm({ displayName }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.displayName).toBeDefined();
    },
  );

  it.each(["Legal\nName", "Legal\tName", "Legal\u0000Name"]) (
    "rejects legal-name control characters %#",
    (legalName) => {
      const result = validateChurchSettingsForm(validForm({ legalName }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.legalName).toBeDefined();
    },
  );

  it("enforces name and thank-you bounds while allowing CR, LF, and tab", () => {
    const atBounds = validateChurchSettingsForm(
      validForm({
        displayName: "D".repeat(CHURCH_SETTINGS_LIMITS.displayName),
        legalName: "L".repeat(CHURCH_SETTINGS_LIMITS.legalName),
        thankYouMessage: "T".repeat(CHURCH_SETTINGS_LIMITS.thankYouMessage),
      }),
    );
    expect(atBounds.success).toBe(true);

    const overBounds = validateChurchSettingsForm(
      validForm({
        displayName: "D".repeat(CHURCH_SETTINGS_LIMITS.displayName + 1),
        legalName: "L".repeat(CHURCH_SETTINGS_LIMITS.legalName + 1),
        thankYouMessage: "T".repeat(CHURCH_SETTINGS_LIMITS.thankYouMessage + 1),
      }),
    );
    expect(overBounds.success).toBe(false);
    if (overBounds.success) return;
    expect(overBounds.fieldErrors).toMatchObject({
      displayName: expect.any(String),
      legalName: expect.any(String),
      thankYouMessage: expect.any(String),
    });
  });

  it.each(["Thank\u0000you", "Thank\u0008you", "Thank\u000byou", "Thank\u007fyou"]) (
    "rejects unsafe thank-you control characters %#",
    (thankYouMessage) => {
      const result = validateChurchSettingsForm(validForm({ thankYouMessage }));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.fieldErrors.thankYouMessage).toBeDefined();
    },
  );

  it.each([
    "office..team@example.test",
    ".office@example.test",
    "office.@example.test",
    "office@example",
    "office@-example.test",
    "office@example-.test",
    "offic\u00e9@example.test",
  ])("rejects invalid support email %s", (supportEmail) => {
    const result = validateChurchSettingsForm(validForm({ supportEmail }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.supportEmail).toBeDefined();
  });

  it("accepts the 64-character email local-part and rejects 65", () => {
    expect(
      validateChurchSettingsForm(
        validForm({ supportEmail: `${"a".repeat(64)}@example.test` }),
      ).success,
    ).toBe(true);

    const result = validateChurchSettingsForm(
      validForm({ supportEmail: `${"a".repeat(65)}@example.test` }),
    );
    expect(result.success).toBe(false);
  });

  it("converts optional colours and thank-you text to null", () => {
    const result = validateChurchSettingsForm(
      validForm({ primaryColor: " ", secondaryColor: "", thankYouMessage: "  " }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.primaryColor).toBeNull();
    expect(result.data.secondaryColor).toBeNull();
    expect(result.data.thankYouMessage).toBeNull();
  });

  it("rejects invalid timezone and non-hex colours", () => {
    const result = validateChurchSettingsForm(
      validForm({
        timezone: "Barbados/Imaginary",
        primaryColor: "red",
        secondaryColor: "#12345Z",
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toMatchObject({
      timezone: expect.any(String),
      primaryColor: expect.any(String),
      secondaryColor: expect.any(String),
    });
  });

  it("selects replace/remove intent and rejects conflicting logo controls", () => {
    const logo = new File([new Uint8Array([1, 2, 3])], "logo.png", {
      type: "image/png",
    });
    const replace = validateChurchSettingsForm(validForm({ logo }));
    expect(replace.success).toBe(true);
    if (replace.success) expect(replace.data.logoAction).toBe("replace");

    const remove = validateChurchSettingsForm(validForm({ removeLogo: true }));
    expect(remove.success).toBe(true);
    if (remove.success) expect(remove.data.logoAction).toBe("remove");

    const conflict = validateChurchSettingsForm(
      validForm({ logo, removeLogo: true }),
    );
    expect(conflict.success).toBe(false);
    if (!conflict.success) expect(conflict.fieldErrors.logo).toBeDefined();
  });

  it("rejects an oversized logo before reading its bytes", () => {
    const oversized = new File(
      [new Uint8Array(CHURCH_LOGO_MAX_BYTES + 1)],
      "logo.png",
      { type: "image/png" },
    );
    const result = validateChurchSettingsForm(validForm({ logo: oversized }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors.logo).toContain("750 KB");
  });

  it("accepts only canonical request UUIDs and safe nonnegative revisions", () => {
    expect(isChurchSettingsRequestId(REQUEST_ID)).toBe(true);
    expect(isChurchSettingsRequestId(REQUEST_ID.toUpperCase())).toBe(false);
    expect(isChurchSettingsRequestId("not-a-uuid")).toBe(false);
    expect(parseChurchSettingsRevision("0")).toBe(0);
    expect(parseChurchSettingsRevision("12")).toBe(12);
    expect(parseChurchSettingsRevision("01")).toBeNull();
    expect(parseChurchSettingsRevision("-1")).toBeNull();
    expect(parseChurchSettingsRevision("9007199254740992")).toBeNull();
  });

  it("creates and verifies only exact same-tenant sanitized logo paths", () => {
    const path = `${snapshot.churchId}/${REQUEST_ID}.webp`;
    expect(createChurchLogoStoragePath(snapshot.churchId, REQUEST_ID)).toBe(path);
    expect(isManagedChurchLogoStoragePath(path, snapshot.churchId)).toBe(true);
    expect(
      isManagedChurchLogoStoragePath(
        `20000000-0000-4000-8000-000000000001/${REQUEST_ID}.webp`,
        snapshot.churchId,
      ),
    ).toBe(false);
    expect(isManagedChurchLogoStoragePath(`${path}.png`, snapshot.churchId)).toBe(
      false,
    );
    expect(isManagedChurchLogoStoragePath(`${path}/extra`, snapshot.churchId)).toBe(
      false,
    );
    expect(createChurchLogoStoragePath("not-a-church", REQUEST_ID)).toBeNull();
  });

  it("compares every retry-sensitive setting value", () => {
    const initial = createInitialChurchSettingsState(REQUEST_ID, snapshot, null);
    expect(churchSettingsValuesEqual(initial.values, initial.values)).toBe(true);
    expect(
      churchSettingsValuesEqual(initial.values, {
        ...initial.values,
        supportEmail: "changed@example.test",
      }),
    ).toBe(false);
  });
});
