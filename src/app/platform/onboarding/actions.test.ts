import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  provisionChurchMock,
  requirePlatformSuperAdminMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  provisionChurchMock: vi.fn(),
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
vi.mock("@/lib/platform/church-provisioning-dal", () => ({
  provisionChurch: provisionChurchMock,
}));

import { createInitialChurchProvisioningState } from "@/lib/platform/church-provisioning";

import { provisionChurchAction } from "./actions";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const CHURCH_ID = "10000000-0000-4000-8000-000000000811";
const client = { rpc: vi.fn() };
const DEFAULTS = {
  currency: "BBD",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: "#E1B85A",
} as const;

function validForm(overrides: Record<string, string | boolean> = {}) {
  const values: Record<string, string | boolean> = {
    requestId: REQUEST_ID,
    displayName: " Harbour   Grace Church ",
    legalName: " Harbour Grace Church Inc. ",
    ownerEmail: " OWNER@Example.Test ",
    supportEmail: " OFFICE@Example.Test ",
    slug: "harbour-grace",
    currency: "bbd",
    timezone: "America/Barbados",
    primaryColor: "#1f6d60",
    secondaryColor: "#e1b85a",
    thankYouMessage: " Thank you for giving. ",
    acknowledgement: true,
    ...overrides,
  };
  const data = new FormData();

  Object.entries(values).forEach(([name, value]) => {
    if (value === true) data.set(name, "on");
    if (typeof value === "string") data.set(name, value);
  });

  return data;
}

function initialState() {
  return createInitialChurchProvisioningState(REQUEST_ID, DEFAULTS);
}

const success = {
  ok: true,
  church: {
    churchId: CHURCH_ID,
    displayName: "Harbour Grace Church",
    slug: "harbour-grace",
    status: "onboarding",
    ownerMembershipStatus: "invited",
    qrShortCode: "hgc7v2q9mx4",
    replayed: false,
  },
} as const;

describe("Super Admin church provisioning Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSuperAdminMock.mockResolvedValue({
      identity: { userId: "10000000-0000-4000-8000-000000000899" },
      workspace: { kind: "platform", key: "platform" },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    provisionChurchMock.mockResolvedValue(success);
  });

  it("re-authorizes before inspecting even an invalid submission", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requirePlatformSuperAdminMock.mockRejectedValue(stop);

    await expect(
      provisionChurchAction(initialState(), new FormData()),
    ).rejects.toBe(stop);
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(provisionChurchMock).not.toHaveBeenCalled();
  });

  it("validates after authorization and before creating a database client", async () => {
    const result = await provisionChurchAction(initialState(), validForm({ slug: "Bad Slug" }));

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.slug).toBeDefined();
    expect(requirePlatformSuperAdminMock).toHaveBeenCalledOnce();
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(provisionChurchMock).not.toHaveBeenCalled();
  });

  it("passes normalized allowlisted values to the user-scoped DAL", async () => {
    const result = await provisionChurchAction(initialState(), validForm());

    expect(provisionChurchMock).toHaveBeenCalledWith(client, REQUEST_ID, {
      displayName: "Harbour Grace Church",
      legalName: "Harbour Grace Church Inc.",
      ownerEmail: "owner@example.test",
      supportEmail: "office@example.test",
      slug: "harbour-grace",
      currency: "BBD",
      timezone: "America/Barbados",
      primaryColor: "#1F6D60",
      secondaryColor: "#E1B85A",
      thankYouMessage: "Thank you for giving.",
    });
    expect(requirePlatformSuperAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      createServerSupabaseClientMock.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      status: "success",
      requestId: REQUEST_ID,
      result: success.church,
    });
    expect(revalidatePathMock).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith("/platform");
  });

  it("uses the same request reference for an ambiguous retry", async () => {
    provisionChurchMock
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        church: { ...success.church, replayed: true },
      });

    const first = await provisionChurchAction(initialState(), validForm());
    expect(first.status).toBe("error");
    expect(first.requestId).toBe(REQUEST_ID);
    expect(revalidatePathMock).not.toHaveBeenCalled();

    const second = await provisionChurchAction(first, validForm());
    expect(second.status).toBe("success");
    expect(second.requestId).toBe(REQUEST_ID);
    expect(provisionChurchMock).toHaveBeenNthCalledWith(
      1,
      client,
      REQUEST_ID,
      expect.any(Object),
    );
    expect(provisionChurchMock).toHaveBeenNthCalledWith(
      2,
      client,
      REQUEST_ID,
      expect.any(Object),
    );
    expect(second.message).toContain("without creating a duplicate");
  });

  it.each([
    ["slug_unavailable", "subdomain slug"],
    ["owner_profile_inactive", "inactive account"],
    ["idempotency_conflict", "different details"],
    ["tenant_records_incomplete", "Tithes fund and QR record"],
    ["forbidden", "access could not be verified"],
  ] as const)("maps %s to a safe message", async (reason, expectedText) => {
    provisionChurchMock.mockResolvedValue({ ok: false, reason });

    const result = await provisionChurchAction(initialState(), validForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain(expectedText);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not expose a thrown raw database error or revalidate", async () => {
    provisionChurchMock.mockRejectedValue(
      new Error("secret relation and submitted owner email"),
    );

    const result = await provisionChurchAction(initialState(), validForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("could not be confirmed");
    expect(JSON.stringify(result)).not.toContain("secret relation");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a missing request reference without reaching Supabase", async () => {
    const state = createInitialChurchProvisioningState("not-valid", DEFAULTS);
    const result = await provisionChurchAction(
      state,
      validForm({ requestId: "also-invalid" }),
    );

    expect(result.message).toContain("setup reference is invalid");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});
