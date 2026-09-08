import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createServerSupabaseClientMock,
  exchangeCodeForSessionMock,
  getPublicAppUrlMock,
  verifyOtpMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getPublicAppUrlMock: vi.fn(),
  verifyOtpMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/public-app-url", () => ({
  getPublicAppUrl: getPublicAppUrlMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { GET } from "./route";

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublicAppUrlMock.mockReturnValue("https://giving.example");
    verifyOtpMock.mockResolvedValue({ data: {}, error: null });
    exchangeCodeForSessionMock.mockResolvedValue({ data: {}, error: null });
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock,
        verifyOtp: verifyOtpMock,
      },
    });
  });

  it("verifies a runtime-allowlisted email token and uses a safe next path", async () => {
    const response = await GET(
      new NextRequest(
        "https://attacker.example/auth/confirm?token_hash=token-value&type=signup&next=%2Fchurch%2Fsettings",
      ),
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: "token-value",
      type: "signup",
    });
    expect(response.headers.get("location")).toBe(
      "https://giving.example/church/settings",
    );
  });

  it("always sends a verified recovery token to the reset form", async () => {
    const response = await GET(
      new NextRequest(
        "https://attacker.example/auth/confirm?token_hash=recovery-token&type=recovery&next=%2F%2Fattacker.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://giving.example/reset-password",
    );
  });

  it("exchanges a PKCE code and permits only callback destinations", async () => {
    const response = await GET(
      new NextRequest(
        "https://attacker.example/auth/confirm?code=pkce-code&next=%2Freset-password",
      ),
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("pkce-code");
    expect(response.headers.get("location")).toBe(
      "https://giving.example/reset-password",
    );
  });

  it("forwards required no-cache headers when verification sets auth cookies", async () => {
    createServerSupabaseClientMock.mockImplementationOnce(
      async (responseHeaders: Headers) => {
        responseHeaders.set(
          "Cache-Control",
          "private, no-cache, no-store, must-revalidate, max-age=0",
        );
        responseHeaders.set("Pragma", "no-cache");
        return {
          auth: {
            exchangeCodeForSession: exchangeCodeForSessionMock,
            verifyOtp: verifyOtpMock,
          },
        };
      },
    );

    const response = await GET(
      new NextRequest(
        "https://giving.example/auth/confirm?token_hash=token-value&type=signup",
      ),
    );

    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it.each([
    "?token_hash=token-value&type=not-real",
    "?token_hash=token-value&type=signup&code=ambiguous",
    "?type=signup",
    "?code=",
    "",
  ])("rejects malformed or ambiguous callbacks: %s", async (query) => {
    const response = await GET(
      new NextRequest(`https://attacker.example/auth/confirm${query}`),
    );

    expect(response.headers.get("location")).toBe(
      "https://giving.example/auth/error",
    );
    expect(response.headers.get("location")).not.toContain("token-value");
  });

  it("uses a fixed safe failure redirect when verification fails", async () => {
    verifyOtpMock.mockResolvedValue({
      data: {},
      error: { message: "expired token" },
    });

    const response = await GET(
      new NextRequest(
        "https://attacker.example/auth/confirm?token_hash=secret-token&type=recovery",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://giving.example/auth/error",
    );
    expect(response.headers.get("location")).not.toContain("secret-token");
  });
});
