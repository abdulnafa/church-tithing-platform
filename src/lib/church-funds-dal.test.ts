import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { getChurchFunds, mutateChurchFund } from "./church-funds-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CHURCH_ID = "20000000-0000-4000-8000-000000000001";
const DEFAULT_ID = "30000000-0000-4000-8000-000000000001";
const FUND_ID = "30000000-0000-4000-8000-000000000002";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";

const defaultRow = {
  church_id: CHURCH_ID,
  fund_id: DEFAULT_ID,
  name: "Tithes",
  slug: "tithes",
  description: "General tithes",
  status: "active",
  is_default: true,
  sort_order: 0,
  funds_revision: 4,
} as const;
const activeRow = {
  ...defaultRow,
  fund_id: FUND_ID,
  name: "Missions",
  slug: "missions",
  description: null,
  is_default: false,
  sort_order: 10,
} as const;
const archivedRow = {
  ...activeRow,
  fund_id: "30000000-0000-4000-8000-000000000003",
  name: "Building Fund",
  slug: "building-fund",
  status: "archived",
} as const;
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;
const malformedLists: readonly unknown[] = [
  [],
  [{ ...defaultRow, church_id: OTHER_CHURCH_ID }],
  [{ ...defaultRow, funds_revision: "4" }],
  [{ ...defaultRow, status: "deleted" }],
  [{ ...defaultRow, is_default: false }],
  [defaultRow, { ...activeRow, fund_id: DEFAULT_ID }],
  [defaultRow, { ...activeRow, slug: "tithes" }],
  [defaultRow, { ...activeRow, name: "TITHES" }],
  [activeRow, defaultRow],
  [defaultRow, { ...activeRow, funds_revision: 5 }],
  [defaultRow, { ...activeRow, sort_order: 0 }],
  [defaultRow, { ...activeRow, description: "\u00a0Not canonical\u00a0" }],
];

describe("church funds DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: [defaultRow, activeRow, archivedRow],
      error: null,
    });
  });

  it("reads the exact tenant RPC and maps only minimum fund fields", async () => {
    await expect(getChurchFunds(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        fundsRevision: 4,
        funds: [
          {
            id: DEFAULT_ID,
            name: "Tithes",
            slug: "tithes",
            description: "General tithes",
            status: "active",
            isDefault: true,
            sortOrder: 0,
          },
          {
            id: FUND_ID,
            name: "Missions",
            slug: "missions",
            description: null,
            status: "active",
            isDefault: false,
            sortOrder: 10,
          },
          {
            id: "30000000-0000-4000-8000-000000000003",
            name: "Building Fund",
            slug: "building-fund",
            description: null,
            status: "archived",
            isDefault: false,
            sortOrder: 10,
          },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_funds", {
      target_church_id: CHURCH_ID,
    });
  });

  it("counts database text limits by Unicode code points", async () => {
    const databaseName = "🙏".repeat(61);
    const databaseDescription = "🙏".repeat(251);
    rpc.mockResolvedValueOnce({
      data: [
        defaultRow,
        {
          ...activeRow,
          name: databaseName,
          description: databaseDescription,
        },
        archivedRow,
      ],
      error: null,
    });

    const result = await getChurchFunds(client, CHURCH_ID);

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.snapshot.funds[1]).toMatchObject({
        name: databaseName,
        description: databaseDescription,
      });
    }
  });

  it("maps read authorization and never exposes raw errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "FUNDS_FORBIDDEN" } });
    await expect(getChurchFunds(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: "secret relation" } });
    const result = await getChurchFunds(client, CHURCH_ID);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret relation");
  });

  it.each(malformedLists)("fails a malformed or inconsistent list closed %#", async (data) => {
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(getChurchFunds(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("calls the exact create operation and verifies the returned snapshot", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ...activeRow,
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Sunday youth giving",
        funds_revision: 5,
        replayed: false,
      },
      error: null,
    });

    await expect(
      mutateChurchFund(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "create",
        fundId: null,
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Sunday youth giving",
      }),
    ).resolves.toMatchObject({
      ok: true,
      fundsRevision: 5,
      replayed: false,
      fund: { name: "Youth Ministry", slug: "youth-ministry" },
    });
    expect(rpc).toHaveBeenCalledWith("mutate_church_fund", {
      fund_request_id: REQUEST_ID,
      target_church_id: CHURCH_ID,
      expected_funds_revision: 4,
      fund_operation: "create",
      target_fund_id: null,
      fund_name: "Youth Ministry",
      fund_slug: "youth-ministry",
      fund_description: "Sunday youth giving",
    });
  });

  it("keeps the slug out of updates and requires the exact target result", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ...activeRow,
        name: "Global Missions",
        description: "Updated",
        funds_revision: 5,
        replayed: true,
      },
      error: null,
    });
    const input = {
      operation: "update" as const,
      fundId: FUND_ID,
      name: "Global Missions",
      slug: null,
      description: "Updated",
    };
    await expect(
      mutateChurchFund(client, REQUEST_ID, CHURCH_ID, 4, input),
    ).resolves.toMatchObject({ ok: true, replayed: true });
    expect(rpc).toHaveBeenCalledWith(
      "mutate_church_fund",
      expect.objectContaining({ target_fund_id: FUND_ID, fund_slug: null }),
    );

    rpc.mockResolvedValueOnce({
      data: {
        ...activeRow,
        fund_id: DEFAULT_ID,
        name: "Global Missions",
        description: "Updated",
        funds_revision: 5,
        replayed: false,
      },
      error: null,
    });
    await expect(
      mutateChurchFund(client, REQUEST_ID, CHURCH_ID, 4, input),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["FUNDS_FORBIDDEN", "forbidden"],
    ["FUNDS_INVALID_NAME", "invalid_request"],
    ["FUNDS_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["FUNDS_REVISION_CONFLICT", "revision_conflict"],
    ["FUNDS_NOT_FOUND", "not_found"],
    ["FUNDS_NO_CHANGES", "no_changes"],
    ["FUNDS_NAME_CONFLICT", "name_conflict"],
    ["FUNDS_SLUG_CONFLICT", "slug_conflict"],
    ["FUNDS_NOT_ACTIVE", "not_active"],
    ["FUNDS_NOT_ARCHIVED", "not_archived"],
    ["FUNDS_ORDER_BOUNDARY", "order_boundary"],
    ["FUNDS_ORDER_EXHAUSTED", "order_exhausted"],
    ["FUNDS_DEFAULT_REQUIRED", "default_required"],
    ["FUNDS_OPEN_CAMPAIGNS", "open_campaigns"],
    ["FUNDS_ACTIVE_RECURRING_GIFTS", "active_recurring_gifts"],
  ] as const)("maps the safe database token %s", async (message, reason) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } });
    await expect(
      mutateChurchFund(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "archive",
        fundId: FUND_ID,
        name: null,
        slug: null,
        description: null,
      }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("rejects malformed input and malformed successful output without calling or trusting it", async () => {
    await expect(
      mutateChurchFund(client, REQUEST_ID, CHURCH_ID, 4, {
        operation: "update",
        fundId: FUND_ID,
        name: "Updated",
        slug: "attempted-change",
        description: null,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();

    for (const data of [
      { ...activeRow, funds_revision: 4, replayed: false },
      { ...activeRow, funds_revision: 6, replayed: false },
      { ...activeRow, funds_revision: 5, replayed: "yes" },
      [{ ...activeRow, funds_revision: 5, replayed: false }, { ...activeRow, funds_revision: 5, replayed: false }],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(
        mutateChurchFund(client, REQUEST_ID, CHURCH_ID, 4, {
          operation: "move_up",
          fundId: FUND_ID,
          name: null,
          slug: null,
          description: null,
        }),
      ).resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });
});
