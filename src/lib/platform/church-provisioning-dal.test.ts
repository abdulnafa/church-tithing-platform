import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { provisionChurch } from "./church-provisioning-dal";
import type { ChurchProvisioningInput } from "./church-provisioning";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const CHURCH_ID = "10000000-0000-4000-8000-000000000811";
const MEMBERSHIP_ID = "10000000-0000-4000-8000-000000000812";
const FUND_ID = "10000000-0000-4000-8000-000000000813";

const input: ChurchProvisioningInput = {
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
};

const successfulRow = {
  church_id: CHURCH_ID,
  church_slug: "harbour-grace",
  owner_membership_id: MEMBERSHIP_ID,
  owner_membership_status: "invited",
  default_fund_id: FUND_ID,
  qr_short_code: "hgc7v2q9mx4",
  replayed: false,
} as const;

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("church provisioning database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [successfulRow], error: null });
  });

  it("calls the exact authenticated RPC contract and returns a minimal UI DTO", async () => {
    await expect(provisionChurch(client, REQUEST_ID, input)).resolves.toEqual({
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
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("provision_church", {
      provisioning_request_id: REQUEST_ID,
      church_display_name: "Harbour Grace Church",
      church_legal_name: "Harbour Grace Church Inc.",
      church_slug: "harbour-grace",
      owner_email: "owner@example.test",
      church_support_email: "office@example.test",
      church_currency: "BBD",
      church_timezone: "America/Barbados",
      church_primary_color: "#1F6D60",
      church_secondary_color: "#E1B85A",
      church_thank_you_message: "Thank you for giving.",
    });
  });

  it("accepts a direct named-composite row from PostgREST", async () => {
    rpc.mockResolvedValue({ data: successfulRow, error: null });

    await expect(provisionChurch(client, REQUEST_ID, input)).resolves.toMatchObject({
      ok: true,
      church: {
        churchId: CHURCH_ID,
        slug: "harbour-grace",
        ownerMembershipStatus: "invited",
      },
    });
  });

  it("omits the optional thank-you argument when the canonical value is null", async () => {
    await provisionChurch(client, REQUEST_ID, {
      ...input,
      thankYouMessage: null,
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty(
      "church_thank_you_message",
    );
  });

  it.each([
    ["PROVISION_FORBIDDEN", "forbidden"],
    ["PROVISION_OWNER_PROFILE_INACTIVE", "owner_profile_inactive"],
    ["PROVISION_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["PROVISION_SLUG_UNAVAILABLE", "slug_unavailable"],
    ["PROVISION_INTERNAL_CHILD_RECORDS", "tenant_records_incomplete"],
    ["PROVISION_INVALID_CHURCH_NAME", "invalid_request"],
    ["PROVISION_INVALID_SUPPORT_EMAIL", "invalid_request"],
  ] as const)("maps allowlisted error %s to %s", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });

    await expect(provisionChurch(client, REQUEST_ID, input)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("does not return an unknown raw database error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "relation secret_table exposed internal details" },
    });

    const result = await provisionChurch(client, REQUEST_ID, input);

    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret_table");
  });

  it("returns unavailable when the request throws", async () => {
    rpc.mockRejectedValue(new Error("network token details"));

    await expect(provisionChurch(client, REQUEST_ID, input)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it.each([
    null,
    [],
    [{ ...successfulRow, owner_membership_status: "revoked" }],
    [{ ...successfulRow, qr_short_code: "bad code" }],
    [{ ...successfulRow, qr_short_code: "ABC7V2Q9" }],
    [{ ...successfulRow, qr_short_code: "abc1234" }],
    [{ ...successfulRow, qr_short_code: `a${"b".repeat(64)}` }],
    [{ ...successfulRow, church_slug: "Harbour-Grace" }],
    [{ ...successfulRow, church_slug: "harbour--grace" }],
    [{ ...successfulRow, church_slug: "another-church" }],
    [successfulRow, successfulRow],
  ])("fails closed for malformed successful payload %#", async (data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(provisionChurch(client, REQUEST_ID, input)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
