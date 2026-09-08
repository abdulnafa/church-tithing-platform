import { normalizeChurchPermissions } from "./permissions";

/**
 * Derives presentation-only visibility from the authoritative permission
 * snapshot already attached to the guarded church workspace.
 */
export function getChurchOverviewVisibility(permissions: unknown) {
  const granted = new Set(normalizeChurchPermissions(permissions));
  const financialRead = granted.has("financial_read");
  const membersRead = granted.has("members_read");
  const reportsRead = granted.has("reports_read");
  const providerStatusRead = granted.has("provider_status_read");
  const fundsRead = granted.has("funds_read");
  const campaignsRead = granted.has("campaigns_read");

  return {
    financialSummary: financialRead,
    registeredMembers: membersRead,
    givingTrend: financialRead,
    recentTransactions: financialRead,
    recurringMembers: financialRead && membersRead,
    fullReportLink: financialRead && reportsRead,
    reportsExport:
      financialRead && reportsRead && granted.has("reports_export"),
    campaigns: fundsRead && campaignsRead,
    givingQr: granted.has("qr_read"),
    fundMix: fundsRead,
    providerStatus: providerStatusRead,
    providerSettingsLink:
      providerStatusRead && granted.has("settings_manage"),
  } as const;
}
