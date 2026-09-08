import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  getRequestIdentityMock,
  headersMock,
  redirectMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getRequestIdentityMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("./request-identity", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

import {
  requireActiveIdentity,
  requireAnyChurchPermission,
  requireChurchPermission,
  requireChurchPermissions,
  requireChurchWorkspace,
  requireMemberWorkspace,
  requirePlatformSuperAdmin,
} from "./guards";

const REDIRECT = new Error("NEXT_REDIRECT");
const CHURCH_A = "10000000-0000-4000-8000-000000000001";
const CHURCH_B = "20000000-0000-4000-8000-000000000001";

const churchAWorkspace = {
  key: `church:${CHURCH_A}`,
  kind: "church" as const,
  churchId: CHURCH_A,
  membershipId: "40000000-0000-4000-8000-000000000001",
  churchSlug: "harbour-grace",
  churchStatus: "active" as const,
  role: "owner" as const,
  permissions: [
    "workspace_read",
    "funds_read",
    "campaigns_read",
    "settings_manage",
  ] as const,
  displayName: "Harbour Grace Church",
  home: "/church" as const,
  roleLabel: "Church Owner",
};

const churchBWorkspace = {
  ...churchAWorkspace,
  key: `church:${CHURCH_B}`,
  churchId: CHURCH_B,
  membershipId: "40000000-0000-4000-8000-000000000002",
  churchSlug: "new-life",
  role: "staff" as const,
  permissions: ["workspace_read", "funds_read", "campaigns_read"] as const,
  displayName: "New Life Fellowship",
  roleLabel: "Church Staff",
};

const memberWorkspace = {
  key: `member:${CHURCH_A}`,
  kind: "member" as const,
  churchId: CHURCH_A,
  donorId: "30000000-0000-4000-8000-000000000001",
  churchSlug: "harbour-grace",
  displayName: "Harbour Grace Church",
  home: "/dashboard" as const,
  roleLabel: "Member" as const,
};

const platformWorkspace = {
  key: "platform" as const,
  kind: "platform" as const,
  displayName: "Platform administration",
  home: "/platform" as const,
  roleLabel: "Platform Admin" as const,
};

function activeIdentity(workspaces: readonly object[]) {
  return {
    state: "active" as const,
    userId: "50000000-0000-4000-8000-000000000001",
    displayName: "Miriam Jordan",
    workspaces,
  };
}

describe("server-only route guards", () => {
  let selectedKey: string | undefined;
  let forwardedDestination: string | null;

  beforeEach(() => {
    vi.clearAllMocks();
    selectedKey = undefined;
    forwardedDestination = null;
    redirectMock.mockImplementation(() => {
      throw REDIRECT;
    });
    cookiesMock.mockResolvedValue({
      get: vi.fn(() =>
        selectedKey ? { name: "kg_workspace_v1", value: selectedKey } : undefined,
      ),
    });
    headersMock.mockResolvedValue({
      get: vi.fn(() => forwardedDestination),
    });
    getRequestIdentityMock.mockResolvedValue(activeIdentity([churchAWorkspace]));
  });

  it("redirects an anonymous request to login with the exact trusted destination", async () => {
    forwardedDestination = "/church/transactions?status=failed&page=2";
    getRequestIdentityMock.mockResolvedValue({ state: "anonymous" });

    await expect(requireChurchWorkspace()).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith(
      "/login?next=%2Fchurch%2Ftransactions%3Fstatus%3Dfailed%26page%3D2",
    );
  });

  it("does not use a forwarded destination from another route family", async () => {
    forwardedDestination = "/platform/onboarding";
    getRequestIdentityMock.mockResolvedValue({ state: "anonymous" });

    await expect(requireChurchWorkspace()).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith("/login?next=%2Fchurch");
  });

  it.each([
    [
      { state: "setup_required", userId: "user" },
      "/account/setup-required",
    ],
    [
      { state: "inactive", userId: "user", displayName: "Inactive" },
      "/account/disabled",
    ],
  ])("redirects non-active state %# to a neutral page", async (identity, destination) => {
    getRequestIdentityMock.mockResolvedValue(identity);

    await expect(requireActiveIdentity()).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith(destination);
  });

  it("returns the only authorized church workspace without requiring a cookie", async () => {
    await expect(requireChurchWorkspace()).resolves.toMatchObject({
      identity: { state: "active" },
      workspace: { key: `church:${CHURCH_A}` },
    });
  });

  it("allows an explicitly granted named church capability", async () => {
    await expect(
      requireChurchPermission("settings_manage"),
    ).resolves.toMatchObject({
      workspace: { churchId: CHURCH_A },
    });
  });

  it("does not infer permission from an owner display role", async () => {
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([{ ...churchAWorkspace, permissions: [] }]),
    );

    await expect(
      requireChurchPermission("workspace_read"),
    ).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith("/account/no-access");
  });

  it("fails closed when a stale workspace has no permission array", async () => {
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([{ ...churchAWorkspace, permissions: undefined }]),
    );

    await expect(
      requireChurchPermission("workspace_read"),
    ).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith("/account/no-access");
  });

  it("requires every capability for a combined church page", async () => {
    await expect(
      requireChurchPermissions(["funds_read", "campaigns_read"]),
    ).resolves.toMatchObject({ workspace: { churchId: CHURCH_A } });

    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([
        { ...churchAWorkspace, permissions: ["funds_read"] as const },
      ]),
    );
    await expect(
      requireChurchPermissions(["funds_read", "campaigns_read"]),
    ).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenLastCalledWith("/account/no-access");
  });

  it("fails closed when a multi-permission guard receives no requirement", async () => {
    await expect(requireChurchPermissions([])).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith("/account/no-access");
  });

  it("allows a combined church page when any named capability is granted", async () => {
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([
        { ...churchAWorkspace, permissions: ["funds_read"] as const },
      ]),
    );

    await expect(
      requireAnyChurchPermission(["funds_read", "campaigns_read"]),
    ).resolves.toMatchObject({ workspace: { churchId: CHURCH_A } });
  });

  it("fails closed when none or no any-of capabilities are required", async () => {
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([
        { ...churchAWorkspace, permissions: ["workspace_read"] as const },
      ]),
    );

    await expect(
      requireAnyChurchPermission(["funds_read", "campaigns_read"]),
    ).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenLastCalledWith("/account/no-access");

    redirectMock.mockClear();
    await expect(requireAnyChurchPermission([])).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenLastCalledWith("/account/no-access");
  });

  it("preserves the exact destination when ambiguous church access needs selection", async () => {
    forwardedDestination = "/church/settings?tab=branding";
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([churchAWorkspace, churchBWorkspace]),
    );

    await expect(requireChurchWorkspace()).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith(
      "/workspaces?next=%2Fchurch%2Fsettings%3Ftab%3Dbranding&kind=church",
    );
  });

  it("revalidates and accepts an authorized selected church", async () => {
    selectedKey = `church:${CHURCH_B}`;
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([churchAWorkspace, churchBWorkspace]),
    );

    await expect(requireChurchWorkspace()).resolves.toMatchObject({
      workspace: { key: `church:${CHURCH_B}` },
    });
  });

  it("does not grant access from a stale or tampered workspace cookie", async () => {
    selectedKey = "church:90000000-0000-4000-8000-000000000001";
    getRequestIdentityMock.mockResolvedValue(
      activeIdentity([churchAWorkspace, churchBWorkspace]),
    );

    await expect(requireChurchWorkspace()).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith(
      "/workspaces?next=%2Fchurch&kind=church",
    );
  });

  it("keeps member, church, and platform route families separate", async () => {
    getRequestIdentityMock.mockResolvedValue(activeIdentity([memberWorkspace]));
    await expect(requireMemberWorkspace()).resolves.toMatchObject({
      workspace: { kind: "member" },
    });

    getRequestIdentityMock.mockResolvedValue(activeIdentity([churchAWorkspace]));
    await expect(requirePlatformSuperAdmin()).rejects.toBe(REDIRECT);
    expect(redirectMock).toHaveBeenCalledWith("/account/no-access");

    redirectMock.mockClear();
    getRequestIdentityMock.mockResolvedValue(activeIdentity([platformWorkspace]));
    await expect(requirePlatformSuperAdmin()).resolves.toMatchObject({
      workspace: { kind: "platform" },
    });
  });
});
