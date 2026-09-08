import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  getPlatformOnboardingDefaultsMock,
  requirePlatformSuperAdminMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getPlatformOnboardingDefaultsMock: vi.fn(),
  requirePlatformSuperAdminMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformSuperAdmin: requirePlatformSuperAdminMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/platform/platform-management-dal", () => ({
  getPlatformOnboardingDefaults: getPlatformOnboardingDefaultsMock,
}));
vi.mock("@/components/church-onboarding-form", () => ({
  ChurchOnboardingForm: ({
    defaults,
    requestId,
  }: {
    defaults: Readonly<Record<string, string>>;
    requestId: string;
  }) => (
    <div
      data-default-currency={defaults.currency}
      data-default-timezone={defaults.timezone}
      data-provisioning-request-id={requestId}
    >
      Provisioning form
    </div>
  ),
}));

import ChurchOnboardingPage from "./page";

describe("church onboarding page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSuperAdminMock.mockResolvedValue({
      identity: {
        state: "active",
        userId: "10000000-0000-4000-8000-000000000899",
        displayName: "Platform Owner",
        workspaces: [],
      },
      workspace: {
        key: "platform",
        kind: "platform",
        displayName: "Platform administration",
        home: "/platform",
        roleLabel: "Platform Admin",
      },
    });
    createServerSupabaseClientMock.mockResolvedValue({ rpc: vi.fn() });
    getPlatformOnboardingDefaultsMock.mockResolvedValue({
      ok: true,
      defaults: {
        defaultCurrency: "XCD",
        defaultTimezone: "America/St_Lucia",
        defaultPrimaryColor: "#123456",
        defaultSecondaryColor: "#ABCDEF",
        settingsRevision: 4,
        updatedAt: "2026-09-07T10:00:00+00:00",
      },
    });
  });

  it("guards the leaf and creates a fresh server UUID for the form", async () => {
    const markup = renderToStaticMarkup(await ChurchOnboardingPage());
    const requestId = markup.match(/data-provisioning-request-id="([^"]+)"/)?.[1];

    expect(requirePlatformSuperAdminMock).toHaveBeenCalledOnce();
    expect(createServerSupabaseClientMock).toHaveBeenCalledOnce();
    expect(getPlatformOnboardingDefaultsMock).toHaveBeenCalledOnce();
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(markup).toContain("What this creates");
    expect(markup).toContain("default Tithes fund");
    expect(markup).toContain("permanent church QR record");
    expect(markup).toContain("Invitation email delivery");
    expect(markup).toContain('data-default-currency="XCD"');
    expect(markup).toContain('data-default-timezone="America/St_Lucia"');
    expect(markup).not.toContain("data is not yet persisted");
  });

  it("does not mount the form with fallback values when saved defaults fail", async () => {
    getPlatformOnboardingDefaultsMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = renderToStaticMarkup(await ChurchOnboardingPage());

    expect(markup).toContain("Church setup is unavailable");
    expect(markup).toContain("not been opened with fallback values");
    expect(markup).not.toContain("Provisioning form");
    expect(markup).not.toContain('data-default-currency="BBD"');
  });

  it("authorizes before creating the database client", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requirePlatformSuperAdminMock.mockRejectedValue(stop);

    await expect(ChurchOnboardingPage()).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getPlatformOnboardingDefaultsMock).not.toHaveBeenCalled();
  });
});
