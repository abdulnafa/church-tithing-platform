import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getSupabasePublicConfigMock } = vi.hoisted(() => ({
  getSupabasePublicConfigMock: vi.fn(),
}));

vi.mock("./config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
}));

import {
  getSupabaseSecretConfig,
  parseSupabaseSecretKey,
  SupabaseSecretConfigurationError,
} from "./secret-config";

const SECRET_KEY = `sb_secret_${"s".repeat(32)}`;

describe("server-only Supabase secret configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("accepts only a modern secret key and trims it", () => {
    expect(parseSupabaseSecretKey(`  ${SECRET_KEY}  `)).toBe(SECRET_KEY);
  });

  it.each([
    undefined,
    "",
    `sb_publishable_${"p".repeat(32)}`,
    "sb_secret_short",
    `sb_secret_${"!".repeat(32)}`,
  ])("rejects an absent or unsafe secret key without echoing it", (value) => {
    expect(() => parseSupabaseSecretKey(value)).toThrow(
      SupabaseSecretConfigurationError,
    );
    try {
      parseSupabaseSecretKey(value);
    } catch (error) {
      if (value) expect((error as Error).message).not.toContain(value);
    }
  });

  it("combines the validated server key with the validated public project URL", () => {
    getSupabasePublicConfigMock.mockReturnValue({
      url: "https://example.supabase.co",
      publishableKey: `sb_publishable_${"p".repeat(32)}`,
    });
    vi.stubEnv("SUPABASE_SECRET_KEY", SECRET_KEY);

    expect(getSupabaseSecretConfig()).toEqual({
      url: "https://example.supabase.co",
      secretKey: SECRET_KEY,
    });
  });
});
