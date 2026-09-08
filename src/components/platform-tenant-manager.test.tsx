import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({ useActionStateMock: vi.fn() }));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("@/app/platform/actions", () => ({
  mutatePlatformTenantLifecycleAction: vi.fn(),
}));

import type { PlatformTenantSummary } from "@/lib/platform/platform-tenant-management";

import { PlatformTenantManager } from "./platform-tenant-manager";

const CHURCH_ID = "20000000-0000-4000-8000-000000000802";
const REQUEST_ID = "10000000-0000-4000-8000-000000000801";

function tenant(
  overrides: Partial<PlatformTenantSummary> = {},
): PlatformTenantSummary {
  return {
    churchId: CHURCH_ID,
    displayName: "Harbour Grace Church",
    slug: "harbour-grace",
    status: "active",
    defaultCurrency: "BBD",
    timezone: "America/Barbados",
    foundationReady: true,
    missingReadinessCodes: [],
    lifecycleRevision: 3,
    createdAt: "2026-09-07T08:00:00+00:00",
    activatedAt: "2026-09-07T09:00:00+00:00",
    suspendedAt: null,
    ...overrides,
  };
}

describe("platform tenant manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action: unknown, initialState: unknown) => [
        initialState,
        "/platform",
        false,
      ],
    );
  });

  it("renders a minimum real tenant summary and honest lifecycle scope", () => {
    const markup = renderToStaticMarkup(
      <PlatformTenantManager items={[{ requestId: REQUEST_ID, tenant: tenant() }]} />,
    );

    expect(markup).toContain("Harbour Grace Church");
    expect(markup).toContain("harbour-grace | BBD | America/Barbados");
    expect(markup).toContain("Initially activated 7 Sep 2026 UTC");
    expect(markup).toContain("Suspend church");
    expect(markup).toContain("Suspension reason");
    expect(markup).toContain("saved database tenant/public status");
    expect(markup).toContain("/give and /q routes");
    expect(markup).not.toMatch(/P14|P17/);
    expect(markup).not.toMatch(/owner_email|user_id|donor|provider|subscription/i);
    expect(markup).not.toContain("min-w-[");
  });

  it("gates both activation and restoration on current foundation readiness", () => {
    const onboarding = tenant({
      status: "onboarding",
      foundationReady: false,
      missingReadinessCodes: ["active_owner", "church_profile"],
      activatedAt: null,
    });
    const suspended = tenant({
      churchId: "20000000-0000-4000-8000-000000000803",
      status: "suspended",
      foundationReady: false,
      missingReadinessCodes: ["default_fund"],
      suspendedAt: "2026-09-07T10:00:00+00:00",
    });
    const markup = renderToStaticMarkup(
      <PlatformTenantManager
        items={[
          { requestId: REQUEST_ID, tenant: onboarding },
          {
            requestId: "10000000-0000-4000-8000-000000000804",
            tenant: suspended,
          },
        ]}
      />,
    );

    expect(markup).toContain("Required before activation");
    expect(markup).toContain("Required before restoration");
    expect(markup).toMatch(/Activation(?:<!-- -->)? stays unavailable/);
    expect(markup).toMatch(/Restoration(?:<!-- -->)? stays unavailable/);
    expect(markup).not.toContain("Activate church");
    expect(markup).not.toContain("Restore church");
  });

  it("keeps canceled and archived tenants visible and read-only", () => {
    const markup = renderToStaticMarkup(
      <PlatformTenantManager
        items={[
          { requestId: null, tenant: tenant({ status: "canceled" }) },
          {
            requestId: null,
            tenant: tenant({
              churchId: "20000000-0000-4000-8000-000000000803",
              displayName: "Historic Church",
              status: "archived",
            }),
          },
        ]}
      />,
    );

    expect(markup).toContain("canceled");
    expect(markup).toContain("archived");
    expect(markup).toContain("historical tenant status is read-only");
    expect(markup).not.toContain("Activate church");
    expect(markup).not.toContain("Suspend church");
    expect(markup).not.toContain("Restore church");
  });

  it("locks the suspension reason during an ambiguous exact retry", () => {
    useActionStateMock.mockImplementation(
      (_action: unknown, initialState: Record<string, unknown>) => [
        {
          ...initialState,
          status: "error",
          message: "Keep the same selection and retry this exact request.",
          responseEpoch: 1,
          suspensionReasonCode: "security_review",
          retryRequired: true,
        },
        "/platform",
        false,
      ],
    );

    const markup = renderToStaticMarkup(
      <PlatformTenantManager items={[{ requestId: REQUEST_ID, tenant: tenant() }]} />,
    );

    expect(markup).toContain("Retry unconfirmed status request");
    expect(markup).toContain('name="suspensionReasonCode"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('value="security_review"');
    expect(markup).toMatch(/<select[^>]*disabled=""[^>]*name="suspensionReasonCode"/);
    expect(markup).toContain("Retry unchanged request");
    expect(markup).toContain('role="alert"');
  });

  it("remounts repeated live-region results so assistive technology can announce them", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/platform-tenant-manager.tsx"),
      "utf8",
    );
    expect(source).toContain("key={state.responseEpoch}");
  });
});
