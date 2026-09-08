import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  mutatePlatformTenantLifecycleMock,
  requirePlatformSuperAdminMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  mutatePlatformTenantLifecycleMock: vi.fn(),
  requirePlatformSuperAdminMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/guards", () => ({
  requirePlatformSuperAdmin: requirePlatformSuperAdminMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/platform/platform-management-dal", () => ({
  mutatePlatformTenantLifecycle: mutatePlatformTenantLifecycleMock,
}));

import { createInitialPlatformLifecycleState } from "@/lib/platform/platform-tenant-management";

import { mutatePlatformTenantLifecycleAction } from "./actions";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const CHURCH_ID = "20000000-0000-4000-8000-000000000802";
const client = { rpc: vi.fn() };

function state(operation: "activate" | "suspend" | "restore" = "suspend") {
  return createInitialPlatformLifecycleState({
    requestId: REQUEST_ID,
    churchId: CHURCH_ID,
    expectedRevision: 3,
    operation,
  });
}

function form(
  operation: "activate" | "suspend" | "restore" = "suspend",
  overrides: Readonly<Record<string, string | boolean>> = {},
) {
  const values: Record<string, string | boolean> = {
    requestId: REQUEST_ID,
    churchId: CHURCH_ID,
    expectedLifecycleRevision: "3",
    operation,
    suspensionReasonCode: operation === "suspend" ? "compliance_review" : "",
    confirmation: true,
    ...overrides,
  };
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => {
    if (value === true) data.set(name, "on");
    if (typeof value === "string") data.set(name, value);
  });
  return data;
}

const success = {
  ok: true,
  mutation: {
    churchId: CHURCH_ID,
    status: "suspended",
    lifecycleRevision: 4,
    activatedAt: "2026-09-07T09:00:00+00:00",
    suspendedAt: "2026-09-07T10:00:00+00:00",
    replayed: false,
  },
} as const;

describe("Platform Admin tenant lifecycle Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSuperAdminMock.mockResolvedValue({
      identity: { userId: "30000000-0000-4000-8000-000000000803" },
      workspace: { kind: "platform", key: "platform" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    mutatePlatformTenantLifecycleMock.mockResolvedValue(success);
  });

  it("re-authorizes before inspecting an invalid submission", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requirePlatformSuperAdminMock.mockRejectedValue(stop);

    await expect(
      mutatePlatformTenantLifecycleAction(state(), new FormData()),
    ).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(mutatePlatformTenantLifecycleMock).not.toHaveBeenCalled();
  });

  it("validates confirmation and reason before creating a database client", async () => {
    const missingConfirmation = await mutatePlatformTenantLifecycleAction(
      state(),
      form("suspend", { confirmation: false }),
    );
    expect(missingConfirmation.message).toMatch(/confirm/i);

    const missingReason = await mutatePlatformTenantLifecycleAction(
      state(),
      form("suspend", { suspensionReasonCode: "" }),
    );
    expect(missingReason.message).toContain("Choose a suspension reason");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("passes only canonical locked identifiers and the selected reason", async () => {
    const result = await mutatePlatformTenantLifecycleAction(state(), form());

    expect(mutatePlatformTenantLifecycleMock).toHaveBeenCalledWith(client, {
      requestId: REQUEST_ID,
      churchId: CHURCH_ID,
      expectedRevision: 3,
      operation: "suspend",
      suspensionReasonCode: "compliance_review",
    });
    expect(requirePlatformSuperAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      createServerSupabaseClientMock.mock.invocationCallOrder[0],
    );
    expect(result.status).toBe("success");
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(result.expectedRevision).toBe(4);
    expect(result.message).toContain("database tenant and public status only");
  });

  it("locks an ambiguous suspension and accepts only its exact retry", async () => {
    mutatePlatformTenantLifecycleMock
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValueOnce({
        ...success,
        mutation: { ...success.mutation, replayed: true },
      });

    const first = await mutatePlatformTenantLifecycleAction(state(), form());
    expect(first.retryRequired).toBe(true);
    expect(first.requestId).toBe(REQUEST_ID);
    expect(first.suspensionReasonCode).toBe("compliance_review");

    const changed = await mutatePlatformTenantLifecycleAction(
      first,
      form("suspend", { suspensionReasonCode: "security_review" }),
    );
    expect(changed.message).toContain("exactly the same details");
    expect(mutatePlatformTenantLifecycleMock).toHaveBeenCalledOnce();

    const recovered = await mutatePlatformTenantLifecycleAction(first, form());
    expect(mutatePlatformTenantLifecycleMock).toHaveBeenCalledTimes(2);
    expect(recovered.status).toBe("success");
    expect(recovered.message).toContain("recovered");
    expect(recovered.retryRequired).toBe(false);
  });

  it.each(["stale", "not_found", "not_ready", "transition_not_allowed", "idempotency_conflict"] as const)(
    "rotates a confirmed %s failure reference and refreshes current state",
    async (reason) => {
      mutatePlatformTenantLifecycleMock.mockResolvedValue({ ok: false, reason });

      const result = await mutatePlatformTenantLifecycleAction(state(), form());

      expect(result.status).toBe("error");
      expect(result.retryRequired).toBe(false);
      expect(result.requestId).not.toBe(REQUEST_ID);
      expect(revalidatePathMock).toHaveBeenCalledWith("/platform");
    },
  );

  it("does not expose a thrown raw database error", async () => {
    mutatePlatformTenantLifecycleMock.mockRejectedValue(
      new Error("secret tenant ledger detail"),
    );

    const result = await mutatePlatformTenantLifecycleAction(state(), form());

    expect(result.retryRequired).toBe(true);
    expect(result.message).toContain("could not be confirmed");
    expect(JSON.stringify(result)).not.toContain("secret tenant ledger");
  });

  it("rejects tampered state and submitted identifiers", async () => {
    const result = await mutatePlatformTenantLifecycleAction(
      state(),
      form("suspend", { churchId: "20000000-0000-4000-8000-000000000899" }),
    );

    expect(result.message).toContain("reference is invalid");
    expect(mutatePlatformTenantLifecycleMock).not.toHaveBeenCalled();
  });
});
