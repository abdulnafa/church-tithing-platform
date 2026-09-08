import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { refreshSupabaseSessionMock } = vi.hoisted(() => ({
  refreshSupabaseSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/proxy", () => ({
  refreshSupabaseSession: refreshSupabaseSessionMock,
}));

import { config, proxy } from "./proxy";

function matchesProxy(url: string) {
  const matcher = config.matcher[0];
  const pathname = new URL(url, "https://giving.example").pathname;
  return new RegExp(`^${matcher}$`).test(pathname);
}

describe("Next.js authentication proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshSupabaseSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      isAuthenticated: true,
    });
  });

  it.each(["/login", "/auth/confirm", "/dashboard", "/church/settings"])(
    "refreshes sessions for application route %s",
    (url) => {
      expect(matchesProxy(url)).toBe(true);
    },
  );

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Flogo.png&w=64&q=75",
    "/favicon.ico",
    "/church-logo.svg",
    "/welcome-video.mp4",
  ])("skips immutable or public asset %s", (url) => {
    expect(matchesProxy(url)).toBe(false);
  });

  it("delegates with a trusted exact request destination", async () => {
    const request = new NextRequest(
      "https://giving.example/dashboard?year=2026",
      { headers: { "x-kindred-request-destination": "/platform" } },
    );
    const expectedResponse = NextResponse.next();
    refreshSupabaseSessionMock.mockResolvedValue({
      response: expectedResponse,
      isAuthenticated: true,
    });

    await expect(proxy(request)).resolves.toBe(expectedResponse);
    const forwardedHeaders = refreshSupabaseSessionMock.mock.calls[0]?.[1] as Headers;
    expect(refreshSupabaseSessionMock).toHaveBeenCalledWith(
      request,
      expect.any(Headers),
    );
    expect(forwardedHeaders.get("x-kindred-request-destination")).toBe(
      "/dashboard?year=2026",
    );
  });

  it("redirects an anonymous protected request and preserves its exact path, query, and refreshed cookies", async () => {
    const refreshedResponse = NextResponse.next();
    refreshedResponse.cookies.set("sb-session", "refreshed", {
      httpOnly: true,
      path: "/",
    });
    refreshedResponse.headers.set("cache-control", "private, no-store");
    refreshSupabaseSessionMock.mockResolvedValue({
      response: refreshedResponse,
      isAuthenticated: false,
    });

    const response = await proxy(
      new NextRequest(
        "https://giving.example/church/transactions?status=failed&page=2",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://giving.example/login?next=%2Fchurch%2Ftransactions%3Fstatus%3Dfailed%26page%3D2",
    );
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("removes Next transport parameters from login redirects", async () => {
    refreshSupabaseSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      isAuthenticated: false,
    });

    const response = await proxy(
      new NextRequest(
        "https://giving.example/church/settings?tab=branding&_rsc=abc&__nextData=internal&page=2",
      ),
    );

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe(
      "/church/settings?tab=branding&page=2",
    );
    expect(location.href).not.toContain("_rsc");
    expect(location.href).not.toContain("__next");
  });

  it("keeps public routes available when session refresh throws", async () => {
    refreshSupabaseSessionMock.mockRejectedValue(
      new Error("Auth configuration unavailable"),
    );

    const response = await proxy(
      new NextRequest("https://giving.example/give/harbour-grace"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails a protected route closed when session refresh throws", async () => {
    refreshSupabaseSessionMock.mockRejectedValue(
      new Error("getClaims unavailable"),
    );

    const response = await proxy(
      new NextRequest("https://giving.example/platform/onboarding?step=owner"),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("next"))
      .toBe("/platform/onboarding?step=owner");
  });

  it.each(["/", "/login", "/reset-password", "/give/harbour-grace"])(
    "does not redirect anonymous public route %s",
    async (path) => {
      const expectedResponse = NextResponse.next();
      refreshSupabaseSessionMock.mockResolvedValue({
        response: expectedResponse,
        isAuthenticated: false,
      });

      await expect(
        proxy(new NextRequest(`https://giving.example${path}`)),
      ).resolves.toBe(expectedResponse);
    },
  );

  it.each(["/dashboard", "/church", "/platform", "/workspaces"])(
    "protects route root %s",
    async (path) => {
      refreshSupabaseSessionMock.mockResolvedValue({
        response: NextResponse.next(),
        isAuthenticated: false,
      });

      const response = await proxy(
        new NextRequest(`https://giving.example${path}`),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/login?next=");
    },
  );

  it("does not confuse similarly prefixed public paths with protected roots", async () => {
    const expectedResponse = NextResponse.next();
    refreshSupabaseSessionMock.mockResolvedValue({
      response: expectedResponse,
      isAuthenticated: false,
    });

    await expect(
      proxy(new NextRequest("https://giving.example/churches")),
    ).resolves.toBe(expectedResponse);
  });

  it("treats the extension matcher as an optimization, not an authorization boundary", () => {
    expect(matchesProxy("/church/export.svg")).toBe(false);

    // Every real protected leaf is independently covered by
    // route-protection-contract.test.ts and its server-side guard.
  });
});
