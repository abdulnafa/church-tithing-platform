import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  getPrayerRequestQueueMock,
  requireChurchPermissionMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getPrayerRequestQueueMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/church/prayers/actions", () => ({
  reviewPrayerRequestAction: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/church-prayer-requests-dal", () => ({
  getPrayerRequestQueue: getPrayerRequestQueueMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import ChurchPrayerRequestsPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };

describe("church prayer request page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: { churchId: CHURCH_ID, kind: "church" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    getPrayerRequestQueueMock.mockResolvedValue({ ok: true, requests: [] });
  });

  it("uses the owner-only prayer permission and renders the honest empty state", async () => {
    const markup = renderToStaticMarkup(await ChurchPrayerRequestsPage());

    expect(requireChurchPermissionMock).toHaveBeenCalledWith(
      "prayer_requests_review",
    );
    expect(getPrayerRequestQueueMock).toHaveBeenCalledWith(client, CHURCH_ID);
    expect(markup).toContain("No saved prayer requests");
    expect(markup).toContain("unsaved local draft");
    expect(markup).toContain("Showing up to 100 requests");
    expect(markup).toContain("Shown awaiting review");
    expect(markup).toContain("Retention is pending");
    expect(markup).toContain("No timer, automatic purge, deletion, redaction");
  });

  it("renders only the minimum prayer projection and escapes sensitive text", async () => {
    getPrayerRequestQueueMock.mockResolvedValue({
      ok: true,
      requests: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          body: "Please pray <script>alert('private')</script>\nThank you.",
          isReviewed: false,
          consentedAt: "2026-09-10T09:59:00.000Z",
          createdAt: "2026-09-10T10:00:00.000Z",
          reviewedAt: null,
          updatedAt: "2026-09-10T10:00:00.000Z",
          revision: 0,
        },
      ],
    });

    const markup = renderToStaticMarkup(await ChurchPrayerRequestsPage());

    expect(markup).toContain("Please pray &lt;script&gt;");
    expect(markup).not.toContain("<script>alert");
    expect(markup).toContain('dir="auto"');
    expect(markup).toContain("Consent recorded");
    expect(markup).toContain("Mark as reviewed");
    const visibleText = markup.replace(/<[^>]*>/g, " ");
    expect(visibleText).not.toMatch(
      /donor@example|BBD|receipt number|payment method/i,
    );
  });

  it("renders reviewed requests without another mutation control", async () => {
    getPrayerRequestQueueMock.mockResolvedValue({
      ok: true,
      requests: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          body: "A reviewed request.",
          isReviewed: true,
          consentedAt: "2026-09-10T09:59:00.000Z",
          createdAt: "2026-09-10T10:00:00.000Z",
          reviewedAt: "2026-09-10T11:00:00.000Z",
          updatedAt: "2026-09-10T11:00:00.000Z",
          revision: 1,
        },
      ],
    });

    const markup = renderToStaticMarkup(await ChurchPrayerRequestsPage());

    expect(markup).toContain("Reviewed request");
    expect(markup).toContain("Shown reviewed");
    expect(markup).not.toContain("Mark as reviewed");
    expect(markup).not.toContain('name="reviewRequestId"');
  });

  it.each([
    { ok: false, reason: "forbidden" },
    { ok: false, reason: "unavailable" },
  ])("renders a body-free unavailable state for $reason", async (result) => {
    getPrayerRequestQueueMock.mockResolvedValue(result);

    const markup = renderToStaticMarkup(await ChurchPrayerRequestsPage());

    expect(markup).toContain("Prayer requests could not be loaded");
    expect(markup).toContain("No prayer text is displayed");
    expect(markup).not.toContain("Private review queue");
  });

  it("contains client creation failures without exposing details", async () => {
    createServerSupabaseClientMock.mockRejectedValue(
      new Error("service detail and private body"),
    );

    const markup = renderToStaticMarkup(await ChurchPrayerRequestsPage());

    expect(markup).toContain("Prayer requests could not be loaded");
    expect(markup).not.toContain("service detail");
    expect(getPrayerRequestQueueMock).not.toHaveBeenCalled();
  });

  it("stops before database work when the leaf permission guard fails", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requireChurchPermissionMock.mockRejectedValue(stop);

    await expect(ChurchPrayerRequestsPage()).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getPrayerRequestQueueMock).not.toHaveBeenCalled();
  });

  it("has no demo or financial data dependency", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/demoData|demoDonations|formatMoney|amountMinor/);
    expect(source).not.toMatch(
      /donorId|donationId|fundId|receiptNumber|donorEmail|recipientEmail/,
    );
    expect(source).toContain("getPrayerRequestQueue");
  });
});
