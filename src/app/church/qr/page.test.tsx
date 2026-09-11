import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  getChurchQrSnapshotMock,
  getPublicAppUrlMock,
  givingQrMock,
  isVercelPreviewEnvironmentMock,
  requireChurchPermissionMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getChurchQrSnapshotMock: vi.fn(),
  getPublicAppUrlMock: vi.fn(),
  givingQrMock: vi.fn(),
  isVercelPreviewEnvironmentMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/qr-routing-dal", () => ({
  getChurchQrSnapshot: getChurchQrSnapshotMock,
}));
vi.mock("@/lib/public-app-url", () => ({
  getPublicAppUrl: getPublicAppUrlMock,
  isLocalAppUrl: (value: string) => value.startsWith("http://localhost"),
  isVercelPreviewEnvironment: isVercelPreviewEnvironmentMock,
  parsePublicAppOrigin: (value: string) => {
    try {
      const url = new URL(value);
      return url.pathname === "/" && !url.search && !url.hash
        ? url.origin
        : null;
    } catch {
      return null;
    }
  },
}));
vi.mock("@/components/giving-qr", () => ({
  GivingQr: (props: Readonly<Record<string, unknown>>) => {
    givingQrMock(props);
    return <div data-giving-qr="true">QR artwork</div>;
  },
}));
vi.mock("@/components/dashboard-shell", () => ({
  SectionHeader: ({ eyebrow, title }: { eyebrow?: string; title: string }) => (
    <header>
      {eyebrow ? <span>{eyebrow}</span> : null}
      <h2>{title}</h2>
    </header>
  ),
}));
vi.mock("@/components/icons", () => ({
  ArrowRightIcon: () => <span aria-hidden="true">arrow</span>,
  CheckIcon: () => <span aria-hidden="true">check</span>,
  QrIcon: () => <span aria-hidden="true">qr</span>,
  ShieldIcon: () => <span aria-hidden="true">shield</span>,
}));

import ChurchQrPage, { metadata } from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const client = { kind: "authenticated-client" };

function setWorkspace(churchStatus: "active" | "onboarding" = "active") {
  requireChurchPermissionMock.mockResolvedValue({
    workspace: {
      churchId: CHURCH_ID,
      churchSlug: "workspace-slug",
      churchStatus,
      displayName: "Persisted Church Name",
    },
  });
}

function setSnapshot(isActive = true) {
  getChurchQrSnapshotMock.mockResolvedValue({
    ok: true,
    snapshot: {
      churchId: CHURCH_ID,
      churchSlug: "current-church-slug",
      shortCode: "p17-qr_code",
      isActive,
    },
  });
}

describe("church QR page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWorkspace();
    setSnapshot();
    createServerSupabaseClientMock.mockResolvedValue(client);
    getPublicAppUrlMock.mockReturnValue("https://giving.example");
    isVercelPreviewEnvironmentMock.mockReturnValue(false);
  });

  it("renders the authorized tenant's persisted QR and current destination", async () => {
    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(requireChurchPermissionMock).toHaveBeenCalledWith("qr_read");
    expect(getChurchQrSnapshotMock).toHaveBeenCalledWith(client, CHURCH_ID);
    expect(givingQrMock).toHaveBeenCalledWith({
      churchName: "Persisted Church Name",
      churchSlug: "current-church-slug",
      value: "https://giving.example/q/p17-qr_code",
    });
    expect(markup).toContain("Persisted Church Name giving code");
    expect(markup).toContain("https://giving.example/q/p17-qr_code");
    expect(markup).toContain("/give/current-church-slug");
    expect(markup).toContain("Configured");
    expect(markup).toContain("Preview validation only");
    expect(markup).toContain('href="/give/current-church-slug"');
    expect(markup).not.toContain("workspace-slug");
  });

  it("keeps an onboarding church's reserved QR visibly non-public", async () => {
    setWorkspace("onboarding");

    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(markup).toContain("Resolver unavailable");
    expect(markup).toContain("reserved for testing");
    expect(markup).toContain("until the church is activated");
    expect(markup).toContain("Download unavailable");
    expect(markup).toContain("Reserved");
    expect(markup).not.toContain('data-giving-qr="true"');
    expect(markup).not.toContain('href="/give/current-church-slug"');
  });

  it("does not offer artwork or a public preview for an inactive QR", async () => {
    setSnapshot(false);

    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(markup).toContain("permanent QR resolver is inactive");
    expect(markup).toContain("Download unavailable");
    expect(markup).toContain("Inactive");
    expect(markup).not.toContain('data-giving-qr="true"');
    expect(givingQrMock).not.toHaveBeenCalled();
  });

  it.each(["forbidden", "unavailable"] as const)(
    "renders a generic protected failure for %s",
    async (reason) => {
      getChurchQrSnapshotMock.mockResolvedValue({ ok: false, reason });

      const markup = renderToStaticMarkup(await ChurchQrPage());

      expect(markup).toContain("We could not load this church&#x27;s QR code");
      expect(markup).toContain('role="alert"');
      expect(markup).not.toContain('data-giving-qr="true"');
      expect(markup).not.toMatch(/postgres|supabase|rpc|policy/i);
    },
  );

  it("renders the same generic unavailable state for client configuration failure", async () => {
    createServerSupabaseClientMock.mockRejectedValue(
      new Error("private configuration detail"),
    );

    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(markup).toContain("No QR artwork was generated");
    expect(markup).toContain('role="alert"');
    expect(getChurchQrSnapshotMock).not.toHaveBeenCalled();
  });

  it("fails closed when the configured public app origin is unsafe", async () => {
    getPublicAppUrlMock.mockImplementation(() => {
      throw new Error("PUBLIC_APP_URL_INVALID");
    });

    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(markup).toContain("No QR artwork was generated");
    expect(givingQrMock).not.toHaveBeenCalled();
  });

  it("labels loopback output as local preview and never calls it publishable", async () => {
    getPublicAppUrlMock.mockReturnValue("http://localhost:3000");

    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(markup).toContain("Local preview QR");
    expect(markup).toContain("approved public origin before printing");
  });

  it("warns that preview deployment artwork must not be printed", async () => {
    isVercelPreviewEnvironmentMock.mockReturnValue(true);

    const markup = renderToStaticMarkup(await ChurchQrPage());

    expect(markup).toContain("Preview deployment configuration");
    expect(markup).toContain("until this release is promoted");
    expect(markup).toContain("approved origin is verified");
    expect(markup).not.toMatch(/live in production|scan-live/i);
  });

  it("uses generic metadata and contains no static demo or weak essential copy", () => {
    expect(metadata).toEqual({
      title: "Church giving QR",
      description:
        "View and download the selected church's permanent giving QR code.",
    });

    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/demoChurch|demoQrCode|Harbour Grace/);
    expect(source).not.toContain("text-[var(--muted)]");
    expect(source).toContain("Subdomain routing remains disabled");
  });
});
