import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  requireChurchPermissionMock,
  revalidatePathMock,
  reviewPrayerRequestMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  reviewPrayerRequestMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/church-prayer-requests-dal", () => ({
  reviewPrayerRequest: reviewPrayerRequestMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { createInitialPrayerReviewActionState } from "@/lib/prayer-request";

import { reviewPrayerRequestAction } from "./actions";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const PRAYER_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "30000000-0000-4000-8000-000000000016";
const client = { rpc: vi.fn() };

function initialState() {
  return createInitialPrayerReviewActionState(REQUEST_ID, PRAYER_ID, 3);
}

function form(overrides: Readonly<Record<string, string>> = {}) {
  const data = new FormData();
  const values = {
    reviewRequestId: REQUEST_ID,
    prayerRequestId: PRAYER_ID,
    expectedPrayerRevision: "3",
    ...overrides,
  };
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe("prayer review Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: { churchId: CHURCH_ID, kind: "church" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    reviewPrayerRequestMock.mockResolvedValue({
      ok: true,
      prayerRequestId: PRAYER_ID,
      reviewedAt: "2026-09-10T12:00:00.000Z",
      revision: 4,
      replayed: false,
    });
  });

  it("authorizes before parsing an invalid request", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requireChurchPermissionMock.mockRejectedValue(stop);

    await expect(
      reviewPrayerRequestAction(initialState(), new FormData()),
    ).rejects.toBe(stop);
    expect(requireChurchPermissionMock).toHaveBeenCalledWith(
      "prayer_requests_review",
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["reviewRequestId", "40000000-0000-4000-8000-000000000016"],
    ["prayerRequestId", "20000000-0000-4000-8000-000000000099"],
    ["expectedPrayerRevision", "03"],
  ])("rejects mismatched %s before creating a client", async (field, value) => {
    const result = await reviewPrayerRequestAction(
      initialState(),
      form({ [field]: value }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("invalid");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("uses only server-derived church scope and sends no prayer body or financial data", async () => {
    const submitted = form({
      churchId: "10000000-0000-4000-8000-000000000099",
      prayerBody: "attacker-controlled text",
      donorId: "50000000-0000-4000-8000-000000000001",
      amount: "999999",
    });

    const result = await reviewPrayerRequestAction(initialState(), submitted);

    expect(reviewPrayerRequestMock).toHaveBeenCalledWith(client, {
      churchId: CHURCH_ID,
      prayerRequestId: PRAYER_ID,
      requestId: REQUEST_ID,
      expectedRevision: 3,
    });
    expect(result).toMatchObject({
      status: "success",
      expectedRevision: 4,
      prayerRequestId: PRAYER_ID,
      retryRequired: false,
    });
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(JSON.stringify(result)).not.toMatch(/prayerBody|donorId|amount|churchId/i);
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/prayers");
  });

  it("locks an ambiguous review and recovers the exact idempotent retry", async () => {
    reviewPrayerRequestMock
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        prayerRequestId: PRAYER_ID,
        reviewedAt: "2026-09-10T12:00:00.000Z",
        revision: 4,
        replayed: true,
      });

    const first = await reviewPrayerRequestAction(initialState(), form());
    expect(first.retryRequired).toBe(true);
    expect(first.requestId).toBe(REQUEST_ID);

    const changed = await reviewPrayerRequestAction(
      first,
      form({ expectedPrayerRevision: "4" }),
    );
    expect(changed.message).toContain("unchanged");
    expect(reviewPrayerRequestMock).toHaveBeenCalledOnce();

    const recovered = await reviewPrayerRequestAction(first, form());
    expect(recovered).toMatchObject({
      status: "success",
      retryRequired: false,
      replayed: true,
      expectedRevision: 4,
    });
    expect(recovered.message).toContain("recovered");
  });

  it.each([
    "forbidden",
    "invalid_request",
    "idempotency_conflict",
    "not_found",
    "revision_conflict",
    "already_reviewed",
  ] as const)("rotates the request after confirmed %s", async (reason) => {
    reviewPrayerRequestMock.mockResolvedValue({ ok: false, reason });

    const result = await reviewPrayerRequestAction(initialState(), form());

    expect(result.status).toBe("error");
    expect(result.retryRequired).toBe(false);
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/prayers");
  });

  it("contains raw failures and keeps the exact retry reference", async () => {
    reviewPrayerRequestMock.mockRejectedValue(new Error("private prayer body"));

    const result = await reviewPrayerRequestAction(initialState(), form());

    expect(result.retryRequired).toBe(true);
    expect(result.requestId).toBe(REQUEST_ID);
    expect(result.message).toContain("could not be confirmed");
    expect(JSON.stringify(result)).not.toContain("private prayer body");
  });

  it("does not misreport a confirmed review if cache refresh fails", async () => {
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    const result = await reviewPrayerRequestAction(initialState(), form());

    expect(result.status).toBe("success");
    expect(result.message).toContain("marked as reviewed");
  });
});
