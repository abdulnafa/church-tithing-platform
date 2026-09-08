import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchPermission } from "@/lib/auth/permissions";

const {
  createServerSupabaseClientMock,
  getChurchCampaignProgressMock,
  getChurchCampaignsMock,
  getChurchFundsMock,
  getServerNowMillisecondsMock,
  requireAnyChurchPermissionMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getChurchCampaignProgressMock: vi.fn(),
  getChurchCampaignsMock: vi.fn(),
  getChurchFundsMock: vi.fn(),
  getServerNowMillisecondsMock: vi.fn(),
  requireAnyChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireAnyChurchPermission: requireAnyChurchPermissionMock,
}));
vi.mock("@/lib/church-campaigns-dal", () => ({
  getChurchCampaignProgress: getChurchCampaignProgressMock,
  getChurchCampaigns: getChurchCampaignsMock,
}));
vi.mock("@/lib/church-funds-dal", () => ({
  getChurchFunds: getChurchFundsMock,
}));
vi.mock("@/lib/server-clock", () => ({
  getServerNowMilliseconds: getServerNowMillisecondsMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/components/church-fund-manager", () => ({
  ChurchFundManager: (props: {
    canManage: boolean;
    snapshot: { fundsRevision: number; funds: readonly { name: string }[] };
  }) => (
    <section
      data-can-manage={String(props.canManage)}
      data-funds-revision={props.snapshot.fundsRevision}
      data-testid="fund-manager"
    >
      {props.snapshot.funds.map((fund) => fund.name).join(", ")}
    </section>
  ),
}));
vi.mock("@/components/church-campaign-manager", () => ({
  ChurchCampaignManager: (props: Record<string, unknown>) => {
    const snapshot = props.snapshot as {
      campaignsRevision: number;
      campaigns: readonly { name: string; fundName: string; windowState: string }[];
    };
    const activeFunds = props.activeFunds as readonly { name: string }[];
    return (
      <section
        data-active-funds={activeFunds.map((fund) => fund.name).join(", ")}
        data-can-manage={String(props.canManage)}
        data-campaigns-revision={snapshot.campaignsRevision}
        data-has-progress={String(
          Object.prototype.hasOwnProperty.call(props, "progress"),
        )}
        data-progress-state={String(props.progressState)}
        data-testid="campaign-manager"
      >
        {JSON.stringify(props)}
      </section>
    );
  },
}));

import ChurchCampaignsPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "30000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };
const fundSnapshot = {
  churchId: CHURCH_ID,
  fundsRevision: 7,
  funds: [
    {
      id: FUND_ID,
      name: "Tithes",
      slug: "tithes",
      description: "General tithes",
      status: "active" as const,
      isDefault: true,
      sortOrder: 0,
    },
  ],
};
const campaign = {
  id: CAMPAIGN_ID,
  fundId: FUND_ID,
  name: "Summer outreach",
  slug: "summer-outreach-internal",
  description: "A persisted campaign",
  status: "draft" as const,
  goalAmountMinorText: "10000",
  currency: "BBD",
  startsAt: null,
  endsAt: null,
};
const campaignSnapshot = {
  churchId: CHURCH_ID,
  campaignsRevision: 11,
  campaigns: [campaign],
};
const progress = [
  {
    campaignId: CAMPAIGN_ID,
    currency: "BBD",
    raisedAmountMinorText: "2750",
    eligibleDonationCountText: "3",
  },
];

function usePermissions(permissions: readonly ChurchPermission[]) {
  requireAnyChurchPermissionMock.mockResolvedValue({
    workspace: {
      kind: "church",
      churchId: CHURCH_ID,
      permissions,
    },
  });
}

async function renderPage() {
  return renderToStaticMarkup(await ChurchCampaignsPage());
}

describe("church funds and campaigns page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClientMock.mockResolvedValue(client);
    getChurchFundsMock.mockResolvedValue({ ok: true, snapshot: fundSnapshot });
    getChurchCampaignsMock.mockResolvedValue({
      ok: true,
      snapshot: campaignSnapshot,
    });
    getChurchCampaignProgressMock.mockResolvedValue({ ok: true, progress });
    getServerNowMillisecondsMock.mockResolvedValue(
      Date.parse("2026-09-05T00:00:00.000Z"),
    );
  });

  it("preserves the any-of route and independent persisted fund read", async () => {
    usePermissions(["funds_read"]);
    const markup = await renderPage();

    expect(requireAnyChurchPermissionMock).toHaveBeenCalledWith([
      "funds_read",
      "campaigns_read",
    ]);
    expect(getChurchFundsMock).toHaveBeenCalledWith(client, CHURCH_ID);
    expect(getChurchCampaignsMock).not.toHaveBeenCalled();
    expect(getChurchCampaignProgressMock).not.toHaveBeenCalled();
    expect(getServerNowMillisecondsMock).not.toHaveBeenCalled();
    expect(markup).toContain('data-testid="fund-manager"');
    expect(markup).not.toContain('data-testid="campaign-manager"');
  });

  it("loads campaign configuration without funds or financial progress for a campaign reader", async () => {
    usePermissions(["campaigns_read"]);
    const markup = await renderPage();

    expect(getChurchFundsMock).not.toHaveBeenCalled();
    expect(getChurchCampaignsMock).toHaveBeenCalledWith(client, CHURCH_ID);
    expect(getChurchCampaignProgressMock).not.toHaveBeenCalled();
    expect(markup).toContain('data-progress-state="hidden"');
    expect(markup).toContain('data-has-progress="false"');
    expect(markup).toContain("Assigned church fund");
    expect(markup).not.toContain("2750");
    expect(markup).not.toContain("summer-outreach-internal");
  });

  it("fetches and serializes progress only with both campaign and financial grants", async () => {
    usePermissions(["campaigns_read", "financial_read"]);
    const markup = await renderPage();

    expect(getChurchCampaignProgressMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      campaignSnapshot.campaigns,
    );
    expect(markup).toContain('data-progress-state="available"');
    expect(markup).toContain('data-has-progress="true"');
    expect(markup).toContain("2750");
  });

  it("distinguishes an unavailable authorized progress read without serializing figures", async () => {
    usePermissions(["campaigns_read", "financial_read"]);
    getChurchCampaignProgressMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });

    const markup = await renderPage();
    expect(markup).toContain('data-progress-state="unavailable"');
    expect(markup).toContain('data-has-progress="false"');
    expect(markup).not.toContain("2750");
  });

  it("maps active fund names for an owner while keeping slug out of the client DTO", async () => {
    usePermissions([
      "funds_read",
      "funds_manage",
      "campaigns_read",
      "campaigns_manage",
    ]);
    const markup = await renderPage();

    expect(markup).toContain('data-can-manage="true"');
    expect(markup).toContain('data-active-funds="Tithes"');
    expect(markup).toContain('fundName\&quot;:\&quot;Tithes');
    expect(markup).not.toContain("summer-outreach-internal");
  });

  it("renders the atomic empty campaign snapshot with revision zero", async () => {
    usePermissions(["funds_read", "campaigns_read", "campaigns_manage"]);
    getChurchCampaignsMock.mockResolvedValue({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        campaignsRevision: 0,
        campaigns: [],
      },
    });

    const markup = await renderPage();
    expect(markup).toContain('data-campaigns-revision="0"');
    expect(markup).toContain('data-can-manage="true"');
  });

  it("formats legacy timestamps deterministically and derives ended state from one server clock", async () => {
    usePermissions(["campaigns_read"]);
    getChurchCampaignsMock.mockResolvedValue({
      ok: true,
      snapshot: {
        ...campaignSnapshot,
        campaigns: [
          {
            ...campaign,
            startsAt: "2000-12-01T00:00:00.000Z",
            endsAt: "2001-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    const markup = await renderPage();
    expect(getServerNowMillisecondsMock).toHaveBeenCalledTimes(1);
    expect(markup).toContain("2001-01-01 00:00 UTC");
    expect(markup).toContain('windowState\&quot;:\&quot;ended');
  });

  it("fails closed when either authorized configuration RPC is unavailable", async () => {
    usePermissions(["funds_read", "campaigns_read"]);
    getChurchFundsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    await expect(ChurchCampaignsPage()).rejects.toThrow(
      "Church funds are temporarily unavailable.",
    );

    getChurchFundsMock.mockResolvedValue({ ok: true, snapshot: fundSnapshot });
    getChurchCampaignsMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    await expect(ChurchCampaignsPage()).rejects.toThrow(
      "Church campaigns are temporarily unavailable.",
    );
  });

  it("uses parallel configuration reads and explicit revision keys without spreading key", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    expect(source).toContain("await Promise.all([");
    expect(source).toContain(
      'key={`${workspace.churchId}:${campaignResult.snapshot.campaignsRevision}`}',
    );
    expect(source).not.toMatch(
      /const campaignProps[\s\S]*?=\s*\{\s*key:/,
    );
    expect(source).not.toContain("demoCampaigns");
  });
});
