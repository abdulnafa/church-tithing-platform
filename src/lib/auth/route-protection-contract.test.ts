import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("protected route source contract", () => {
  it.each([
    ["src/app/dashboard/layout.tsx", "requireMemberWorkspace"],
    ["src/app/church/layout.tsx", "requireChurchWorkspace"],
    ["src/app/platform/layout.tsx", "requirePlatformSuperAdmin"],
  ])("guards %s before rendering its shared shell", (path, guard) => {
    const layout = source(path);
    const guardCall = layout.indexOf(`await ${guard}()`);
    const shellRender = layout.indexOf("<DashboardShell");

    expect(guardCall).toBeGreaterThan(-1);
    expect(shellRender).toBeGreaterThan(guardCall);
    expect(layout).toContain("createShellIdentity(identity, workspace)");
    expect(layout).toContain("createShellWorkspace(workspace)");
  });

  it.each([
    ["src/app/dashboard/page.tsx", "requireMemberWorkspace"],
    ["src/app/platform/page.tsx", "requirePlatformSuperAdmin"],
    ["src/app/platform/onboarding/page.tsx", "requirePlatformSuperAdmin"],
    ["src/app/platform/settings/page.tsx", "requirePlatformSuperAdmin"],
  ])("protects leaf page %s without relying on its layout cache", (path, guard) => {
    const page = source(path);
    const pageExport = page.indexOf("export default async function");
    const guardCall = page.indexOf(`await ${guard}()`, pageExport);

    expect(pageExport).toBeGreaterThan(-1);
    expect(guardCall).toBeGreaterThan(pageExport);
    expect(page).not.toContain("<DashboardShell");
    expect(page).not.toContain('import { DashboardShell');
  });

  it.each([
    ["src/app/church/page.tsx", "workspace_read"],
    ["src/app/church/transactions/page.tsx", "financial_read"],
    ["src/app/church/reports/page.tsx", "reports_read"],
    ["src/app/church/qr/page.tsx", "qr_read"],
    ["src/app/church/settings/page.tsx", "settings_manage"],
  ])("protects church leaf %s with named permission %s", (path, permission) => {
    const page = source(path);
    const pageExport = page.indexOf("export default async function");
    const guardCall = page.indexOf(
      `requireChurchPermission(\"${permission}\")`,
      pageExport,
    );

    expect(pageExport).toBeGreaterThan(-1);
    expect(guardCall).toBeGreaterThan(pageExport);
    expect(page).not.toContain("requireChurchWorkspace");
  });

  it("requires either fund or campaign read access on the combined campaigns page", () => {
    const page = source("src/app/church/campaigns/page.tsx");
    const pageExport = page.indexOf("export default async function");
    const guardCall = page.indexOf("requireAnyChurchPermission([", pageExport);

    expect(guardCall).toBeGreaterThan(pageExport);
    expect(page).toContain('"funds_read"');
    expect(page).toContain('"campaigns_read"');
    expect(page).not.toContain("requireChurchWorkspace");
  });

  it("requires either member-read or staff-management access on the combined members page", () => {
    const page = source("src/app/church/members/page.tsx");
    const pageExport = page.indexOf("export default async function");
    const guardCall = page.indexOf("requireAnyChurchPermission([", pageExport);

    expect(guardCall).toBeGreaterThan(pageExport);
    expect(page).toContain('"members_read"');
    expect(page).toContain('"staff_manage"');
    expect(page).not.toContain("requireChurchWorkspace");
  });

  it.each([
    "src/app/church/page.tsx",
    "src/app/church/transactions/page.tsx",
    "src/app/church/members/page.tsx",
    "src/app/church/campaigns/page.tsx",
    "src/app/church/reports/page.tsx",
    "src/app/church/qr/page.tsx",
    "src/app/church/settings/page.tsx",
  ])("retains the authorized tenant identifier at church leaf %s", (path) => {
    const page = source(path);

    expect(page).toMatch(/const \{[^}]*workspace[^}]*\}/);
    expect(page).toContain("workspace.churchId");
  });

  it("uses live minimal shell props instead of hard-coded users or auth objects", () => {
    const shell = source("src/components/dashboard-shell.tsx");

    expect(shell).toContain("identity: ShellIdentity");
    expect(shell).toContain("workspace: ShellWorkspace");
    expect(shell).not.toContain("Alicia Clarke");
    expect(shell).not.toContain("Miriam Jordan");
    expect(shell).not.toContain("Noah Williams");
    expect(shell).not.toContain("access_token");
    expect(shell).not.toContain("refresh_token");
    expect(shell).not.toContain("SupabaseClient");
    expect(shell).toContain("Preview workspace:");
    expect(shell).toContain("explicitly labelled Demo or Preview");
    expect(shell).toContain(
      "church settings, fund categories, campaigns, and staff access are tenant-scoped",
    );
    expect(shell).toContain("payment processing remains disabled");
  });

  it("keeps role labels out of authoritative application permission checks", () => {
    const guards = source("src/lib/auth/guards.ts");
    const churchLayout = source("src/app/church/layout.tsx");

    expect(guards).toContain("hasChurchPermission");
    expect(guards).not.toContain("finance_admin");
    expect(guards).not.toContain("accountant");
    expect(guards).not.toContain('role === "owner"');
    expect(churchLayout).toContain("requireChurchWorkspace");
    expect(churchLayout).not.toContain("requireChurchPermission(");
  });

  it("filters church navigation from named grants while leaf guards remain authoritative", () => {
    const shell = source("src/components/dashboard-shell.tsx");

    expect(shell).toContain('label: "Overview", href: "/church", Icon: HomeIcon, permissions: ["workspace_read"]');
    expect(shell).toContain('label: "Transactions", href: "/church/transactions", Icon: CardIcon, permissions: ["financial_read"]');
    expect(shell).toContain('label: "Members & staff", href: "/church/members", Icon: UsersIcon, permissions: ["members_read", "staff_manage"], permissionMode: "any"');
    expect(shell).toContain('label: "Funds & campaigns", href: "/church/campaigns", Icon: HeartIcon, permissions: ["funds_read", "campaigns_read"], permissionMode: "any"');
    expect(shell).toContain('label: "Reports", href: "/church/reports", Icon: ChartIcon, permissions: ["reports_read"]');
    expect(shell).toContain('label: "Giving QR", href: "/church/qr", Icon: QrIcon, permissions: ["qr_read"]');
    expect(shell).toContain('label: "Settings", href: "/church/settings", Icon: SettingsIcon, permissions: ["settings_manage"]');
    expect(shell).toContain(
      "hasEveryChurchPermission(workspace.permissions, item.permissions)",
    );
    expect(shell).toContain(
      "hasAnyChurchPermission(workspace.permissions, item.permissions)",
    );
    expect(shell).not.toContain("finance_admin");
    expect(shell).not.toContain("accountant");
  });

  it("links Platform Admin navigation only to real P13 destinations", () => {
    const shell = source("src/components/dashboard-shell.tsx");

    expect(shell).toContain(
      '{ label: "Overview", href: "/platform", Icon: HomeIcon }',
    );
    expect(shell).toContain(
      '{ label: "Churches", href: "/platform#churches", Icon: UsersIcon }',
    );
    expect(shell).toContain(
      '{ label: "Add church", href: "/platform/onboarding", Icon: UsersIcon }',
    );
    expect(shell).toContain(
      '{ label: "Settings", href: "/platform/settings", Icon: SettingsIcon }',
    );
    expect(shell).not.toContain('href: "/platform#subscriptions"');
    expect(shell).not.toContain('href: "/platform#reports"');
    expect(shell).not.toContain('href: "/platform#settings"');
    expect(shell).toContain("isDemoMode && !isPlatform");
  });

  it("derives every overview widget from the guarded workspace permission snapshot", () => {
    const overview = source("src/app/church/page.tsx");

    expect(overview).toContain(
      "getChurchOverviewVisibility(workspace.permissions)",
    );
    expect(overview).toContain("visibility.financialSummary");
    expect(overview).toContain("visibility.registeredMembers");
    expect(overview).toContain("visibility.givingTrend");
    expect(overview).toContain("visibility.recentTransactions");
    expect(overview).toContain("visibility.recurringMembers");
    expect(overview).toContain("visibility.fullReportLink");
    expect(overview).toContain("visibility.reportsExport");
    expect(overview).toContain("visibility.campaigns");
    expect(overview).toContain("visibility.givingQr");
    expect(overview).toContain("visibility.fundMix");
    expect(overview).toContain("visibility.providerStatus");
    expect(overview).toContain("visibility.providerSettingsLink");
  });

  it("gates report and transaction CSV controls on the explicit export grant", () => {
    const reports = source("src/app/church/reports/page.tsx");
    const transactions = source("src/app/church/transactions/page.tsx");
    const transactionTable = source("src/components/church-transactions.tsx");

    expect(reports).toContain('"reports_export"');
    expect(reports).toContain("const reportCsv = canExport ?");
    expect(reports).toContain("{canExport ? (");
    expect(transactions).toContain('"reports_read"');
    expect(transactions).toContain('"reports_export"');
    expect(transactions).toContain("const transactionExportDetails = canExport");
    expect(transactions).toContain("canExport={false}");
    expect(transactionTable).toContain("canExport: false");
    expect(transactionTable).toContain("canExport: true");
    expect(transactionTable).toContain("{props.canExport ? (");
  });

  it("keeps all account-state and workspace-selection pages outside protected layouts", () => {
    expect(source("src/app/workspaces/page.tsx")).toContain(
      "requireActiveIdentity",
    );
    expect(source("src/app/account/disabled/page.tsx")).toContain(
      "AccountStatePage",
    );
    expect(source("src/app/account/no-access/page.tsx")).toContain(
      "AccountStatePage",
    );
    expect(source("src/app/account/setup-required/page.tsx")).toContain(
      "AccountStatePage",
    );
  });
});
