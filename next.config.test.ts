import { describe, expect, it } from "vitest";

import { createChurchLogoRemotePattern } from "./next.config";

describe("church logo image host configuration", () => {
  it("allows only the public church logo bucket on the configured HTTPS host", () => {
    expect(
      createChurchLogoRemotePattern("https://example.supabase.co"),
    ).toEqual({
      protocol: "https",
      hostname: "example.supabase.co",
      port: "",
      pathname: "/storage/v1/object/public/church-logos/**",
    });
  });

  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321/",
    "http://[::1]:54321",
  ])("supports a local Supabase URL: %s", (url) => {
    expect(createChurchLogoRemotePattern(url)).toMatchObject({
      protocol: "http",
      port: "54321",
      pathname: "/storage/v1/object/public/church-logos/**",
    });
  });

  it.each([
    undefined,
    "not a URL",
    "http://example.supabase.co",
    "ftp://example.supabase.co",
    "https://user:secret@example.supabase.co",
    "https://*.supabase.co",
    "https://example.supabase.co/a-project-path",
    "https://example.supabase.co?bucket=other",
  ])("fails closed for an unsafe or malformed base URL: %s", (url) => {
    expect(createChurchLogoRemotePattern(url)).toBeNull();
  });
});
