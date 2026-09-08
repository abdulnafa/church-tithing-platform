import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSupabasePublicConfig,
  parseSupabasePublicConfig,
  SupabaseConfigurationError,
} from "./config";

const validPublishableKey = `sb_publishable_${"a".repeat(24)}`;

function expectConfigurationError(
  input: Parameters<typeof parseSupabasePublicConfig>[0],
  code: SupabaseConfigurationError["code"],
) {
  try {
    parseSupabasePublicConfig(input);
  } catch (error) {
    expect(error).toBeInstanceOf(SupabaseConfigurationError);
    expect((error as SupabaseConfigurationError).code).toBe(code);
    return error as SupabaseConfigurationError;
  }

  throw new Error("Expected Supabase configuration parsing to fail.");
}

describe("parseSupabasePublicConfig", () => {
  it("requires the project URL", () => {
    expectConfigurationError(
      { publishableKey: validPublishableKey },
      "missing_url",
    );
  });

  it("requires the publishable key", () => {
    expectConfigurationError(
      { url: "https://example.supabase.co" },
      "missing_publishable_key",
    );
  });

  it.each(["not a url", "ftp://example.supabase.co"])(
    "rejects an invalid project URL: %s",
    (url) => {
      expectConfigurationError(
        { url, publishableKey: validPublishableKey },
        "invalid_url",
      );
    },
  );

  it("rejects insecure remote URLs", () => {
    expectConfigurationError(
      {
        url: "http://example.supabase.co",
        publishableKey: validPublishableKey,
      },
      "insecure_url",
    );
  });

  it.each(["http://localhost:54321", "http://127.0.0.1:54321"])(
    "allows local HTTP development at %s",
    (url) => {
      expect(
        parseSupabasePublicConfig({ url, publishableKey: validPublishableKey }),
      ).toEqual({ url, publishableKey: validPublishableKey });
    },
  );

  it.each([
    "https://user:password@example.supabase.co",
    "https://example.supabase.co/rest/v1",
    "https://example.supabase.co?secret=value",
    "https://example.supabase.co/#fragment",
  ])("rejects a project URL with unsafe extra data: %s", (url) => {
    expectConfigurationError(
      { url, publishableKey: validPublishableKey },
      "invalid_url",
    );
  });

  it.each([
    `sb_secret_${"x".repeat(24)}`,
    "legacy-or-placeholder-key",
    "sb_publishable_short",
  ])("rejects a non-publishable key", (publishableKey) => {
    expectConfigurationError(
      { url: "https://example.supabase.co", publishableKey },
      "invalid_publishable_key",
    );
  });

  it("trims and normalizes valid public configuration", () => {
    expect(
      parseSupabasePublicConfig({
        url: "  https://example.supabase.co/  ",
        publishableKey: `  ${validPublishableKey}  `,
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: validPublishableKey,
    });
  });

  it("never includes supplied credentials in an error", () => {
    const unsafeUrl = "https://admin:private@example.supabase.co";
    const secretKey = `sb_secret_${"z".repeat(32)}`;
    const urlError = expectConfigurationError(
      { url: unsafeUrl, publishableKey: validPublishableKey },
      "invalid_url",
    );
    const keyError = expectConfigurationError(
      { url: "https://example.supabase.co", publishableKey: secretKey },
      "invalid_publishable_key",
    );

    expect(urlError.message).not.toContain(unsafeUrl);
    expect(urlError.message).not.toContain("private");
    expect(keyError.message).not.toContain(secretKey);
  });
});

describe("getSupabasePublicConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the two statically referenced public environment variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", validPublishableKey);

    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: validPublishableKey,
    });
  });
});
