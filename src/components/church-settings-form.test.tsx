import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInitialChurchSettingsState,
  type ChurchSettingsActionState,
  type ChurchSettingsSnapshot,
} from "@/lib/church-settings";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span aria-label={alt} data-image-src={src} role="img" />
  ),
}));
vi.mock("@/app/church/settings/actions", () => ({
  updateChurchSettingsAction: vi.fn(),
}));

import { ChurchSettingsForm } from "./church-settings-form";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000901";
const LOGO_PATH = `${CHURCH_ID}/${REQUEST_ID}.webp`;
const LOGO_URL = `https://example.supabase.co/storage/v1/object/public/church-logos/${LOGO_PATH}`;
const snapshot: ChurchSettingsSnapshot = {
  churchId: CHURCH_ID,
  displayName: "Harbour Grace Church",
  legalName: "Harbour Grace Church Inc.",
  slug: "harbour-grace",
  status: "active",
  defaultCurrency: "BBD",
  supportEmail: "office@example.test",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: "#E1B85A",
  thankYouMessage: "Thank you.",
  logoStoragePath: LOGO_PATH,
  settingsRevision: 0,
};

function setActionState(state: ChurchSettingsActionState, pending = false) {
  useActionStateMock.mockReturnValue([state, "/church/settings", pending]);
}

function renderForm() {
  return renderToStaticMarkup(
    <ChurchSettingsForm
      logoPublicUrl={LOGO_URL}
      requestId={REQUEST_ID}
      settings={snapshot}
    />,
  );
}

describe("church settings form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActionState(
      createInitialChurchSettingsState(REQUEST_ID, snapshot, LOGO_URL),
    );
  });

  it("renders every persisted editable field with an associated label", () => {
    const markup = renderForm();

    expect(markup).toContain(`name="requestId"`);
    expect(markup).toContain(`value="${REQUEST_ID}"`);
    expect(markup).toContain(`name="expectedSettingsRevision"`);
    expect(markup).toContain(`for="church-displayName"`);
    expect(markup).toContain(`id="church-displayName"`);
    expect(markup).toContain(`name="displayName"`);
    expect(markup).toContain(`for="church-legalName"`);
    expect(markup).toContain(`name="legalName"`);
    expect(markup).toContain(`for="church-supportEmail"`);
    expect(markup).toContain(`name="supportEmail"`);
    expect(markup).toContain(`for="church-timezone"`);
    expect(markup).toContain(`name="timezone"`);
    expect(markup).toContain(`for="church-primaryColor"`);
    expect(markup).toContain(`name="primaryColor"`);
    expect(markup).toContain(`for="church-secondaryColor"`);
    expect(markup).toContain(`name="secondaryColor"`);
    expect(markup).toContain(`for="thank-you-message"`);
    expect(markup).toContain(`name="thankYouMessage"`);
    expect(markup).toContain(`for="church-logo"`);
    expect(markup).toContain(`name="logo"`);
    expect(markup).toContain(`accept="image/png,image/jpeg,image/webp"`);
    expect(markup).toContain(`for="remove-church-logo"`);
    expect(markup).toContain(`name="removeLogo"`);
  });

  it("uses aria-live feedback and associates field and logo errors", () => {
    const initial = createInitialChurchSettingsState(
      REQUEST_ID,
      snapshot,
      LOGO_URL,
    );
    setActionState({
      ...initial,
      status: "error",
      message: "Check the highlighted fields and try again.",
      responseEpoch: 1,
      fieldErrors: {
        supportEmail: "Enter a valid support email address.",
        logo: "Choose a still image.",
      },
    });

    const markup = renderForm();

    expect(markup).toContain(`aria-live="polite"`);
    expect(markup).toContain(`role="alert"`);
    expect(markup).toContain(`id="supportEmail-error"`);
    expect(markup).toContain(`aria-describedby="supportEmail-error"`);
    expect(markup).toContain(`id="logo-error"`);
    expect(markup).toContain(
      `aria-describedby="church-logo-help logo-error"`,
    );
    expect(markup).toContain(`aria-invalid="true"`);
  });

  it("renders an accessible fallback and disables removal without a stored logo", () => {
    const withoutLogo = { ...snapshot, logoStoragePath: null };
    setActionState(
      createInitialChurchSettingsState(REQUEST_ID, withoutLogo, null),
    );

    const markup = renderToStaticMarkup(
      <ChurchSettingsForm
        logoPublicUrl={null}
        requestId={REQUEST_ID}
        settings={withoutLogo}
      />,
    );

    expect(markup).toContain(`aria-label="No church logo uploaded"`);
    expect(markup).toContain(`role="img"`);
    expect(markup).toMatch(
      /<input[^>]*disabled=""[^>]*id="remove-church-logo"[^>]*name="removeLogo"/,
    );
  });

  it("exposes pending state and a locked exact-retry state", () => {
    const initial = createInitialChurchSettingsState(
      REQUEST_ID,
      snapshot,
      LOGO_URL,
    );
    setActionState(
      {
        ...initial,
        status: "error",
        message: "The save could not be confirmed.",
        responseEpoch: 1,
        retryLogoAction: "keep",
      },
      true,
    );

    const markup = renderForm();

    expect(markup).toContain("unconfirmed settings save");
    expect(markup).toContain("Do not change the");
    expect(markup).toContain("Saving settings...");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Resolve request");
    expect(markup).not.toContain("abandon");
  });

  it("uses a response epoch to restore server-authoritative uncontrolled values", () => {
    const source = readFileSync(
      new URL("./church-settings-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("key={state.responseEpoch}");
  });

  it("keeps the 390px layout fluid and removes the former fake settings", () => {
    const markup = renderForm();

    expect(markup).toContain("min-w-0");
    expect(markup).toContain("w-full");
    expect(markup).toContain("sm:w-auto");
    expect(markup).not.toMatch(/class="[^"]*(?:^|\s)grid-cols-2(?:\s|$)/);
    expect(markup).not.toContain(`name="phone"`);
    expect(markup).not.toContain(`name="location"`);
    expect(markup).not.toContain(`name="fund"`);
    expect(markup).not.toContain(`name="payment"`);
    expect(markup).not.toContain("demo mode");
    expect(markup).toContain("Only the church owner");
  });
});
