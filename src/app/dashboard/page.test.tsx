import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  donorProfileFormMock,
  loadMemberDonorProfileMock,
  requireMemberWorkspaceMock,
} = vi.hoisted(() => ({
  donorProfileFormMock: vi.fn(),
  loadMemberDonorProfileMock: vi.fn(),
  requireMemberWorkspaceMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireMemberWorkspace: requireMemberWorkspaceMock,
}));
vi.mock("@/lib/member-donor-profile", () => ({
  loadMemberDonorProfile: loadMemberDonorProfileMock,
}));
vi.mock("@/components/donor-profile-form", () => ({
  DonorProfileForm: (props: Readonly<Record<string, unknown>>) => {
    donorProfileFormMock(props);
    return <div data-testid="profile-form">Profile form</div>;
  },
}));
vi.mock("@/components/dashboard-shell", () => ({
  SectionHeader: ({
    action,
    eyebrow,
    title,
  }: Readonly<{
    action?: React.ReactNode;
    eyebrow?: string;
    title: string;
  }>) => (
    <div>
      {eyebrow ? <p>{eyebrow}</p> : null}
      <h2>{title}</h2>
      {action}
    </div>
  ),
  StatCard: ({
    label,
    note,
    value,
  }: Readonly<{ label: string; note: string; value: string }>) => (
    <article>
      <h2>{label}</h2>
      <p>{value}</p>
      <p>{note}</p>
    </article>
  ),
}));

import MemberDashboardPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const DONOR_ID = "20000000-0000-4000-8000-000000000002";
const workspace = {
  churchId: CHURCH_ID,
  churchSlug: "harbour-grace",
  displayName: "Harbour Grace Church",
  donorId: DONOR_ID,
  kind: "member",
} as const;
const profile = {
  displayName: "Alicia Clarke",
  email: "alicia@example.test",
  profileRevision: 3,
} as const;

describe("member dashboard donor profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMemberWorkspaceMock.mockResolvedValue({
      identity: { displayName: "Account Name", state: "active" },
      workspace,
    });
    loadMemberDonorProfileMock.mockResolvedValue({ ok: true, profile });
    donorProfileFormMock.mockImplementation(() => null);
  });

  it("guards before reading the exact selected donor and passes a minimum profile DTO", async () => {
    const markup = renderToStaticMarkup(await MemberDashboardPage());

    expect(requireMemberWorkspaceMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadMemberDonorProfileMock.mock.invocationCallOrder[0],
    );
    expect(loadMemberDonorProfileMock).toHaveBeenCalledWith(CHURCH_ID, DONOR_ID);
    expect(donorProfileFormMock.mock.calls[0]?.[0]).toMatchObject({
      churchName: "Harbour Grace Church",
      snapshot: profile,
    });
    expect(donorProfileFormMock.mock.calls[0]?.[0].requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(JSON.stringify(donorProfileFormMock.mock.calls[0]?.[0])).not.toMatch(
      /churchId|donorId|userId|phone|updatedAt/i,
    );
    expect(markup).toContain("Welcome, Alicia Clarke");
  });

  it("shows no fallback personal details when the strict profile read fails", async () => {
    loadMemberDonorProfileMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = renderToStaticMarkup(await MemberDashboardPage());
    expect(markup).toContain("Your giving profile is unavailable");
    expect(markup).toContain(
      "no unverified donor-profile name or email is shown in this profile",
    );
    expect(markup).not.toContain("Profile form");
    expect(donorProfileFormMock).not.toHaveBeenCalled();
  });

  it("labels every retained financial panel as shared Demo or Preview data", async () => {
    const markup = renderToStaticMarkup(await MemberDashboardPage());

    expect(markup).toContain("Shared example | Across 24 gifts");
    expect(markup).toContain("Shared example data");
    expect(markup).toContain("Recurring gift | Shared example");
    expect(markup).toContain("Payment method | Demo");
    expect(markup).toContain("Annual statement | Preview");
  });

  it("keys the profile form by selected church and persisted revision", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain(
      "key={`${workspace.churchId}:${profileResult.profile.profileRevision}`}",
    );
    expect(source).not.toMatch(/demo.*profile|phone.*profile/i);
  });
});
