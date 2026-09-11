import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPublicGivingPath,
  createPublicQrPath,
  createPublicQrUrl,
  isPublicChurchSlug,
  isPublicQrShortCode,
} from "./public-church-routing";

describe("public church path routing", () => {
  it.each(["harbour-grace", "ab", "church-123"])(
    "accepts canonical church slug %s",
    (slug) => {
      expect(isPublicChurchSlug(slug)).toBe(true);
      expect(createPublicGivingPath(slug)).toBe(`/give/${slug}`);
    },
  );

  it.each([
    "",
    "a",
    "Harbour-Grace",
    "church--name",
    "-church",
    "church-",
    "church.example",
    "church/name",
    "https://attacker.example",
    "a".repeat(64),
  ])("rejects unsafe church slug %s", (slug) => {
    expect(isPublicChurchSlug(slug)).toBe(false);
    expect(createPublicGivingPath(slug)).toBeNull();
  });

  it.each(["hgc-7v2q9mx4", "church_123", "abc12345"])(
    "accepts canonical QR short code %s",
    (shortCode) => {
      expect(isPublicQrShortCode(shortCode)).toBe(true);
      expect(createPublicQrPath(shortCode)).toBe(`/q/${shortCode}`);
    },
  );

  it.each([
    "",
    "abc1234",
    "ABC12345",
    "-abc12345",
    "abc12345_",
    "abc/12345",
    "https://attacker.example",
    `a${"b".repeat(64)}`,
  ])("rejects unsafe QR short code %s", (shortCode) => {
    expect(isPublicQrShortCode(shortCode)).toBe(false);
    expect(createPublicQrPath(shortCode)).toBeNull();
  });

  it("builds a printable URL only from an origin-only safe app URL", () => {
    expect(createPublicQrUrl("https://giving.example", "hgc-7v2q9mx4")).toBe(
      "https://giving.example/q/hgc-7v2q9mx4",
    );
    expect(
      createPublicQrUrl("http://localhost:3000", "hgc-7v2q9mx4"),
    ).toBe("http://localhost:3000/q/hgc-7v2q9mx4");
    expect(
      createPublicQrUrl("https://giving.example/base", "hgc-7v2q9mx4"),
    ).toBeNull();
    expect(
      createPublicQrUrl("https://giving.example", "https://attacker.example"),
    ).toBeNull();
  });

  it("documents a path-only strategy without trusting request hosts", () => {
    const source = readFileSync(
      new URL("./public-church-routing.ts", import.meta.url),
      "utf8",
    );

    expect(source.startsWith('import "server-only"')).toBe(true);
    expect(source).toContain("same-origin path");
    expect(source).toContain("routing remains disabled");
    expect(source).not.toMatch(/headers\(|cookies\(|hostname|x-forwarded-host/i);
  });
});
