import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ChurchStaffManagerMock,
  createServerSupabaseClientMock,
  getChurchStaffMock,
  requireAnyChurchPermissionMock,
} = vi.hoisted(() => ({
  ChurchStaffManagerMock: vi.fn(
    (props: {
      snapshot: { staffRevision: number };
      requestIds: { invite: string; staff: readonly unknown[] };
    }) => (
      <div data-testid="staff-manager">
        Saved roster revision {props.snapshot.staffRevision}
      </div>
    ),
  ),
  createServerSupabaseClientMock: vi.fn(),
  getChurchStaffMock: vi.fn(),
  requireAnyChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/components/church-staff-manager", () => ({
  ChurchStaffManager: ChurchStaffManagerMock,
}));
vi.mock("@/lib/auth/guards", () => ({
  requireAnyChurchPermission: requireAnyChurchPermissionMock,
}));
vi.mock("@/lib/church-staff-dal", () => ({
  getChurchStaff: getChurchStaffMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import ChurchMembersPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };
const staff = [
  {
    membershipId: MEMBERSHIP_ID,
    email: "owner@example.test",
    displayName: "Church Owner",
    role: "owner",
    status: "active",
    accessEnabled: true,
    invitedAt: "2026-09-01T10:00:00Z",
    acceptedAt: "2026-09-01T10:05:00Z",
    revokedAt: null,
    isCurrent: true,
  },
] as const;

function grant(permissions: readonly string[]) {
  requireAnyChurchPermissionMock.mockResolvedValue({
    identity: { state: "active", userId: "not-passed-to-roster" },
    workspace: {
      kind: "church",
      churchId: CHURCH_ID,
      permissions,
    },
  });
}

async function renderPage() {
  return renderToStaticMarkup(await ChurchMembersPage());
}

describe("church members and staff page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant(["members_read", "staff_manage"]);
    createServerSupabaseClientMock.mockResolvedValue(client);
    getChurchStaffMock.mockResolvedValue({
      ok: true,
      snapshot: { churchId: CHURCH_ID, staffRevision: 7, staff },
    });
  });

  it("guards the combined route with either named permission", async () => {
    await renderPage();
    expect(requireAnyChurchPermissionMock).toHaveBeenCalledWith([
      "members_read",
      "staff_manage",
    ]);
  });

  it("reads and serializes the private roster only with staff_manage", async () => {
    const markup = await renderPage();
    expect(createServerSupabaseClientMock).toHaveBeenCalledTimes(1);
    expect(getChurchStaffMock).toHaveBeenCalledWith(client, CHURCH_ID);
    expect(markup).toContain("Saved roster revision 7");

    const props = ChurchStaffManagerMock.mock.calls[0]?.[0];
    expect(props.snapshot).toEqual({ staffRevision: 7, staff });
    expect(props.snapshot).not.toHaveProperty("churchId");
    expect(JSON.stringify(props.snapshot)).not.toMatch(/userId|invitedBy/);
    expect(props.requestIds.invite).toMatch(/^[0-9a-f-]{36}$/);
    expect(props.requestIds.staff).toEqual([]);
  });

  it("keeps all donor/member examples out of a staff-only response", async () => {
    grant(["staff_manage"]);
    const markup = await renderPage();
    expect(markup).toContain("Saved roster revision 7");
    expect(markup).not.toContain("Demo member activity:");
    expect(markup).not.toContain("Naomi King");
    expect(markup).not.toContain("Demo giving");
  });

  it("keeps the private roster out of a member-read-only response", async () => {
    grant(["members_read"]);
    const markup = await renderPage();
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getChurchStaffMock).not.toHaveBeenCalled();
    expect(ChurchStaffManagerMock).not.toHaveBeenCalled();
    expect(markup).toContain("Demo member activity:");
    expect(markup).toContain("shared examples");
    expect(markup).toContain("not persisted records for this church");
    expect(markup).toContain("Demo giving");
  });

  it("labels member/donor data as demo when both capabilities are present", async () => {
    const markup = await renderPage();
    expect(markup).toContain("Saved roster revision 7");
    expect(markup).toContain("Demo member activity:");
    expect(markup).toContain("Demo registered members");
    expect(markup).toContain("Demo recurring plan");
    expect(markup).toContain("Demo privacy preview");
    expect(markup).not.toContain("Harbour Grace Church members");
  });

  it("fails closed instead of rendering stale or demo staff data", async () => {
    getChurchStaffMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    await expect(ChurchMembersPage()).rejects.toThrow(
      "Church staff management is temporarily unavailable.",
    );
    expect(ChurchStaffManagerMock).not.toHaveBeenCalled();
  });
});
