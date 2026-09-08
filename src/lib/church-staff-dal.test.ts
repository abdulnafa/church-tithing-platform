import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { getChurchStaff, mutateChurchStaff } from "./church-staff-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CHURCH_ID = "10000000-0000-4000-8000-000000000002";
const OWNER_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const STAFF_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000002";
const REVOKED_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000003";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";

const ownerRow = {
  membership_id: OWNER_MEMBERSHIP_ID,
  email: "owner@example.test",
  display_name: "Church Owner",
  role: "owner",
  status: "active",
  access_enabled: true,
  is_current_user: true,
  invited_at: "2026-09-01T10:00:00+00:00",
  accepted_at: "2026-09-01T10:05:00+00:00",
  revoked_at: null,
} as const;
const invitedRow = {
  membership_id: STAFF_MEMBERSHIP_ID,
  email: "team@example.test",
  display_name: null,
  role: "staff",
  status: "invited",
  access_enabled: false,
  is_current_user: false,
  invited_at: "2026-09-07T09:00:00Z",
  accepted_at: null,
  revoked_at: null,
} as const;
const revokedRow = {
  ...invitedRow,
  membership_id: REVOKED_MEMBERSHIP_ID,
  email: "former@example.test",
  display_name: "Former Staff",
  role: "accountant",
  status: "revoked",
  revoked_at: "2026-09-07T11:00:00+00:00",
} as const;
const secondOwnerRow = {
  ...ownerRow,
  membership_id: "20000000-0000-4000-8000-000000000004",
  email: "co-owner@example.test",
  display_name: "Co Owner",
  is_current_user: false,
} as const;
const snapshotRow = {
  church_id: CHURCH_ID,
  staff_revision: 4,
  staff: [ownerRow, invitedRow, revokedRow],
} as const;
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("church staff DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: snapshotRow, error: null });
  });

  it("maps the private roster without exposing user or inviter identifiers", async () => {
    await expect(getChurchStaff(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        staffRevision: 4,
        staff: [
          {
            membershipId: OWNER_MEMBERSHIP_ID,
            email: "owner@example.test",
            displayName: "Church Owner",
            role: "owner",
            status: "active",
            accessEnabled: true,
            isCurrent: true,
            invitedAt: "2026-09-01T10:00:00+00:00",
            acceptedAt: "2026-09-01T10:05:00+00:00",
            revokedAt: null,
          },
          {
            membershipId: STAFF_MEMBERSHIP_ID,
            email: "team@example.test",
            displayName: null,
            role: "staff",
            status: "invited",
            accessEnabled: false,
            isCurrent: false,
            invitedAt: "2026-09-07T09:00:00Z",
            acceptedAt: null,
            revokedAt: null,
          },
          {
            membershipId: REVOKED_MEMBERSHIP_ID,
            email: "former@example.test",
            displayName: "Former Staff",
            role: "accountant",
            status: "revoked",
            accessEnabled: false,
            isCurrent: false,
            invitedAt: "2026-09-07T09:00:00Z",
            acceptedAt: null,
            revokedAt: "2026-09-07T11:00:00+00:00",
          },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_staff", {
      target_church_id: CHURCH_ID,
    });
    expect(JSON.stringify(await getChurchStaff(client, CHURCH_ID))).not.toMatch(
      /user_id|invited_by/,
    );
  });

  it("accepts exactly one scalar-composite wrapper", async () => {
    rpc.mockResolvedValueOnce({ data: [snapshotRow], error: null });
    await expect(getChurchStaff(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
      snapshot: { staffRevision: 4 },
    });

    rpc.mockResolvedValueOnce({
      data: [snapshotRow, snapshotRow],
      error: null,
    });
    await expect(getChurchStaff(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("accepts more than one valid owner without weakening current-user checks", async () => {
    rpc.mockResolvedValueOnce({
      data: { ...snapshotRow, staff: [ownerRow, secondOwnerRow, invitedRow] },
      error: null,
    });
    const result = await getChurchStaff(client, CHURCH_ID);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.snapshot.staff.slice(0, 2).map(({ role }) => role)).toEqual([
        "owner",
        "owner",
      ]);
    }
  });

  it("maps read authorization and strips raw database errors", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "STAFF_FORBIDDEN" },
    });
    await expect(getChurchStaff(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private auth.users detail" },
    });
    const result = await getChurchStaff(client, CHURCH_ID);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("auth.users");
  });

  it.each([
    null,
    { ...snapshotRow, church_id: OTHER_CHURCH_ID },
    { ...snapshotRow, staff_revision: "4" },
    { ...snapshotRow, staff: null },
    { ...snapshotRow, staff: [] },
    { ...snapshotRow, staff: [ownerRow, ownerRow] },
    {
      ...snapshotRow,
      staff: [ownerRow, { ...invitedRow, email: ownerRow.email }],
    },
    { ...snapshotRow, staff: [{ ...ownerRow, email: "Owner@example.test" }] },
    { ...snapshotRow, staff: [{ ...ownerRow, display_name: "  Owner" }] },
    { ...snapshotRow, staff: [{ ...ownerRow, display_name: "A\u0000B" }] },
    { ...snapshotRow, staff: [{ ...ownerRow, role: "super_owner" }] },
    { ...snapshotRow, staff: [{ ...ownerRow, status: "pending" }] },
    { ...snapshotRow, staff: [{ ...ownerRow, access_enabled: "yes" }] },
    { ...snapshotRow, staff: [{ ...ownerRow, access_enabled: false }] },
    { ...snapshotRow, staff: [{ ...ownerRow, is_current_user: false }] },
    { ...snapshotRow, staff: [{ ...ownerRow, invited_at: "2026-09-07" }] },
    {
      ...snapshotRow,
      staff: [{ ...ownerRow, invited_at: "prefix-2026-09-07T10:00:00Z" }],
    },
    {
      ...snapshotRow,
      staff: [{ ...ownerRow, invited_at: "2026-09-07T10:00:00+0000" }],
    },
    {
      ...snapshotRow,
      staff: [ownerRow, { ...invitedRow, access_enabled: true }],
    },
  ])("fails malformed or inconsistent private roster data closed %#", async (data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(getChurchStaff(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("accepts a code-point-bounded canonical display name", async () => {
    const displayName = `A${"🙏".repeat(119)}`;
    rpc.mockResolvedValueOnce({
      data: {
        ...snapshotRow,
        staff: [{ ...ownerRow, display_name: displayName }],
      },
      error: null,
    });
    const result = await getChurchStaff(client, CHURCH_ID);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.snapshot.staff[0]?.displayName).toBe(displayName);
    }
  });

  it("accepts RFC3339 microseconds and colonized offsets from PostgREST", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ...snapshotRow,
        staff: [
          {
            ...ownerRow,
            accepted_at: "2026-09-01T06:05:00.123456-04:00",
          },
        ],
      },
      error: null,
    });
    await expect(getChurchStaff(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("calls invite with the exact privacy-preserving operation shape", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        membership_id: STAFF_MEMBERSHIP_ID,
        role: "accountant",
        status: "invited",
        staff_revision: 5,
        replayed: false,
      },
      error: null,
    });

    await expect(
      mutateChurchStaff(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "invite",
        membershipId: null,
        email: "team@example.test",
        role: "accountant",
      }),
    ).resolves.toEqual({
      ok: true,
      membershipId: STAFF_MEMBERSHIP_ID,
      role: "accountant",
      status: "invited",
      staffRevision: 5,
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith("mutate_church_staff", {
      staff_request_id: REQUEST_ID,
      target_church_id: CHURCH_ID,
      expected_staff_revision: 4,
      staff_operation: "invite",
      target_membership_id: null,
      staff_email: "team@example.test",
      staff_role: "accountant",
    });
  });

  it("validates change-role and removal result invariants", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        membership_id: STAFF_MEMBERSHIP_ID,
        role: "finance_admin",
        status: "active",
        staff_revision: 5,
        replayed: true,
      },
      error: null,
    });
    await expect(
      mutateChurchStaff(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "change_role",
        membershipId: STAFF_MEMBERSHIP_ID,
        email: null,
        role: "finance_admin",
      }),
    ).resolves.toMatchObject({
      ok: true,
      role: "finance_admin",
      status: "active",
      replayed: true,
    });

    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        membership_id: STAFF_MEMBERSHIP_ID,
        role: "finance_admin",
        status: "revoked",
        staff_revision: 5,
        replayed: false,
      },
      error: null,
    });
    await expect(
      mutateChurchStaff(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "remove",
        membershipId: STAFF_MEMBERSHIP_ID,
        email: null,
        role: null,
      }),
    ).resolves.toMatchObject({ ok: true, status: "revoked" });
  });

  it.each([
    ["STAFF_FORBIDDEN", "forbidden"],
    ["STAFF_INVALID_EMAIL", "invalid_request"],
    ["STAFF_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["STAFF_REVISION_CONFLICT", "revision_conflict"],
    ["STAFF_MEMBERSHIP_NOT_FOUND", "not_found"],
    ["STAFF_OWNER_PROTECTED", "owner_protected"],
    ["STAFF_SELF_PROTECTED", "self_protected"],
    ["STAFF_EMAIL_CONFLICT", "email_conflict"],
    ["STAFF_ALREADY_INVITED", "already_invited"],
    ["STAFF_ALREADY_REMOVED", "already_removed"],
    ["STAFF_MEMBERSHIP_NOT_MANAGEABLE", "not_manageable"],
    ["STAFF_NO_CHANGES", "no_changes"],
    ["private implementation detail", "unavailable"],
  ])("maps %s to a safe %s failure", async (message, reason) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } });
    await expect(
      mutateChurchStaff(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "invite",
        membershipId: null,
        email: "team@example.test",
        role: "staff",
      }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it.each([
    ["bad", CHURCH_ID, 4],
    [REQUEST_ID, "bad", 4],
    [REQUEST_ID, CHURCH_ID, -1],
  ])("rejects invalid request metadata before RPC %#", async (requestId, churchId, revision) => {
    await expect(
      mutateChurchStaff(client, requestId, churchId, revision, {
        operation: "invite",
        membershipId: null,
        email: "team@example.test",
        role: "staff",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails malformed success data closed", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        membership_id: STAFF_MEMBERSHIP_ID,
        role: "owner",
        status: "active",
        staff_revision: 5,
        replayed: false,
      },
      error: null,
    });
    await expect(
      mutateChurchStaff(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "invite",
        membershipId: null,
        email: "team@example.test",
        role: "staff",
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each(["suspended", "revoked"])(
    "rejects an impossible %s change-role success",
    async (status) => {
      rpc.mockResolvedValueOnce({
        data: {
          church_id: CHURCH_ID,
          membership_id: STAFF_MEMBERSHIP_ID,
          role: "accountant",
          status,
          staff_revision: 5,
          replayed: false,
        },
        error: null,
      });
      await expect(
        mutateChurchStaff(client, REQUEST_ID, CHURCH_ID, 4, {
          operation: "change_role",
          membershipId: STAFF_MEMBERSHIP_ID,
          email: null,
          role: "accountant",
        }),
      ).resolves.toEqual({ ok: false, reason: "unavailable" });
    },
  );
});
