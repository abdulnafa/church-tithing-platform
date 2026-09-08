import { describe, expect, it } from "vitest";

import {
  CHURCH_PERMISSION_VALUES,
  hasAnyChurchPermission,
  hasChurchPermission,
  hasEveryChurchPermission,
  normalizeChurchPermissions,
} from "./permissions";

describe("church permission contracts", () => {
  it("keeps the complete canonical database permission vocabulary", () => {
    expect(CHURCH_PERMISSION_VALUES).toEqual([
      "workspace_read",
      "funds_read",
      "funds_manage",
      "campaigns_read",
      "campaigns_manage",
      "qr_read",
      "settings_manage",
      "staff_manage",
      "provider_manage",
      "audit_read",
      "billing_manage",
      "financial_read",
      "members_read",
      "reports_read",
      "reports_export",
      "receipts_read",
      "statements_read",
      "provider_status_read",
      "email_status_read",
      "prayer_requests_review",
    ]);
  });

  it("normalizes valid duplicates into canonical order", () => {
    expect(
      normalizeChurchPermissions([
        "settings_manage",
        "workspace_read",
        "settings_manage",
      ]),
    ).toEqual(["workspace_read", "settings_manage"]);
  });

  it.each([
    null,
    undefined,
    {},
    "workspace_read",
    1,
    ["workspace_read", "unknown_permission"],
    ["workspace_read", 42],
  ])(
    "fails closed for malformed RPC payload %#",
    (payload) => {
      expect(normalizeChurchPermissions(payload)).toEqual([]);
    },
  );

  it("checks one or every named grant without consulting a role", () => {
    const permissions = [
      "workspace_read",
      "funds_read",
      "campaigns_read",
    ] as const;

    expect(hasChurchPermission(permissions, "workspace_read")).toBe(true);
    expect(hasChurchPermission(permissions, "settings_manage")).toBe(false);
    expect(hasChurchPermission(undefined, "workspace_read")).toBe(false);
    expect(
      hasEveryChurchPermission(permissions, ["funds_read", "campaigns_read"]),
    ).toBe(true);
    expect(
      hasEveryChurchPermission(permissions, ["funds_read", "reports_read"]),
    ).toBe(false);
    expect(hasEveryChurchPermission(permissions, [])).toBe(false);
    expect(
      hasEveryChurchPermission(undefined, ["workspace_read"]),
    ).toBe(false);
    expect(
      hasAnyChurchPermission(permissions, ["funds_read", "reports_read"]),
    ).toBe(true);
    expect(
      hasAnyChurchPermission(permissions, ["reports_read", "audit_read"]),
    ).toBe(false);
    expect(hasAnyChurchPermission(permissions, [])).toBe(false);
    expect(hasAnyChurchPermission(undefined, ["funds_read"])).toBe(false);
  });
});
