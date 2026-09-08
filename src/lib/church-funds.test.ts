import { describe, expect, it } from "vitest";

import {
  createInitialChurchFundActionState,
  deriveChurchFundSlug,
  isChurchFundAction,
  isChurchFundId,
  isChurchFundRequestId,
  isChurchFundSlug,
  parseFundsRevision,
  validateChurchFundForm,
} from "./church-funds";

const FUND_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("church fund application contract", () => {
  it("validates ids, request ids, immutable slugs, actions, and revisions", () => {
    expect(isChurchFundId(FUND_ID)).toBe(true);
    expect(isChurchFundId("not-a-fund")).toBe(false);
    expect(isChurchFundRequestId(REQUEST_ID)).toBe(true);
    expect(
      isChurchFundRequestId("10000000-0000-1000-8000-000000000001"),
    ).toBe(false);
    expect(isChurchFundSlug("youth-ministry-2")).toBe(true);
    expect(isChurchFundSlug("Youth Ministry")).toBe(false);
    expect(isChurchFundAction("restore")).toBe(true);
    expect(isChurchFundAction("delete")).toBe(false);
    expect(parseFundsRevision("0")).toBe(0);
    expect(parseFundsRevision("9007199254740992")).toBeNull();
    expect(parseFundsRevision("01")).toBeNull();

    expect(deriveChurchFundSlug("Café & Missions 2026")).toBe(
      "cafe-missions-2026",
    );
    expect(deriveChurchFundSlug("Youth & Ministry")).toBe(
      deriveChurchFundSlug("Youth Ministry"),
    );
    expect(deriveChurchFundSlug("🙏 !!!")).toBeNull();
    const longSlug = deriveChurchFundSlug(`Long ${"word ".repeat(24)}`);
    expect(longSlug?.length).toBeLessThanOrEqual(80);
    expect(longSlug).not.toMatch(/-$/);
  });

  it("normalizes and accepts create and update values", () => {
    expect(
      validateChurchFundForm(
        form({
          name: "  Youth   Ministry  ",
          slug: "attempted-client-override",
          description: "  Sunday giving  ",
        }),
        "create",
        null,
      ),
    ).toEqual({
      success: true,
      input: {
        operation: "create",
        fundId: null,
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Sunday giving",
      },
      values: {
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Sunday giving",
      },
    });

    expect(
      validateChurchFundForm(
        form({
          name: "Missions",
          slug: "ignored",
          description: "\u2003First line\r\nSecond line\rThird line\u2003",
        }),
        "update",
        FUND_ID,
      ),
    ).toMatchObject({
      success: true,
      input: {
        fundId: FUND_ID,
        slug: null,
        description: "First line\nSecond line\nThird line",
      },
    });
  });

  it("rejects control characters, invalid lengths, and missing update targets", () => {
    expect(
      validateChurchFundForm(
        form({ name: "A", slug: "ignored", description: `Unsafe\u0000text` }),
        "create",
        null,
      ),
    ).toMatchObject({
      success: false,
      fieldErrors: {
        name: expect.any(String),
        description: expect.any(String),
      },
    });
    expect(
      validateChurchFundForm(
        form({ name: "🙏🙏", slug: "forced", description: "" }),
        "create",
        null,
      ),
    ).toMatchObject({
      success: false,
      fieldErrors: { name: expect.any(String) },
    });
    expect(
      validateChurchFundForm(
        form({ name: "Missions", slug: "", description: "x".repeat(501) }),
        "update",
        "wrong-tenant-or-malformed",
      ),
    ).toMatchObject({ success: false });
  });

  it("never accepts editable fields for non-content mutations", () => {
    expect(
      validateChurchFundForm(
        form({ name: "Injected rename", slug: "injected", description: "Injected" }),
        "archive",
        FUND_ID,
      ),
    ).toEqual({
      success: true,
      input: {
        operation: "archive",
        fundId: FUND_ID,
        name: null,
        slug: null,
        description: null,
      },
      values: { name: "", slug: "", description: "" },
    });
  });

  it("creates serializable action state without accepting a slug", () => {
    const state = createInitialChurchFundActionState(
      REQUEST_ID,
      4,
      "update",
      { id: FUND_ID, name: "Tithes", description: null },
    );
    expect(state).toMatchObject({
      requestId: REQUEST_ID,
      fundsRevision: 4,
      operation: "update",
      fundId: FUND_ID,
      values: { name: "Tithes", slug: "", description: "" },
      retryRequired: false,
    });
    expect(state).not.toHaveProperty("slug");
  });
});
