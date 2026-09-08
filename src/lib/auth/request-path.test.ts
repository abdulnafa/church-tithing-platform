import { describe, expect, it } from "vitest";

import {
  createSafeRequestDestination,
  MAX_REQUEST_DESTINATION_LENGTH,
} from "./request-path";

describe("trusted request destination", () => {
  it("preserves a normal path and query byte-for-byte", () => {
    const search =
      "?status=failed%20now&status=pending&empty=&encoded=%2Ffoo%2Fbar";

    expect(
      createSafeRequestDestination(
        "/church/transactions",
        search,
        "/church",
      ),
    ).toBe(`/church/transactions${search}`);
  });

  it("drops Next transport parameters while retaining application parameters", () => {
    expect(
      createSafeRequestDestination(
        "/church/settings",
        "?tab=branding&_rsc=abc123&__nextData=internal&page=2",
        "/church",
      ),
    ).toBe("/church/settings?tab=branding&page=2");
  });

  it("removes repeated and case-variant internal parameters", () => {
    expect(
      createSafeRequestDestination(
        "/dashboard",
        "?_RSC=one&_rsc=two&__NEXTLocale=en",
        "/dashboard",
      ),
    ).toBe("/dashboard");
  });

  it("uses the protected root instead of forwarding an oversized destination", () => {
    const oversizedSearch = `?query=${"x".repeat(MAX_REQUEST_DESTINATION_LENGTH)}`;

    expect(
      createSafeRequestDestination(
        "/platform/onboarding",
        oversizedSearch,
        "/platform",
      ),
    ).toBe("/platform");
  });
});
