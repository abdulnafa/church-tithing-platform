import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchPermission } from "@/lib/auth/permissions";
import { CHURCH_PERMISSION_VALUES } from "@/lib/auth/permissions";

const { requireChurchPermissionMock } = vi.hoisted(() => ({
  requireChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));

import ChurchDashboardPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";

function usePermissions(permissions: readonly ChurchPermission[]) {
  const workspace = {
    key: `church:${CHURCH_ID}`,
    kind: "church" as const,
    churchId: CHURCH_ID,
    membershipId: "40000000-0000-4000-8000-000000000001",
    churchSlug: "harbour-grace",
    churchStatus: "active" as const,
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
});
