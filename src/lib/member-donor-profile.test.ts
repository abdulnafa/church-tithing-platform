import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock, getMyDonorProfileMock } = vi.hoisted(
  () => ({
    createServerSupabaseClientMock: vi.fn(),
    getMyDonorProfileMock: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/donor-profile-dal", () => ({
  getMyDonorProfile: getMyDonorProfileMock,
}));

import { loadMemberDonorProfile } from "./member-donor-profile";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const DONOR_ID = "20000000-0000-4000-8000-000000000002";

describe("member donor profile request loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the request client and strict donor-profile DAL", async () => {
    const client = { rpc: vi.fn() };
    const result = {
      ok: true,
      profile: {
        displayName: "Alicia Clarke",
        email: "alicia@example.test",
        profileRevision: 2,
      },
    } as const;
    createServerSupabaseClientMock.mockResolvedValue(client);
    getMyDonorProfileMock.mockResolvedValue(result);

    await expect(
      loadMemberDonorProfile(CHURCH_ID, DONOR_ID),
    ).resolves.toEqual(result);
    expect(getMyDonorProfileMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      DONOR_ID,
    );
  });

  it("returns a generic unavailable result on client or DAL exceptions", async () => {
    createServerSupabaseClientMock.mockRejectedValue(
      new Error("private session failure"),
    );
    await expect(
      loadMemberDonorProfile(CHURCH_ID, DONOR_ID),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
