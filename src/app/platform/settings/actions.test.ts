import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  requirePlatformSuperAdminMock,
  revalidatePathMock,
  updatePlatformOnboardingDefaultsMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  requirePlatformSuperAdminMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  updatePlatformOnboardingDefaultsMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformSuperAdmin: requirePlatformSuperAdminMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/platform/platform-management-dal", () => ({
  updatePlatformOnboardingDefaults: updatePlatformOnboardingDefaultsMock,
}));

import { createInitialPlatformOnboardingDefaultsState } from "@/lib/platform/platform-onboarding-defaults";

import { updatePlatformOnboardingDefaultsAction } from "./actions";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const client = { rpc: vi.fn() };
const SNAPSHOT = {
  defaultCurrency: "BBD",
  defaultTimezone: "America/Barbados",
  defaultPrimaryColor: "#1F6D60",
  defaultSecondaryColor: "#E1B85A",
  settingsRevision: 3,
  updatedAt: "2026-09-07T10:00:00+00:00",
} as const;

function state() {
  return createInitialPlatformOnboardingDefaultsState(REQUEST_ID, SNAPSHOT);
}

function form(overrides: Readonly<Record<string, string>> = {}) {
  const data = new FormData();
  const values = {
    requestId: REQUEST_ID,
    expectedSettingsRevision: "3",
    defaultCurrency: "USD",
    defaultTimezone: "America/Barbados",
    defaultPrimaryColor: "#123456",
    defaultSecondaryColor: "#ABCDEF",
    ...overrides,
  };
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

const success = {
  ok: true,
  defaults: {
    defaultCurrency: "USD",
    defaultTimezone: "America/Barbados",
    defaultPrimaryColor: "#123456",
    defaultSecondaryColor: "#ABCDEF",
    settingsRevision: 4,
    updatedAt: "2026-09-07T10:05:00+00:00",
  },
  replayed: false,
} as const;

describe("Platform Admin onboarding defaults Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSuperAdminMock.mockResolvedValue({
      identity: { userId: "30000000-0000-4000-8000-000000000803" },
      workspace: { kind: "platform", key: "platform" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    updatePlatformOnboardingDefaultsMock.mockResolvedValue(success);
  });

  it("re-authorizes before parsing even invalid platform settings", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requirePlatformSuperAdminMock.mockRejectedValue(stop);

    await expect(
      updatePlatformOnboardingDefaultsAction(state(), new FormData()),
    ).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("independently validates before creating a database client", async () => {
    const result = await updatePlatformOnboardingDefaultsAction(
      state(),
      form({ defaultTimezone: "not a timezone" }),
    );

    expect(result.fieldErrors?.defaultTimezone).toBeDefined();
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("passes canonical values, revision, and exact request reference", async () => {
    const result = await updatePlatformOnboardingDefaultsAction(state(), form());

    expect(updatePlatformOnboardingDefaultsMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      3,
      {
        defaultCurrency: "USD",
        defaultTimezone: "America/Barbados",
        defaultPrimaryColor: "#123456",
        defaultSecondaryColor: "#ABCDEF",
      },
    );
    expect(result.status).toBe("success");
    expect(result.expectedRevision).toBe(4);
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/platform/onboarding");
  });

  it("locks ambiguous canonical values and accepts only the exact retry", async () => {
    updatePlatformOnboardingDefaultsMock
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValueOnce({ ...success, replayed: true });

    const first = await updatePlatformOnboardingDefaultsAction(state(), form());
    expect(first.retryRequired).toBe(true);
    expect(first.requestId).toBe(REQUEST_ID);
    expect(first.values.defaultCurrency).toBe("USD");

    const changed = await updatePlatformOnboardingDefaultsAction(
      first,
      form({ defaultCurrency: "CAD" }),
    );
    expect(changed.message).toContain("exactly the same values");
    expect(updatePlatformOnboardingDefaultsMock).toHaveBeenCalledOnce();

    const recovered = await updatePlatformOnboardingDefaultsAction(first, form());
    expect(recovered.status).toBe("success");
    expect(recovered.message).toContain("recovered");
    expect(recovered.retryRequired).toBe(false);
  });

  it.each(["stale", "no_changes", "idempotency_conflict", "invalid_request"] as const)(
    "rotates the reference and clears retry state for confirmed %s",
    async (reason) => {
      updatePlatformOnboardingDefaultsMock.mockResolvedValue({ ok: false, reason });

      const result = await updatePlatformOnboardingDefaultsAction(state(), form());

      expect(result.status).toBe("error");
      expect(result.requestId).not.toBe(REQUEST_ID);
      expect(result.retryRequired).toBe(false);
      expect(result.fieldErrors).toBeUndefined();
    },
  );

  it("does not expose a thrown raw settings error", async () => {
    updatePlatformOnboardingDefaultsMock.mockRejectedValue(
      new Error("private platform settings ledger"),
    );
    const result = await updatePlatformOnboardingDefaultsAction(state(), form());

    expect(result.retryRequired).toBe(true);
    expect(result.message).toContain("could not be confirmed");
    expect(JSON.stringify(result)).not.toContain("private platform settings ledger");
  });
});
