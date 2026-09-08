import { describe, expect, it } from "vitest";

import { getChurchOverviewVisibility } from "./church-overview-access";
import { CHURCH_PERMISSION_VALUES } from "./permissions";

describe("church overview widget visibility", () => {
  it("preserves every widget and action for an owner grant", () => {
    expect(
      Object.values(getChurchOverviewVisibility(CHURCH_PERMISSION_VALUES)),
    ).toEqual(Array(12).fill(true));
  });

  it("keeps staff-facing fund, campaign, and QR widgets but hides financial and member data", () => {
    expect(
      getChurchOverviewVisibility([
        "workspace_read",
        "funds_read",
        "campaigns_read",
        "qr_read",
        "prayer_requests_review",
      ]),
    ).toEqual({
      financialSummary: false,
      registeredMembers: false,
      givingTrend: false,
      recentTransactions: false,
      recurringMembers: false,
      fullReportLink: false,
      reportsExport: false,
      campaigns: true,
      givingQr: true,
      fundMix: true,
      providerStatus: false,
      providerSettingsLink: false,
    });
  });

  it("requires both financial and member grants for recurring-member rows", () => {
    expect(
      getChurchOverviewVisibility(["financial_read"]).recurringMembers,
    ).toBe(false);
    expect(
      getChurchOverviewVisibility(["members_read"]).recurringMembers,
    ).toBe(false);
    expect(
      getChurchOverviewVisibility(["financial_read", "members_read"])
        .recurringMembers,
    ).toBe(true);
  });

  it("requires both fund and campaign reads for the combined campaign widget", () => {
    expect(
      getChurchOverviewVisibility(["campaigns_read"]).campaigns,
    ).toBe(false);
    expect(getChurchOverviewVisibility(["funds_read"]).campaigns).toBe(false);
    expect(
      getChurchOverviewVisibility(["funds_read", "campaigns_read"])
        .campaigns,
    ).toBe(true);
  });

  it("requires the read capability and explicit export grant for export controls", () => {
    expect(
      getChurchOverviewVisibility(["financial_read", "reports_export"])
        .reportsExport,
    ).toBe(false);
    expect(
      getChurchOverviewVisibility([
        "financial_read",
        "reports_read",
        "reports_export",
      ]).reportsExport,
    ).toBe(true);
  });

  it("shows provider status independently from its owner-only settings action", () => {
    expect(
      getChurchOverviewVisibility(["provider_status_read"]),
    ).toMatchObject({
      providerStatus: true,
      providerSettingsLink: false,
    });
    expect(
      getChurchOverviewVisibility([
        "provider_status_read",
        "settings_manage",
      ]).providerSettingsLink,
    ).toBe(true);
  });

  it("fails every widget closed for a malformed or missing snapshot", () => {
    expect(
      Object.values(getChurchOverviewVisibility(undefined)),
    ).toEqual(Array(12).fill(false));
    expect(Object.values(getChurchOverviewVisibility({}))).toEqual(
      Array(12).fill(false),
    );
  });
});
