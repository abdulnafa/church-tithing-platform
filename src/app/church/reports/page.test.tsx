import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchPermission } from "@/lib/auth/permissions";

const { requireChurchPermissionMock } = vi.hoisted(() => ({
  requireChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));

import ChurchReportsPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";

function usePermissions(permissions: readonly ChurchPermission[]) {
  requireChurchPermissionMock.mockResolvedValue({
    workspace: {
      kind: "church",
      churchId: CHURCH_ID,
      permissions,
    },
  });
}

describe("church report export permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders report data but no download control without every export permission", async () => {
    usePermissions(["reports_read"]);

    let markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(markup).toContain("Giving reports");
    expect(markup).not.toContain("Export CSV");
    expect(markup).not.toContain("data:text/csv");

    usePermissions(["reports_read", "reports_export"]);
    markup = renderToStaticMarkup(await ChurchReportsPage());
    expect(markup).not.toContain("Export CSV");

    usePermissions(["reports_read", "financial_read"]);
    markup = renderToStaticMarkup(await ChurchReportsPage());
    expect(markup).not.toContain("Export CSV");
  });

  it("renders responsive secure-route controls with every export permission", async () => {
    usePermissions(["reports_read", "financial_read", "reports_export"]);

    const markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(markup.match(/Export CSV/g)).toHaveLength(2);
    expect(markup.match(/href="\/church\/reports\/export\?period=all"/g))
      .toHaveLength(2);
    expect(markup).not.toContain("data:text/csv");
    expect(markup).not.toContain("download=");
  });
});
