import { describe, expect, it } from "vitest";

import {
  createTrustedAppRedirect,
  getSafeAuthCallbackRedirect,
  getSafePostAuthDestination,
  getSafePostAuthRedirect,
} from "./redirects";

describe("getSafePostAuthRedirect", () => {
  it.each([
    "/dashboard",
    "/dashboard?year=2026#history",
    "/church",
    "/church/settings",
    "/platform/onboarding?step=details",
  ])("allows a known application destination: %s", (destination) => {
    expect(getSafePostAuthRedirect(destination)).toBe(destination);
  });

  it.each([
    undefined,
    "",
    " /church",
    "/church ",
    "https://attacker.example/church",
    "//attacker.example/church",
    "/\\attacker.example",
    "/%2f%2fattacker.example",
    "/%5cattacker.example",
    "/church%0d%0aLocation:https://attacker.example",
    "/churches",
    "/reset-password",
  ])("rejects an untrusted post-auth destination: %s", (destination) => {
    expect(getSafePostAuthRedirect(destination)).toBe("/dashboard");
  });

  it("only adds the reset page to the callback allowlist", () => {
    expect(getSafeAuthCallbackRedirect("/reset-password")).toBe(
      "/reset-password",
    );
    expect(getSafeAuthCallbackRedirect("/reset-password/other")).toBe(
      "/dashboard",
    );
  });

  it("exposes a nullable parser so authorization chooses the fallback", () => {
    expect(getSafePostAuthDestination("/platform/onboarding?step=details")).toBe(
      "/platform/onboarding?step=details",
    );
    expect(getSafePostAuthDestination("//attacker.example")).toBeNull();
    expect(getSafePostAuthDestination(undefined)).toBeNull();
  });

  it("strips internal transport parameters and rejects oversized direct input", () => {
    expect(
      getSafePostAuthDestination(
        "/church/settings?tab=branding&_rsc=internal&__nextData=internal",
      ),
    ).toBe("/church/settings?tab=branding");
    expect(
      getSafePostAuthDestination(`/church?query=${"x".repeat(2_048)}`),
    ).toBeNull();
  });
});

describe("createTrustedAppRedirect", () => {
  it("builds redirects from the configured application origin", () => {
    expect(
      createTrustedAppRedirect(
        "https://giving.example/base-path",
        "/auth/confirm",
      ),
    ).toBe("https://giving.example/auth/confirm");
    expect(
      createTrustedAppRedirect("http://localhost:3000", "/login"),
    ).toBe("http://localhost:3000/login");
  });

  it.each([
    ["http://giving.example", "/login"],
    ["https://user:password@giving.example", "/login"],
    ["https://giving.example", "https://attacker.example"],
    ["https://giving.example", "//attacker.example"],
  ])("rejects unsafe redirect input", (appUrl, destination) => {
    expect(() => createTrustedAppRedirect(appUrl, destination)).toThrow(
      "not trusted",
    );
  });
});
