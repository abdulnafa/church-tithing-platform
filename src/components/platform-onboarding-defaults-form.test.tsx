import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({ useActionStateMock: vi.fn() }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("@/app/platform/settings/actions", () => ({
  updatePlatformOnboardingDefaultsAction: vi.fn(),
}));

import { createInitialPlatformOnboardingDefaultsState } from "@/lib/platform/platform-onboarding-defaults";

import { PlatformOnboardingDefaultsForm } from "./platform-onboarding-defaults-form";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const SNAPSHOT = {
  defaultCurrency: "XCD",
  defaultTimezone: "America/St_Lucia",
  defaultPrimaryColor: "#123456",
  defaultSecondaryColor: "#ABCDEF",
  settingsRevision: 7,
  updatedAt: "2026-09-07T10:00:00+00:00",
} as const;

describe("platform onboarding defaults form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([
      createInitialPlatformOnboardingDefaultsState(REQUEST_ID, SNAPSHOT),
      "/platform/settings",
      false,
    ]);
  });

  it("renders persisted values, labels, revision, and future-only scope", () => {
    const markup = renderToStaticMarkup(
      <PlatformOnboardingDefaultsForm requestId={REQUEST_ID} snapshot={SNAPSHOT} />,
    );

    expect(markup).toContain(`value="${REQUEST_ID}"`);
    expect(markup).toContain('name="expectedSettingsRevision"');
    expect(markup).toContain('value="7"');
    expect(markup).toContain('name="defaultCurrency"');
    expect(markup).toContain('value="XCD" selected=""');
    expect(markup).toContain('name="defaultTimezone"');
    expect(markup).toContain('value="America/St_Lucia"');
    expect(markup).toContain('name="defaultPrimaryColor"');
    expect(markup).toContain('name="defaultSecondaryColor"');
    expect(markup).toContain("prefill future church onboarding forms only");
    expect(markup).toContain("existing churches are not changed");
    expect(markup).not.toMatch(/owner|donor|provider|subscription/i);
    expect(markup).not.toContain("min-w-[");
  });

  it("associates field errors and exposes pending state", () => {
    const state = createInitialPlatformOnboardingDefaultsState(REQUEST_ID, SNAPSHOT);
    useActionStateMock.mockReturnValue([
      {
        ...state,
        status: "error",
        message: "Check the highlighted fields.",
        responseEpoch: 1,
        fieldErrors: { defaultTimezone: "Enter a valid IANA timezone." },
      },
      "/platform/settings",
      true,
    ]);

    const markup = renderToStaticMarkup(
      <PlatformOnboardingDefaultsForm requestId={REQUEST_ID} snapshot={SNAPSHOT} />,
    );

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="defaultTimezone-error"');
    expect(markup).toContain("Saving defaults...");
    expect(markup).toContain("disabled");
  });

  it("locks and resubmits canonical values after an ambiguous save", () => {
    const state = createInitialPlatformOnboardingDefaultsState(REQUEST_ID, SNAPSHOT);
    useActionStateMock.mockReturnValue([
      {
        ...state,
        status: "error",
        message: "Keep every field unchanged.",
        responseEpoch: 1,
        retryRequired: true,
      },
      "/platform/settings",
      false,
    ]);

    const markup = renderToStaticMarkup(
      <PlatformOnboardingDefaultsForm requestId={REQUEST_ID} snapshot={SNAPSHOT} />,
    );

    expect(markup).toContain("values are locked");
    expect(markup).toContain('name="defaultCurrency"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('value="XCD"');
    expect(markup).toContain('name="defaultTimezone"');
    expect(markup).toContain('value="America/St_Lucia"');
    expect(markup).toContain("Retry unchanged save");
    expect(markup).toMatch(/<select[^>]*disabled=""/);
  });

  it("remounts repeated live-region results so assistive technology can announce them", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/platform-onboarding-defaults-form.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("key={state.responseEpoch}");
  });
});
