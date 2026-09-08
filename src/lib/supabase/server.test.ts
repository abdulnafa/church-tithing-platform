import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  createServerClientMock,
  getSupabasePublicConfigMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerClientMock: vi.fn(),
  getSupabasePublicConfigMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("./config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
}));

import { createServerSupabaseClient } from "./server";

describe("createServerSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabasePublicConfigMock.mockReturnValue({
      url: "https://example.supabase.co",
      publishableKey: `sb_publishable_${"a".repeat(24)}`,
    });
  });

  it("creates a request-scoped client that reads the current cookie store", async () => {
    const requestCookies = [{ name: "session", value: "safe-cookie-value" }];
    const getAll = vi.fn(() => requestCookies);
    const expectedClient = { kind: "server-client" };

    cookiesMock.mockResolvedValue({ getAll });
    createServerClientMock.mockReturnValue(expectedClient);

    const client = await createServerSupabaseClient();
    const options = createServerClientMock.mock.calls[0]?.[2] as {
      cookies: { getAll: () => unknown };
    };

    expect(client).toBe(expectedClient);
    expect(cookiesMock).toHaveBeenCalledOnce();
    expect(createServerClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      `sb_publishable_${"a".repeat(24)}`,
      expect.objectContaining({
        cookies: expect.objectContaining({ getAll: expect.any(Function) }),
      }),
    );
    expect(options.cookies.getAll()).toEqual(requestCookies);
    expect(getAll).toHaveBeenCalledOnce();
  });

  it("creates a fresh client and cookie store for every request", async () => {
    cookiesMock.mockResolvedValue({ getAll: vi.fn(() => []) });
    createServerClientMock
      .mockReturnValueOnce({ request: 1 })
      .mockReturnValueOnce({ request: 2 });

    const firstClient = await createServerSupabaseClient();
    const secondClient = await createServerSupabaseClient();

    expect(firstClient).not.toBe(secondClient);
    expect(cookiesMock).toHaveBeenCalledTimes(2);
    expect(createServerClientMock).toHaveBeenCalledTimes(2);
  });

  it("writes every auth cookie when the current Next.js context allows it", async () => {
    const set = vi.fn();
    const responseHeaders = new Headers();
    cookiesMock.mockResolvedValue({ getAll: vi.fn(() => []), set });
    createServerClientMock.mockReturnValue({ kind: "server-client" });

    await createServerSupabaseClient(responseHeaders);
    const options = createServerClientMock.mock.calls[0]?.[2] as {
      cookies: {
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
    const cookie = {
      name: "sb-session",
      value: "refreshed-session",
      options: { httpOnly: true, path: "/" },
    };

    options.cookies.setAll([cookie], {
      "Cache-Control": "private, no-cache, no-store",
      Pragma: "no-cache",
    });

    expect(set).toHaveBeenCalledWith(
      cookie.name,
      cookie.value,
      cookie.options,
    );
    expect(responseHeaders.get("cache-control")).toBe(
      "private, no-cache, no-store",
    );
    expect(responseHeaders.get("pragma")).toBe("no-cache");
  });

  it("tolerates cookie writes from a Server Component render", async () => {
    const set = vi.fn(() => {
      throw new Error("Cookies can only be modified in an Action or Route Handler");
    });
    cookiesMock.mockResolvedValue({ getAll: vi.fn(() => []), set });
    createServerClientMock.mockReturnValue({ kind: "server-client" });

    await createServerSupabaseClient();
    const options = createServerClientMock.mock.calls[0]?.[2] as {
      cookies: {
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

    expect(() =>
      options.cookies.setAll(
        [{ name: "sb-session", value: "value", options: { path: "/" } }],
        { "Cache-Control": "private, no-store" },
      ),
    ).not.toThrow();
  });
});
