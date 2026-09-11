import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchPermission } from "@/lib/auth/permissions";
import { CHURCH_PERMISSION_VALUES } from "@/lib/auth/permissions";

const {
  createServerSupabaseClientMock,
  getChurchQrSnapshotMock,
  getPublicAppUrlMock,
  isVercelPreviewEnvironmentMock,
  requireChurchPermissionMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getChurchQrSnapshotMock: vi.fn(),
  getPublicAppUrlMock: vi.fn(),
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
      return new URL(value).origin;
    } catch {
      return null;
    }
  },
}));

import ChurchDashboardPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";

function usePermissions(
  permissions: readonly ChurchPermission[],
  churchStatus: "active" | "onboarding" = "active",
) {
  const workspace = {
    key: `church:${CHURCH_ID}`,
    kind: "church" as const,
    churchId: CHURCH_ID,
    membershipId: "40000000-0000-4000-8000-000000000001",
    churchSlug: "harbour-grace",
    churchStatus,
    role: "owner" as const,
    permissions,
    displayName: "Harbour Grace Church",
    home: "/church" as const,
    roleLabel: "Church Owner",
  };

  requireChurchPermissionMock.mockResolvedValue({
    identity: {
      state: "active",
      userId: "50000000-0000-4000-8000-000000000001",
      displayName: "Owner User",
      workspaces: [workspace],
    },
    workspace,
  });
}

async function renderOverview() {
  return renderToStaticMarkup(await ChurchDashboardPage());
}

describe("church overview permission rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClientMock.mockResolvedValue({ kind: "client" });
    getChurchQrSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        churchSlug: "harbour-grace",
        shortCode: "hgc-7v2q9mx4",
        isActive: true,
      },
    });
    getPublicAppUrlMock.mockReturnValue("https://giving.example");
    isVercelPreviewEnvironmentMock.mockReturnValue(false);
  });

  it("preserves every overview widget and action for an owner grant", async () => {
    usePermissions(CHURCH_PERMISSION_VALUES);

    const markup = await renderOverview();

    expect(markup).toContain("Demo giving this week");
    expect(markup).toContain("Registered members");
    expect(markup).toContain("Weekly giving");
    expect(markup).toContain("Recent transactions");
    expect(markup).toContain("Demo campaign preview");
    expect(markup).toContain("Example active campaigns");
    expect(markup).toContain("Shared examples for layout preview");
    expect(markup).toContain("Giving QR code");
    expect(markup).toContain("Recurring members");
    expect(markup).toContain("Payment connection");
    expect(markup).toContain("Fund mix");
    expect(markup).toContain("Full report");
    expect(markup).toContain("Export CSV");
    expect(markup).toContain("Open settings");
  });

  it("does not serialize financial or member demo rows for staff", async () => {
    usePermissions([
      "workspace_read",
      "funds_read",
      "campaigns_read",
      "qr_read",
      "prayer_requests_review",
    ]);

    const markup = await renderOverview();

    expect(markup).not.toContain("Demo giving this week");
    expect(markup).not.toContain("Registered members");
    expect(markup).not.toContain("Weekly giving");
    expect(markup).not.toContain("Recent transactions");
    expect(markup).not.toContain("Recurring members");
    expect(markup).not.toContain("Alicia Clarke");
    expect(markup).not.toContain("Payment connection");
    expect(markup).not.toContain("Full report");
    expect(markup).not.toContain("Export CSV");
    expect(markup).toContain("Demo campaign preview");
    expect(markup).toContain("Giving QR code");
    expect(markup).toContain("Giving funds");
    expect(markup).not.toContain("Fund mix");
    expect(markup).not.toContain("BBD $34,250.00");
    expect(markup).not.toContain("43.1%");
  });

  it("shows financial widgets without member rows or ungranted report actions", async () => {
    usePermissions(["workspace_read", "financial_read"]);

    const markup = await renderOverview();

    expect(markup).toContain("Demo giving this week");
    expect(markup).toContain("Weekly giving");
    expect(markup).toContain("Recent transactions");
    expect(markup).not.toContain("Registered members");
    expect(markup).not.toContain("Recurring members");
    expect(markup).not.toContain("Full report");
    expect(markup).not.toContain("Export CSV");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getChurchQrSnapshotMock).not.toHaveBeenCalled();
  });

  it("separates report navigation from report export", async () => {
    usePermissions([
      "workspace_read",
      "financial_read",
      "reports_read",
    ]);
    expect(await renderOverview()).toContain("Full report");
    expect(await renderOverview()).not.toContain("Export CSV");

    usePermissions([
      "workspace_read",
      "financial_read",
      "reports_read",
      "reports_export",
    ]);
    expect(await renderOverview()).toContain("Export CSV");
  });

  it("renders the persisted church QR without static demo routing data", async () => {
    usePermissions(["workspace_read", "qr_read"]);

    const markup = await renderOverview();

    expect(getChurchQrSnapshotMock).toHaveBeenCalledWith(
      { kind: "client" },
      CHURCH_ID,
    );
    expect(markup).toContain("https://giving.example/q/hgc-7v2q9mx4");
    expect(markup).toContain('href="/give/harbour-grace"');
    expect(markup).toContain("Harbour Grace Church");
    expect(markup).toContain("Preview validation only");
  });

  it("renders a non-downloadable QR state when the resolver is inactive", async () => {
    usePermissions(["workspace_read", "qr_read"]);
    getChurchQrSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        churchSlug: "harbour-grace",
        shortCode: "hgc-7v2q9mx4",
        isActive: false,
      },
    });

    const markup = await renderOverview();

    expect(markup).toContain("QR preview unavailable");
    expect(markup).toContain("resolver is currently inactive");
    expect(markup).not.toContain("Download SVG");
  });

  it("keeps an onboarding workspace's reserved QR and giving link unavailable", async () => {
    usePermissions(["workspace_read", "qr_read"], "onboarding");

    const markup = await renderOverview();

    expect(markup).toContain("QR preview unavailable");
    expect(markup).toContain("remains unavailable until church activation");
    expect(markup).toContain("Unavailable until activation");
    expect(markup).not.toContain("Download SVG");
    expect(markup).not.toContain('href="/give/harbour-grace"');
  });

  it("shows a promotion warning for QR artwork in Vercel Preview", async () => {
    usePermissions(["workspace_read", "qr_read"]);
    isVercelPreviewEnvironmentMock.mockReturnValue(true);

    const markup = await renderOverview();

    expect(markup).toContain("Preview deployment configuration");
    expect(markup).toContain("until this release is promoted");
  });
});
