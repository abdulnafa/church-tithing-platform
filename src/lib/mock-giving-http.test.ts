import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  hasJsonContentType,
  isSameOriginMockGivingMutation,
} from "./mock-giving-http";

function request(headers: HeadersInit = {}) {
  return new NextRequest("https://giving.example/api/mock-giving/checkouts", {
    method: "POST",
    headers,
  });
}

describe("mock giving HTTP trust boundary", () => {
  it("accepts an exact same-origin browser mutation", () => {
    expect(
      isSameOriginMockGivingMutation(
        request({
          origin: "https://giving.example",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["missing origin", { "sec-fetch-site": "same-origin" }],
    [
      "cross origin",
      { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    ],
    [
      "spoofed origin with cross-site fetch metadata",
      { origin: "https://giving.example", "sec-fetch-site": "cross-site" },
    ],
    ["malformed origin", { origin: "not a url" }],
  ])("rejects %s", (_label, headers) => {
    expect(isSameOriginMockGivingMutation(request(headers))).toBe(false);
  });

  it("allows clients without Fetch Metadata only when Origin still matches", () => {
    expect(
      isSameOriginMockGivingMutation(
        request({ origin: "https://giving.example" }),
      ),
    ).toBe(true);
  });

  it("accepts JSON media types and rejects non-JSON or missing content types", () => {
    expect(hasJsonContentType(request({ "content-type": "application/json" }))).toBe(
      true,
    );
    expect(
      hasJsonContentType(
        request({ "content-type": "Application/JSON; charset=utf-8" }),
      ),
    ).toBe(true);
    expect(hasJsonContentType(request({ "content-type": "text/plain" }))).toBe(
      false,
    );
    expect(
      hasJsonContentType(request({ "content-type": "application/jsonp" })),
    ).toBe(false);
    expect(hasJsonContentType(request())).toBe(false);
  });
});
