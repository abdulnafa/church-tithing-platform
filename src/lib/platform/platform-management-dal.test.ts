import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import {
  getPlatformOnboardingDefaults,
  getPlatformTenantPage,
  mutatePlatformTenantLifecycle,
  updatePlatformOnboardingDefaults,
} from "./platform-management-dal";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const CHURCH_ID = "20000000-0000-4000-8000-000000000820";
const OTHER_CHURCH_ID = "20000000-0000-4000-8000-000000000810";
const CREATED_AT = "2026-09-07T10:00:00+00:00";
const ACTIVATED_AT = "2026-09-07T10:05:00+00:00";
const SUSPENDED_AT = "2026-09-07T10:10:00+00:00";

const activeTenant = {
  church_id: CHURCH_ID,
  display_name: "Harbour Grace Church",
  slug: "harbour-grace",
  status: "active",
  default_currency: "BBD",
  timezone: "America/Barbados",
  foundation_ready: true,
  missing_readiness_codes: [],
  lifecycle_revision: 2,
  created_at: CREATED_AT,
  activated_at: ACTIVATED_AT,
  suspended_at: null,
} as const;

function pageRow(
  tenants: readonly unknown[] = [activeTenant],
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    tenants,
    total_tenant_count: tenants.length,
    onboarding_count: 0,
    active_count: tenants.length,
    suspended_count: 0,
    next_cursor_created_at: null,
    next_cursor_church_id: null,
    has_more: false,
    ...overrides,
  };
}

const defaultsRow = {
  default_currency: "BBD",
  default_timezone: "America/Barbados",
  default_primary_color: "#1F6D60",
  default_secondary_color: "#E1B85A",
  settings_revision: 3,
  updated_at: "2026-09-07T10:00:00+00:00",
} as const;

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("platform management database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tenant page", () => {
    beforeEach(() => {
      rpc.mockResolvedValue({ data: pageRow(), error: null });
    });

    it("calls the narrow paginated RPC and maps a minimum client snapshot", async () => {
      await expect(getPlatformTenantPage(client)).resolves.toEqual({
        ok: true,
        page: {
          tenants: [
            {
              churchId: CHURCH_ID,
              displayName: "Harbour Grace Church",
              slug: "harbour-grace",
              status: "active",
              defaultCurrency: "BBD",
              timezone: "America/Barbados",
              foundationReady: true,
              missingReadinessCodes: [],
              lifecycleRevision: 2,
              createdAt: CREATED_AT,
              activatedAt: ACTIVATED_AT,
              suspendedAt: null,
            },
          ],
          totalTenantCount: 1,
          onboardingCount: 0,
          activeCount: 1,
          suspendedCount: 0,
          nextCursorCreatedAt: null,
          nextCursorChurchId: null,
          hasMore: false,
        },
      });
      expect(rpc).toHaveBeenCalledWith("get_platform_tenants", {
        tenant_page_size: 20,
      });
      expect(JSON.stringify((await getPlatformTenantPage(client)))).not.toMatch(
        /owner|user_id|donor|provider|subscription/i,
      );
    });

    it("accepts a DB-valid 120-code-point astral display name", async () => {
      rpc.mockResolvedValue({
        data: pageRow([{ ...activeTenant, display_name: "😀".repeat(120) }]),
        error: null,
      });

      const result = await getPlatformTenantPage(client);
      expect(result.ok).toBe(true);
    });

    it("keeps a malformed legacy profile visible through nullable safe fields", async () => {
      rpc.mockResolvedValue({
        data: pageRow([
          {
            ...activeTenant,
            default_currency: null,
            timezone: null,
            foundation_ready: false,
            missing_readiness_codes: ["church_profile"],
          },
        ]),
        error: null,
      });

      await expect(getPlatformTenantPage(client)).resolves.toMatchObject({
        ok: true,
        page: {
          tenants: [
            {
              defaultCurrency: null,
              timezone: null,
              foundationReady: false,
              missingReadinessCodes: ["church_profile"],
            },
          ],
        },
      });
    });

    it("accepts a bounded DB-validated timezone outside Node ICU", async () => {
      rpc.mockResolvedValue({
        data: pageRow([{ ...activeTenant, timezone: "Factory" }]),
        error: null,
      });

      await expect(getPlatformTenantPage(client)).resolves.toMatchObject({
        ok: true,
        page: { tenants: [{ timezone: "Factory" }] },
      });
    });

    it("passes and validates an exact keyset cursor before calling RPC", async () => {
      const cursor = {
        createdAt: "2026-09-07T11:00:00+00:00",
        churchId: "20000000-0000-4000-8000-000000000900",
      };

      await getPlatformTenantPage(client, { pageSize: 10, cursor });
      expect(rpc).toHaveBeenCalledWith("get_platform_tenants", {
        tenant_page_size: 10,
        tenant_cursor_created_at: cursor.createdAt,
        tenant_cursor_church_id: cursor.churchId,
      });

      rpc.mockClear();
      await expect(
        getPlatformTenantPage(client, {
          cursor: { ...cursor, createdAt: "not-rfc3339" },
        }),
      ).resolves.toEqual({ ok: false, reason: "invalid_request" });
      expect(rpc).not.toHaveBeenCalled();
    });

    it.each([
      ["onboarding timestamps", [{ ...activeTenant, status: "onboarding", activated_at: ACTIVATED_AT }]],
      ["active without activation", [{ ...activeTenant, activated_at: null }]],
      ["suspended without suspension", [{ ...activeTenant, status: "suspended", suspended_at: null }]],
      ["activation before creation", [{ ...activeTenant, activated_at: "2026-09-07T09:00:00+00:00" }]],
      ["suspension before activation", [{ ...activeTenant, status: "suspended", suspended_at: CREATED_AT }]],
      ["malformed timestamp", [{ ...activeTenant, created_at: "7 September 2026" }]],
      ["readiness mismatch", [{ ...activeTenant, foundation_ready: false }]],
      ["duplicate readiness", [{ ...activeTenant, foundation_ready: false, missing_readiness_codes: ["active_owner", "active_owner"] }]],
      ["unordered readiness", [{ ...activeTenant, foundation_ready: false, missing_readiness_codes: ["permanent_qr", "active_owner"] }]],
      ["unknown readiness", [{ ...activeTenant, foundation_ready: false, missing_readiness_codes: ["billing"] }]],
      ["invalid currency", [{ ...activeTenant, default_currency: "EUR" }]],
      ["nullable profile without readiness code", [{ ...activeTenant, default_currency: null }]],
    ])("fails closed for malformed %s", async (_name, tenants) => {
      rpc.mockResolvedValue({ data: pageRow(tenants), error: null });
      await expect(getPlatformTenantPage(client)).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    });

    it("rejects duplicate or out-of-order tenant keys", async () => {
      const older = {
        ...activeTenant,
        church_id: OTHER_CHURCH_ID,
        created_at: "2026-09-07T09:00:00+00:00",
        activated_at: "2026-09-07T09:05:00+00:00",
      };
      rpc.mockResolvedValue({ data: pageRow([older, activeTenant]), error: null });
      await expect(getPlatformTenantPage(client)).resolves.toMatchObject({ ok: false });

      rpc.mockResolvedValue({ data: pageRow([activeTenant, activeTenant]), error: null });
      await expect(getPlatformTenantPage(client)).resolves.toMatchObject({ ok: false });
    });

    it("requires returned rows to be strictly below the supplied cursor", async () => {
      const cursor = { createdAt: CREATED_AT, churchId: OTHER_CHURCH_ID };
      await expect(getPlatformTenantPage(client, { cursor })).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    });

    it("requires a has-more cursor to match the last returned tenant", async () => {
      rpc.mockResolvedValue({
        data: pageRow([activeTenant], {
          has_more: true,
          next_cursor_created_at: CREATED_AT,
          next_cursor_church_id: OTHER_CHURCH_ID,
        }),
        error: null,
      });
      await expect(getPlatformTenantPage(client)).resolves.toMatchObject({ ok: false });
    });

    it.each([
      ["PLATFORM_TENANTS_FORBIDDEN", "forbidden"],
      ["PLATFORM_TENANTS_INVALID_PAGE_SIZE", "invalid_request"],
      ["PLATFORM_TENANTS_INVALID_CURSOR", "invalid_request"],
      ["secret internal table", "unavailable"],
    ] as const)("maps exact list error %s safely", async (message, reason) => {
      rpc.mockResolvedValue({ data: null, error: { message } });
      await expect(getPlatformTenantPage(client)).resolves.toEqual({ ok: false, reason });
    });
  });

  describe("tenant lifecycle", () => {
    const input = {
      requestId: REQUEST_ID,
      churchId: CHURCH_ID,
      expectedRevision: 2,
      operation: "suspend",
      suspensionReasonCode: "compliance_review",
    } as const;

    beforeEach(() => {
      rpc.mockResolvedValue({
        data: {
          church_id: CHURCH_ID,
          status: "suspended",
          lifecycle_revision: 3,
          activated_at: ACTIVATED_AT,
          suspended_at: SUSPENDED_AT,
          replayed: false,
        },
        error: null,
      });
    });

    it("calls the exact lifecycle RPC and returns only confirmed state", async () => {
      await expect(mutatePlatformTenantLifecycle(client, input)).resolves.toEqual({
        ok: true,
        mutation: {
          churchId: CHURCH_ID,
          status: "suspended",
          lifecycleRevision: 3,
          activatedAt: ACTIVATED_AT,
          suspendedAt: SUSPENDED_AT,
          replayed: false,
        },
      });
      expect(rpc).toHaveBeenCalledWith("mutate_platform_tenant_lifecycle", {
        lifecycle_request_id: REQUEST_ID,
        target_church_id: CHURCH_ID,
        expected_lifecycle_revision: 2,
        lifecycle_operation: "suspend",
        suspension_reason_code: "compliance_review",
      });
    });

    it("omits the generated optional reason argument outside suspension", async () => {
      rpc.mockResolvedValue({
        data: {
          church_id: CHURCH_ID,
          status: "active",
          lifecycle_revision: 3,
          activated_at: ACTIVATED_AT,
          suspended_at: null,
          replayed: false,
        },
        error: null,
      });

      await expect(
        mutatePlatformTenantLifecycle(client, {
          ...input,
          operation: "activate",
          suspensionReasonCode: null,
        }),
      ).resolves.toMatchObject({ ok: true });
      expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty(
        "suspension_reason_code",
      );
    });

    it.each([
      ["PLATFORM_LIFECYCLE_FORBIDDEN", "forbidden"],
      ["PLATFORM_LIFECYCLE_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
      ["PLATFORM_LIFECYCLE_INVALID_REASON", "invalid_request"],
      ["PLATFORM_LIFECYCLE_TENANT_NOT_FOUND", "not_found"],
      ["PLATFORM_LIFECYCLE_TENANT_NOT_READY", "not_ready"],
      ["PLATFORM_LIFECYCLE_REVISION_CONFLICT", "stale"],
      ["PLATFORM_LIFECYCLE_TRANSITION_NOT_ALLOWED", "transition_not_allowed"],
      ["private schema detail", "unavailable"],
    ] as const)("maps exact lifecycle error %s safely", async (message, reason) => {
      rpc.mockResolvedValue({ data: null, error: { message } });
      await expect(mutatePlatformTenantLifecycle(client, input)).resolves.toEqual({
        ok: false,
        reason,
      });
    });

    it.each([
      { lifecycle_revision: 2 },
      { status: "active" },
      { activated_at: null },
      { suspended_at: null },
      { suspended_at: CREATED_AT },
      { replayed: "false" },
    ])("fails closed for malformed lifecycle result %#", async (override) => {
      rpc.mockResolvedValue({
        data: {
          church_id: CHURCH_ID,
          status: "suspended",
          lifecycle_revision: 3,
          activated_at: ACTIVATED_AT,
          suspended_at: SUSPENDED_AT,
          replayed: false,
          ...override,
        },
        error: null,
      });
      await expect(mutatePlatformTenantLifecycle(client, input)).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    });
  });

  describe("onboarding defaults", () => {
    beforeEach(() => {
      rpc.mockResolvedValue({ data: defaultsRow, error: null });
    });

    it("reads and maps the persisted singleton snapshot", async () => {
      await expect(getPlatformOnboardingDefaults(client)).resolves.toEqual({
        ok: true,
        defaults: {
          defaultCurrency: "BBD",
          defaultTimezone: "America/Barbados",
          defaultPrimaryColor: "#1F6D60",
          defaultSecondaryColor: "#E1B85A",
          settingsRevision: 3,
          updatedAt: "2026-09-07T10:00:00+00:00",
        },
      });
      expect(rpc).toHaveBeenCalledWith("get_platform_onboarding_defaults");
    });

    it("loads a bounded DB-validated timezone outside Node ICU", async () => {
      rpc.mockResolvedValue({
        data: { ...defaultsRow, default_timezone: "Factory" },
        error: null,
      });

      await expect(getPlatformOnboardingDefaults(client)).resolves.toMatchObject({
        ok: true,
        defaults: { defaultTimezone: "Factory" },
      });
    });

    it("fails closed instead of inventing defaults from malformed data", async () => {
      rpc.mockResolvedValue({
        data: { ...defaultsRow, default_primary_color: "#bad" },
        error: null,
      });
      await expect(getPlatformOnboardingDefaults(client)).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    });

    it("maps read authorization without exposing unknown errors", async () => {
      rpc.mockResolvedValue({ data: null, error: { message: "PLATFORM_DEFAULTS_FORBIDDEN" } });
      await expect(getPlatformOnboardingDefaults(client)).resolves.toEqual({
        ok: false,
        reason: "forbidden",
      });
      rpc.mockResolvedValue({ data: null, error: { message: "secret value" } });
      await expect(getPlatformOnboardingDefaults(client)).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    });

    it("updates the exact canonical values and confirms the next revision", async () => {
      rpc.mockResolvedValue({
        data: { ...defaultsRow, settings_revision: 4, replayed: false },
        error: null,
      });
      const input = {
        defaultCurrency: "BBD",
        defaultTimezone: "America/Barbados",
        defaultPrimaryColor: "#1F6D60",
        defaultSecondaryColor: "#E1B85A",
      } as const;

      await expect(
        updatePlatformOnboardingDefaults(client, REQUEST_ID, 3, input),
      ).resolves.toMatchObject({ ok: true, replayed: false });
      expect(rpc).toHaveBeenCalledWith("update_platform_onboarding_defaults", {
        settings_request_id: REQUEST_ID,
        expected_settings_revision: 3,
        default_currency: "BBD",
        default_timezone: "America/Barbados",
        default_primary_color: "#1F6D60",
        default_secondary_color: "#E1B85A",
      });
    });

    it.each([
      ["PLATFORM_DEFAULTS_FORBIDDEN", "forbidden"],
      ["PLATFORM_DEFAULTS_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
      ["PLATFORM_DEFAULTS_INVALID_TIMEZONE", "invalid_request"],
      ["PLATFORM_DEFAULTS_REVISION_CONFLICT", "stale"],
      ["PLATFORM_DEFAULTS_NO_CHANGES", "no_changes"],
      ["raw internal failure", "unavailable"],
    ] as const)("maps exact defaults error %s safely", async (message, reason) => {
      rpc.mockResolvedValue({ data: null, error: { message } });
      await expect(
        updatePlatformOnboardingDefaults(client, REQUEST_ID, 3, {
          defaultCurrency: "BBD",
          defaultTimezone: "America/Barbados",
          defaultPrimaryColor: "#1F6D60",
          defaultSecondaryColor: "#E1B85A",
        }),
      ).resolves.toEqual({ ok: false, reason });
    });
  });
});
