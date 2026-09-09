import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dashboardShellMock,
  loadMemberDonorProfileMock,
  requireMemberWorkspaceMock,
} = vi.hoisted(() => ({
  dashboardShellMock: vi.fn(),
  loadMemberDonorProfileMock: vi.fn(),
  requireMemberWorkspaceMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireMemberWorkspace: requireMemberWorkspaceMock,
}));
vi.mock("@/lib/member-donor-profile", () => ({
  loadMemberDonorProfile: loadMemberDonorProfileMock,
}));
vi.mock("@/components/dashboard-shell", () => ({
  DashboardShell: (props: Readonly<Record<string, unknown>>) => {
    dashboardShellMock(props);
    return <div>{props.children as React.ReactNode}</div>;
  },
}));

import MemberDashboardLayout from "./layout";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const DONOR_ID = "20000000-0000-4000-8000-000000000002";
const workspace = {
  key: `member:${CHURCH_ID}`,
  kind: "member",
  churchId: CHURCH_ID,
  donorId: DONOR_ID,
  churchSlug: "harbour-grace",
  displayName: "Harbour Grace Church",
  home: "/dashboard",
  roleLabel: "Member",
} as const;
const identity = {
  state: "active",
  userId: "30000000-0000-4000-8000-000000000003",
  displayName: "Global Account Name",
  workspaces: [workspace],
} as const;

describe("member dashboard shell profile identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMemberWorkspaceMock.mockResolvedValue({ identity, workspace });
    loadMemberDonorProfileMock.mockResolvedValue({
      ok: true,
      profile: {
        displayName: "Alicia Clarke",
        email: "alicia@example.test",
        profileRevision: 3,
      },
    });
  });

  it("uses the selected church donor name in the shell after a request-deduped read", async () => {
    renderToStaticMarkup(
      await MemberDashboardLayout({ children: <p>Dashboard child</p> }),
    );

    expect(loadMemberDonorProfileMock).toHaveBeenCalledWith(CHURCH_ID, DONOR_ID);
    expect(dashboardShellMock.mock.calls[0]?.[0].identity).toMatchObject({
      displayName: "Alicia Clarke",
      initials: "AC",
      roleLabel: "Member",
    });
  });

  it("falls back to the authenticated account label when profile reading fails", async () => {
    loadMemberDonorProfileMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    renderToStaticMarkup(
      await MemberDashboardLayout({ children: <p>Dashboard child</p> }),
    );
    expect(dashboardShellMock.mock.calls[0]?.[0].identity).toMatchObject({
      displayName: "Global Account Name",
      initials: "GA",
    });
  });
});
