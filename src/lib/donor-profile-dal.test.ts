import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { getMyDonorProfile, mutateMyDonorProfile } from "./donor-profile-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const DONOR_ID = "20000000-0000-4000-8000-000000000002";
const OTHER_DONOR_ID = "20000000-0000-4000-8000-000000000003";
const REQUEST_ID = "30000000-0000-4000-8000-000000000f15";

const profileRow = {
  church_id: CHURCH_ID,
  donor_id: DONOR_ID,
  display_name: "Alicia Clarke",
  email: "alicia@example.test",
  profile_revision: 3,
  updated_at: "2026-09-09T08:30:00+00:00",
} as const;

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("donor profile database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads one selected profile and returns a minimum client DTO", async () => {
    rpc.mockResolvedValue({ data: [profileRow], error: null });

    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toEqual({
      ok: true,
      profile: {
        displayName: "Alicia Clarke",
        email: "alicia@example.test",
        profileRevision: 3,
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_my_donor_profile", {
      target_church_id: CHURCH_ID,
    });
    expect(
      JSON.stringify(await getMyDonorProfile(client, CHURCH_ID, DONOR_ID)),
    ).not.toMatch(/churchId|donorId|updatedAt|phone|auth|user/i);
  });

  it("distinguishes no linked row without inventing a profile", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("fails closed for multiple, cross-church, or wrong-donor rows", async () => {
    rpc.mockResolvedValue({ data: [profileRow, profileRow], error: null });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toMatchObject({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValue({
      data: [{ ...profileRow, church_id: "10000000-0000-4000-8000-000000000004" }],
      error: null,
    });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toMatchObject({ ok: false, reason: "unavailable" });

    rpc.mockResolvedValue({
      data: [{ ...profileRow, donor_id: OTHER_DONOR_ID }],
      error: null,
    });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toMatchObject({ ok: false, reason: "unavailable" });
  });

  it.each([
    { display_name: " Alicia Clarke" },
    { display_name: "Alicia\u202eClarke" },
    { email: "ALICIA@example.test" },
    { email: "alicia@invalid" },
    { profile_revision: -1 },
    { updated_at: "9 September 2026" },
  ])("fails closed for malformed persisted profile data %#", async (override) => {
    rpc.mockResolvedValue({ data: [{ ...profileRow, ...override }], error: null });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("maps only the exact read authorization error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "DONOR_PROFILE_FORBIDDEN" },
    });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toEqual({ ok: false, reason: "forbidden" });

    rpc.mockResolvedValue({
      data: null,
      error: { message: "private donors table detail" },
    });
    await expect(
      getMyDonorProfile(client, CHURCH_ID, DONOR_ID),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("updates with server-derived scope and sends no email, donor, user, or phone", async () => {
    rpc.mockResolvedValue({
      data: {
        church_id: CHURCH_ID,
        donor_id: DONOR_ID,
        profile_revision: 4,
        operation: "updated",
        replayed: false,
      },
      error: null,
    });

    await expect(
      mutateMyDonorProfile(
        client,
        { churchId: CHURCH_ID, expectedDonorId: DONOR_ID },
        REQUEST_ID,
        3,
        { displayName: "Alicia Clarke-Smith" },
      ),
    ).resolves.toEqual({
      ok: true,
      profileRevision: 4,
      operation: "updated",
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith("mutate_my_donor_profile", {
      target_church_id: CHURCH_ID,
      profile_request_id: REQUEST_ID,
      expected_profile_revision: 3,
      profile_display_name: "Alicia Clarke-Smith",
    });
    expect(JSON.stringify(rpc.mock.calls[0]?.[1])).not.toMatch(
      /email|phone|donor|user|auth/i,
    );
  });

  it("supports the unlinked create result only through the server DAL boundary", async () => {
    rpc.mockResolvedValue({
      data: {
        church_id: CHURCH_ID,
        donor_id: DONOR_ID,
        profile_revision: 0,
        operation: "created",
        replayed: false,
      },
      error: null,
    });

    await expect(
      mutateMyDonorProfile(
        client,
        { churchId: CHURCH_ID, expectedDonorId: null },
        REQUEST_ID,
        0,
        { displayName: "Alicia Clarke" },
      ),
    ).resolves.toEqual({
      ok: true,
      profileRevision: 0,
      operation: "created",
      replayed: false,
    });
  });

  it.each([
    ["DONOR_PROFILE_FORBIDDEN", "forbidden"],
    ["DONOR_PROFILE_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["DONOR_PROFILE_INVALID_REQUEST_ID", "invalid_request"],
    ["DONOR_PROFILE_INVALID_EXPECTED_REVISION", "invalid_request"],
    ["DONOR_PROFILE_INVALID_DISPLAY_NAME", "invalid_request"],
    ["DONOR_PROFILE_REVISION_CONFLICT", "revision_conflict"],
    ["DONOR_PROFILE_NO_CHANGES", "no_changes"],
    ["private database detail", "unavailable"],
  ] as const)("maps mutation error %s safely", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });

    await expect(
      mutateMyDonorProfile(
        client,
        { churchId: CHURCH_ID, expectedDonorId: DONOR_ID },
        REQUEST_ID,
        3,
        { displayName: "Alicia Clarke-Smith" },
      ),
    ).resolves.toEqual({ ok: false, reason });
  });

  it.each([
    { church_id: "10000000-0000-4000-8000-000000000004" },
    { donor_id: OTHER_DONOR_ID },
    { profile_revision: 3 },
    { operation: "created" },
    { replayed: "false" },
  ])("rejects malformed or cross-scope mutation confirmations %#", async (override) => {
    rpc.mockResolvedValue({
      data: {
        church_id: CHURCH_ID,
        donor_id: DONOR_ID,
        profile_revision: 4,
        operation: "updated",
        replayed: false,
        ...override,
      },
      error: null,
    });
    await expect(
      mutateMyDonorProfile(
        client,
        { churchId: CHURCH_ID, expectedDonorId: DONOR_ID },
        REQUEST_ID,
        3,
        { displayName: "Alicia Clarke-Smith" },
      ),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects malformed inputs before any RPC", async () => {
    await expect(
      mutateMyDonorProfile(
        client,
        { churchId: CHURCH_ID, expectedDonorId: DONOR_ID },
        "not-a-request-id",
        3,
        { displayName: " Alicia Clarke" },
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
