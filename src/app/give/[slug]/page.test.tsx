import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicGivingPageBySlugMock, givingFormMock, notFoundMock } = vi.hoisted(
  () => ({
    getPublicGivingPageBySlugMock: vi.fn(),
    givingFormMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("@/lib/public-giving-dal", () => ({
  getPublicGivingPageBySlug: getPublicGivingPageBySlugMock,
}));
vi.mock("@/components/giving-form", () => ({
  GivingForm: (props: Readonly<Record<string, unknown>>) => {
    givingFormMock(props);
    return <div data-testid="giving-form">Giving selector</div>;
  },
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-alt={alt} data-image-src={src} />
  ),
}));
vi.mock("@/components/icons", () => ({
  ArrowRightIcon: () => <span aria-hidden="true">arrow</span>,
  HeartIcon: () => <span aria-hidden="true">heart</span>,
  ShieldIcon: () => <span aria-hidden="true">shield</span>,
}));
vi.mock("@/components/brand", () => ({
  ChurchMark: ({ size }: { size?: string }) => (
    <span data-church-mark={size}>Church mark</span>
  ),
}));

import GivingPage, { dynamic, generateMetadata } from "./page";

const FUND_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_FUND_ID = "20000000-0000-4000-8000-000000000002";

function successfulResult(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ok: true,
    page: {
      church: {
        slug: "harbour-grace",
        name: "Harbour <Grace> Church",
        currency: "BBD",
        logoUrl:
          "https://example.supabase.co/storage/v1/object/public/church-logos/10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.webp",
        primaryColor: "#1F6D60",
        secondaryColor: "#E1B85A",
        thankYouMessage: "Thank you <script>alert(1)</script>",
      },
      funds: [
        {
          id: FUND_ID,
          name: "Tithes",
          description: "Support our church.",
          isDefault: true,
        },
        {
          id: CAMPAIGN_FUND_ID,
          name: "Community Care",
          description: null,
          isDefault: false,
        },
      ],
      campaigns: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          fundId: CAMPAIGN_FUND_ID,
          name: "Community Centre",
          description: "Create a welcoming community space.",
          goalAmountMinor: "9007199254740991",
        },
      ],
      ...overrides,
    },
  } as const;
}

describe("public giving page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublicGivingPageBySlugMock.mockResolvedValue(successfulResult());
  });

  it("renders persisted public data, exact goal cents, and escaped church text", async () => {
    const markup = renderToStaticMarkup(
      await GivingPage({ params: Promise.resolve({ slug: "harbour-grace" }) }),
    );

    expect(getPublicGivingPageBySlugMock).toHaveBeenCalledWith("harbour-grace");
    expect(markup).toContain("Support Harbour &lt;Grace&gt; Church");
    expect(markup).toContain("Community Centre");
    expect(markup).toContain("BBD $90,071,992,547,409.91");
    expect(markup).toContain(
      "Thank you &lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("church-logos");
    expect(markup).toContain('data-alt=""');
    expect(markup).toContain("Online payment submission will be available");
    expect(markup).not.toMatch(/raised|payment is processed|secure provider/i);
  });

  it("passes a minimum serializable target DTO to the client component", async () => {
    renderToStaticMarkup(
      await GivingPage({ params: Promise.resolve({ slug: "harbour-grace" }) }),
    );

    const props = givingFormMock.mock.calls[0]?.[0];
    expect(props).toEqual({
      churchName: "Harbour <Grace> Church",
      currency: "BBD",
      funds: successfulResult().page.funds,
      campaigns: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          fundId: CAMPAIGN_FUND_ID,
          name: "Community Centre",
          description: "Create a welcoming community space.",
        },
      ],
    });
    expect(JSON.stringify(props)).not.toMatch(
      /goalAmountMinor|church_id|logo|color|thankYou|provider|donor|subscription/i,
    );
  });

  it("uses dynamic, honest metadata without a payment-readiness claim", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "harbour-grace" }),
    });

    expect(metadata).toEqual({
      title: "Give to Harbour <Grace> Church",
      description:
        "View the current funds and campaigns for Harbour <Grace> Church. Online payments are not enabled yet.",
    });
    expect(dynamic).toBe("force-dynamic");
  });

  it("makes missing and inactive churches indistinguishable through not-found", async () => {
    getPublicGivingPageBySlugMock.mockResolvedValue({
      ok: false,
      reason: "not_found",
    });

    await expect(
      GivingPage({ params: Promise.resolve({ slug: "unknown-church" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "unknown-church" }),
    });
    expect(metadata).toMatchObject({
      title: "Giving page not found",
      robots: { index: false, follow: false },
    });
  });

  it("renders a generic unavailable state without leaking database details", async () => {
    getPublicGivingPageBySlugMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = renderToStaticMarkup(
      await GivingPage({ params: Promise.resolve({ slug: "harbour-grace" }) }),
    );
    expect(markup).toContain("We could not load this giving page");
    expect(markup).toContain("No payment or personal information was submitted");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toMatch(/postgres|supabase|policy|rpc|church status/i);
  });

  it("renders a valid no-campaign state without inventing campaign data", async () => {
    getPublicGivingPageBySlugMock.mockResolvedValue(
      successfulResult({ campaigns: [] }),
    );

    const markup = renderToStaticMarkup(
      await GivingPage({ params: Promise.resolve({ slug: "harbour-grace" }) }),
    );
    expect(markup).toContain("No active campaigns right now");
    expect(markup).toContain("available funds");
    expect(markup).not.toContain("Community Centre");
  });

  it("has no static demo capture and documents request deduplication", () => {
    const source = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("cache(getPublicGivingPageBySlug)");
    expect(source).not.toMatch(/generateStaticParams|demoChurch|demoFunds|demoCampaigns/);
    expect(source).not.toMatch(/Number\(minorUnits\)|calculateProgress|raised/);
    expect(source).toContain("campaignOptions");
    expect(source.match(/\[overflow-wrap:anywhere\]/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
