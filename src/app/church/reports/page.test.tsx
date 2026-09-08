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

  it("renders report data but no download control without reports_export", async () => {
    usePermissions(["reports_read"]);

    const markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(markup).toContain("Giving reports");
    expect(markup).not.toContain("Export CSV");
    expect(markup).not.toContain("data:text/csv");
  });

  it("renders responsive CSV download controls with reports_export", async () => {
    usePermissions(["reports_read", "reports_export"]);

    const markup = renderToStaticMarkup(await ChurchReportsPage());

    expect(markup.match(/Export CSV/g)).toHaveLength(2);
    expect(markup).toContain("data:text/csv");
  });
});
