import { describe, expect, it } from "vitest";

import {
  DONOR_IDENTITY_LIMITS,
  getDonorDisplayNameError,
  getDonorEmailError,
  normalizeDonorDisplayName,
  normalizeDonorEmail,
  validateGuestIdentityValues,
} from "./donor-identity";

describe("donor identity validation", () => {
  it("canonicalizes a valid guest name and email without storing anything", () => {
    expect(
      validateGuestIdentityValues({
        fullName: "  Alicia   Clarke  ",
        email: "  Alicia.Clarke+Giving@Example.Test ",
      }),
    ).toEqual({
      success: true,
      data: {
        fullName: "Alicia Clarke",
        email: "alicia.clarke+giving@example.test",
      },
      values: {
        fullName: "Alicia Clarke",
        email: "alicia.clarke+giving@example.test",
      },
    });
  });

  it("keeps Unicode names and measures their code points", () => {
    const maximumName = "😀".repeat(DONOR_IDENTITY_LIMITS.displayName);

    expect(getDonorDisplayNameError("Élodie Brathwaite")).toBeUndefined();
    expect(getDonorDisplayNameError(maximumName)).toBeUndefined();
    expect(getDonorDisplayNameError(`${maximumName}😀`)).toContain("120");
  });

  it("rejects missing, overlong, multiline, and control-character names", () => {
    expect(getDonorDisplayNameError(" ")).toBe("Enter your full name.");
    expect(getDonorDisplayNameError("a".repeat(121))).toContain("120");
    expect(getDonorDisplayNameError("Alicia\nClarke")).toContain("control");
    expect(getDonorDisplayNameError("Alicia\u0000Clarke")).toContain("control");
    expect(getDonorDisplayNameError("Alicia\u0085Clarke")).toContain("control");
    expect(getDonorDisplayNameError("Alicia\u202eClarke")).toContain("control");
  });

  it("accepts practical canonical email addresses and rejects unsafe shapes", () => {
    expect(getDonorEmailError("member+giving@example.test")).toBeUndefined();
    expect(getDonorEmailError("member@example")).toBeDefined();
    expect(getDonorEmailError(".member@example.test")).toBeDefined();
    expect(getDonorEmailError("member..giving@example.test")).toBeDefined();
    expect(getDonorEmailError(`${"a".repeat(65)}@example.test`)).toBeDefined();
    expect(getDonorEmailError(`member@${"a".repeat(64)}.test`)).toBeDefined();
  });

  it("returns independent field errors and safe normalized retry values", () => {
    expect(
      validateGuestIdentityValues({ fullName: " A ", email: "invalid " }),
    ).toEqual({
      success: false,
      fieldErrors: {
        fullName: "Enter your full name.",
        email: "Enter a valid email address.",
      },
      values: { fullName: "A", email: "invalid" },
    });
  });

  it("exports small deterministic normalizers for client-only draft state", () => {
    expect(normalizeDonorDisplayName("  Alicia\tClarke ")).toBe("Alicia Clarke");
    expect(normalizeDonorEmail(" Member@Example.Test ")).toBe(
      "member@example.test",
    );
  });

});
