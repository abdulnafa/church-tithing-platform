import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  createServerSupabaseClientMock,
  deleteWorkspaceCookieMock,
  exchangeCodeForSessionMock,
  getClaimsMock,
  getPublicAppUrlMock,
  redirectMock,
  resetPasswordForEmailMock,
  resolveRequestIdentityMock,
  signInWithPasswordMock,
  signOutMock,
  updateUserMock,
  verifyOtpMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
  deleteWorkspaceCookieMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getClaimsMock: vi.fn(),
  getPublicAppUrlMock: vi.fn(),
  redirectMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  resolveRequestIdentityMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  updateUserMock: vi.fn(),
  verifyOtpMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/public-app-url", () => ({
  getPublicAppUrl: getPublicAppUrlMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

vi.mock("@/lib/auth/request-identity", () => ({
  resolveRequestIdentity: resolveRequestIdentityMock,
}));

import {
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  updatePasswordAction,
  type AuthActionState,
} from "./actions";

const INITIAL_STATE: AuthActionState = { status: "idle", message: "" };
const NEXT_REDIRECT_ERROR = new Error("NEXT_REDIRECT");
const CHURCH_ID = "10000000-0000-4000-8000-000000000001";

const churchIdentity = {
  state: "active" as const,
  userId: "30000000-0000-4000-8000-000000000001",
  displayName: "Church Owner",
  workspaces: [
    {
      key: `church:${CHURCH_ID}`,
      kind: "church" as const,
      churchId: CHURCH_ID,
      membershipId: "40000000-0000-4000-8000-000000000001",
      churchSlug: "harbour-grace",
      churchStatus: "active" as const,
      role: "owner" as const,
      permissions: ["workspace_read", "settings_manage"] as const,
      displayName: "Harbour Grace Church",
      home: "/church" as const,
      roleLabel: "Church Owner",
    },
  ],
};

function formData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe("authentication Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation(() => {
      throw NEXT_REDIRECT_ERROR;
    });
    getPublicAppUrlMock.mockReturnValue("https://giving.example");
    signInWithPasswordMock.mockResolvedValue({ data: {}, error: null });
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: "user-id" } },
      error: null,
    });
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    signOutMock.mockResolvedValue({ error: null });
    cookiesMock.mockResolvedValue({
      delete: deleteWorkspaceCookieMock,
      get: vi.fn(() => undefined),
    });
    resolveRequestIdentityMock.mockResolvedValue(churchIdentity);
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock,
        getClaims: getClaimsMock,
        resetPasswordForEmail: resetPasswordForEmailMock,
        signInWithPassword: signInWithPasswordMock,
        signOut: signOutMock,
        updateUser: updateUserMock,
        verifyOtp: verifyOtpMock,
      },
    });
  });

  it("validates credentials before creating an auth client", async () => {
    const result = await signInAction(
      INITIAL_STATE,
      formData({ email: "invalid", password: "short" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors).toEqual({
      email: "Enter a valid email address.",
      password: "Password must be at least 8 characters.",
    });
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("normalizes credentials and redirects a successful sign-in safely", async () => {
    const action = signInAction(
      INITIAL_STATE,
      formData({
        email: "  MEMBER@Example.COM ",
        password: "correct-password",
        next: "/church/settings?tab=branding",
      }),
    );

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "correct-password",
    });
    expect(redirectMock).toHaveBeenCalledWith(
      "/church/settings?tab=branding",
    );
  });

  it("does not honor an external post-login redirect", async () => {
    const action = signInAction(
      INITIAL_STATE,
      formData({
        email: "member@example.com",
        password: "correct-password",
        next: "//attacker.example",
      }),
    );

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(redirectMock).toHaveBeenCalledWith("/church");
  });

  it("routes a platform-only user to the platform instead of the member dashboard", async () => {
    resolveRequestIdentityMock.mockResolvedValue({
      state: "active",
      userId: "30000000-0000-4000-8000-000000000002",
      displayName: "Platform Owner",
      workspaces: [
        {
          key: "platform",
          kind: "platform",
          displayName: "Platform administration",
          home: "/platform",
          roleLabel: "Platform Admin",
        },
      ],
    });

    const action = signInAction(
      INITIAL_STATE,
      formData({
        email: "admin@example.com",
        password: "correct-password",
      }),
    );

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(redirectMock).toHaveBeenCalledWith("/platform");
  });

  it("does not honor a safe route when the user lacks that workspace type", async () => {
    const action = signInAction(
      INITIAL_STATE,
      formData({
        email: "owner@example.com",
        password: "correct-password",
        next: "/dashboard?year=2026",
      }),
    );

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(redirectMock).toHaveBeenCalledWith("/account/no-access");
  });

  it("returns one safe message for rejected login credentials", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {},
      error: { code: "invalid_credentials", message: "sensitive detail" },
    });

    const result = await signInAction(
      INITIAL_STATE,
      formData({
        email: "member@example.com",
        password: "incorrect-password",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Email or password is incorrect, or the email is not verified.",
    });
    expect(result.message).not.toContain("sensitive detail");
  });

  it("uses only the trusted configured origin for password recovery", async () => {
    const result = await requestPasswordResetAction(
      INITIAL_STATE,
      formData({ email: "member@example.com" }),
    );

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      "member@example.com",
      { redirectTo: "https://giving.example/auth/confirm" },
    );
    expect(result.status).toBe("success");
  });

  it("returns the same enumeration-safe reset response when Supabase rejects it", async () => {
    resetPasswordForEmailMock.mockRejectedValue(new Error("provider unavailable"));

    const result = await requestPasswordResetAction(
      INITIAL_STATE,
      formData({ email: "unknown@example.com" }),
    );

    expect(result).toEqual({
      status: "success",
      message:
        "If an account exists for that email, a password-reset link has been sent.",
    });
  });

  it("validates the recovery session before updating and signing out", async () => {
    const action = updatePasswordAction(
      INITIAL_STATE,
      formData({
        password: "new-secure-password",
        confirmPassword: "new-secure-password",
      }),
    );

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(getClaimsMock).toHaveBeenCalledOnce();
    expect(updateUserMock).toHaveBeenCalledWith({
      password: "new-secure-password",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(getClaimsMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateUserMock.mock.invocationCallOrder[0],
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?password=updated");
  });

  it("rejects an expired recovery session without changing a password", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null }, error: null });

    const result = await updatePasswordAction(
      INITIAL_STATE,
      formData({
        password: "new-secure-password",
        confirmPassword: "new-secure-password",
      }),
    );

    expect(result.message).toContain("invalid or has expired");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("signs out only the current browser session and uses a fixed redirect", async () => {
    const action = signOutAction();

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(deleteWorkspaceCookieMock).toHaveBeenCalledWith("kg_workspace_v1");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("does not claim sign-out succeeded when the provider rejects it", async () => {
    signOutMock.mockResolvedValue({ error: { message: "failed" } });

    const action = signOutAction();

    await expect(action).rejects.toBe(NEXT_REDIRECT_ERROR);
    expect(redirectMock).toHaveBeenCalledWith("/auth/error?reason=signout");
  });
});
