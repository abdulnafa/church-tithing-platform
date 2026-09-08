import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("@/app/church/members/staff-actions", () => ({
  changeChurchStaffRoleAction: vi.fn(),
  inviteChurchStaffAction: vi.fn(),
  removeChurchStaffAction: vi.fn(),
}));

import {
  ChurchStaffManager,
  type ChurchStaffManagerRequestIds,
  type ChurchStaffManagerSnapshot,
} from "./church-staff-manager";
import type {
  ChurchStaffActionState,
  ChurchStaffMember,
} from "@/lib/church-staff";

const ids = [1, 2, 3, 4, 5, 6].map(
  (index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
);

function member(
  index: number,
  overrides: Partial<ChurchStaffMember>,
): ChurchStaffMember {
  return {
    membershipId: ids[index],
    email: `person-${index}@example.test`,
    displayName: `Person ${index}`,
    role: "staff",
    status: "active",
    accessEnabled: true,
    isCurrent: false,
    invitedAt: "2026-09-01T10:00:00+00:00",
    acceptedAt: "2026-09-01T10:05:00+00:00",
    revokedAt: null,
    ...overrides,
  };
}

const snapshot: ChurchStaffManagerSnapshot = {
  staffRevision: 8,
  staff: [
    member(0, {
      email: "owner@example.test",
      displayName: "Church Owner",
      role: "owner",
      isCurrent: true,
    }),
    member(1, {
      email: "finance@example.test",
      displayName: "Finance Admin",
      role: "finance_admin",
    }),
    member(2, {
      email: "pending@example.test",
      displayName: null,
      status: "invited",
      accessEnabled: false,
      acceptedAt: null,
    }),
    member(3, {
      email: "suspended@example.test",
      displayName: "Suspended Staff",
      status: "suspended",
      accessEnabled: false,
    }),
    member(4, {
      email: "former@example.test",
      displayName: "Former Accountant",
      role: "accountant",
      status: "revoked",
      accessEnabled: false,
      revokedAt: "2026-09-06T12:00:00+00:00",
    }),
    member(5, {
      email: "disabled@example.test",
      displayName: "Disabled Profile",
      status: "active",
      accessEnabled: false,
    }),
  ],
};

function uuid(index: number) {
  return `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const requestIds: ChurchStaffManagerRequestIds = {
  invite: uuid(1),
  staff: snapshot.staff.map((staffMember, index) => ({
    membershipId: staffMember.membershipId,
    changeRole:
      staffMember.status === "active" || staffMember.status === "invited"
        ? uuid(index * 2 + 2)
        : null,
    remove: uuid(index * 2 + 3),
  })),
};

function renderManager(
  managerSnapshot: ChurchStaffManagerSnapshot = snapshot,
) {
  return renderToStaticMarkup(
    <ChurchStaffManager requestIds={requestIds} snapshot={managerSnapshot} />,
  );
}

describe("church staff manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action, initialState: ChurchStaffActionState) => [
        initialState,
        "/church/members",
        false,
      ],
    );
  });

  it("renders persisted roster summary and distinguishes effective access", () => {
    const markup = renderManager();
    expect(markup).toContain('data-staff-revision="8"');
    expect(markup).toContain("Access enabled");
    expect(markup).toContain(">2<");
    expect(markup).toContain("Invites recorded");
    expect(markup).toContain("Removed records");
    expect(markup).toContain("Disabled Profile");
    expect(markup).toContain("Active membership");
    expect(markup).toContain("Access unavailable");
    expect(markup).toContain("Suspended membership");
    expect(markup).toContain("Access pending");
    expect(markup).toContain("Access removed");
  });

  it("states the invitation limitation without account-existence disclosure", () => {
    const markup = renderManager();
    expect(markup).toContain("This saves a pending invitation only");
    expect(markup).toContain("No email is sent");
    expect(markup).toContain("no account is created");
    expect(markup).toContain("access is not activated");
    expect(markup).toContain("transactional email");
    expect(markup).toContain("Invitation recorded only");
    expect(markup).not.toMatch(/existing account|verified account|immediate access/i);
  });

  it("offers only managed roles and no owner-transfer input", () => {
    const markup = renderManager();
    expect(markup).toContain('value="finance_admin"');
    expect(markup).toContain('value="accountant"');
    expect(markup).toContain('value="staff"');
    expect(markup).not.toContain('value="owner"');
    expect(markup).toContain("Ownership cannot be transferred here");
  });

  it("keeps owner, self, and removed records non-actionable", () => {
    const markup = renderManager();
    expect(markup).toContain("The owner membership is visible");
    expect(markup).toContain("Owner transfer is not available");
    expect(markup).not.toContain(
      `aria-label="Review role change for owner@example.test"`,
    );
    expect(markup).not.toContain(
      `aria-label="Review access removal for owner@example.test"`,
    );
    expect(markup).not.toContain(
      `aria-label="Review role change for former@example.test"`,
    );
    expect(markup).not.toContain(
      `aria-label="Review access removal for former@example.test"`,
    );
  });

  it("shows guarded role and removal controls only for manageable records", () => {
    const markup = renderManager();
    expect(markup).toContain(
      `aria-label="Review role change for finance@example.test"`,
    );
    expect(markup).toContain(
      `aria-label="Review access removal for finance@example.test"`,
    );
    expect(markup).toContain(
      `aria-label="Review role change for pending@example.test"`,
    );
    expect(markup).not.toContain(
      `aria-label="Review role change for suspended@example.test"`,
    );
    expect(markup).toContain(
      `aria-label="Review access removal for suspended@example.test"`,
    );
    expect(markup).toContain("does not delete an account or past records");
  });

  it("renders timestamps in deterministic UTC labels", () => {
    const markup = renderManager();
    expect(markup).toContain("2026-09-01 UTC");
    expect(markup).toContain("2026-09-06 UTC");
    expect(markup).toContain("Not recorded");
  });

  it("converts offset timestamps before labelling the calendar date UTC", () => {
    const markup = renderManager({
      staffRevision: 1,
      staff: [
        member(0, {
          invitedAt: "2026-09-01T23:30:00-04:00",
          acceptedAt: "2026-09-02T00:00:00-04:00",
        }),
      ],
    });
    expect(markup).toContain("2026-09-02 UTC");
    expect(markup).not.toContain("2026-09-01 UTC");
  });

  it("supports a defensive empty state while leaving invitation controls usable", () => {
    const markup = renderManager({ staffRevision: 0, staff: [] });
    expect(markup).toContain('data-staff-revision="0"');
    expect(markup).toContain("No current or pending staff memberships");
    expect(markup).toContain("No removed staff records");
    expect(markup).toContain("Record a staff invitation");
  });

  it("restores canonical invitation values and exact-retry guidance", () => {
    useActionStateMock.mockImplementation(
      (_action, initialState: ChurchStaffActionState) => [
        initialState.operation === "invite"
          ? {
              ...initialState,
              status: "error",
              message: "The request could not be confirmed.",
              responseEpoch: 2,
              retryRequired: true,
              values: {
                email: "pending.team@example.test",
                role: "accountant",
              },
            }
          : initialState,
        "/church/members",
        false,
      ],
    );
    const markup = renderManager();
    expect(markup).toContain("This request is unconfirmed");
    expect(markup).toContain("Do not change these details or reload");
    expect(markup).toContain("Retry same request");
    expect(markup).toContain('value="pending.team@example.test"');
    expect(markup).toMatch(/option value="accountant" selected=""/);
  });

  it("uses accessible live feedback, unique controls, and fluid wrapping", () => {
    useActionStateMock.mockImplementation(
      (_action, initialState: ChurchStaffActionState) => [
        initialState.operation === "invite"
          ? {
              ...initialState,
              status: "error",
              message: "Check the email.",
              fieldErrors: { email: "Enter a valid staff email address." },
            }
          : initialState,
        "/church/members",
        false,
      ],
    );
    const markup = renderManager();
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="new-staff-email-help new-staff-email-error"');

    const roleIds = [...markup.matchAll(/id="(staff-role-[^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(roleIds).size).toBe(roleIds.length);

    const source = readFileSync(
      new URL("./church-staff-manager.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-w-0");
    expect(source).toContain("w-full");
    expect(source).toContain("[overflow-wrap:anywhere]");
    expect(source).not.toContain("userId");
    expect(source).not.toContain("invitedBy");
  });
});
