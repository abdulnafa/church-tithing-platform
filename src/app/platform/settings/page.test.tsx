import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  formMock,
  getPlatformOnboardingDefaultsMock,
  requirePlatformSuperAdminMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  formMock: vi.fn(),
  getPlatformOnboardingDefaultsMock: vi.fn(),
  requirePlatformSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformSuperAdmin: requirePlatformSuperAdminMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/platform/platform-management-dal", () => ({
  getPlatformOnboardingDefaults: getPlatformOnboardingDefaultsMock,
}));
vi.mock("@/components/platform-onboarding-defaults-form", () => ({
  PlatformOnboardingDefaultsForm: formMock,
}));

import PlatformSettingsPage from "./page";

const client = { rpc: vi.fn() };
const defaults = {
  defaultCurrency: "BBD",
  defaultTimezone: "America/Barbados",
  defaultPrimaryColor: "#1F6D60",
  defaultSecondaryColor: "#E1B85A",
  settingsRevision: 3,
  updatedAt: "2026-09-07T10:00:00+00:00",
} as const;

describe("Platform Admin settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSuperAdminMock.mockResolvedValue({
      identity: { displayName: "Platform Admin" },
      workspace: { key: "platform", kind: "platform" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    getPlatformOnboardingDefaultsMock.mockResolvedValue({ ok: true, defaults });
    formMock.mockImplementation(
      ({ requestId }: { requestId: string }) => (
        <div data-request-id={requestId}>Defaults form</div>
      ),
    );
  });

  it("guards before reading and passes the persisted snapshot with a fresh reference", async () => {
    const markup = renderToStaticMarkup(await PlatformSettingsPage());

    expect(requirePlatformSuperAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      createServerSupabaseClientMock.mock.invocationCallOrder[0],
    );
    expect(getPlatformOnboardingDefaultsMock).toHaveBeenCalledWith(client);
    expect(formMock.mock.calls[0]?.[0].snapshot).toEqual(defaults);
    expect(formMock.mock.calls[0]?.[0].requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(markup).toContain("Defaults form");
    expect(markup).toContain("future church setup forms");
  });

  it("renders no form or fallback values when the persisted read fails", async () => {
    getPlatformOnboardingDefaultsMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = renderToStaticMarkup(await PlatformSettingsPage());

    expect(markup).toContain("Saved defaults are unavailable");
    expect(markup).toContain("No fallback values");
    expect(markup).not.toContain("Defaults form");
    expect(formMock).not.toHaveBeenCalled();
  });

  it("stops before the database when authorization fails", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requirePlatformSuperAdminMock.mockRejectedValue(stop);

    await expect(PlatformSettingsPage()).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});
