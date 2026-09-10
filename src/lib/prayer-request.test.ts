import { describe, expect, it } from "vitest";

import {
  getPrayerRequestCodePointLength,
  getPrayerDraftConsentBoundary,
  isCanonicalPrayerRequestBody,
  isPrayerRequestId,
  isPrayerRequestRevision,
  isPrayerReviewRequestId,
  limitPrayerRequestDraft,
  normalizePrayerRequestBody,
  parsePrayerRequestRevision,
  PRAYER_REQUEST_LIMITS,
} from "./prayer-request";

describe("transient prayer request draft limits", () => {
  it("counts and caps Unicode code points instead of UTF-16 units", () => {
    const value = "🙏".repeat(PRAYER_REQUEST_LIMITS.body + 1);
    const limited = limitPrayerRequestDraft(value);

    expect(getPrayerRequestCodePointLength(value)).toBe(2_001);
    expect(getPrayerRequestCodePointLength(limited)).toBe(2_000);
    expect(limited).toBe("🙏".repeat(PRAYER_REQUEST_LIMITS.body));
  });

  it("preserves an in-bound draft exactly", () => {
    const value = "  Please pray for my family.\nThank you.  ";

    expect(limitPrayerRequestDraft(value)).toBe(value);
  });

  it("normalizes line endings and validates the canonical stored body", () => {
    expect(normalizePrayerRequestBody("  First\r\nSecond\r  ")).toBe(
      "First\nSecond",
    );
    expect(isCanonicalPrayerRequestBody("First\nSecond\tline")).toBe(true);
    expect(isCanonicalPrayerRequestBody(" First ")).toBe(false);
    expect(isCanonicalPrayerRequestBody("unsafe\u0000text")).toBe(false);
    expect(isCanonicalPrayerRequestBody("unsafe\u0085text")).toBe(false);
    expect(isCanonicalPrayerRequestBody("unsafe\u202etext")).toBe(false);
    expect(normalizePrayerRequestBody("\u00a0")).toBe("\u00a0");
    expect(isCanonicalPrayerRequestBody("\u00a0")).toBe(true);
    expect(isCanonicalPrayerRequestBody("")).toBe(false);
  });

  it("validates prayer, idempotency and revision identifiers independently", () => {
    expect(isPrayerRequestId("10000000-0000-4000-8000-000000000001")).toBe(
      true,
    );
    expect(
      isPrayerReviewRequestId("10000000-0000-5000-8000-000000000001"),
    ).toBe(false);
    expect(
      isPrayerReviewRequestId("10000000-0000-4000-8000-000000000001"),
    ).toBe(true);
    expect(isPrayerRequestRevision(0)).toBe(true);
    expect(isPrayerRequestRevision(-1)).toBe(false);
    expect(parsePrayerRequestRevision("0")).toBe(0);
    expect(parsePrayerRequestRevision("01")).toBeNull();
    expect(parsePrayerRequestRevision("9007199254740992")).toBeNull();
  });

  it("clears and disables consent when a consented draft becomes unsafe", () => {
    const valid = getPrayerDraftConsentBoundary("Please pray for us.", true);
    expect(valid).toMatchObject({
      hasText: true,
      canConsent: true,
      consented: true,
    });

    const unsafe = getPrayerDraftConsentBoundary(
      `${valid.normalizedBody}\u202e`,
      valid.consented,
    );
    expect(unsafe).toMatchObject({
      hasText: true,
      canConsent: false,
      consented: false,
    });

    expect(getPrayerDraftConsentBoundary(" \t\n ", true)).toMatchObject({
      hasText: false,
      canConsent: false,
      consented: false,
    });
  });
});
