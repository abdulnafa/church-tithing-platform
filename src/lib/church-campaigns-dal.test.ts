import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import {
  getChurchCampaignProgress,
  getChurchCampaigns,
  mutateChurchCampaign,
} from "./church-campaigns-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CHURCH_ID = "20000000-0000-4000-8000-000000000001";
const FUND_ID = "30000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_CAMPAIGN_ID = "40000000-0000-4000-8000-000000000002";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";

const draftRow = {
  campaign_id: CAMPAIGN_ID,
  fund_id: FUND_ID,
  name: "Community Centre",
  slug: "community-centre",
  description: "A safe gathering place",
  status: "draft",
  goal_amount_minor_text: "5000000",
  currency: "BBD",
  starts_at: null,
  ends_at: null,
} as const;
const activeRow = {
  ...draftRow,
  campaign_id: OTHER_CAMPAIGN_ID,
  name: "School Supplies",
  slug: "school-supplies",
  status: "active",
  goal_amount_minor_text: null,
  starts_at: "2026-09-01T04:00:00+00:00",
  ends_at: "2026-10-01T04:00:00+00:00",
} as const;
const snapshotRow = {
  church_id: CHURCH_ID,
  campaigns_revision: 4,
  campaigns: [draftRow, activeRow],
} as const;
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("church campaigns DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: snapshotRow, error: null });
  });

  it("reads the scalar tenant snapshot and maps only campaign configuration", async () => {
    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        campaignsRevision: 4,
        campaigns: [
          {
            id: CAMPAIGN_ID,
            fundId: FUND_ID,
            name: "Community Centre",
            slug: "community-centre",
            description: "A safe gathering place",
            status: "draft",
            goalAmountMinorText: "5000000",
            currency: "BBD",
            startsAt: null,
            endsAt: null,
          },
          {
            id: OTHER_CAMPAIGN_ID,
            fundId: FUND_ID,
            name: "School Supplies",
            slug: "school-supplies",
            description: "A safe gathering place",
            status: "active",
            goalAmountMinorText: null,
            currency: "BBD",
            startsAt: "2026-09-01T04:00:00.000Z",
            endsAt: "2026-10-01T04:00:00.000Z",
          },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_campaigns", {
      target_church_id: CHURCH_ID,
    });
  });

  it("accepts an empty campaign array while preserving its CAS revision", async () => {
    rpc.mockResolvedValueOnce({
      data: { church_id: CHURCH_ID, campaigns_revision: 0, campaigns: [] },
      error: null,
    });
    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        campaignsRevision: 0,
        campaigns: [],
      },
    });
  });

  it("unwraps exactly one composite snapshot returned as an array", async () => {
    rpc.mockResolvedValueOnce({ data: [snapshotRow], error: null });
    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
      snapshot: { churchId: CHURCH_ID, campaignsRevision: 4 },
    });

    rpc.mockResolvedValueOnce({ data: [snapshotRow, snapshotRow], error: null });
    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("uses PostgreSQL-compatible code-point limits for database text", async () => {
    const name = `A${"🙏".repeat(119)}`;
    const description = "🙏".repeat(1_000);
    rpc.mockResolvedValueOnce({
      data: {
        ...snapshotRow,
        campaigns: [{ ...draftRow, name, description }],
      },
      error: null,
    });
    const result = await getChurchCampaigns(client, CHURCH_ID);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.snapshot.campaigns[0]).toMatchObject({ name, description });
    }
  });

  it("maps read authorization and does not expose raw errors", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "CAMPAIGNS_FORBIDDEN" },
    });
    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "secret table name" },
    });
    const result = await getChurchCampaigns(client, CHURCH_ID);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret table name");
  });

  it.each([
    null,
    { ...snapshotRow, church_id: OTHER_CHURCH_ID },
    { ...snapshotRow, campaigns_revision: "4" },
    { ...snapshotRow, campaigns: null },
    { ...snapshotRow, campaigns: [{ ...draftRow, fund_id: "bad" }] },
    { ...snapshotRow, campaigns: [draftRow, { ...activeRow, campaign_id: CAMPAIGN_ID }] },
    { ...snapshotRow, campaigns: [draftRow, { ...activeRow, slug: draftRow.slug }] },
    { ...snapshotRow, campaigns: [draftRow, { ...activeRow, name: draftRow.name }] },
    { ...snapshotRow, campaigns: [activeRow, draftRow] },
    { ...snapshotRow, campaigns: [{ ...draftRow, goal_amount_minor_text: "01" }] },
    { ...snapshotRow, campaigns: [{ ...draftRow, description: "\u00a0Not canonical\u00a0" }] },
    { ...snapshotRow, campaigns: [{ ...draftRow, currency: "GBP" }] },
    { ...snapshotRow, campaigns: [{ ...draftRow, starts_at: "not-a-date" }] },
    { ...snapshotRow, campaigns: [{ ...draftRow, starts_at: "2026-09-01" }] },
    {
      ...snapshotRow,
      campaigns: [{ ...activeRow, starts_at: activeRow.ends_at }],
    },
  ])("fails malformed or inconsistent snapshot data closed %#", async (data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("does not impose JavaScript case-folding on database-valid Unicode names", async () => {
    expect("K Plan".toLowerCase()).toBe("\u212a Plan".toLowerCase());
    rpc.mockResolvedValueOnce({
      data: {
        ...snapshotRow,
        campaigns: [
          { ...draftRow, name: "K Plan" },
          { ...activeRow, name: "\u212a Plan" },
        ],
      },
      error: null,
    });

    await expect(getChurchCampaigns(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("reads exact string progress only through the dedicated RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          church_id: CHURCH_ID,
          campaign_id: OTHER_CAMPAIGN_ID,
          currency: "BBD",
          raised_amount_minor_text: "900719925474099100000",
          eligible_donation_count_text: "12",
        },
        {
          church_id: CHURCH_ID,
          campaign_id: CAMPAIGN_ID,
          currency: "BBD",
          raised_amount_minor_text: "0",
          eligible_donation_count_text: "0",
        },
      ],
      error: null,
    });

    await expect(
      getChurchCampaignProgress(client, CHURCH_ID, [draftRowToCampaign(), activeRowToCampaign()]),
    ).resolves.toEqual({
      ok: true,
      progress: [
        {
          campaignId: CAMPAIGN_ID,
          currency: "BBD",
          raisedAmountMinorText: "0",
          eligibleDonationCountText: "0",
        },
        {
          campaignId: OTHER_CAMPAIGN_ID,
          currency: "BBD",
          raisedAmountMinorText: "900719925474099100000",
          eligibleDonationCountText: "12",
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("get_church_campaign_progress", {
      target_church_id: CHURCH_ID,
    });
  });

  it("accepts empty progress only for an empty snapshot", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getChurchCampaignProgress(client, CHURCH_ID, []),
    ).resolves.toEqual({ ok: true, progress: [] });
  });

  it.each([
    null,
    [],
    [
      {
        church_id: OTHER_CHURCH_ID,
        campaign_id: CAMPAIGN_ID,
        currency: "BBD",
        raised_amount_minor_text: "0",
        eligible_donation_count_text: "0",
      },
      progressRow(OTHER_CAMPAIGN_ID),
    ],
    [progressRow(CAMPAIGN_ID), progressRow(CAMPAIGN_ID)],
    [progressRow(CAMPAIGN_ID), { ...progressRow(OTHER_CAMPAIGN_ID), currency: "USD" }],
    [progressRow(CAMPAIGN_ID), { ...progressRow(OTHER_CAMPAIGN_ID), raised_amount_minor_text: "01" }],
    [progressRow(CAMPAIGN_ID), { ...progressRow(OTHER_CAMPAIGN_ID), eligible_donation_count_text: "-1" }],
  ])("fails malformed or cross-tenant progress closed %#", async (data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(
      getChurchCampaignProgress(client, CHURCH_ID, [draftRowToCampaign(), activeRowToCampaign()]),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("maps progress authorization without exposing an error", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "CAMPAIGNS_FORBIDDEN" },
    });
    await expect(
      getChurchCampaignProgress(client, CHURCH_ID, []),
    ).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it("calls the exact create operation and validates the returned row", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        ...draftRow,
        campaigns_revision: 5,
        replayed: false,
      },
      error: null,
    });

    await expect(
      mutateChurchCampaign(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "create",
        campaignId: null,
        name: "Community Centre",
        slug: "community-centre",
        description: "A safe gathering place",
        fundId: FUND_ID,
        goalAmountMinorText: "5000000",
      }),
    ).resolves.toMatchObject({
      ok: true,
      campaignsRevision: 5,
      replayed: false,
      campaign: { id: CAMPAIGN_ID, status: "draft" },
    });
    expect(rpc).toHaveBeenCalledWith("mutate_church_campaign", {
      campaign_request_id: REQUEST_ID,
      target_church_id: CHURCH_ID,
      expected_campaigns_revision: 4,
      campaign_operation: "create",
      target_campaign_id: null,
      campaign_name: "Community Centre",
      campaign_slug: "community-centre",
      campaign_description: "A safe gathering place",
      campaign_fund_id: FUND_ID,
      campaign_goal_amount_minor_text: "5000000",
    });
  });

  it("keeps the internal slug out of draft updates", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        ...draftRow,
        name: "Community Hub",
        description: null,
        goal_amount_minor_text: null,
        campaigns_revision: 5,
        replayed: true,
      },
      error: null,
    });
    await expect(
      mutateChurchCampaign(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "update",
        campaignId: CAMPAIGN_ID,
        name: "Community Hub",
        slug: null,
        description: null,
        fundId: FUND_ID,
        goalAmountMinorText: null,
      }),
    ).resolves.toMatchObject({ ok: true, replayed: true });
    expect(rpc).toHaveBeenCalledWith(
      "mutate_church_campaign",
      expect.objectContaining({
        target_campaign_id: CAMPAIGN_ID,
        campaign_slug: null,
        campaign_fund_id: FUND_ID,
      }),
    );
  });

  it.each([
    ["activate", "active"],
    ["close", "closed"],
    ["archive", "archived"],
    ["restore", "closed"],
  ] as const)("sends a strict %s lifecycle shape", async (operation, status) => {
    rpc.mockResolvedValueOnce({
      data: {
        church_id: CHURCH_ID,
        ...draftRow,
        status,
        campaigns_revision: 5,
        replayed: false,
      },
      error: null,
    });
    await expect(
      mutateChurchCampaign(client, REQUEST_ID, CHURCH_ID, 4, {
        operation,
        campaignId: CAMPAIGN_ID,
        name: null,
        slug: null,
        description: null,
        fundId: null,
        goalAmountMinorText: null,
      }),
    ).resolves.toMatchObject({ ok: true, campaign: { status } });
    expect(rpc).toHaveBeenCalledWith(
      "mutate_church_campaign",
      expect.objectContaining({
        campaign_operation: operation,
        target_campaign_id: CAMPAIGN_ID,
        campaign_name: null,
        campaign_slug: null,
        campaign_description: null,
        campaign_fund_id: null,
        campaign_goal_amount_minor_text: null,
      }),
    );
  });

  it.each([
    ["CAMPAIGNS_FORBIDDEN", "forbidden"],
    ["CAMPAIGNS_INVALID_GOAL", "invalid_request"],
    ["CAMPAIGNS_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["CAMPAIGNS_REVISION_CONFLICT", "revision_conflict"],
    ["CAMPAIGNS_NOT_FOUND", "not_found"],
    ["CAMPAIGNS_NO_CHANGES", "no_changes"],
    ["CAMPAIGNS_NAME_CONFLICT", "name_conflict"],
    ["CAMPAIGNS_SLUG_CONFLICT", "slug_conflict"],
    ["CAMPAIGNS_FUND_NOT_ACTIVE", "fund_not_active"],
    ["CAMPAIGNS_CURRENCY_MISMATCH", "currency_mismatch"],
    ["CAMPAIGNS_WINDOW_ENDED", "window_ended"],
    ["CAMPAIGNS_NOT_DRAFT", "not_draft"],
    ["CAMPAIGNS_NOT_ACTIVE", "not_active"],
    ["CAMPAIGNS_NOT_CLOSED", "not_closed"],
    ["CAMPAIGNS_NOT_ARCHIVED", "not_archived"],
    ["CAMPAIGNS_ACTIVE_RECURRING_GIFTS", "active_recurring_gifts"],
  ] as const)("maps safe database token %s", async (message, reason) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } });
    await expect(
      mutateChurchCampaign(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "activate",
        campaignId: CAMPAIGN_ID,
        name: null,
        slug: null,
        description: null,
        fundId: null,
        goalAmountMinorText: null,
      }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("rejects malformed input and malformed successful output", async () => {
    await expect(
      mutateChurchCampaign(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "update",
        campaignId: CAMPAIGN_ID,
        name: "Changed",
        slug: "attempted-change",
        description: null,
        fundId: FUND_ID,
        goalAmountMinorText: null,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();

    for (const data of [
      { church_id: CHURCH_ID, ...draftRow, campaigns_revision: 4, replayed: false },
      { church_id: CHURCH_ID, ...draftRow, campaigns_revision: 6, replayed: false },
      { church_id: OTHER_CHURCH_ID, ...draftRow, campaigns_revision: 5, replayed: false },
      { church_id: CHURCH_ID, ...draftRow, campaigns_revision: 5, replayed: "yes" },
      [{ church_id: CHURCH_ID, ...draftRow, campaigns_revision: 5, replayed: false }, { church_id: CHURCH_ID, ...draftRow, campaigns_revision: 5, replayed: false }],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(
        mutateChurchCampaign(client, REQUEST_ID, CHURCH_ID, 4, {
          operation: "create",
          campaignId: null,
          name: "Community Centre",
          slug: "community-centre",
          description: "A safe gathering place",
          fundId: FUND_ID,
          goalAmountMinorText: "5000000",
        }),
      ).resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });
});

function progressRow(campaignId: string) {
  return {
    church_id: CHURCH_ID,
    campaign_id: campaignId,
    currency: "BBD",
    raised_amount_minor_text: "0",
    eligible_donation_count_text: "0",
  };
}

function draftRowToCampaign() {
  return { id: CAMPAIGN_ID, currency: "BBD" };
}

function activeRowToCampaign() {
  return { id: OTHER_CAMPAIGN_ID, currency: "BBD" };
}
