import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  deleteCookieMock,
  redirectMock,
  requireActiveIdentityMock,
  setCookieMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  deleteCookieMock: vi.fn(),
  redirectMock: vi.fn(),
  requireActiveIdentityMock: vi.fn(),
  setCookieMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth/guards", () => ({
  requireActiveIdentity: requireActiveIdentityMock,
}));

import { selectWorkspaceAction } from "./actions";

const REDIRECT = new Error("NEXT_REDIRECT");
const CHURCH_A = "10000000-0000-4000-8000-000000000001";

const churchWorkspace = {
  key: `church:${CHURCH_A}`,
  kind: "church" as const,
  churchId: CHURCH_A,
  membershipId: "40000000-0000-4000-8000-000000000001",
  churchSlug: "harbour-grace",
  churchStatus: "active" as const,
  role: "owner" as const,
  permissions: ["workspace_read", "settings_manage"] as const,
  displayName: "Harbour Grace Church",
  home: "/church" as const,
  roleLabel: "Church Owner",
};

const platformWorkspace = {
  key: "platform" as const,
  kind: "platform" as const,
  displayName: "Platform administration",
  home: "/platform" as const,
  roleLabel: "Platform Admin" as const,
};

function formData(workspace: string, next?: string) {
  const data = new FormData();
  data.set("workspace", workspace);
  if (next) data.set("next", next);
  return data;
}

describe("workspace selection Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    redirectMock.mockImplementation(() => {
      throw REDIRECT;
    });
    cookiesMock.mockResolvedValue({
      delete: deleteCookieMock,
      set: setCookieMock,
    });
    requireActiveIdentityMock.mockResolvedValue({
      state: "active",
      userId: "50000000-0000-4000-8000-000000000001",
      displayName: "Miriam Jordan",
      workspaces: [churchWorkspace, platformWorkspace],
    });
  });

  it("authorizes the submitted workspace before setting a secure preference", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      selectWorkspaceAction(
        formData(
          `church:${CHURCH_A.toUpperCase()}`,
          "/church/settings?tab=branding",
        ),
      ),
    ).rejects.toBe(REDIRECT);

    expect(requireActiveIdentityMock).toHaveBeenCalledWith("/workspaces");
    expect(setCookieMock).toHaveBeenCalledWith(
      "kg_workspace_v1",
      `church:${CHURCH_A}`,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      },
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/church/settings?tab=branding",
    );
  });

  it("rejects a forged or stale key before writing a cookie", async () => {
    await expect(
      selectWorkspaceAction(
        formData("church:90000000-0000-4000-8000-000000000001"),
      ),
    ).rejects.toBe(REDIRECT);

    expect(redirectMock).toHaveBeenCalledWith("/workspaces?error=invalid");
    expect(cookiesMock).not.toHaveBeenCalled();
    expect(setCookieMock).not.toHaveBeenCalled();
  });

  it("does not carry a requested destination into another portal type", async () => {
    await expect(
      selectWorkspaceAction(
        formData(`church:${CHURCH_A}`, "/platform/onboarding"),
      ),
    ).rejects.toBe(REDIRECT);

    expect(redirectMock).toHaveBeenCalledWith("/church");
  });

  it("deletes tenant preference when entering the platform workspace", async () => {
    await expect(
      selectWorkspaceAction(formData("platform", "/platform/onboarding")),
    ).rejects.toBe(REDIRECT);

    expect(deleteCookieMock).toHaveBeenCalledWith("kg_workspace_v1");
    expect(setCookieMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/platform/onboarding");
  });
});
