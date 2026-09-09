import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  mutateMyDonorProfileMock,
  requireMemberWorkspaceMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  mutateMyDonorProfileMock: vi.fn(),
  requireMemberWorkspaceMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/guards", () => ({
  requireMemberWorkspace: requireMemberWorkspaceMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/donor-profile-dal", () => ({
  mutateMyDonorProfile: mutateMyDonorProfileMock,
}));

import { createInitialDonorProfileActionState } from "@/lib/donor-profile";

import { updateDonorProfileAction } from "./profile-actions";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const DONOR_ID = "20000000-0000-4000-8000-000000000002";
const REQUEST_ID = "30000000-0000-4000-8000-000000000f15";
const client = { rpc: vi.fn() };

function state() {
  return createInitialDonorProfileActionState(REQUEST_ID, {
    displayName: "Alicia Clarke",
    email: "alicia@example.test",
    profileRevision: 3,
  });
}

function form(overrides: Readonly<Record<string, string>> = {}) {
  const data = new FormData();
  const values = {
    requestId: REQUEST_ID,
    expectedProfileRevision: "3",
    displayName: "Alicia Clarke-Smith",
    ...overrides,
  };
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

const success = {
  ok: true,
  profileRevision: 4,
  operation: "updated",
  replayed: false,
} as const;

describe("member donor profile Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMemberWorkspaceMock.mockResolvedValue({
      identity: { state: "active" },
      workspace: {
        churchId: CHURCH_ID,
        donorId: DONOR_ID,
        kind: "member",
      },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    mutateMyDonorProfileMock.mockResolvedValue(success);
  });

  it("re-authorizes before parsing even an invalid request", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requireMemberWorkspaceMock.mockRejectedValue(stop);

    await expect(
      updateDonorProfileAction(state(), new FormData()),
    ).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("validates independently before creating a database client", async () => {
    const result = await updateDonorProfileAction(
      state(),
      form({ displayName: "A" }),
    );

    expect(result.fieldErrors?.displayName).toBe("Enter your full name.");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("uses only server-derived church and donor scope with no email or IDs from FormData", async () => {
    const submitted = form();
    submitted.set("churchId", "10000000-0000-4000-8000-000000000099");
    submitted.set("donorId", "20000000-0000-4000-8000-000000000099");
    submitted.set("userId", "40000000-0000-4000-8000-000000000099");
    submitted.set("email", "attacker@example.test");
    submitted.set("phone", "+1 246 555 0199");

    const result = await updateDonorProfileAction(state(), submitted);

    expect(mutateMyDonorProfileMock).toHaveBeenCalledWith(
      client,
      { churchId: CHURCH_ID, expectedDonorId: DONOR_ID },
      REQUEST_ID,
      3,
      { displayName: "Alicia Clarke-Smith" },
    );
    expect(JSON.stringify(result)).not.toMatch(/email|phone|churchId|donorId|userId/i);
    expect(result.status).toBe("success");
    expect(result.expectedRevision).toBe(4);
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("locks an ambiguous canonical value and accepts only the exact retry", async () => {
    mutateMyDonorProfileMock
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValueOnce({ ...success, replayed: true });

    const first = await updateDonorProfileAction(state(), form());
    expect(first.retryRequired).toBe(true);
    expect(first.requestId).toBe(REQUEST_ID);
    expect(first.values.displayName).toBe("Alicia Clarke-Smith");

    const changed = await updateDonorProfileAction(
      first,
      form({ displayName: "Different Name" }),
    );
    expect(changed.message).toContain("exactly the same name");
    expect(mutateMyDonorProfileMock).toHaveBeenCalledOnce();

    const recovered = await updateDonorProfileAction(first, form());
    expect(recovered.status).toBe("success");
    expect(recovered.message).toContain("recovered");
    expect(recovered.retryRequired).toBe(false);
  });

  it.each([
    "forbidden",
    "idempotency_conflict",
    "invalid_request",
    "revision_conflict",
  ] as const)("rotates the request after confirmed %s", async (reason) => {
    mutateMyDonorProfileMock.mockResolvedValue({ ok: false, reason });

    const result = await updateDonorProfileAction(state(), form());
    expect(result.status).toBe("error");
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(result.retryRequired).toBe(false);
  });

  it("treats confirmed no-change as a safe success", async () => {
    mutateMyDonorProfileMock.mockResolvedValue({
      ok: false,
      reason: "no_changes",
    });
    const result = await updateDonorProfileAction(state(), form());

    expect(result.status).toBe("success");
    expect(result.message).toContain("already has this name");
    expect(result.retryRequired).toBe(false);
    expect(result.requestId).not.toBe(REQUEST_ID);
  });

  it("does not expose thrown database details and preserves the exact retry", async () => {
    mutateMyDonorProfileMock.mockRejectedValue(
      new Error("private donor profile ledger"),
    );
    const result = await updateDonorProfileAction(state(), form());

    expect(result.retryRequired).toBe(true);
    expect(result.requestId).toBe(REQUEST_ID);
    expect(result.message).toContain("could not be confirmed");
    expect(JSON.stringify(result)).not.toContain("private donor profile ledger");
  });
});
