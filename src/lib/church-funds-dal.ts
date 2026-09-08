import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  CHURCH_FUND_LIMITS,
  isChurchFundAction,
  isChurchFundId,
  isChurchFundRequestId,
  isChurchFundSlug,
  type ChurchFund,
  type ChurchFundMutationInput,
  type ChurchFundsSnapshot,
} from "./church-funds";

export type ChurchFundsReadFailureReason = "forbidden" | "unavailable";
export type ChurchFundsReadResult =
  | Readonly<{ ok: true; snapshot: ChurchFundsSnapshot }>
  | Readonly<{ ok: false; reason: ChurchFundsReadFailureReason }>;

export type ChurchFundMutationFailureReason =
  | "forbidden"
  | "invalid_request"
  | "idempotency_conflict"
  | "revision_conflict"
  | "not_found"
  | "no_changes"
  | "name_conflict"
  | "slug_conflict"
  | "not_active"
  | "not_archived"
  | "order_boundary"
  | "order_exhausted"
  | "default_required"
  | "open_campaigns"
  | "active_recurring_gifts"
  | "unavailable";

export type ChurchFundMutationResult =
  | Readonly<{
      ok: true;
      fund: ChurchFund;
      fundsRevision: number;
      replayed: boolean;
    }>
  | Readonly<{ ok: false; reason: ChurchFundMutationFailureReason }>;

type RpcError = Readonly<{ message?: unknown }>;
type GeneratedMutateArgs =
  Database["public"]["Functions"]["mutate_church_fund"]["Args"];
type NullableMutateArgs = Omit<
  GeneratedMutateArgs,
  "fund_description" | "fund_name" | "fund_slug" | "target_fund_id"
> &
  Readonly<{
    fund_description: string | null;
    fund_name: string | null;
    fund_slug: string | null;
    target_fund_id: string | null;
  }>;

const INVALID_REQUEST_IDENTIFIERS = new Set([
  "FUNDS_INVALID_REQUEST_ID",
  "FUNDS_INVALID_EXPECTED_REVISION",
  "FUNDS_INVALID_OPERATION",
  "FUNDS_INVALID_ARGUMENTS",
  "FUNDS_INVALID_NAME",
  "FUNDS_INVALID_SLUG",
  "FUNDS_INVALID_DESCRIPTION",
]);
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function adaptNullableMutateArgs(args: NullableMutateArgs) {
  // Supabase typegen marks defaulted SQL text/UUID parameters as non-null when
  // they are supplied, although this RPC intentionally uses explicit nulls to
  // preserve one canonical operation shape. Limit adaptation to those fields.
  return args as GeneratedMutateArgs;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSortOrder(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 2_147_483_647
  );
}

function getCodePointLength(value: string) {
  return Array.from(value).length;
}

function isCanonicalInputName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= CHURCH_FUND_LIMITS.name &&
    value === value.trim().replace(/\s+/g, " ") &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function isDatabaseName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    getCodePointLength(value) >= 2 &&
    getCodePointLength(value) <= CHURCH_FUND_LIMITS.name &&
    value === value.trim().replace(/\s+/g, " ") &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function isCanonicalInputDescription(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= CHURCH_FUND_LIMITS.description &&
      value === value.trim() &&
      !value.includes("\r") &&
      !UNSAFE_MULTILINE_PATTERN.test(value))
  );
}

function isDatabaseDescription(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      getCodePointLength(value) > 0 &&
      getCodePointLength(value) <= CHURCH_FUND_LIMITS.description &&
      value === value.trim() &&
      !value.includes("\r") &&
      !UNSAFE_MULTILINE_PATTERN.test(value))
  );
}

function parseFundRow(value: unknown, churchId: string) {
  if (typeof value !== "object" || value === null) return null;

  const row = value as Record<string, unknown>;
  if (
    row.church_id !== churchId ||
    !isChurchFundId(row.fund_id) ||
    !isDatabaseName(row.name) ||
    !isChurchFundSlug(row.slug) ||
    !isDatabaseDescription(row.description) ||
    (row.status !== "active" && row.status !== "archived") ||
    typeof row.is_default !== "boolean" ||
    !isSortOrder(row.sort_order) ||
    !isRevision(row.funds_revision) ||
    (row.is_default && row.status !== "active")
  ) {
    return null;
  }

  return {
    fund: {
      id: row.fund_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      status: row.status,
      isDefault: row.is_default,
      sortOrder: row.sort_order,
    } satisfies ChurchFund,
    fundsRevision: row.funds_revision,
  };
}

function getErrorIdentifier(error: unknown) {
  return typeof error === "object" && error !== null
    ? (error as RpcError).message
    : undefined;
}

function mapMutationError(error: unknown): ChurchFundMutationFailureReason {
  const identifier = getErrorIdentifier(error);

  if (identifier === "FUNDS_FORBIDDEN") return "forbidden";
  if (identifier === "FUNDS_IDEMPOTENCY_CONFLICT") {
    return "idempotency_conflict";
  }
  if (identifier === "FUNDS_REVISION_CONFLICT") return "revision_conflict";
  if (identifier === "FUNDS_NOT_FOUND") return "not_found";
  if (identifier === "FUNDS_NO_CHANGES") return "no_changes";
  if (identifier === "FUNDS_NAME_CONFLICT") return "name_conflict";
  if (identifier === "FUNDS_SLUG_CONFLICT") return "slug_conflict";
  if (identifier === "FUNDS_NOT_ACTIVE") return "not_active";
  if (identifier === "FUNDS_NOT_ARCHIVED") return "not_archived";
  if (identifier === "FUNDS_ORDER_BOUNDARY") return "order_boundary";
  if (identifier === "FUNDS_ORDER_EXHAUSTED") return "order_exhausted";
  if (identifier === "FUNDS_DEFAULT_REQUIRED") return "default_required";
  if (identifier === "FUNDS_OPEN_CAMPAIGNS") return "open_campaigns";
  if (identifier === "FUNDS_ACTIVE_RECURRING_GIFTS") {
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

function hasValidMutationShape(input: ChurchFundMutationInput) {
  if (!isChurchFundAction(input.operation)) return false;

  if (input.operation === "create") {
    return (
      input.fundId === null &&
      isCanonicalInputName(input.name) &&
      isChurchFundSlug(input.slug) &&
      isCanonicalInputDescription(input.description)
    );
  }

  if (!isChurchFundId(input.fundId) || input.slug !== null) return false;

  if (input.operation === "update") {
    return (
      isCanonicalInputName(input.name) &&
      isCanonicalInputDescription(input.description)
    );
  }

  return input.name === null && input.description === null;
}

function hasExpectedResult(
  fund: ChurchFund,
  input: ChurchFundMutationInput,
) {
  if (input.operation !== "create" && fund.id !== input.fundId) return false;

  if (input.operation === "create") {
    return (
      fund.name === input.name &&
      fund.slug === input.slug &&
      fund.description === input.description &&
      fund.status === "active" &&
      !fund.isDefault
    );
  }

  if (input.operation === "update") {
    return fund.name === input.name && fund.description === input.description;
  }
  if (input.operation === "set_default") {
    return fund.status === "active" && fund.isDefault;
  }
  if (input.operation === "archive") {
    return fund.status === "archived" && !fund.isDefault;
  }
  if (input.operation === "restore") {
    return fund.status === "active" && !fund.isDefault;
  }

  return fund.status === "active";
}

/** Read all active and archived funds for one already-authorized workspace. */
export async function getChurchFunds(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<ChurchFundsReadResult> {
  if (!isChurchFundId(churchId)) {
    return { ok: false, reason: "unavailable" };
  }

  let response;
  try {
    response = await client.rpc("get_church_funds", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorIdentifier(response.error) === "FUNDS_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }
  if (!Array.isArray(response.data) || response.data.length === 0) {
    return { ok: false, reason: "unavailable" };
  }

  const funds: ChurchFund[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const names = new Set<string>();
  let revision: number | null = null;
  let defaultCount = 0;
  let archivedSeen = false;
  let previousActiveOrder: number | null = null;
  const activeOrders = new Set<number>();

  for (const value of response.data) {
    const parsed = parseFundRow(value, churchId);
    if (!parsed) return { ok: false, reason: "unavailable" };

    const { fund, fundsRevision } = parsed;
    if (
      ids.has(fund.id) ||
      slugs.has(fund.slug) ||
      names.has(fund.name)
    ) {
      return { ok: false, reason: "unavailable" };
    }
    ids.add(fund.id);
    slugs.add(fund.slug);
    names.add(fund.name);

    revision ??= fundsRevision;
    if (revision !== fundsRevision) {
      return { ok: false, reason: "unavailable" };
    }
    if (fund.isDefault) defaultCount += 1;

    if (fund.status === "archived") {
      archivedSeen = true;
    } else {
      if (archivedSeen) return { ok: false, reason: "unavailable" };
      if (
        previousActiveOrder !== null &&
        fund.sortOrder < previousActiveOrder
      ) {
        return { ok: false, reason: "unavailable" };
      }
      if (activeOrders.has(fund.sortOrder)) {
        return { ok: false, reason: "unavailable" };
      }
      activeOrders.add(fund.sortOrder);
      previousActiveOrder = fund.sortOrder;
    }

    funds.push(fund);
  }

  if (revision === null || defaultCount !== 1) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    snapshot: { churchId, fundsRevision: revision, funds },
  };
}

/**
 * Call the single atomic fund mutation RPC with a canonical operation shape.
 * Raw PostgreSQL errors and audit details never leave this adapter.
 */
export async function mutateChurchFund(
  client: SupabaseClient<Database>,
  requestId: string,
  churchId: string,
  expectedFundsRevision: number,
  input: ChurchFundMutationInput,
): Promise<ChurchFundMutationResult> {
  if (
    !isChurchFundRequestId(requestId) ||
    !isChurchFundId(churchId) ||
    !isRevision(expectedFundsRevision) ||
    !hasValidMutationShape(input)
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  let response;
  try {
    response = await client.rpc(
      "mutate_church_fund",
      adaptNullableMutateArgs({
        fund_request_id: requestId,
        target_church_id: churchId,
        expected_funds_revision: expectedFundsRevision,
        fund_operation: input.operation,
        target_fund_id: input.fundId,
        fund_name: input.name,
        fund_slug: input.slug,
        fund_description: input.description,
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
  const parsed = parseFundRow(row, churchId);
  if (
    !parsed ||
    parsed.fundsRevision !== expectedFundsRevision + 1 ||
    !hasExpectedResult(parsed.fund, input) ||
    typeof (row as Record<string, unknown>).replayed !== "boolean"
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    fund: parsed.fund,
    fundsRevision: parsed.fundsRevision,
    replayed: (row as Record<string, unknown>).replayed as boolean,
  };
}
