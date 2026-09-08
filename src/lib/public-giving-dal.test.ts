import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

const {
  createPublicServerSupabaseClientMock,
  getSupabasePublicConfigMock,
  rpcMock,
} = vi.hoisted(() => ({
  createPublicServerSupabaseClientMock: vi.fn(),
  getSupabasePublicConfigMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfig: getSupabasePublicConfigMock,
}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicServerSupabaseClient: createPublicServerSupabaseClientMock,
}));

import {
  getPublicGivingPageBySlug,
  isPublicGivingSlug,
  parsePublicGivingPageRow,
} from "./public-giving-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const FUND_ID_2 = "20000000-0000-4000-8000-000000000002";
const CAMPAIGN_ID = "30000000-0000-4000-8000-000000000001";
const LOGO_OBJECT_ID = "40000000-0000-4000-8000-000000000001";
const SUPABASE_URL = "https://example.supabase.co";

const pageRow = {
  church_id: CHURCH_ID,
  church_slug: "harbour-grace",
  display_name: "Harbour Grace Church",
  default_currency: "BBD",
  logo_storage_path: `${CHURCH_ID}/${LOGO_OBJECT_ID}.webp`,
  primary_color: "#1F6D60",
  secondary_color: "#E1B85A",
  thank_you_message: "Thank you for supporting our community.",
  funds: [
    {
      fund_id: FUND_ID,
      name: "Tithes",
      description: "Support the life and ministry of our church.",
      is_default: true,
    },
    {
      fund_id: FUND_ID_2,
      name: "Community Care",
      description: null,
      is_default: false,
    },
  ],
  campaigns: [
    {
      campaign_id: CAMPAIGN_ID,
      fund_id: FUND_ID_2,
      name: "Community Centre",
      description: "Create a welcoming community space.",
      goal_amount_minor_text: "9007199254740991",
    },
  ],
} as const;

describe("public giving database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPublicServerSupabaseClientMock.mockReturnValue({
      rpc: rpcMock,
    } as unknown as SupabaseClient<Database>);
    getSupabasePublicConfigMock.mockReturnValue({
      url: SUPABASE_URL,
      publishableKey: `sb_publishable_${"a".repeat(24)}`,
    });
    rpcMock.mockResolvedValue({ data: [pageRow], error: null });
  });

  it("uses only the session-free public client and maps the minimum DTO", async () => {
    await expect(getPublicGivingPageBySlug("harbour-grace")).resolves.toEqual({
      ok: true,
      page: {
        church: {
          slug: "harbour-grace",
          name: "Harbour Grace Church",
          currency: "BBD",
          logoUrl:
            "https://example.supabase.co/storage/v1/object/public/church-logos/10000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.webp",
          primaryColor: "#1F6D60",
          secondaryColor: "#E1B85A",
          thankYouMessage: "Thank you for supporting our community.",
        },
        funds: [
          {
            id: FUND_ID,
            name: "Tithes",
            description: "Support the life and ministry of our church.",
            isDefault: true,
          },
          {
            id: FUND_ID_2,
            name: "Community Care",
            description: null,
            isDefault: false,
          },
        ],
        campaigns: [
          {
            id: CAMPAIGN_ID,
            fundId: FUND_ID_2,
            name: "Community Centre",
            description: "Create a welcoming community space.",
            goalAmountMinor: "9007199254740991",
          },
        ],
      },
    });

    expect(createPublicServerSupabaseClientMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledWith("get_public_giving_page", {
      church_slug: "harbour-grace",
    });
    const serialized = JSON.stringify(
      await getPublicGivingPageBySlug("harbour-grace"),
    );
    expect(serialized).not.toMatch(
      /church_id|logo_storage_path|provider|subscription|donor|raised/i,
    );
  });

  it("treats malformed slugs and zero rows as indistinguishable not-found results", async () => {
    for (const slug of ["", "A Church", "-church", "church-", "a".repeat(64)]) {
      await expect(getPublicGivingPageBySlug(slug)).resolves.toEqual({
        ok: false,
        reason: "not_found",
      });
    }
    expect(createPublicServerSupabaseClientMock).not.toHaveBeenCalled();

    rpcMock.mockResolvedValue({ data: [], error: null });
    await expect(getPublicGivingPageBySlug("harbour-grace")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("maps database, configuration, thrown, and cardinality failures to unavailable", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "private detail" } });
    await expect(getPublicGivingPageBySlug("harbour-grace")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpcMock.mockRejectedValueOnce(new Error("network detail"));
    await expect(getPublicGivingPageBySlug("harbour-grace")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpcMock.mockResolvedValueOnce({ data: [pageRow, pageRow], error: null });
    await expect(getPublicGivingPageBySlug("harbour-grace")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    getSupabasePublicConfigMock.mockImplementationOnce(() => {
      throw new Error("invalid environment detail");
    });
    await expect(getPublicGivingPageBySlug("harbour-grace")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("accepts optional legacy branding only after the RPC has sanitized it to null", () => {
    expect(
      parsePublicGivingPageRow(
        {
          ...pageRow,
          logo_storage_path: null,
          primary_color: null,
          secondary_color: null,
          thank_you_message: null,
          campaigns: [],
        },
        "harbour-grace",
        SUPABASE_URL,
      ),
    ).toMatchObject({
      church: {
        logoUrl: null,
        primaryColor: null,
        secondaryColor: null,
        thankYouMessage: null,
      },
      campaigns: [],
    });
  });

  it("accepts canonical multiline descriptions and astral code-point limits", () => {
    expect(
      parsePublicGivingPageRow(
        {
          ...pageRow,
          display_name: "\u{1F600}".repeat(120),
          funds: [
            {
              ...pageRow.funds[0],
              description: "First line\nSecond\tline",
            },
          ],
          campaigns: [],
        },
        "harbour-grace",
        SUPABASE_URL,
      ),
    ).not.toBeNull();
  });

  it.each([
    ["wrong returned slug", { church_slug: "another-church" }],
    ["malformed church ID", { church_id: "not-a-uuid" }],
    ["noncanonical church name", { display_name: " Harbour Grace " }],
    ["collapsed church name", { display_name: "Harbour  Grace" }],
    ["unsupported currency", { default_currency: "EUR" }],
    ["lowercase color", { primary_color: "#1f6d60" }],
    ["unsafe thank-you message", { thank_you_message: "Hello\rworld" }],
    ["cross-tenant logo path", { logo_storage_path: `${FUND_ID}/${LOGO_OBJECT_ID}.webp` }],
    ["legacy logo URL", { logo_storage_path: "https://attacker.example/logo.webp" }],
    ["missing funds array", { funds: null }],
    ["missing default", { funds: [{ ...pageRow.funds[0], is_default: false }] }],
    [
      "duplicate defaults",
      { funds: [pageRow.funds[0], { ...pageRow.funds[1], is_default: true }] },
    ],
    ["duplicate funds", { funds: [pageRow.funds[0], pageRow.funds[0]] }],
    [
      "noncanonical fund description",
      { funds: [{ ...pageRow.funds[0], description: "Line one\rLine two" }] },
    ],
    [
      "orphan campaign",
      { campaigns: [{ ...pageRow.campaigns[0], fund_id: CHURCH_ID }] },
    ],
    [
      "unsafe campaign goal",
      {
        campaigns: [
          { ...pageRow.campaigns[0], goal_amount_minor_text: "9007199254740992" },
        ],
      },
    ],
    [
      "duplicate campaigns",
      { campaigns: [pageRow.campaigns[0], pageRow.campaigns[0]] },
    ],
  ])("fails closed for a malformed %s response", (_name, override) => {
    expect(
      parsePublicGivingPageRow(
        { ...pageRow, ...override },
        "harbour-grace",
        SUPABASE_URL,
      ),
    ).toBeNull();
  });

  it.each([
    "http://example.supabase.co",
    "ftp://example.supabase.co",
    "https://user:password@example.supabase.co",
    "https://*.supabase.co",
    "https://example.supabase.co/project",
    "https://example.supabase.co?bucket=private",
  ])("rejects an unsafe configured logo origin: %s", (url) => {
    expect(
      parsePublicGivingPageRow(pageRow, "harbour-grace", url),
    ).toBeNull();
  });

  it("keeps the production DAL server-only and free of request sessions", () => {
    const source = readFileSync(
      new URL("./public-giving-dal.ts", import.meta.url),
      "utf8",
    );
    expect(source.startsWith('import "server-only"')).toBe(true);
    expect(source).toContain("createPublicServerSupabaseClient");
    expect(source).not.toMatch(/createServerSupabaseClient|cookies\(|headers\(/);
  });

  it.each(["harbour-grace", "ab", "church-123"])(
    "accepts canonical public slug %s",
    (slug) => {
      expect(isPublicGivingSlug(slug)).toBe(true);
    },
  );
});
