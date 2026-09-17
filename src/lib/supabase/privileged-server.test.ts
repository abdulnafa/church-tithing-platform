import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getSupabaseSecretConfigMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabaseSecretConfigMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("./secret-config", () => ({
  getSupabaseSecretConfig: getSupabaseSecretConfigMock,
}));

import { createPrivilegedServerSupabaseClient } from "./privileged-server";

describe("privileged server Supabase client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseSecretConfigMock.mockReturnValue({
      url: "https://example.supabase.co",
      secretKey: `sb_secret_${"s".repeat(32)}`,
    });
  });

  it("creates a cookie-free non-persistent service client", () => {
    const expected = { kind: "privileged-server-client" };
    createClientMock.mockReturnValue(expected);

    expect(createPrivilegedServerSupabaseClient()).toBe(expected);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      `sb_secret_${"s".repeat(32)}`,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });

  it("is explicitly server-only and never reads cookies or a public secret", () => {
    const source = readFileSync(
      new URL("./privileged-server.ts", import.meta.url),
      "utf8",
    );
    expect(source.startsWith('import "server-only"')).toBe(true);
    expect(source).toContain("getSupabaseSecretConfig");
    expect(source).not.toMatch(/cookies\(|NEXT_PUBLIC_.*SECRET|publishableKey/);
  });
});
