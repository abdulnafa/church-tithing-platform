import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { beginMockGivingCheckoutMock } = vi.hoisted(() => ({
  beginMockGivingCheckoutMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mock-giving-dal", () => ({
  beginMockGivingCheckout: beginMockGivingCheckoutMock,
}));

import { dynamic, POST } from "./route";

const REQUEST_ID = "10000000-0000-4000-8000-000000000004";
const CHECKOUT_ID = "20000000-0000-4000-8000-000000000001";
const FUND_ID = "30000000-0000-4000-8000-000000000001";

const validBody = {
  requestId: REQUEST_ID,
  churchSlug: "harbour-grace",
  givingTarget: `fund:${FUND_ID}`,
  amount: "25.00",
  frequency: "one_time",
  fullName: "Demo Donor",
  email: "demo@example.test",
};

function checkoutRequest(
  body: unknown = validBody,
  headers: Readonly<Record<string, string>> = {},
) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("https://giving.example/api/mock-giving/checkouts", {
    method: "POST",
    headers: {
      origin: "https://giving.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: rawBody,
  });
}

describe("POST /api/mock-giving/checkouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beginMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      checkoutId: CHECKOUT_ID,
      expiresAt: "2026-09-17T12:30:00.000Z",
      replayed: false,
    });
  });

  it("creates a no-store checkout response and an HttpOnly strict capability cookie", async () => {
    const response = await POST(checkoutRequest());

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      checkoutPath: `/give/harbour-grace/checkout/${CHECKOUT_ID}`,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`cwe_mock_checkout=${CHECKOUT_ID}.${REQUEST_ID}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(JSON.stringify(body)).not.toContain(REQUEST_ID);

    expect(beginMockGivingCheckoutMock).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      churchSlug: "harbour-grace",
      targetKind: "fund",
      targetId: FUND_ID,
      amountMinor: 2500,
      frequency: "one_time",
      donor: { fullName: "Demo Donor", email: "demo@example.test" },
    });
  });

  it("returns 200 for an idempotent replay while preserving the same safe shape", async () => {
    beginMockGivingCheckoutMock.mockResolvedValue({
      ok: true,
      checkoutId: CHECKOUT_ID,
      expiresAt: "2026-09-17T12:30:00.000Z",
      replayed: true,
    });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      checkoutPath: `/give/harbour-grace/checkout/${CHECKOUT_ID}`,
    });
  });

  it.each([
    ["missing Origin", { origin: "" }],
    ["cross-site Origin", { origin: "https://attacker.example" }],
    ["cross-site Fetch Metadata", { "sec-fetch-site": "cross-site" }],
    ["non-JSON content", { "content-type": "text/plain" }],
  ])("rejects %s before database access", async (_label, headers) => {
    const response = await POST(checkoutRequest(validBody, headers));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(beginMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it("fails closed for malformed, oversized, and prayer-bearing bodies", async () => {
    for (const request of [
      checkoutRequest("{"),
      checkoutRequest(validBody, { "content-length": "4097" }),
      checkoutRequest({ ...validBody, prayerRequestDraft: "private prayer" }),
    ]) {
      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(beginMockGivingCheckoutMock).not.toHaveBeenCalled();
  });

  it("maps DAL failures to generic responses without leaking provider or database detail", async () => {
    beginMockGivingCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "idempotency_conflict",
      raw: "secret relation provider token",
    });
    const conflict = await POST(checkoutRequest());
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toMatch(/secret|relation|provider token/i);

    beginMockGivingCheckoutMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
      raw: "postgres policy detail",
    });
    const unavailable = await POST(checkoutRequest());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).toBe(
      '{"error":"The demo checkout is temporarily unavailable."}',
    );
  });
});
