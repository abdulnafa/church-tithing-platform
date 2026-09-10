import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "./supabase/database.types";

vi.mock("server-only", () => ({}));

import {
  getPrayerRequestQueue,
  reviewPrayerRequest,
} from "./church-prayer-requests-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const PRAYER_A = "20000000-0000-4000-8000-000000000001";
const PRAYER_B = "20000000-0000-4000-8000-000000000002";
const REVIEW_REQUEST_ID = "30000000-0000-4000-8000-000000000016";

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

function row(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    prayer_request_id: PRAYER_A,
    body: "Please pray for my family.",
    is_reviewed: false,
    consented_at: "2026-09-09T09:59:00.000Z",
    created_at: "2026-09-09T10:00:00.000Z",
    reviewed_at: null,
    updated_at: "2026-09-09T10:00:00.000Z",
    revision: 0,
    ...overrides,
  };
}

describe("church prayer request DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the exact privacy-minimized queue and preserves mixed ordering", async () => {
    rpc.mockResolvedValue({
      data: [
        row(),
        row({
          prayer_request_id: PRAYER_B,
          body: "A second request.",
          is_reviewed: true,
          created_at: "2026-09-10T10:00:00.000Z",
          consented_at: "2026-09-10T09:59:00.000Z",
          reviewed_at: "2026-09-10T12:00:00.000Z",
          updated_at: "2026-09-10T12:00:00.000Z",
          revision: 1,
        }),
      ],
      error: null,
    });

    const result = await getPrayerRequestQueue(client, CHURCH_ID);

    expect(rpc).toHaveBeenCalledWith("get_prayer_request_queue", {
      target_church_id: CHURCH_ID,
    });
    expect(result).toEqual({
      ok: true,
      requests: [
        {
          id: PRAYER_A,
          body: "Please pray for my family.",
          isReviewed: false,
          consentedAt: "2026-09-09T09:59:00.000Z",
          createdAt: "2026-09-09T10:00:00.000Z",
          reviewedAt: null,
          updatedAt: "2026-09-09T10:00:00.000Z",
          revision: 0,
        },
        {
          id: PRAYER_B,
          body: "A second request.",
          isReviewed: true,
          consentedAt: "2026-09-10T09:59:00.000Z",
          createdAt: "2026-09-10T10:00:00.000Z",
          reviewedAt: "2026-09-10T12:00:00.000Z",
          updatedAt: "2026-09-10T12:00:00.000Z",
          revision: 1,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /donation|donor|email|amount|fund|receipt|reviewedBy/i,
    );
  });

  it("accepts the true empty queue but distinguishes permission denial", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      requests: [],
    });

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "PRAYER_QUEUE_FORBIDDEN" },
    });
    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it.each([
    ["extra linkage column", [row({ donation_id: PRAYER_B })]],
    ["non-canonical body", [row({ body: " padded " })]],
    ["unsafe body", [row({ body: "unsafe\u202etext" })]],
    ["impossible consent time", [row({ consented_at: "2026-09-11T10:00:00.000Z" })]],
    ["impossible review state", [row({ is_reviewed: true })]],
    ["unreviewed revision is not zero", [row({ revision: 1 })]],
    [
      "reviewed revision is not one",
      [
        row({
          is_reviewed: true,
          reviewed_at: "2026-09-10T10:00:00.000Z",
          updated_at: "2026-09-10T10:00:00.000Z",
          revision: 0,
        }),
      ],
    ],
    ["duplicate rows", [row(), row()]],
  ])("fails closed for %s", async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("rejects queue rows that do not follow unreviewed-oldest/reviewed-newest ordering", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          prayer_request_id: PRAYER_B,
          created_at: "2026-09-10T10:00:00.000Z",
          consented_at: "2026-09-10T09:59:00.000Z",
          updated_at: "2026-09-10T10:00:00.000Z",
        }),
        row(),
      ],
      error: null,
    });

    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("preserves unreviewed microsecond ordering when display milliseconds and UUID fallback disagree", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          prayer_request_id: PRAYER_B,
          created_at: "2026-09-09T10:00:00.000100Z",
          updated_at: "2026-09-09T10:00:00.000300Z",
        }),
        row({
          prayer_request_id: PRAYER_A,
          created_at: "2026-09-09T10:00:00.000200Z",
          updated_at: "2026-09-09T10:00:00.000300Z",
        }),
      ],
      error: null,
    });

    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
      requests: [
        { id: PRAYER_B, createdAt: "2026-09-09T10:00:00.000Z" },
        { id: PRAYER_A, createdAt: "2026-09-09T10:00:00.000Z" },
      ],
    });
  });

  it("rejects reviewed rows that are not newest-reviewed first", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          prayer_request_id: PRAYER_A,
          is_reviewed: true,
          reviewed_at: "2026-09-10T11:00:00.000Z",
          updated_at: "2026-09-10T11:00:00.000Z",
          revision: 1,
        }),
        row({
          prayer_request_id: PRAYER_B,
          is_reviewed: true,
          reviewed_at: "2026-09-10T12:00:00.000Z",
          updated_at: "2026-09-10T12:00:00.000Z",
          revision: 1,
        }),
      ],
      error: null,
    });

    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("preserves reviewed microsecond ordering when display milliseconds and UUID fallback disagree", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          prayer_request_id: PRAYER_A,
          is_reviewed: true,
          reviewed_at: "2026-09-10T12:00:00.000200Z",
          updated_at: "2026-09-10T12:00:00.000300Z",
          revision: 1,
        }),
        row({
          prayer_request_id: PRAYER_B,
          is_reviewed: true,
          reviewed_at: "2026-09-10T12:00:00.000100Z",
          updated_at: "2026-09-10T12:00:00.000300Z",
          revision: 1,
        }),
      ],
      error: null,
    });

    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
      requests: [
        { id: PRAYER_A, reviewedAt: "2026-09-10T12:00:00.000Z" },
        { id: PRAYER_B, reviewedAt: "2026-09-10T12:00:00.000Z" },
      ],
    });
  });

  it("rejects responses above the documented 100-row cap", async () => {
    rpc.mockResolvedValue({
      data: Array.from({ length: 101 }, () => row()),
      error: null,
    });

    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("calls only the audited review RPC and validates its minimum result", async () => {
    rpc.mockResolvedValue({
      data: {
        prayer_request_id: PRAYER_A,
        reviewed_at: "2026-09-10T12:00:00.000Z",
        revision: 1,
        replayed: false,
      },
      error: null,
    });

    const result = await reviewPrayerRequest(client, {
      churchId: CHURCH_ID,
      prayerRequestId: PRAYER_A,
      requestId: REVIEW_REQUEST_ID,
      expectedRevision: 0,
    });

    expect(rpc).toHaveBeenCalledWith("review_prayer_request", {
      target_church_id: CHURCH_ID,
      target_prayer_request_id: PRAYER_A,
      review_request_id: REVIEW_REQUEST_ID,
      expected_revision: 0,
    });
    expect(result).toEqual({
      ok: true,
      prayerRequestId: PRAYER_A,
      reviewedAt: "2026-09-10T12:00:00.000Z",
      revision: 1,
      replayed: false,
    });
  });

  it.each([
    ["PRAYER_REVIEW_FORBIDDEN", "forbidden"],
    ["PRAYER_REVIEW_INVALID_REQUEST_ID", "invalid_request"],
    ["PRAYER_REVIEW_INVALID_EXPECTED_REVISION", "invalid_request"],
    ["PRAYER_REVIEW_NOT_FOUND", "not_found"],
    ["PRAYER_REVIEW_REVISION_CONFLICT", "revision_conflict"],
    ["PRAYER_REVIEW_ALREADY_REVIEWED", "already_reviewed"],
    ["PRAYER_REVIEW_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
  ] as const)("maps %s to %s", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });

    await expect(
      reviewPrayerRequest(client, {
        churchId: CHURCH_ID,
        prayerRequestId: PRAYER_A,
        requestId: REVIEW_REQUEST_ID,
        expectedRevision: 0,
      }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("contains thrown and malformed RPC results", async () => {
    rpc.mockRejectedValueOnce(new Error("private prayer body"));
    await expect(getPrayerRequestQueue(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpc.mockResolvedValueOnce({
      data: {
        prayer_request_id: PRAYER_A,
        reviewed_at: "invalid",
        revision: 1,
        replayed: false,
      },
      error: null,
    });
    await expect(
      reviewPrayerRequest(client, {
        churchId: CHURCH_ID,
        prayerRequestId: PRAYER_A,
        requestId: REVIEW_REQUEST_ID,
        expectedRevision: 0,
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
