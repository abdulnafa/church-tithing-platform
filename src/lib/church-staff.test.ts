import { describe, expect, it } from "vitest";

import {
  churchStaffValuesEqual,
  createInitialChurchStaffActionState,
  getChurchStaffRoleLabel,
  getChurchStaffStatusLabel,
  isCanonicalChurchStaffEmail,
  isChurchStaffMembershipId,
  isChurchStaffRequestId,
  isManagedChurchStaffRole,
  normalizeChurchStaffEmail,
  parseStaffRevision,
  validateChurchStaffForm,
  type ChurchStaffMember,
} from "./church-staff";

const MEMBERSHIP_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("church staff model", () => {
  it("normalizes and validates a conservative staff email address", () => {
    expect(normalizeChurchStaffEmail("  TEAM.Member@Example.Test  ")).toBe(
      "team.member@example.test",
    );
    expect(isCanonicalChurchStaffEmail("team.member@example.test")).toBe(true);
    expect(isCanonicalChurchStaffEmail("Team.Member@example.test")).toBe(false);
    expect(isCanonicalChurchStaffEmail("team..member@example.test")).toBe(
      false,
    );
    expect(isCanonicalChurchStaffEmail("member@localhost")).toBe(false);
    expect(isCanonicalChurchStaffEmail(`a${"b".repeat(64)}@example.test`)).toBe(
      false,
    );
    expect(
      normalizeChurchStaffEmail("\u00a0TEAM.Member@Example.Test\ufeff"),
    ).toBe("team.member@example.test");
  });

  it("accepts only managed non-owner roles", () => {
    expect(isManagedChurchStaffRole("finance_admin")).toBe(true);
    expect(isManagedChurchStaffRole("accountant")).toBe(true);
    expect(isManagedChurchStaffRole("staff")).toBe(true);
    expect(isManagedChurchStaffRole("owner")).toBe(false);
    expect(getChurchStaffRoleLabel("finance_admin")).toBe("Finance admin");
    expect(getChurchStaffStatusLabel("invited")).toBe("Invite recorded");
  });

  it("recognizes membership and v4 request identifiers separately", () => {
    expect(isChurchStaffMembershipId(MEMBERSHIP_ID)).toBe(true);
    expect(isChurchStaffRequestId(REQUEST_ID)).toBe(true);
    expect(
      isChurchStaffRequestId("a0000000-0000-3000-8000-000000000001"),
    ).toBe(false);
    expect(isChurchStaffMembershipId("not-an-id")).toBe(false);
  });

  it("parses only canonical safe revisions", () => {
    expect(parseStaffRevision("0")).toBe(0);
    expect(parseStaffRevision("42")).toBe(42);
    expect(parseStaffRevision("01")).toBeNull();
    expect(parseStaffRevision("-1")).toBeNull();
    expect(parseStaffRevision("9007199254740992")).toBeNull();
    expect(parseStaffRevision(4)).toBeNull();
  });

  it("creates minimal operation-specific initial state", () => {
    const member: ChurchStaffMember = {
      membershipId: MEMBERSHIP_ID,
      email: "team@example.test",
      displayName: "Team Member",
      role: "accountant",
      status: "active",
      accessEnabled: true,
      invitedAt: "2026-09-07T10:00:00.000Z",
      acceptedAt: "2026-09-07T10:10:00.000Z",
      revokedAt: null,
      isCurrent: false,
    };

    expect(
      createInitialChurchStaffActionState(REQUEST_ID, 3, "invite"),
    ).toMatchObject({
      membershipId: null,
      values: { email: "", role: "staff" },
      retryRequired: false,
    });
    expect(
      createInitialChurchStaffActionState(
        REQUEST_ID,
        3,
        "change_role",
        member,
      ),
    ).toMatchObject({
      membershipId: MEMBERSHIP_ID,
      values: { email: "", role: "accountant" },
    });
    expect(
      createInitialChurchStaffActionState(REQUEST_ID, 3, "remove", member),
    ).toMatchObject({
      membershipId: MEMBERSHIP_ID,
      values: { email: "", role: "" },
    });
  });

  it("validates and canonicalizes an invitation without accepting owner", () => {
    expect(
      validateChurchStaffForm(
        form({ email: " TEAM@Example.Test ", role: "accountant" }),
        "invite",
        null,
      ),
    ).toEqual({
      success: true,
      input: {
        operation: "invite",
        membershipId: null,
        email: "team@example.test",
        role: "accountant",
      },
      values: { email: "team@example.test", role: "accountant" },
    });

    const invalid = validateChurchStaffForm(
      form({ email: "bad", role: "owner" }),
      "invite",
      null,
    );
    expect(invalid).toMatchObject({
      success: false,
      fieldErrors: { email: expect.any(String), role: expect.any(String) },
    });
  });

  it("validates role change and removal with a server-bound membership id", () => {
    expect(
      validateChurchStaffForm(
        form({
          role: "finance_admin",
          email: "client-override@example.test",
          membershipId: "20000000-0000-4000-8000-000000000002",
        }),
        "change_role",
        MEMBERSHIP_ID,
      ),
    ).toEqual({
      success: true,
      input: {
        operation: "change_role",
        membershipId: MEMBERSHIP_ID,
        email: null,
        role: "finance_admin",
      },
      values: { email: "", role: "finance_admin" },
    });

    expect(
      validateChurchStaffForm(
        form({ email: "ignored@example.test", role: "owner" }),
        "remove",
        MEMBERSHIP_ID,
      ),
    ).toEqual({
      success: true,
      input: {
        operation: "remove",
        membershipId: MEMBERSHIP_ID,
        email: null,
        role: null,
      },
      values: { email: "", role: "" },
    });
  });

  it("fails lifecycle validation before accepting a missing membership id", () => {
    expect(
      validateChurchStaffForm(form({ role: "staff" }), "change_role", null),
    ).toEqual({
      success: false,
      values: { email: "", role: "" },
      fieldErrors: {},
    });
  });

  it("compares exactly the canonical fields used for replay", () => {
    expect(
      churchStaffValuesEqual(
        { email: "team@example.test", role: "staff" },
        { email: "team@example.test", role: "staff" },
      ),
    ).toBe(true);
    expect(
      churchStaffValuesEqual(
        { email: "team@example.test", role: "staff" },
        { email: "team@example.test", role: "accountant" },
      ),
    ).toBe(false);
  });
});
