import "server-only";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createPublicServerSupabaseClient } from "@/lib/supabase/public-server";

import type {
  PublicGivingCampaign,
  PublicGivingFund,
  PublicGivingPageData,
} from "./public-giving";

export type PublicGivingPageResult =
  | Readonly<{ ok: true; page: PublicGivingPageData }>
  | Readonly<{ ok: false; reason: "not_found" | "unavailable" }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MULTILINE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const POSITIVE_MINOR_UNITS_PATTERN = /^[1-9][0-9]{0,18}$/;
const MAX_SAFE_MINOR_UNITS = BigInt("9007199254740991");
const SUPPORTED_CURRENCIES = new Set(["BBD", "USD", "CAD", "XCD"]);
const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSafeCodePointLength(value: string, minimum: number, maximum: number) {
  const length = Array.from(value).length;
  return length >= minimum && length <= maximum;
}

function isSafeSingleLineText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().replace(/\s+/g, " ") &&
    hasSafeCodePointLength(value, 2, maximum) &&
    !SINGLE_LINE_CONTROL_PATTERN.test(value)
  );
}

function isSafeOptionalMultilineText(
  value: unknown,
  maximum: number,
): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value === value.trim() &&
      hasSafeCodePointLength(value, 1, maximum) &&
      !value.includes("\r") &&
      !MULTILINE_CONTROL_PATTERN.test(value))
  );
}

export function isPublicGivingSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 63 &&
    SLUG_PATTERN.test(value)
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCurrency(
  value: unknown,
): value is PublicGivingPageData["church"]["currency"] {
  return typeof value === "string" && SUPPORTED_CURRENCIES.has(value);
}

function isNullableColor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && HEX_COLOR_PATTERN.test(value));
}

function parseMinorUnits(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !POSITIVE_MINOR_UNITS_PATTERN.test(value)) {
    return undefined;
  }

  try {
    return BigInt(value) <= MAX_SAFE_MINOR_UNITS ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseFund(value: unknown): PublicGivingFund | null {
  if (!isRecord(value)) return null;
  if (
    !isUuid(value.fund_id) ||
    !isSafeSingleLineText(value.name, 120) ||
    !isSafeOptionalMultilineText(value.description, 500) ||
    typeof value.is_default !== "boolean"
  ) {
    return null;
  }

  return {
    id: value.fund_id,
    name: value.name,
    description: value.description,
    isDefault: value.is_default,
  };
}

function parseCampaign(value: unknown, fundIds: ReadonlySet<string>) {
  if (!isRecord(value)) return null;
  const goalAmountMinor = parseMinorUnits(value.goal_amount_minor_text);
  if (
    !isUuid(value.campaign_id) ||
    !isUuid(value.fund_id) ||
    !fundIds.has(value.fund_id) ||
    !isSafeSingleLineText(value.name, 120) ||
    !isSafeOptionalMultilineText(value.description, 1_000) ||
    goalAmountMinor === undefined
  ) {
    return null;
  }

  return {
    id: value.campaign_id,
    fundId: value.fund_id,
    name: value.name,
    description: value.description,
    goalAmountMinor,
  } satisfies PublicGivingCampaign;
}

function parseUniqueFunds(value: unknown) {
  if (!Array.isArray(value)) return null;

  const funds: PublicGivingFund[] = [];
  const ids = new Set<string>();
  let defaultCount = 0;
  for (const candidate of value) {
    const fund = parseFund(candidate);
    if (!fund || ids.has(fund.id)) return null;
    ids.add(fund.id);
    if (fund.isDefault) defaultCount += 1;
    funds.push(fund);
  }

  if (funds.length === 0 || defaultCount !== 1) return null;
  return funds;
}

function parseUniqueCampaigns(value: unknown, fundIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return null;

  const campaigns: PublicGivingCampaign[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const campaign = parseCampaign(candidate, fundIds);
    if (!campaign || ids.has(campaign.id)) return null;
    ids.add(campaign.id);
    campaigns.push(campaign);
  }
  return campaigns;
}

function createLogoUrl(
  supabaseUrl: string,
  churchId: string,
  storagePath: unknown,
) {
  if (storagePath === null) return null;
  if (typeof storagePath !== "string") return undefined;

  const logoObjectPattern = new RegExp(
    `^${churchId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$`,
  );
  if (!logoObjectPattern.test(storagePath)) return undefined;

  try {
    const configured = new URL(supabaseUrl);
    const hasSafeProtocol =
      configured.protocol === "https:" ||
      (configured.protocol === "http:" &&
        LOCAL_SUPABASE_HOSTS.has(configured.hostname));
    if (
      !hasSafeProtocol ||
      configured.username ||
      configured.password ||
      configured.hostname.includes("*") ||
      configured.search ||
      configured.hash ||
      (configured.pathname !== "/" && configured.pathname !== "")
    ) {
      return undefined;
    }

    const url = new URL(
      `/storage/v1/object/public/church-logos/${storagePath}`,
      configured.origin,
    );
    return url.toString();
  } catch {
    return undefined;
  }
}

function getSingleRow(data: unknown) {
  if (!Array.isArray(data)) return undefined;
  if (data.length === 0) return null;
  return data.length === 1 ? data[0] : undefined;
}

export function parsePublicGivingPageRow(
  value: unknown,
  requestedSlug: string,
  supabaseUrl: string,
): PublicGivingPageData | null {
  if (!isRecord(value)) return null;

  const churchId = value.church_id;
  if (
    !isUuid(churchId) ||
    value.church_slug !== requestedSlug ||
    !isSafeSingleLineText(value.display_name, 120) ||
    !isCurrency(value.default_currency) ||
    !isNullableColor(value.primary_color) ||
    !isNullableColor(value.secondary_color) ||
    !isSafeOptionalMultilineText(value.thank_you_message, 500)
  ) {
    return null;
  }

  const logoUrl = createLogoUrl(supabaseUrl, churchId, value.logo_storage_path);
  if (logoUrl === undefined) return null;

  const funds = parseUniqueFunds(value.funds);
  if (!funds) return null;
  const campaigns = parseUniqueCampaigns(
    value.campaigns,
    new Set(funds.map((fund) => fund.id)),
  );
  if (!campaigns) return null;

  return {
    church: {
      slug: requestedSlug,
      name: value.display_name,
      currency: value.default_currency,
      logoUrl,
      primaryColor: value.primary_color,
      secondaryColor: value.secondary_color,
      thankYouMessage: value.thank_you_message,
    },
    funds,
    campaigns,
  };
}

export async function getPublicGivingPageBySlug(
  slug: string,
): Promise<PublicGivingPageResult> {
  if (!isPublicGivingSlug(slug)) return { ok: false, reason: "not_found" };

  let response: RpcResponse;
  let supabaseUrl: string;
  try {
    const client = createPublicServerSupabaseClient();
    supabaseUrl = getSupabasePublicConfig().url;
    response = await client.rpc("get_public_giving_page", {
      church_slug: slug,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) return { ok: false, reason: "unavailable" };
  const row = getSingleRow(response.data);
  if (row === null) return { ok: false, reason: "not_found" };
  if (row === undefined) return { ok: false, reason: "unavailable" };

  const page = parsePublicGivingPageRow(row, slug, supabaseUrl);
  return page
    ? { ok: true, page }
    : { ok: false, reason: "unavailable" };
}
