import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  mutateChurchStaffMock,
  requireChurchPermissionMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  mutateChurchStaffMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/church-staff-dal", () => ({
  mutateChurchStaff: mutateChurchStaffMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  changeChurchStaffRoleAction,
  inviteChurchStaffAction,
  removeChurchStaffAction,
} from "./staff-actions";
import {
  createInitialChurchStaffActionState,
  type ChurchStaffAction,
  type ChurchStaffMember,
} from "@/lib/church-staff";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };
const member: ChurchStaffMember = {
  membershipId: MEMBERSHIP_ID,
  email: "team@example.test",
  displayName: "Team Member",
  role: "staff",
  status: "active",
  accessEnabled: true,
  invitedAt: "2026-09-07T09:00:00Z",
  acceptedAt: "2026-09-07T09:05:00Z",
  revokedAt: null,
  isCurrent: false,
};

function state(operation: ChurchStaffAction) {
  return createInitialChurchStaffActionState(
    REQUEST_ID,
    4,
    operation,
    operation === "invite" ? null : member,
  );
}

function form(
  values: Record<string, string> = {},
  requestId = REQUEST_ID,
  revision = "4",
) {
  const data = new FormData();
  data.set("requestId", requestId);
  data.set("expectedStaffRevision", revision);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const inviteValues = {
  email: "team@example.test",
  role: "accountant",
};

const operations = [
  ["invite", inviteChurchStaffAction],
  ["change_role", changeChurchStaffRoleAction],
  ["remove", removeChurchStaffAction],
] as const;

describe("church staff Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: { kind: "church", churchId: CHURCH_ID },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    mutateChurchStaffMock.mockResolvedValue({
      ok: true,
      membershipId: MEMBERSHIP_ID,
      role: "accountant",
      status: "invited",
      staffRevision: 5,
      replayed: false,
    });
  });

  it.each(operations)(
    "independently guards %s before parsing or client creation",
    async (operation, action) => {
      const denied = new Error("NEXT_REDIRECT");
      requireChurchPermissionMock.mockRejectedValueOnce(denied);

      await expect(action(state(operation), new FormData())).rejects.toBe(
        denied,
      );
      expect(requireChurchPermissionMock).toHaveBeenCalledWith("staff_manage");
      expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
      expect(mutateChurchStaffMock).not.toHaveBeenCalled();
    },
  );

  it("sends only canonical invite fields and guarded tenant identity", async () => {
    const result = await inviteChurchStaffAction(
      state("invite"),
      form({
        email: " TEAM@Example.Test ",
        role: "accountant",
        churchId: "90000000-0000-4000-8000-000000000009",
        membershipId: "90000000-0000-4000-8000-000000000008",
      }),
    );

    expect(mutateChurchStaffMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      {
        operation: "invite",
        membershipId: null,
        email: "team@example.test",
        role: "accountant",
      },
    );
    expect(result).toMatchObject({
      status: "success",
      staffRevision: 5,
      retryRequired: false,
    });
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(result.message).toContain("pending accountant invitation");
    expect(result.message).toContain("No email was sent");
    expect(result.message).toContain("did not create an account");
    expect(result.message).toContain("transactional email");
    expect(result.message).not.toMatch(/existing|verified account|immediate/i);
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/members");
  });

  it("returns accessible field errors without creating a client", async () => {
    const result = await inviteChurchStaffAction(
      state("invite"),
      form({ email: "bad", role: "owner" }),
    );

    expect(result).toMatchObject({
      status: "error",
      retryRequired: false,
      fieldErrors: {
        email: expect.any(String),
        role: expect.any(String),
      },
    });
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("locks canonical invitation content after ambiguity", async () => {
    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await inviteChurchStaffAction(
      state("invite"),
      form(inviteValues),
    );
    expect(uncertain).toMatchObject({
      status: "error",
      requestId: REQUEST_ID,
      staffRevision: 4,
      retryRequired: true,
      values: inviteValues,
    });

    const changed = await inviteChurchStaffAction(
      uncertain,
      form({ ...inviteValues, role: "staff" }),
    );
    expect(changed).toMatchObject({
      retryRequired: true,
      values: inviteValues,
    });
    expect(mutateChurchStaffMock).toHaveBeenCalledTimes(1);

    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: true,
      membershipId: MEMBERSHIP_ID,
      role: "accountant",
      status: "invited",
      staffRevision: 5,
      replayed: true,
    });
    const recovered = await inviteChurchStaffAction(
      changed,
      form(inviteValues),
    );
    expect(recovered).toMatchObject({
      status: "success",
      retryRequired: false,
      staffRevision: 5,
    });
    expect(recovered.message).toContain("recovered");
    expect(mutateChurchStaffMock).toHaveBeenCalledTimes(2);
  });

  it("treats an unexpected adapter throw as ambiguous", async () => {
    mutateChurchStaffMock.mockRejectedValueOnce(new Error("socket closed"));
    const result = await changeChurchStaffRoleAction(
      state("change_role"),
      form({ role: "finance_admin" }),
    );
    expect(result).toMatchObject({
      status: "error",
      requestId: REQUEST_ID,
      staffRevision: 4,
      retryRequired: true,
      values: { email: "", role: "finance_admin" },
    });
  });

  it("rotates a confirmed failure and clears the retry lock", async () => {
    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await inviteChurchStaffAction(
      state("invite"),
      form(inviteValues),
    );

    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: false,
      reason: "revision_conflict",
    });
    const confirmed = await inviteChurchStaffAction(
      uncertain,
      form(inviteValues),
    );
    expect(confirmed).toMatchObject({
      status: "error",
      retryRequired: false,
    });
    expect(confirmed.requestId).not.toBe(REQUEST_ID);
    expect(confirmed).not.toHaveProperty("fieldErrors");
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/members");
  });

  it("discards injected lifecycle fields for an exact removal replay", async () => {
    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await removeChurchStaffAction(
      state("remove"),
      form({
        email: "injected@example.test",
        role: "owner",
        membershipId: "90000000-0000-4000-8000-000000000009",
      }),
    );
    expect(uncertain.values).toEqual({ email: "", role: "" });

    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: true,
      membershipId: MEMBERSHIP_ID,
      role: "staff",
      status: "revoked",
      staffRevision: 5,
      replayed: true,
    });
    const recovered = await removeChurchStaffAction(
      uncertain,
      form({ email: "different@example.test", role: "finance_admin" }),
    );
    expect(recovered.status).toBe("success");
    expect(mutateChurchStaffMock).toHaveBeenLastCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      {
        operation: "remove",
        membershipId: MEMBERSHIP_ID,
        email: null,
        role: null,
      },
    );
  });

  it.each([
    ["email_conflict", "email"],
    ["already_invited", "email"],
    ["self_protected", "email"],
  ] as const)("maps invite %s to the visible %s field", async (reason, field) => {
    mutateChurchStaffMock.mockResolvedValueOnce({ ok: false, reason });
    const result = await inviteChurchStaffAction(
      state("invite"),
      form(inviteValues),
    );
    expect(result.status).toBe("error");
    expect(result.fieldErrors).toHaveProperty(field);
    expect(result.requestId).not.toBe(REQUEST_ID);
  });

  it("maps a no-op role change to its visible role field", async () => {
    mutateChurchStaffMock.mockResolvedValueOnce({
      ok: false,
      reason: "no_changes",
    });
    const result = await changeChurchStaffRoleAction(
      state("change_role"),
      form({ role: "staff" }),
    );
    expect(result.fieldErrors).toHaveProperty("role");
  });

  it("rejects altered request identity or revision before validation", async () => {
    await inviteChurchStaffAction(
      state("invite"),
      form(
        inviteValues,
        "b0000000-0000-4000-8000-000000000002",
        "5",
      ),
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(mutateChurchStaffMock).not.toHaveBeenCalled();
  });
});
