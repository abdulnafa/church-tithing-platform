import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getSupabasePublicConfigMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabasePublicConfigMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("./config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
}));

import { createPublicServerSupabaseClient } from "./public-server";

describe("public server Supabase client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabasePublicConfigMock.mockReturnValue({
      url: "https://example.supabase.co",
      publishableKey: `sb_publishable_${"a".repeat(24)}`,
    });
  });

  it("creates a cookie-free client that cannot persist or refresh a user session", () => {
    const expectedClient = { kind: "anonymous-public-client" };
    createClientMock.mockReturnValue(expectedClient);

    expect(createPublicServerSupabaseClient()).toBe(expectedClient);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      `sb_publishable_${"a".repeat(24)}`,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });
});
