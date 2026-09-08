import { describe, expect, it } from "vitest";

import type { ActiveIdentity } from "./identity-types";
import {
  buildWorkspaces,
  createShellIdentity,
  createShellWorkspace,
  createWorkspaceKey,
  createWorkspaceSelectionHref,
  getWorkspaceForKind,
  parseWorkspaceKey,
  resolvePostAuthDestination,
} from "./workspaces";

const CHURCH_A = "10000000-0000-4000-8000-000000000001";
const CHURCH_B = "20000000-0000-4000-8000-000000000001";
const DONOR_A = "30000000-0000-4000-8000-000000000001";
const DONOR_B = "30000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "40000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "40000000-0000-4000-8000-000000000002";

const churchA = {
  id: CHURCH_A,
  name: "Harbour Grace Church",
  slug: "harbour-grace",
  status: "active" as const,
};

const churchB = {
  id: CHURCH_B,
  name: "New Life Fellowship",
  slug: "new-life",
  status: "onboarding" as const,
};

function activeIdentity(
  workspaces: ActiveIdentity["workspaces"],
): ActiveIdentity {
  return {
    state: "active",
    userId: "50000000-0000-4000-8000-000000000001",
    displayName: "  Miriam   Jordan  ",
    workspaces,
  };
}

describe("workspace construction", () => {
  it("constructs only status-eligible member, church, and platform workspaces", () => {
    const workspaces = buildWorkspaces({
      donors: [
        { id: DONOR_A, church_id: CHURCH_A },
        { id: DONOR_B, church_id: CHURCH_B },
      ],
      memberships: [
        { id: MEMBERSHIP_A, church_id: CHURCH_A, role: "owner" },
        { id: MEMBERSHIP_B, church_id: CHURCH_B, role: "accountant" },
      ],
      donorChurches: [churchA, churchB],
      memberChurches: [churchA, churchB],
      permissionsByChurch: {
        [CHURCH_A]: ["workspace_read", "settings_manage"],
        [CHURCH_B]: ["workspace_read", "reports_read"],
      },
      isPlatformSuperAdmin: true,
    });

    expect(workspaces.map(({ key }) => key)).toEqual([
      `member:${CHURCH_A}`,
      `church:${CHURCH_A}`,
      `church:${CHURCH_B}`,
      "platform",
    ]);
    expect(workspaces[1]).toMatchObject({
      role: "owner",
      roleLabel: "Church Owner",
      churchStatus: "active",
      permissions: ["workspace_read", "settings_manage"],
    });
    expect(workspaces[2]).toMatchObject({
      role: "accountant",
      roleLabel: "Accountant",
      churchStatus: "onboarding",
      permissions: ["workspace_read", "reports_read"],
    });
  });

  it.each(["suspended", "canceled", "archived"] as const)(
    "does not construct a church workspace for a %s church",
    (status) => {
      const workspaces = buildWorkspaces({
        donors: [],
        memberships: [
          { id: MEMBERSHIP_A, church_id: CHURCH_A, role: "staff" },
        ],
        donorChurches: [],
        memberChurches: [{ ...churchA, status }],
        isPlatformSuperAdmin: false,
      });

      expect(workspaces).toEqual([]);
    },
  );

  it("does not use a non-active church returned to the donor enrichment layer", () => {
    const workspaces = buildWorkspaces({
      donors: [{ id: DONOR_A, church_id: CHURCH_A }],
      memberships: [],
      donorChurches: [{ ...churchA, status: "suspended" }],
      memberChurches: [],
      isPlatformSuperAdmin: false,
    });

    expect(workspaces).toEqual([]);
  });

  it("maps all church roles to an explicit display label", () => {
    const roles = ["owner", "finance_admin", "staff", "accountant"] as const;
    const expected = [
      "Church Owner",
      "Finance Admin",
      "Church Staff",
      "Accountant",
    ];

    roles.forEach((role, index) => {
      const workspaces = buildWorkspaces({
        donors: [],
        memberships: [{ id: MEMBERSHIP_A, church_id: CHURCH_A, role }],
        donorChurches: [],
        memberChurches: [churchA],
        isPlatformSuperAdmin: false,
      });

      expect(workspaces[0]?.roleLabel).toBe(expected[index]);
    });
  });
});

describe("workspace keys", () => {
  it("normalizes valid typed church keys", () => {
    expect(createWorkspaceKey("church", CHURCH_A.toUpperCase())).toBe(
      `church:${CHURCH_A}`,
    );
    expect(parseWorkspaceKey(`member:${CHURCH_A.toUpperCase()}`)).toEqual({
      kind: "member",
      churchId: CHURCH_A,
    });
    expect(parseWorkspaceKey("platform")).toEqual({
      kind: "platform",
      churchId: null,
    });
  });

  it.each([
    "",
    "church",
    "platform:anything",
    `owner:${CHURCH_A}`,
    `church:${CHURCH_A}:extra`,
    "church:not-a-uuid",
  ])("rejects invalid or unrecognized key %s", (key) => {
    expect(parseWorkspaceKey(key)).toBeNull();
  });

  it("refuses to construct a key from a malformed identifier", () => {
    expect(() => createWorkspaceKey("church", "not-a-uuid")).toThrow(
      "valid church identifier",
    );
  });
});

describe("workspace authorization decisions", () => {
  const churchWorkspaces = buildWorkspaces({
    donors: [],
    memberships: [
      { id: MEMBERSHIP_A, church_id: CHURCH_A, role: "owner" },
      { id: MEMBERSHIP_B, church_id: CHURCH_B, role: "staff" },
    ],
    donorChurches: [],
    memberChurches: [churchA, churchB],
    isPlatformSuperAdmin: false,
  });
  const identity = activeIdentity(churchWorkspaces);

  it("requires a valid selection when more than one matching workspace exists", () => {
    expect(getWorkspaceForKind(identity, "church")).toEqual({
      state: "choose",
    });
    expect(
      getWorkspaceForKind(identity, "church", `church:${CHURCH_B}`),
    ).toMatchObject({
      state: "allowed",
      workspace: { churchId: CHURCH_B },
    });
  });

  it("does not accept a stale, tampered, or different-kind selection", () => {
    expect(
      getWorkspaceForKind(identity, "church", `member:${CHURCH_A}`),
    ).toEqual({ state: "choose" });
    expect(
      getWorkspaceForKind(
        identity,
        "church",
        "church:90000000-0000-4000-8000-000000000001",
      ),
    ).toEqual({ state: "choose" });
  });

  it("auto-selects one matching workspace and forbids an absent kind", () => {
    const oneChurch = activeIdentity([churchWorkspaces[0]]);
    expect(getWorkspaceForKind(oneChurch, "church")).toMatchObject({
      state: "allowed",
      workspace: { churchId: CHURCH_A },
    });
    expect(getWorkspaceForKind(oneChurch, "platform")).toEqual({
      state: "forbidden",
    });
  });
});

describe("post-auth destination resolution", () => {
  const memberWorkspace = buildWorkspaces({
    donors: [{ id: DONOR_A, church_id: CHURCH_A }],
    memberships: [],
    donorChurches: [churchA],
    memberChurches: [],
    isPlatformSuperAdmin: false,
  })[0];
  const churchWorkspaces = buildWorkspaces({
    donors: [],
    memberships: [
      { id: MEMBERSHIP_A, church_id: CHURCH_A, role: "owner" },
      { id: MEMBERSHIP_B, church_id: CHURCH_B, role: "staff" },
    ],
    donorChurches: [],
    memberChurches: [churchA, churchB],
    isPlatformSuperAdmin: false,
  });
  const platformWorkspace = buildWorkspaces({
    donors: [],
    memberships: [],
    donorChurches: [],
    memberChurches: [],
    isPlatformSuperAdmin: true,
  })[0];

  it("preserves a safe destination for an anonymous login redirect", () => {
    expect(
      resolvePostAuthDestination(
        { state: "anonymous" },
        "/church/transactions?status=failed&page=2",
      ),
    ).toBe(
      "/login?next=%2Fchurch%2Ftransactions%3Fstatus%3Dfailed%26page%3D2",
    );
  });

  it("does not forward an external anonymous destination", () => {
    expect(
      resolvePostAuthDestination(
        { state: "anonymous" },
        "//attacker.example",
      ),
    ).toBe("/login?next=%2Fdashboard");
  });

  it("routes non-active identity states to fixed neutral pages", () => {
    expect(
      resolvePostAuthDestination({
        state: "setup_required",
        userId: "user",
      }),
    ).toBe("/account/setup-required");
    expect(
      resolvePostAuthDestination({
        state: "inactive",
        userId: "user",
        displayName: "Inactive",
      }),
    ).toBe("/account/disabled");
  });

  it.each([
    [memberWorkspace, "/dashboard"],
    [churchWorkspaces[0], "/church"],
    [platformWorkspace, "/platform"],
  ] as const)("routes a single %s workspace to its home", (workspace, home) => {
    expect(resolvePostAuthDestination(activeIdentity([workspace]))).toBe(home);
  });

  it("rejects a valid application route for an unauthorized workspace kind", () => {
    expect(
      resolvePostAuthDestination(
        activeIdentity([churchWorkspaces[0]]),
        "/platform/onboarding",
      ),
    ).toBe("/account/no-access");
  });

  it("preserves the full route after a matching workspace is selected", () => {
    expect(
      resolvePostAuthDestination(
        activeIdentity(churchWorkspaces),
        "/church/transactions?status=failed&page=2",
        `church:${CHURCH_B}`,
      ),
    ).toBe("/church/transactions?status=failed&page=2");
  });

  it("routes ambiguous access to a selector with a safe exact destination", () => {
    expect(
      resolvePostAuthDestination(
        activeIdentity(churchWorkspaces),
        "/church/settings?tab=branding",
      ),
    ).toBe(
      "/workspaces?next=%2Fchurch%2Fsettings%3Ftab%3Dbranding&kind=church",
    );
  });

  it("uses a selector when the identity has several portal types", () => {
    expect(
      resolvePostAuthDestination(
        activeIdentity([memberWorkspace, churchWorkspaces[0]]),
      ),
    ).toBe("/workspaces");
  });

  it("fails closed when an active identity has no workspace", () => {
    expect(resolvePostAuthDestination(activeIdentity([]))).toBe(
      "/account/no-access",
    );
  });

  it("never includes an unsafe destination in a selector link", () => {
    expect(
      createWorkspaceSelectionHref("//attacker.example", "church"),
    ).toBe("/workspaces?kind=church");
  });
});

describe("safe shell identity", () => {
  it("normalizes the display name and sends only initials and a role label", () => {
    const workspace = buildWorkspaces({
      donors: [],
      memberships: [
        { id: MEMBERSHIP_A, church_id: CHURCH_A, role: "finance_admin" },
      ],
      donorChurches: [],
      memberChurches: [churchA],
      isPlatformSuperAdmin: false,
    })[0];

    expect(createShellIdentity(activeIdentity([workspace]), workspace)).toEqual({
      displayName: "Miriam Jordan",
      initials: "MJ",
      roleLabel: "Finance Admin",
    });
  });

  it("sends only the selected church's named permissions to the shell", () => {
    const [workspace] = buildWorkspaces({
      donors: [],
      memberships: [
        { id: MEMBERSHIP_A, church_id: CHURCH_A, role: "finance_admin" },
      ],
      donorChurches: [],
      memberChurches: [churchA],
      permissionsByChurch: {
        [CHURCH_A]: ["workspace_read", "reports_read"],
      },
      isPlatformSuperAdmin: false,
    });

    expect(createShellWorkspace(workspace)).toEqual({
      displayName: "Harbour Grace Church",
      kind: "church",
      permissions: ["workspace_read", "reports_read"],
    });
  });
});
