import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  getPlatformTenantPageMock,
  platformTenantManagerMock,
  requirePlatformSuperAdminMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getPlatformTenantPageMock: vi.fn(),
  platformTenantManagerMock: vi.fn(),
  requirePlatformSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requirePlatformSuperAdmin: requirePlatformSuperAdminMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/platform/platform-management-dal", () => ({
  getPlatformTenantPage: getPlatformTenantPageMock,
}));
vi.mock("@/components/dashboard-shell", () => ({
  SectionHeader: ({
    action,
    title,
  }: {
    action?: ReactNode;
    title: string;
  }) => (
    <header>
      <h2>{title}</h2>
      {action}
    </header>
  ),
  StatCard: ({ label, value }: { label: string; value: string }) => (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  ),
}));
vi.mock("@/components/platform-tenant-manager", () => ({
  PlatformTenantManager: platformTenantManagerMock,
}));

import PlatformDashboardPage from "./page";

const CHURCH_ID = "20000000-0000-4000-8000-000000000802";
const client = { rpc: vi.fn() };
const tenant = {
  churchId: CHURCH_ID,
  displayName: "Harbour Grace Church",
  slug: "harbour-grace",
  status: "onboarding",
  defaultCurrency: "BBD",
  timezone: "America/Barbados",
  foundationReady: true,
  missingReadinessCodes: [],
  lifecycleRevision: 3,
  createdAt: "2026-09-07T10:00:00+00:00",
  activatedAt: null,
  suspendedAt: null,
} as const;

function successPage(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ok: true,
    page: {
      tenants: [tenant],
      totalTenantCount: 5,
      onboardingCount: 2,
      activeCount: 1,
      suspendedCount: 1,
      nextCursorCreatedAt: null,
      nextCursorChurchId: null,
      hasMore: false,
      ...overrides,
    },
  };
}

describe("Platform Admin tenant page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSuperAdminMock.mockResolvedValue({
      identity: { displayName: "Platform Admin" },
      workspace: { key: "platform", kind: "platform" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    getPlatformTenantPageMock.mockResolvedValue(successPage());
    platformTenantManagerMock.mockImplementation(
      ({ items }: { items: readonly { tenant: typeof tenant; requestId: string }[] }) => (
        <div data-count={items.length} data-request-id={items[0]?.requestId}>
          Tenant manager
        </div>
      ),
    );
  });

  it("guards before reading and renders real counts without demo claims", async () => {
    const markup = renderToStaticMarkup(
      await PlatformDashboardPage({ searchParams: Promise.resolve({}) }),
    );

    expect(requirePlatformSuperAdminMock).toHaveBeenCalledOnce();
    expect(requirePlatformSuperAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      createServerSupabaseClientMock.mock.invocationCallOrder[0],
    );
    expect(getPlatformTenantPageMock).toHaveBeenCalledWith(client, {
      pageSize: 20,
      cursor: null,
    });
    expect(markup).toContain("All churches");
    expect(markup).toContain(">5<");
    expect(markup).toContain("Tenant manager");
    expect(markup).toContain("USD $99 per month");
    expect(markup).toContain("pending final client confirmation");
    expect(markup).not.toMatch(/Tuesday, 18 August|Demo donation|Mock adapter|Â|â€”/);
    expect(markup).not.toMatch(/owner_email|user_id|donor|provider|subscription/i);
  });

  it("passes only the tenant snapshot and an opaque v4 action reference to the client", async () => {
    renderToStaticMarkup(
      await PlatformDashboardPage({ searchParams: Promise.resolve({}) }),
    );

    const props = platformTenantManagerMock.mock.calls[0]?.[0];
    expect(props.items[0].tenant).toEqual(tenant);
    expect(props.items[0].requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.stringify(props)).not.toMatch(
      /owner_email|user_id|donor|provider|subscription/i,
    );
  });

  it.each([
    {
      cursorCreatedAt: ["2026-09-07T10:00:00+00:00"],
      cursorChurchId: [CHURCH_ID],
    },
    { cursorCreatedAt: "not-rfc3339", cursorChurchId: CHURCH_ID },
    { cursorCreatedAt: "2026-09-07T10:00:00+00:00" },
  ])("rejects invalid or duplicate cursors before creating a client", async (query) => {
    const markup = renderToStaticMarkup(
      await PlatformDashboardPage({ searchParams: Promise.resolve(query) }),
    );

    expect(markup).toContain("tenant-list link is invalid");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getPlatformTenantPageMock).not.toHaveBeenCalled();
  });

  it("passes a valid keyset cursor and encodes the next link", async () => {
    const cursorCreatedAt = "2026-09-07T11:00:00+00:00";
    const cursorChurchId = "20000000-0000-4000-8000-000000000900";
    getPlatformTenantPageMock.mockResolvedValue(
      successPage({
        hasMore: true,
        nextCursorCreatedAt: tenant.createdAt,
        nextCursorChurchId: tenant.churchId,
      }),
    );

    const markup = renderToStaticMarkup(
      await PlatformDashboardPage({
        searchParams: Promise.resolve({ cursorCreatedAt, cursorChurchId }),
      }),
    );

    expect(getPlatformTenantPageMock).toHaveBeenCalledWith(client, {
      pageSize: 20,
      cursor: { createdAt: cursorCreatedAt, churchId: cursorChurchId },
    });
    expect(markup).toContain("First page");
    expect(markup).toContain("Next tenants");
    expect(markup).toContain(
      "cursorCreatedAt=2026-09-07T10%3A00%3A00%2B00%3A00&amp;cursorChurchId=20000000-0000-4000-8000-000000000802",
    );
  });

  it("renders explicit unavailable and empty states", async () => {
    getPlatformTenantPageMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    let markup = renderToStaticMarkup(
      await PlatformDashboardPage({ searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain("Tenant data is unavailable");
    expect(markup).not.toContain("Tenant manager");

    getPlatformTenantPageMock.mockResolvedValue(
      successPage({
        tenants: [],
        totalTenantCount: 0,
        onboardingCount: 0,
        activeCount: 0,
        suspendedCount: 0,
      }),
    );
    markup = renderToStaticMarkup(
      await PlatformDashboardPage({ searchParams: Promise.resolve({}) }),
    );
    expect(platformTenantManagerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ items: [] }),
      undefined,
    );
    expect(markup).toMatch(/Showing(?:<!-- -->)? 0(?:<!-- -->)? tenants/);
  });
});
