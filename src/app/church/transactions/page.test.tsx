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

import ChurchTransactionsPage from "./page";

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

describe("church transaction secondary permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps prayer-request metadata out of the financial route", async () => {
    usePermissions([
      "workspace_read",
      "funds_read",
      "campaigns_read",
      "qr_read",
      "financial_read",
      "members_read",
      "reports_read",
      "reports_export",
      "receipts_read",
      "statements_read",
    ]);

    const markup = renderToStaticMarkup(await ChurchTransactionsPage());

    expect(markup).toContain("All transactions");
    expect(markup).toContain("Export CSV");
    expect(markup).not.toContain("Prayer requests");
  });

  it("keeps prayer-request metadata out of an owner's financial route", async () => {
    usePermissions(CHURCH_PERMISSION_VALUES);

    const markup = renderToStaticMarkup(await ChurchTransactionsPage());

    expect(markup).not.toContain("Prayer requests");
  });

  it("omits export-only fields and controls without reports_export", async () => {
    usePermissions(["workspace_read", "financial_read"]);

    const markup = renderToStaticMarkup(await ChurchTransactionsPage());

    expect(markup).toContain("Alicia Clarke");
    expect(markup).not.toContain("Export CSV");
    expect(markup).not.toContain("alicia.clarke@example.com");
    expect(markup).not.toContain("With gratitude.");
    expect(markup).not.toContain("mock_pay_1006");
    expect(markup).not.toContain("4242");
  });
});
