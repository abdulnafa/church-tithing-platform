import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchSettingsSnapshot } from "@/lib/church-settings";

const {
  createServerSupabaseClientMock,
  getChurchLogoPublicUrlMock,
  getChurchSettingsMock,
  requireChurchPermissionMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getChurchLogoPublicUrlMock: vi.fn(),
  getChurchSettingsMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/church-settings-dal", () => ({
  getChurchLogoPublicUrl: getChurchLogoPublicUrlMock,
  getChurchSettings: getChurchSettingsMock,
}));
vi.mock("@/components/church-settings-form", () => ({
  ChurchSettingsForm: ({
    logoPublicUrl,
    requestId,
    settings,
  }: {
    logoPublicUrl: string | null;
    requestId: string;
    settings: ChurchSettingsSnapshot;
  }) => (
    <div
      data-church-id={settings.churchId}
      data-logo-url={logoPublicUrl}
      data-request-id={requestId}
    >
      Persisted settings form
    </div>
  ),
}));

import ChurchSettingsPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const LOGO_PATH = `${CHURCH_ID}/a0000000-0000-4000-8000-000000000901.webp`;
const LOGO_URL = `https://example.supabase.co/storage/v1/object/public/church-logos/${LOGO_PATH}`;
const client = { rpc: vi.fn(), storage: { from: vi.fn() } };
const settings: ChurchSettingsSnapshot = {
  churchId: CHURCH_ID,
  displayName: "Harbour Grace Church",
  legalName: "Harbour Grace Church Inc.",
  slug: "harbour-grace",
  status: "onboarding",
  defaultCurrency: "BBD",
  supportEmail: "office@example.test",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: "#E1B85A",
  thankYouMessage: "Thank you.",
  logoStoragePath: LOGO_PATH,
  settingsRevision: 0,
};

describe("church settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: {
        churchId: CHURCH_ID,
        kind: "church",
        key: `church:${CHURCH_ID}`,
      },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    getChurchSettingsMock.mockResolvedValue({ ok: true, settings });
    getChurchLogoPublicUrlMock.mockReturnValue(LOGO_URL);
  });

  it("guards first and loads only the current church's persisted settings", async () => {
    const markup = renderToStaticMarkup(await ChurchSettingsPage());
    const requestId = markup.match(/data-request-id="([^"]+)"/)?.[1];

    expect(requireChurchPermissionMock).toHaveBeenCalledWith("settings_manage");
    expect(
      requireChurchPermissionMock.mock.invocationCallOrder[0],
    ).toBeLessThan(createServerSupabaseClientMock.mock.invocationCallOrder[0]);
    expect(getChurchSettingsMock).toHaveBeenCalledWith(client, CHURCH_ID);
    expect(getChurchLogoPublicUrlMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      LOGO_PATH,
    );
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(markup).toContain(`data-church-id="${CHURCH_ID}"`);
    expect(markup).toContain(`data-logo-url="${LOGO_URL}"`);
  });

  it("shows accurate read-only identity without claiming live slug routing", async () => {
    const markup = renderToStaticMarkup(await ChurchSettingsPage());

    expect(markup).toContain("Church slug");
    expect(markup).toContain("harbour-grace");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("BBD");
    expect(markup).not.toContain("Subdomain");
    expect(markup).not.toContain("View public page");
    expect(markup).not.toContain("live");
  });

  it("removes the former demo phone, location, fund, staff, and payment panels", async () => {
    const markup = renderToStaticMarkup(await ChurchSettingsPage());

    expect(markup).not.toContain("Settings preview");
    expect(markup).not.toContain("Phone");
    expect(markup).not.toContain("Location");
    expect(markup).not.toContain("Donation preferences");
    expect(markup).not.toContain("Church staff");
    expect(markup).not.toContain("Merchant and billing");
    expect(markup).not.toContain("demoChurch");
  });

  it("fails closed with a generic message for an unavailable snapshot", async () => {
    getChurchSettingsMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      raw: "secret table details",
    });

    await expect(ChurchSettingsPage()).rejects.toThrow(
      "Church settings are temporarily unavailable.",
    );
  });
});
