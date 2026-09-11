import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPublicAppUrl,
  isLocalAppUrl,
  isVercelPreviewEnvironment,
  parsePublicAppOrigin,
} from "./public-app-url";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("public application origin", () => {
  it.each([
    ["giving.example", "https://giving.example"],
    ["https://Giving.Example/", "https://giving.example"],
    ["https://giving.example:8443", "https://giving.example:8443"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3217/", "http://127.0.0.1:3217"],
    ["http://[::1]:3000", "http://[::1]:3000"],
  ])("accepts safe origin %s", (value, expected) => {
    expect(parsePublicAppOrigin(value)).toBe(expected);
  });

  it.each([
    "",
    "http://giving.example",
    "ftp://giving.example",
    "https://user:password@giving.example",
    "https://*.giving.example",
    "https://giving.example/church",
    "https://giving.example?next=attacker",
    "https://giving.example#fragment",
    "not a host",
  ])("rejects unsafe or non-origin value %s", (value) => {
    expect(parsePublicAppOrigin(value)).toBeNull();
  });

  it("uses an explicit safe app origin before Vercel system origins", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://giving.example/";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "preview.vercel.app";

    expect(getPublicAppUrl()).toBe("https://giving.example");
  });

  it("rejects a malformed explicit origin instead of printing a fallback", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://attacker.example/path";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "preview.vercel.app";

    expect(() => getPublicAppUrl()).toThrow("PUBLIC_APP_URL_INVALID");
  });

  it("uses only a valid Vercel origin when no explicit origin is set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "preview.vercel.app";

    expect(getPublicAppUrl()).toBe("https://preview.vercel.app");

    process.env.VERCEL_PROJECT_PRODUCTION_URL = "http://preview.vercel.app";
    expect(() => getPublicAppUrl()).toThrow("VERCEL_APP_URL_INVALID");
  });

  it("falls back to loopback only when no deployment origin exists", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;

    expect(getPublicAppUrl()).toBe("http://localhost:3000");
  });

  it.each([
    ["http://localhost:3000", true],
    ["http://127.0.0.1:3000", true],
    ["http://[::1]:3000", true],
    ["https://localhost", true],
    ["http://localhost.attacker.example", false],
    ["invalid", false],
  ])("classifies local origin %s", (value, expected) => {
    expect(isLocalAppUrl(value)).toBe(expected);
  });

  it("recognizes preview state only from exact trusted Vercel metadata", () => {
    for (const [value, expected] of [
      ["preview", true],
      ["production", false],
      ["development", false],
      ["Preview", false],
      ["", false],
    ] as const) {
      process.env.VERCEL_ENV = value;
      expect(isVercelPreviewEnvironment()).toBe(expected);
    }
  });
});
