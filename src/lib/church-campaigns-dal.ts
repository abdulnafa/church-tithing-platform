import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  CHURCH_CAMPAIGN_LIMITS,
  isCanonicalNonnegativeDecimalText,
  isCanonicalPositiveCampaignMinorText,
  isChurchCampaignAction,
  isChurchCampaignCurrency,
  isChurchCampaignId,
  isChurchCampaignRequestId,
  isChurchCampaignSlug,
  type ChurchCampaign,
  type ChurchCampaignMutationInput,
  type ChurchCampaignProgress,
  type ChurchCampaignsSnapshot,
} from "./church-campaigns";

export type ChurchCampaignsReadFailureReason = "forbidden" | "unavailable";
export type ChurchCampaignsReadResult =
  | Readonly<{ ok: true; snapshot: ChurchCampaignsSnapshot }>
  | Readonly<{ ok: false; reason: ChurchCampaignsReadFailureReason }>;

export type ChurchCampaignProgressReadResult =
  | Readonly<{ ok: true; progress: readonly ChurchCampaignProgress[] }>
  | Readonly<{ ok: false; reason: ChurchCampaignsReadFailureReason }>;

export type ChurchCampaignMutationFailureReason =
  | "forbidden"
  | "invalid_request"
  | "idempotency_conflict"
  | "revision_conflict"
  | "not_found"
  | "no_changes"
  | "name_conflict"
  | "slug_conflict"
  | "fund_not_active"
  | "currency_mismatch"
  | "window_ended"
  | "not_draft"
  | "not_active"
  | "not_closed"
  | "not_archived"
  | "active_recurring_gifts"
  | "unavailable";

export type ChurchCampaignMutationResult =
  | Readonly<{
      ok: true;
      campaign: ChurchCampaign;
      campaignsRevision: number;
      replayed: boolean;
    }>
  | Readonly<{ ok: false; reason: ChurchCampaignMutationFailureReason }>;

type RpcError = Readonly<{ message?: unknown }>;
type GeneratedMutateArgs =
  Database["public"]["Functions"]["mutate_church_campaign"]["Args"];
type NullableMutateArgs = Omit<
  GeneratedMutateArgs,
  | "campaign_description"
  | "campaign_fund_id"
  | "campaign_goal_amount_minor_text"
  | "campaign_name"
  | "campaign_slug"
  | "target_campaign_id"
> &
  Readonly<{
    campaign_description: string | null;
    campaign_fund_id: string | null;
    campaign_goal_amount_minor_text: string | null;
    campaign_name: string | null;
    campaign_slug: string | null;
    target_campaign_id: string | null;
  }>;

const INVALID_REQUEST_IDENTIFIERS = new Set([
  "CAMPAIGNS_INVALID_REQUEST_ID",
  "CAMPAIGNS_INVALID_EXPECTED_REVISION",
  "CAMPAIGNS_INVALID_OPERATION",
  "CAMPAIGNS_INVALID_ARGUMENTS",
  "CAMPAIGNS_INVALID_NAME",
  "CAMPAIGNS_INVALID_SLUG",
  "CAMPAIGNS_INVALID_DESCRIPTION",
  "CAMPAIGNS_INVALID_GOAL",
]);
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const RFC3339_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const STATUS_ORDER = {
  draft: 0,
  active: 1,
  closed: 2,
  archived: 3,
} as const;

function adaptNullableMutateArgs(args: NullableMutateArgs) {
  // Typegen marks supplied defaulted parameters as non-null. The database RPC
  // deliberately requires explicit nulls for one canonical operation shape.
  return args as GeneratedMutateArgs;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function getCodePointLength(value: string) {
  return Array.from(value).length;
}

function isCanonicalName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    getCodePointLength(value) >= 2 &&
    getCodePointLength(value) <= CHURCH_CAMPAIGN_LIMITS.name &&
    value === value.trim().replace(/\s+/g, " ") &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function isCanonicalDescription(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      getCodePointLength(value) >= 1 &&
      getCodePointLength(value) <= CHURCH_CAMPAIGN_LIMITS.description &&
      value === value.trim() &&
      !value.includes("\r") &&
      !UNSAFE_MULTILINE_PATTERN.test(value))
  );
}

function normalizeTimestamp(value: unknown) {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !RFC3339_TIMESTAMP_PATTERN.test(value)
  ) {
    return undefined;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : undefined;
}

function parseCampaignRow(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const startsAt = normalizeTimestamp(row.starts_at);
  const endsAt = normalizeTimestamp(row.ends_at);
  if (
    !isChurchCampaignId(row.campaign_id) ||
    !isChurchCampaignId(row.fund_id) ||
    !isCanonicalName(row.name) ||
    !isChurchCampaignSlug(row.slug) ||
    !isCanonicalDescription(row.description) ||
    (row.status !== "draft" &&
      row.status !== "active" &&
      row.status !== "closed" &&
      row.status !== "archived") ||
    (row.goal_amount_minor_text !== null &&
      !isCanonicalPositiveCampaignMinorText(row.goal_amount_minor_text)) ||
    !isChurchCampaignCurrency(row.currency) ||
    startsAt === undefined ||
    endsAt === undefined ||
    (startsAt !== null && endsAt !== null && endsAt <= startsAt)
  ) {
    return null;
  }

  return {
    id: row.campaign_id,
    fundId: row.fund_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    goalAmountMinorText: row.goal_amount_minor_text,
    currency: row.currency,
    startsAt,
    endsAt,
  } satisfies ChurchCampaign;
}

function getErrorIdentifier(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as RpcError).message
    : undefined;
}

function mapMutationError(
  error: unknown,
): ChurchCampaignMutationFailureReason {
  const identifier = getErrorIdentifier(error);
  if (identifier === "CAMPAIGNS_FORBIDDEN") return "forbidden";
  if (identifier === "CAMPAIGNS_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "CAMPAIGNS_REVISION_CONFLICT") {
    return "revision_conflict";
  }
  if (identifier === "CAMPAIGNS_NOT_FOUND") return "not_found";
  if (identifier === "CAMPAIGNS_NO_CHANGES") return "no_changes";
  if (identifier === "CAMPAIGNS_NAME_CONFLICT") return "name_conflict";
  if (identifier === "CAMPAIGNS_SLUG_CONFLICT") return "slug_conflict";
  if (identifier === "CAMPAIGNS_FUND_NOT_ACTIVE") {
    return "fund_not_active";
  }
  if (identifier === "CAMPAIGNS_CURRENCY_MISMATCH") {
    return "currency_mismatch";
  }
  if (identifier === "CAMPAIGNS_WINDOW_ENDED") return "window_ended";
  if (identifier === "CAMPAIGNS_NOT_DRAFT") return "not_draft";
  if (identifier === "CAMPAIGNS_NOT_ACTIVE") return "not_active";
  if (identifier === "CAMPAIGNS_NOT_CLOSED") return "not_closed";
  if (identifier === "CAMPAIGNS_NOT_ARCHIVED") return "not_archived";
  if (identifier === "CAMPAIGNS_ACTIVE_RECURRING_GIFTS") {
    return "active_recurring_gifts";
  }
  if (
    typeof identifier === "string" &&
    INVALID_REQUEST_IDENTIFIERS.has(identifier)
  ) {
    return "invalid_request";
  }
  return "unavailable";
}

function hasValidMutationShape(input: ChurchCampaignMutationInput) {
  if (!isChurchCampaignAction(input.operation)) return false;

  if (input.operation === "create") {
    return (
      input.campaignId === null &&
      isCanonicalName(input.name) &&
      isChurchCampaignSlug(input.slug) &&
      isCanonicalDescription(input.description) &&
      isChurchCampaignId(input.fundId) &&
      (input.goalAmountMinorText === null ||
        isCanonicalPositiveCampaignMinorText(input.goalAmountMinorText))
    );
  }

  if (!isChurchCampaignId(input.campaignId) || input.slug !== null) {
    return false;
  }

  if (input.operation === "update") {
    return (
      isCanonicalName(input.name) &&
      isCanonicalDescription(input.description) &&
      isChurchCampaignId(input.fundId) &&
      (input.goalAmountMinorText === null ||
        isCanonicalPositiveCampaignMinorText(input.goalAmountMinorText))
    );
  }

  return (
    input.name === null &&
    input.description === null &&
    input.fundId === null &&
    input.goalAmountMinorText === null
  );
}

function hasExpectedResult(
  campaign: ChurchCampaign,
  input: ChurchCampaignMutationInput,
) {
  if (input.operation !== "create" && campaign.id !== input.campaignId) {
    return false;
  }
  if (input.operation === "create") {
    return (
      campaign.name === input.name &&
      campaign.slug === input.slug &&
      campaign.description === input.description &&
      campaign.fundId === input.fundId &&
      campaign.goalAmountMinorText === input.goalAmountMinorText &&
      campaign.status === "draft" &&
      campaign.startsAt === null &&
      campaign.endsAt === null
    );
  }
  if (input.operation === "update") {
    return (
      campaign.name === input.name &&
      campaign.description === input.description &&
      campaign.fundId === input.fundId &&
      campaign.goalAmountMinorText === input.goalAmountMinorText &&
      campaign.status === "draft"
    );
  }

  const expectedStatus = {
    activate: "active",
    close: "closed",
    archive: "archived",
    restore: "closed",
  } as const;
  return campaign.status === expectedStatus[input.operation];
}

/** Read an atomic tenant campaign snapshot, including the valid empty state. */
export async function getChurchCampaigns(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<ChurchCampaignsReadResult> {
  if (!isChurchCampaignId(churchId)) {
    return { ok: false, reason: "unavailable" };
  }

  let response;
  try {
    response = await client.rpc("get_church_campaigns", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorIdentifier(response.error) === "CAMPAIGNS_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }
  const unwrappedSnapshot = Array.isArray(response.data)
    ? response.data.length === 1
      ? response.data[0]
      : null
    : response.data;
  if (typeof unwrappedSnapshot !== "object" || unwrappedSnapshot === null) {
    return { ok: false, reason: "unavailable" };
  }

  const snapshotRow = unwrappedSnapshot as Record<string, unknown>;
  if (
    snapshotRow.church_id !== churchId ||
    !isRevision(snapshotRow.campaigns_revision) ||
    !Array.isArray(snapshotRow.campaigns)
  ) {
    return { ok: false, reason: "unavailable" };
  }

  const campaigns: ChurchCampaign[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const names = new Set<string>();
  let previousStatusOrder = -1;

  for (const value of snapshotRow.campaigns) {
    const campaign = parseCampaignRow(value);
    if (!campaign) return { ok: false, reason: "unavailable" };
    const statusOrder = STATUS_ORDER[campaign.status];
    if (
      ids.has(campaign.id) ||
      slugs.has(campaign.slug) ||
      names.has(campaign.name) ||
      statusOrder < previousStatusOrder
    ) {
      return { ok: false, reason: "unavailable" };
    }
    ids.add(campaign.id);
    slugs.add(campaign.slug);
    names.add(campaign.name);
    previousStatusOrder = statusOrder;
    campaigns.push(campaign);
  }

  return {
    ok: true,
    snapshot: {
      churchId,
      campaignsRevision: snapshotRow.campaigns_revision,
      campaigns,
    },
  };
}

/**
 * Read financial progress only after the page has verified financial_read.
 * The database independently verifies both campaigns_read and financial_read.
 */
export async function getChurchCampaignProgress(
  client: SupabaseClient<Database>,
  churchId: string,
  campaigns: readonly Pick<ChurchCampaign, "id" | "currency">[],
): Promise<ChurchCampaignProgressReadResult> {
  if (!isChurchCampaignId(churchId)) {
    return { ok: false, reason: "unavailable" };
  }

  let response;
  try {
    response = await client.rpc("get_church_campaign_progress", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorIdentifier(response.error) === "CAMPAIGNS_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }
  if (!Array.isArray(response.data) || response.data.length !== campaigns.length) {
    return { ok: false, reason: "unavailable" };
  }

  const rowsByCampaign = new Map<string, ChurchCampaignProgress>();
  for (const value of response.data) {
    if (typeof value !== "object" || value === null) {
      return { ok: false, reason: "unavailable" };
    }
    const row = value as Record<string, unknown>;
    if (
      row.church_id !== churchId ||
      !isChurchCampaignId(row.campaign_id) ||
      !isChurchCampaignCurrency(row.currency) ||
      !isCanonicalNonnegativeDecimalText(row.raised_amount_minor_text) ||
      !isCanonicalNonnegativeDecimalText(row.eligible_donation_count_text) ||
      rowsByCampaign.has(row.campaign_id)
    ) {
      return { ok: false, reason: "unavailable" };
    }
    rowsByCampaign.set(row.campaign_id, {
      campaignId: row.campaign_id,
      currency: row.currency,
      raisedAmountMinorText: row.raised_amount_minor_text,
      eligibleDonationCountText: row.eligible_donation_count_text,
    });
  }

  const progress: ChurchCampaignProgress[] = [];
  for (const campaign of campaigns) {
    const row = rowsByCampaign.get(campaign.id);
    if (!row || row.currency !== campaign.currency) {
      return { ok: false, reason: "unavailable" };
    }
    progress.push(row);
  }
  return { ok: true, progress };
}

/** Call the single audited, idempotent campaign mutation boundary. */
export async function mutateChurchCampaign(
  client: SupabaseClient<Database>,
  requestId: string,
  churchId: string,
  expectedCampaignsRevision: number,
  input: ChurchCampaignMutationInput,
): Promise<ChurchCampaignMutationResult> {
  if (
    !isChurchCampaignRequestId(requestId) ||
    !isChurchCampaignId(churchId) ||
    !isRevision(expectedCampaignsRevision) ||
    !hasValidMutationShape(input)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  let response;
  try {
    response = await client.rpc(
      "mutate_church_campaign",
      adaptNullableMutateArgs({
        campaign_request_id: requestId,
        target_church_id: churchId,
        expected_campaigns_revision: expectedCampaignsRevision,
        campaign_operation: input.operation,
        target_campaign_id: input.campaignId,
        campaign_name: input.name,
        campaign_slug: input.slug,
        campaign_description: input.description,
        campaign_fund_id: input.fundId,
        campaign_goal_amount_minor_text: input.goalAmountMinorText,
      }),
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.error) {
    return { ok: false, reason: mapMutationError(response.error) };
  }

  const row = Array.isArray(response.data)
    ? response.data.length === 1
      ? response.data[0]
      : null
    : response.data;
  const campaign = parseCampaignRow(row);
  if (
    !campaign ||
    typeof row !== "object" ||
    row === null ||
    (row as Record<string, unknown>).church_id !== churchId ||
    !isRevision((row as Record<string, unknown>).campaigns_revision) ||
    (row as Record<string, unknown>).campaigns_revision !==
      expectedCampaignsRevision + 1 ||
    typeof (row as Record<string, unknown>).replayed !== "boolean" ||
    !hasExpectedResult(campaign, input)
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    campaign,
    campaignsRevision: (row as Record<string, unknown>)
      .campaigns_revision as number,
    replayed: (row as Record<string, unknown>).replayed as boolean,
  };
}
