import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInitialChurchProvisioningState,
  type ChurchProvisioningActionState,
} from "@/lib/platform/church-provisioning";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("@/app/platform/onboarding/actions", () => ({
  provisionChurchAction: vi.fn(),
}));

import { ChurchOnboardingForm } from "./church-onboarding-form";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const DEFAULTS = {
  currency: "BBD",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: "#E1B85A",
} as const;

function useState(state: ChurchProvisioningActionState, pending = false) {
  useActionStateMock.mockReturnValue([state, "/platform/onboarding", pending]);
}

describe("church onboarding form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useState(createInitialChurchProvisioningState(REQUEST_ID, DEFAULTS));
  });

  it("renders the required persisted fields with associated labels", () => {
    const markup = renderToStaticMarkup(
      <ChurchOnboardingForm defaults={DEFAULTS} requestId={REQUEST_ID} />,
    );

    expect(markup).toContain(`name="requestId"`);
    expect(markup).toContain(`value="${REQUEST_ID}"`);
    expect(markup).toContain(`for="church-displayName"`);
    expect(markup).toContain(`id="church-displayName"`);
    expect(markup).toContain(`name="displayName"`);
    expect(markup).toContain(`for="church-legalName"`);
    expect(markup).toContain(`name="legalName"`);
    expect(markup).toContain(`for="church-ownerEmail"`);
    expect(markup).toContain(`name="ownerEmail"`);
    expect(markup).toContain(`for="church-supportEmail"`);
    expect(markup).toContain(`name="supportEmail"`);
    expect(markup).toContain(`for="church-slug"`);
    expect(markup).toContain(`name="slug"`);
    expect(markup).toContain(`for="church-currency"`);
    expect(markup).toContain(`name="currency"`);
    expect(markup).toContain(`for="church-timezone"`);
    expect(markup).toContain(`name="timezone"`);
    expect(markup).toContain(`for="church-primaryColor"`);
    expect(markup).toContain(`name="primaryColor"`);
    expect(markup).toContain(`for="church-secondaryColor"`);
    expect(markup).toContain(`name="secondaryColor"`);
    expect(markup).toContain(`for="thank-you-message"`);
    expect(markup).toContain(`name="thankYouMessage"`);
    expect(markup).toContain(`for="onboarding-acknowledgement"`);
    expect(markup).toContain(`name="acknowledgement"`);
    expect(markup).toContain("Planned platform plan");
    expect(markup).toContain("USD $99 / month - pending billing setup");
  });

  it("uses an aria-live error region and associates field errors", () => {
    const initial = createInitialChurchProvisioningState(REQUEST_ID, DEFAULTS);
    useState({
      ...initial,
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        ownerEmail: "Enter a valid owner email address.",
        slug: "Choose another slug.",
      },
    });

    const markup = renderToStaticMarkup(
      <ChurchOnboardingForm defaults={DEFAULTS} requestId={REQUEST_ID} />,
    );

    expect(markup).toContain(`aria-live="polite"`);
    expect(markup).toContain(`role="alert"`);
    expect(markup).toContain(`aria-invalid="true"`);
    expect(markup).toContain(`id="ownerEmail-error"`);
    expect(markup).toContain(
      `aria-describedby="ownerEmail-help ownerEmail-error"`,
    );
    expect(markup).toContain(`id="slug-error"`);
    expect(markup).toContain(`church-slug-help slug-error`);
  });

  it("disables the submit button and exposes pending copy", () => {
    useState(createInitialChurchProvisioningState(REQUEST_ID, DEFAULTS), true);

    const markup = renderToStaticMarkup(
      <ChurchOnboardingForm defaults={DEFAULTS} requestId={REQUEST_ID} />,
    );

    expect(markup).toContain("Creating church...");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Create onboarding church");
  });

  it("renders only confirmed identifiers and explicit remaining limitations", () => {
    const initial = createInitialChurchProvisioningState(REQUEST_ID, DEFAULTS);
    useState({
      ...initial,
      status: "success",
      message: "The church workspace was created.",
      result: {
        churchId: "10000000-0000-4000-8000-000000000811",
        displayName: "Harbour Grace Church",
        slug: "harbour-grace",
        status: "onboarding",
        ownerMembershipStatus: "invited",
        qrShortCode: "hgc7v2q9mx4",
        replayed: false,
      },
    });

    const markup = renderToStaticMarkup(
      <ChurchOnboardingForm defaults={DEFAULTS} requestId={REQUEST_ID} />,
    );

    expect(markup).toContain("Harbour Grace Church");
    expect(markup).toContain("harbour-grace");
    expect(markup).toContain("Onboarding");
    expect(markup).toContain("Membership invitation reserved");
    expect(markup).toContain("hgc7v2q9mx4");
    expect(markup).toContain("No invitation email has been sent");
    expect(markup).toContain("public QR resolver");
    expect(markup).toContain("not enabled yet");
    expect(markup).not.toContain("Open giving page");
  });

  it("does not render removed P09 or non-persisted profile inputs", () => {
    const markup = renderToStaticMarkup(
      <ChurchOnboardingForm defaults={DEFAULTS} requestId={REQUEST_ID} />,
    );

    expect(markup).not.toContain(`name="phone"`);
    expect(markup).not.toContain(`name="location"`);
    expect(markup).not.toContain(`name="logo"`);
    expect(markup).not.toContain(`type="file"`);
    expect(markup).not.toContain("This demo does not write tenant data");
  });
});
