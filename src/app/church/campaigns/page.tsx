import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  ChurchCampaignManager,
  type ChurchCampaignFundOption,
  type ChurchCampaignManagerRequestIds,
  type ChurchCampaignManagerSnapshot,
} from "@/components/church-campaign-manager";
import {
  ChurchFundManager,
  type ChurchFundManagerSnapshot,
  type ChurchFundManagerRequestIds,
} from "@/components/church-fund-manager";
import { ShieldIcon } from "@/components/icons";
import { requireAnyChurchPermission } from "@/lib/auth/guards";
import { hasChurchPermission } from "@/lib/auth/permissions";
import type { ChurchCampaign } from "@/lib/church-campaigns";
import {
  getChurchCampaignProgress,
  getChurchCampaigns,
} from "@/lib/church-campaigns-dal";
import type { ChurchFund } from "@/lib/church-funds";
import { getChurchFunds } from "@/lib/church-funds-dal";
import { getServerNowMilliseconds } from "@/lib/server-clock";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Church funds & campaigns",
  description: "Manage persisted church funds and giving campaigns.",
};

export default async function ChurchCampaignsPage() {
  const { workspace } = await requireAnyChurchPermission([
    "funds_read",
    "campaigns_read",
  ]);
  const canReadFunds = hasChurchPermission(
    workspace.permissions,
    "funds_read",
  );
  const canManageFunds =
    canReadFunds &&
    hasChurchPermission(workspace.permissions, "funds_manage");
  const canReadCampaigns = hasChurchPermission(
    workspace.permissions,
    "campaigns_read",
  );
  const canManageCampaigns =
    canReadCampaigns &&
    canReadFunds &&
    hasChurchPermission(workspace.permissions, "campaigns_manage");
  const canReadCampaignProgress =
    canReadCampaigns &&
    hasChurchPermission(workspace.permissions, "financial_read");

  let fundManager: ReactNode = null;
  let campaignManager: ReactNode = null;
  const supabase = await createServerSupabaseClient();
  const [fundResult, campaignResult, nowMilliseconds] = await Promise.all([
    canReadFunds ? getChurchFunds(supabase, workspace.churchId) : null,
    canReadCampaigns ? getChurchCampaigns(supabase, workspace.churchId) : null,
    canReadCampaigns ? getServerNowMilliseconds() : null,
  ]);

  if (fundResult) {
    if (!fundResult.ok) {
      throw new Error("Church funds are temporarily unavailable.");
    }
    fundManager = (
      <ChurchFundManager
        canManage={canManageFunds}
        key={`${workspace.churchId}:${fundResult.snapshot.fundsRevision}`}
        requestIds={createFundRequestIds(fundResult.snapshot.funds)}
        snapshot={createFundManagerSnapshot(fundResult.snapshot)}
      />
    );
  }

  if (campaignResult) {
    if (!campaignResult.ok) {
      throw new Error("Church campaigns are temporarily unavailable.");
    }

    const funds = fundResult?.ok ? fundResult.snapshot.funds : [];
    const campaignProps = {
      activeFunds: createCampaignFundOptions(funds),
      canManage: canManageCampaigns,
      requestIds: createCampaignRequestIds(campaignResult.snapshot.campaigns),
      snapshot: createCampaignManagerSnapshot(
        campaignResult.snapshot,
        funds,
        nowMilliseconds ?? 0,
      ),
    };

    if (canReadCampaignProgress) {
      const progressResult = await getChurchCampaignProgress(
        supabase,
        workspace.churchId,
        campaignResult.snapshot.campaigns,
      );
      campaignManager = progressResult.ok ? (
        <ChurchCampaignManager
          {...campaignProps}
          key={`${workspace.churchId}:${campaignResult.snapshot.campaignsRevision}`}
          progress={progressResult.progress}
          progressState="available"
        />
      ) : (
        <ChurchCampaignManager
          {...campaignProps}
          key={`${workspace.churchId}:${campaignResult.snapshot.campaignsRevision}`}
          progressState="unavailable"
        />
      );
    } else {
      // Keep the unauthorized RSC tree free of donation-derived values. The
      // progress RPC is not called and no progress prop crosses the boundary.
      campaignManager = (
        <ChurchCampaignManager
          {...campaignProps}
          key={`${workspace.churchId}:${campaignResult.snapshot.campaignsRevision}`}
          progressState="hidden"
        />
      );
    }
  }

  return (
    <main
      className="mx-auto min-w-0 max-w-6xl space-y-6 pb-24"
      key={workspace.churchId}
    >
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
            Giving destinations
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">
            Funds & campaigns
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Keep giving categories organized without changing historical gifts.
            Fund and campaign settings on this page are saved for the selected
            church.
          </p>
        </div>
        {canManageFunds || canManageCampaigns ? (
          <p className="flex max-w-xs items-start gap-2 rounded-2xl bg-[var(--sage-pale)] px-4 py-3 text-[10px] leading-5 text-[var(--sage-dark)]">
            <ShieldIcon className="mt-0.5 shrink-0" size={14} />
            Owner-only fund and campaign controls are enforced again on every
            save or lifecycle change.
          </p>
        ) : null}
      </header>

      {fundManager}

      {campaignManager}
    </main>
  );
}

function createFundRequestIds(
  funds: readonly ChurchFund[],
): ChurchFundManagerRequestIds {
  return {
    create: randomUUID(),
    funds: funds.map((fund) => ({
      fundId: fund.id,
      update: randomUUID(),
      setDefault: randomUUID(),
      moveUp: randomUUID(),
      moveDown: randomUUID(),
      archive: randomUUID(),
      restore: randomUUID(),
    })),
  };
}

function createFundManagerSnapshot(
  snapshot: Readonly<{
    churchId: string;
    fundsRevision: number;
    funds: readonly ChurchFund[];
  }>,
): ChurchFundManagerSnapshot {
  return {
    churchId: snapshot.churchId,
    fundsRevision: snapshot.fundsRevision,
    funds: snapshot.funds.map((fund) => ({
      id: fund.id,
      name: fund.name,
      description: fund.description,
      status: fund.status,
      isDefault: fund.isDefault,
      sortOrder: fund.sortOrder,
    })),
  };
}

function createCampaignRequestIds(
  campaigns: readonly ChurchCampaign[],
): ChurchCampaignManagerRequestIds {
  return {
    create: randomUUID(),
    campaigns: campaigns.map((campaign) => ({
      campaignId: campaign.id,
      update: randomUUID(),
      activate: randomUUID(),
      close: randomUUID(),
      archive: randomUUID(),
      restore: randomUUID(),
    })),
  };
}

function createCampaignFundOptions(
  funds: readonly ChurchFund[],
): readonly ChurchCampaignFundOption[] {
  return funds
    .filter((fund) => fund.status === "active")
    .map((fund) => ({ id: fund.id, name: fund.name }));
}

function createCampaignManagerSnapshot(
  snapshot: Readonly<{
    churchId: string;
    campaignsRevision: number;
    campaigns: readonly ChurchCampaign[];
  }>,
  funds: readonly ChurchFund[],
  nowMilliseconds: number,
): ChurchCampaignManagerSnapshot {
  const fundNames = new Map(funds.map((fund) => [fund.id, fund.name]));
  return {
    churchId: snapshot.churchId,
    campaignsRevision: snapshot.campaignsRevision,
    campaigns: snapshot.campaigns.map((campaign) => ({
      id: campaign.id,
      fundId: campaign.fundId,
      fundName: fundNames.get(campaign.fundId) ?? "Assigned church fund",
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      goalAmountMinorText: campaign.goalAmountMinorText,
      currency: campaign.currency,
      visibilityStartsLabel: formatUtcTimestamp(campaign.startsAt),
      visibilityEndsLabel: formatUtcTimestamp(campaign.endsAt),
      windowState: getWindowState(campaign, nowMilliseconds),
    })),
  };
}

function formatUtcTimestamp(timestamp: string | null) {
  if (timestamp === null) return null;
  return `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} UTC`;
}

function getWindowState(
  campaign: Pick<ChurchCampaign, "startsAt" | "endsAt">,
  nowMilliseconds: number,
): "none" | "scheduled" | "open" | "ended" {
  if (campaign.startsAt === null && campaign.endsAt === null) return "none";
  if (
    campaign.endsAt !== null &&
    Date.parse(campaign.endsAt) <= nowMilliseconds
  ) {
    return "ended";
  }
  if (
    campaign.startsAt !== null &&
    Date.parse(campaign.startsAt) > nowMilliseconds
  ) {
    return "scheduled";
  }
  return "open";
}
