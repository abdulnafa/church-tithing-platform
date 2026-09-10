import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/church/prayers/actions", () => ({
  reviewPrayerRequestAction: vi.fn(),
}));

import { PrayerReviewForm } from "./prayer-review-form";

describe("prayer review form", () => {
  it("submits only review identifiers and a revision", () => {
    const markup = renderToStaticMarkup(
      <PrayerReviewForm
        expectedRevision={3}
        prayerRequestId="20000000-0000-4000-8000-000000000001"
        requestId="30000000-0000-4000-8000-000000000016"
      />,
    );

    expect(markup).toContain('name="reviewRequestId"');
    expect(markup).toContain('name="prayerRequestId"');
    expect(markup).toContain('name="expectedPrayerRevision"');
    expect(markup).toContain("Mark as reviewed");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toMatch(/prayerBody|donorId|amount|fundId|receipt/i);
  });

  it("contains exact retry and responsive controls", () => {
    const source = readFileSync(
      new URL("./prayer-review-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("state.retryRequired");
    expect(source).toContain('state.status === "success"');
    expect(source).toContain("isPending || completed");
    expect(source).toContain("Review recorded");
    expect(source).toContain("Retry unchanged review");
    expect(source).toContain("w-full");
    expect(source).toContain("sm:w-auto");
    expect(source).not.toContain("min-w-[");
  });
});
