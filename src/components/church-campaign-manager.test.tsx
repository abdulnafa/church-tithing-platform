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
vi.mock("@/app/church/campaigns/campaign-actions", () => ({
  activateCampaignAction: vi.fn(),
  archiveCampaignAction: vi.fn(),
  closeCampaignAction: vi.fn(),
  createCampaignAction: vi.fn(),
  restoreCampaignAction: vi.fn(),
  updateCampaignAction: vi.fn(),
}));

import {
  ChurchCampaignManager,
  type ChurchCampaignManagerRequestIds,
  type ChurchCampaignManagerSnapshot,
} from "./church-campaign-manager";
import type {
  ChurchCampaignActionState,
  ChurchCampaignProgress,
} from "@/lib/church-campaigns";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const ids = [1, 2, 3, 4].map(
  (index) => `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
);
const snapshot: ChurchCampaignManagerSnapshot = {
  churchId: CHURCH_ID,
  campaignsRevision: 9,
  campaigns: [
    {
      id: ids[0],
      fundId: FUND_ID,
      fundName: "Tithes",
      name: "Expired Draft",
      description: "Legacy dates",
      status: "draft",
      goalAmountMinorText: "5000000",
      currency: "BBD",
      visibilityStartsLabel: "1 Aug 2026, 04:00 UTC",
      visibilityEndsLabel: "31 Aug 2026, 04:00 UTC",
      windowState: "ended",
    },
    {
      id: ids[1],
      fundId: FUND_ID,
      fundName: "Tithes",
      name: "Active Outreach",
      description: null,
      status: "active",
      goalAmountMinorText: "100",
      currency: "BBD",
      visibilityStartsLabel: null,
      visibilityEndsLabel: null,
      windowState: "none",
    },
    {
      id: ids[2],
      fundId: FUND_ID,
      fundName: "Tithes",
      name: "Closed School Drive",
      description: "Completed",
      status: "closed",
      goalAmountMinorText: null,
      currency: "BBD",
      visibilityStartsLabel: null,
      visibilityEndsLabel: null,
      windowState: "none",
    },
    {
      id: ids[3],
      fundId: FUND_ID,
      fundName: "Tithes",
      name: "Archived Roof Fund",
      description: "Historic",
      status: "archived",
      goalAmountMinorText: "250000",
      currency: "BBD",
      visibilityStartsLabel: null,
      visibilityEndsLabel: null,
      windowState: "none",
    },
  ],
};

function uuid(index: number) {
  return `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const requestIds: ChurchCampaignManagerRequestIds = {
  create: uuid(1),
  campaigns: snapshot.campaigns.map((campaign, index) => ({
    campaignId: campaign.id,
    update: uuid(index * 5 + 2),
    activate: uuid(index * 5 + 3),
    close: uuid(index * 5 + 4),
    archive: uuid(index * 5 + 5),
    restore: uuid(index * 5 + 6),
  })),
};
const activeFunds = [{ id: FUND_ID, name: "Tithes" }];
const progress: readonly ChurchCampaignProgress[] = snapshot.campaigns.map(
  (campaign, index) => ({
    campaignId: campaign.id,
    currency: "BBD",
    raisedAmountMinorText:
      index === 1 ? "150" : index === 0 ? "9007199254740991" : "0",
    eligibleDonationCountText: index === 1 ? "2" : "0",
  }),
);

function renderManager(options?: {
  canManage?: boolean;
  progress?: readonly ChurchCampaignProgress[];
  progressState?: "available" | "hidden" | "unavailable";
  snapshot?: ChurchCampaignManagerSnapshot;
}) {
  const baseProps = {
    activeFunds,
    canManage: options?.canManage ?? false,
    requestIds,
    snapshot: options?.snapshot ?? snapshot,
  };
  return renderToStaticMarkup(
    options?.progressState === "available" || options?.progress
      ? (
          <ChurchCampaignManager
            {...baseProps}
            progress={options?.progress ?? progress}
            progressState="available"
          />
        )
      : (
          <ChurchCampaignManager
            {...baseProps}
            progressState={options?.progressState ?? "hidden"}
          />
        ),
  );
}

describe("church campaign manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action, initialState: ChurchCampaignActionState) => [
        initialState,
        "/church/campaigns",
        false,
      ],
    );
  });

  it("shows persisted configuration but no financial data to a config-only reader", () => {
    const markup = renderManager();
    expect(markup).toContain('data-campaigns-revision="9"');
    expect(markup).toContain("Persisted campaigns");
    expect(markup).toContain("Active Outreach");
    expect(markup).toContain("Informational goal");
    expect(markup).toContain("financial access");
    expect(markup).toContain("read-only campaign access");
    expect(markup).not.toContain("Confirmed online progress");
    expect(markup).not.toContain("qualifying stored gift");
    expect(markup).not.toContain("Create a campaign draft");
    expect(markup).not.toContain("community-centre");
  });

  it("renders authorized string-based progress, including more than 100 percent", () => {
    const markup = renderManager({ progress, progressState: "available" });
    expect(markup).toContain("Live checkout is disabled");
    expect(markup).toContain("qualifying stored online records only");
    expect(markup).not.toContain("test records");
    expect(markup).toContain("Confirmed online progress");
    expect(markup).toContain("BBD $90,071,992,547,409.91");
    expect(markup).toContain('aria-valuetext="150.0%"');
    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain(
      'aria-label="Active Outreach: 150.0% of the informational goal"',
    );
    expect(markup).toContain('style="width:100%"');
    expect(markup).toContain("less recorded refunds");
    expect(markup).toContain("Processor fees are not subtracted");
    expect(markup).toContain("offline gifts");
  });

  it("distinguishes a failed progress read from hidden financial permission", () => {
    const markup = renderManager({ progressState: "unavailable" });
    expect(markup).toContain("progress could not be loaded");
    expect(markup).toContain("refresh before relying on financial totals");
    expect(markup).not.toContain("role does not include financial access");
    expect(markup).not.toContain("qualifying stored online records");
  });

  it("renders an owner create form without exposing internal or deferred fields", () => {
    const markup = renderManager({ canManage: true });
    expect(markup).toContain("Create a campaign draft");
    expect(markup).toContain('name="fundId"');
    expect(markup).toContain("The assigned fund cannot change");
    expect(markup).toContain('name="goalAmount"');
    expect(markup).toContain('inputMode="decimal"');
    expect(markup).toContain('type="text"');
    expect(markup).not.toContain('name="slug"');
    expect(markup).not.toContain('name="startsAt"');
    expect(markup).not.toContain('name="endsAt"');
    expect(markup).not.toContain('name="image"');
  });

  it("offers only status-valid lifecycle controls and keeps edits draft-only", () => {
    const markup = renderManager({ canManage: true });
    expect(markup).toContain(`aria-label="Edit draft Expired Draft"`);
    expect(markup).not.toContain(`aria-label="Edit draft Active Outreach"`);
    expect(markup).not.toContain(`aria-label="Edit draft Closed School Drive"`);
    expect(markup).toContain(
      `aria-label="Review close campaign for Active Outreach"`,
    );
    expect(markup).toContain(
      `aria-label="Review archive campaign for Closed School Drive"`,
    );
    expect(markup).toContain(
      `aria-label="Restore to closed Archived Roof Fund"`,
    );
    expect(markup).toContain("Closing is terminal");
    expect(markup).toContain("Restoring an archive returns it to closed");
    expect(markup).toContain("keeps it listed here for management history");
    expect(markup).not.toContain("Reopen");
    expect(markup).not.toContain("Delete campaign");
  });

  it("disables activation for an expired legacy window and explains manual closing", () => {
    const markup = renderManager({ canManage: true });
    expect(markup).toContain("Legacy visibility window (read-only)");
    expect(markup).toContain("Giving window ended; close manually");
    expect(markup).toContain("does not stop existing recurring instructions");
    expect(markup).toMatch(
      /aria-label="Confirm activate Expired Draft"[^>]*disabled=""[^>]*title="Legacy visibility window has ended"/,
    );
  });

  it("keeps draft fund immutable in edit UI and all repeated controls named", () => {
    const markup = renderManager({ canManage: true });
    const selectCount = (markup.match(/<select/g) ?? []).length;
    expect(selectCount).toBe(1);
    expect(markup).toContain("Fund, currency");
    expect(markup).toContain(
      `aria-label="Confirm close campaign Active Outreach"`,
    );
    expect(markup).toContain(
      `aria-label="Confirm archive campaign Closed School Drive"`,
    );
  });

  it("keeps the zero-campaign snapshot usable for first draft creation", () => {
    const markup = renderManager({
      canManage: true,
      snapshot: { ...snapshot, campaignsRevision: 0, campaigns: [] },
    });
    expect(markup).toContain('data-campaigns-revision="0"');
    expect(markup).toContain("No campaigns yet");
    expect(markup).toContain("Create a campaign draft");
  });

  it("shows exact-retry guidance and restores canonical values", () => {
    useActionStateMock.mockImplementation(
      (_action, initialState: ChurchCampaignActionState) => [
        initialState.operation === "create"
          ? {
              ...initialState,
              status: "error",
              message: "The request could not be confirmed.",
              responseEpoch: 2,
              retryRequired: true,
              values: {
                name: "Youth Appeal",
                description: "Sunday giving",
                fundId: FUND_ID,
                goalAmount: "2500.50",
              },
            }
          : initialState,
        "/church/campaigns",
        false,
      ],
    );
    const markup = renderManager({ canManage: true });
    expect(markup).toContain("This request is unconfirmed");
    expect(markup).toContain("Do not change these details or reload");
    expect(markup).toContain("Retry same request");
    expect(markup).toContain('value="2500.50"');
  });

  it("uses unique field ids and fluid responsive sizing", () => {
    const markup = renderManager({ canManage: true });
    const nameIds = [...markup.matchAll(/id="(campaign-name-[^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(nameIds).size).toBe(nameIds.length);

    const source = readFileSync(
      new URL("./church-campaign-manager.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-w-0");
    expect(source).toContain("w-full");
    expect(source).not.toContain("min-w-[");
    expect(source).not.toContain("Number(progress");
  });
});
