import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { notFoundMock, redirectMock, resolvePublicQrMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn((destination: string) => {
    void destination;
    throw new Error("NEXT_REDIRECT");
  }),
  resolvePublicQrMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));
vi.mock("@/lib/qr-routing-dal", () => ({
  resolvePublicQr: resolvePublicQrMock,
}));
vi.mock("@/components/brand", () => ({
  ChurchMark: () => <span>Church mark</span>,
}));

import QrResolverNotFound from "./not-found";
import GivingQrResolverPage, { dynamic, metadata, revalidate } from "./page";

const SHORT_CODE = "hgc-7v2q9mx4";

describe("public QR resolver route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePublicQrMock.mockResolvedValue({
      ok: true,
      churchSlug: "harbour-grace",
    });
  });

  it("temporarily redirects a persisted code to a validated same-origin path", async () => {
    await expect(
      GivingQrResolverPage({
        params: Promise.resolve({ code: SHORT_CODE }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(resolvePublicQrMock).toHaveBeenCalledWith(SHORT_CODE);
    expect(redirectMock).toHaveBeenCalledWith("/give/harbour-grace");
    expect(redirectMock.mock.calls[0]?.[0]).not.toMatch(/^https?:|^\/\//);
  });

  it("uses a neutral not-found state for every unresolved code", async () => {
    resolvePublicQrMock.mockResolvedValue({
      ok: false,
      reason: "not_found",
    });

    await expect(
      GivingQrResolverPage({
        params: Promise.resolve({ code: "unknown-code" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(<QrResolverNotFound />);
    expect(markup).toContain("This QR giving link is not available");
    expect(markup).toContain("contact the church directly");
    expect(markup).not.toMatch(/inactive|suspended|database|supabase/i);
  });

  it("renders an accessible retry state for infrastructure failure", async () => {
    resolvePublicQrMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = renderToStaticMarkup(
      await GivingQrResolverPage({
        params: Promise.resolve({ code: SHORT_CODE }),
      }),
    );

    expect(markup).toContain("We could not open this giving link");
    expect(markup).toContain("No payment or personal information was submitted");
    expect(markup).toContain(`href="/q/${SHORT_CODE}"`);
    expect(markup).toContain('role="alert"');
    expect(markup).not.toMatch(/postgres|supabase|rpc|policy|church status/i);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("fails closed if an adapter ever returns an unsafe destination", async () => {
    resolvePublicQrMock.mockResolvedValue({
      ok: true,
      churchSlug: "https://attacker.example",
    });

    const markup = renderToStaticMarkup(
      await GivingQrResolverPage({
        params: Promise.resolve({ code: SHORT_CODE }),
      }),
    );

    expect(redirectMock).not.toHaveBeenCalled();
    expect(markup).toContain("We could not open this giving link");
  });

  it("is request-time, non-indexed, session-free, and host-independent", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(metadata).toMatchObject({
      title: "Church giving link",
      robots: { index: false, follow: false },
    });

    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("resolvePublicQr(code)");
    expect(source).not.toMatch(/demoChurch|demoQrCode|headers\(|cookies\(|hostname/i);
  });
});
