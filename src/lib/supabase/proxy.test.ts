import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClientMock, getClaimsMock, getSupabasePublicConfigMock } =
  vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    getClaimsMock: vi.fn(),
    getSupabasePublicConfigMock: vi.fn(),
  }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("./config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
}));

import { refreshSupabaseSession } from "./proxy";

type ProxyClientOptions = {
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: (
      values: Array<{
        name: string;
        value: string;
        options: Record<string, unknown>;
      }>,
      headers: Record<string, string>,
    ) => void;
  };
};

describe("refreshSupabaseSession", () => {
  let options: ProxyClientOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    getSupabasePublicConfigMock.mockReturnValue({
      url: "https://example.supabase.co",
      publishableKey: `sb_publishable_${"a".repeat(24)}`,
    });
    createServerClientMock.mockImplementation(
      (_url: string, _key: string, clientOptions: ProxyClientOptions) => {
        options = clientOptions;
        return { auth: { getClaims: getClaimsMock } };
      },
    );
  });

  it("validates claims immediately and mirrors refreshed cookies and cache headers", async () => {
    const request = new NextRequest("https://giving.example/church", {
      headers: { cookie: "existing=value" },
    });
    getClaimsMock.mockImplementation(async () => {
      options.cookies.setAll(
        [
          {
            name: "sb-session",
            value: "refreshed",
            options: { httpOnly: true, path: "/", sameSite: "lax" },
          },
        ],
        {
          "Cache-Control":
            "private, no-cache, no-store, must-revalidate, max-age=0",
          Expires: "0",
          Pragma: "no-cache",
        },
      );
      return { data: { claims: { sub: "user-id" } }, error: null };
    });

    const { response, isAuthenticated } = await refreshSupabaseSession(request);

    expect(createServerClientMock).toHaveBeenCalledOnce();
    expect(getClaimsMock).toHaveBeenCalledOnce();
    expect(options.cookies.getAll()).toEqual(
      expect.arrayContaining([{ name: "sb-session", value: "refreshed" }]),
    );
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(isAuthenticated).toBe(true);
  });

  it("returns a pass-through response when no refresh is required", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });

    const { response, isAuthenticated } = await refreshSupabaseSession(
      new NextRequest("https://giving.example/login"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(isAuthenticated).toBe(false);
  });

  it("fails closed when claim validation reports an error", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "untrusted-user" } },
      error: { message: "invalid JWT" },
    });

    const { isAuthenticated } = await refreshSupabaseSession(
      new NextRequest("https://giving.example/dashboard"),
    );

    expect(isAuthenticated).toBe(false);
  });

  it("fails closed without throwing when getClaims throws", async () => {
    getClaimsMock.mockRejectedValue(new Error("Auth service unavailable"));

    const { response, isAuthenticated } = await refreshSupabaseSession(
      new NextRequest("https://giving.example/dashboard"),
    );

    expect(isAuthenticated).toBe(false);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed without throwing when public configuration cannot load", async () => {
    getSupabasePublicConfigMock.mockImplementation(() => {
      throw new Error("Missing configuration");
    });

    const { response, isAuthenticated } = await refreshSupabaseSession(
      new NextRequest("https://giving.example/"),
    );

    expect(isAuthenticated).toBe(false);
    expect(response.status).toBe(200);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});
