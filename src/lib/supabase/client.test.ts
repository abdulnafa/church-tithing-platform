import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClientMock, getSupabasePublicConfigMock } = vi.hoisted(
  () => ({
    createBrowserClientMock: vi.fn(),
    getSupabasePublicConfigMock: vi.fn(),
  }),
);

vi.mock("client-only", () => ({}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
}));

vi.mock("./config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
}));

import { createBrowserSupabaseClient } from "./client";

describe("createBrowserSupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabasePublicConfigMock.mockReturnValue({
      url: "https://example.supabase.co",
      publishableKey: `sb_publishable_${"a".repeat(24)}`,
    });
  });

  it("creates a user-scoped browser client with public configuration", () => {
    const expectedClient = { kind: "browser-client" };
    createBrowserClientMock.mockReturnValue(expectedClient);

    const client = createBrowserSupabaseClient();

    expect(client).toBe(expectedClient);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      `sb_publishable_${"a".repeat(24)}`,
    );
  });

  it("delegates every factory call to the Supabase browser-client helper", () => {
    createBrowserSupabaseClient();
    createBrowserSupabaseClient();

    expect(createBrowserClientMock).toHaveBeenCalledTimes(2);
  });
});
