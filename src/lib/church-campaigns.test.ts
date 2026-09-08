import { describe, expect, it } from "vitest";

import {
  calculateCampaignProgress,
  campaignMinorTextToGoalInput,
  churchCampaignValuesEqual,
  createInitialChurchCampaignActionState,
  deriveChurchCampaignSlug,
  formatCampaignMinorAmount,
  isCanonicalNonnegativeDecimalText,
  isCanonicalPositiveCampaignMinorText,
  isChurchCampaignAction,
  isChurchCampaignCurrency,
  isChurchCampaignId,
  isChurchCampaignRequestId,
  parseCampaignGoalAmount,
  parseCampaignsRevision,
  validateChurchCampaignForm,
  type ChurchCampaign,
} from "./church-campaigns";

const CAMPAIGN_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const campaign: ChurchCampaign = {
  id: CAMPAIGN_ID,
  fundId: FUND_ID,
  name: "Community Centre",
  slug: "community-centre",
  description: "A safe gathering place",
  status: "draft",
  goalAmountMinorText: "125050",
  currency: "BBD",
  startsAt: null,
  endsAt: null,
};

describe("church campaign application contract", () => {
  it("validates identifiers, actions, currencies, slugs, and revisions", () => {
    expect(isChurchCampaignId(CAMPAIGN_ID)).toBe(true);
    expect(isChurchCampaignId("campaign-one")).toBe(false);
    expect(isChurchCampaignRequestId(REQUEST_ID)).toBe(true);
    expect(
      isChurchCampaignRequestId("a0000000-0000-1000-8000-000000000001"),
    ).toBe(false);
    expect(isChurchCampaignAction("restore")).toBe(true);
    expect(isChurchCampaignAction("reopen")).toBe(false);
    expect(isChurchCampaignCurrency("BBD")).toBe(true);
    expect(isChurchCampaignCurrency("GBP")).toBe(false);
    expect(parseCampaignsRevision("0")).toBe(0);
    expect(parseCampaignsRevision("01")).toBeNull();
    expect(parseCampaignsRevision("9007199254740992")).toBeNull();
    expect(deriveChurchCampaignSlug("Café & School 2026")).toBe(
      "cafe-school-2026",
    );
    expect(deriveChurchCampaignSlug("🙏 !!!")).toBeNull();
  });

  it("parses human goal amounts into exact canonical minor-unit text", () => {
    expect(parseCampaignGoalAmount("")).toEqual({
      success: true,
      goalAmount: "",
      minorText: null,
    });
    expect(parseCampaignGoalAmount(" 1250.5 ")).toEqual({
      success: true,
      goalAmount: "1250.50",
      minorText: "125050",
    });
    expect(parseCampaignGoalAmount("0.01")).toMatchObject({
      success: true,
      minorText: "1",
    });
    expect(parseCampaignGoalAmount("90071992547409.91")).toMatchObject({
      success: true,
      minorText: "9007199254740991",
    });

    for (const invalid of [
      "0",
      "0.00",
      "01.00",
      ".50",
      "+1.00",
      "-1.00",
      "1e3",
      "1,000.00",
      "1.001",
      "90071992547409.92",
    ]) {
      expect(parseCampaignGoalAmount(invalid).success).toBe(false);
    }
  });

  it("formats goal and progress strings without Number precision loss", () => {
    expect(
      isCanonicalPositiveCampaignMinorText("9007199254740991"),
    ).toBe(true);
    expect(
      isCanonicalPositiveCampaignMinorText("9007199254740992"),
    ).toBe(false);
    expect(isCanonicalNonnegativeDecimalText("0")).toBe(true);
    expect(isCanonicalNonnegativeDecimalText("01")).toBe(false);
    expect(campaignMinorTextToGoalInput("9007199254740991")).toBe(
      "90071992547409.91",
    );
    expect(formatCampaignMinorAmount("9007199254740991", "BBD")).toBe(
      "BBD $90,071,992,547,409.91",
    );
    expect(formatCampaignMinorAmount("0", "USD")).toBe("USD $0.00");

    expect(calculateCampaignProgress("150", "100")).toEqual({
      percentageText: "150.0%",
      cappedPercentage: 100,
    });
    expect(calculateCampaignProgress("1", "3")).toEqual({
      percentageText: "33.3%",
      cappedPercentage: 33.33,
    });
  });

  it("normalizes Unicode-aware create and draft-update fields", () => {
    const unicodeName = `A${"🙏".repeat(119)}`;
    const unicodeDescription = "🙏".repeat(1_000);
    const created = validateChurchCampaignForm(
      form({
        name: `\u00a0 ${unicodeName}\ufeff`,
        description: `\u00a0${unicodeDescription}\ufeff`,
        fundId: FUND_ID,
        goalAmount: "2500.5",
      }),
      "create",
      null,
    );

    expect(created).toMatchObject({
      success: true,
      input: {
        operation: "create",
        fundId: FUND_ID,
        goalAmountMinorText: "250050",
      },
      values: { goalAmount: "2500.50" },
    });

    const updated = validateChurchCampaignForm(
      form({
        name: "  Community   Centre ",
        description: " First line\r\nSecond line\rThird line ",
        fundId: FUND_ID,
        goalAmount: "",
      }),
      "update",
      CAMPAIGN_ID,
    );
    expect(updated).toEqual({
      success: true,
      input: {
        operation: "update",
        campaignId: CAMPAIGN_ID,
        name: "Community Centre",
        slug: null,
        description: "First line\nSecond line\nThird line",
        fundId: FUND_ID,
        goalAmountMinorText: null,
      },
      values: {
        name: "Community Centre",
        description: "First line\nSecond line\nThird line",
        fundId: FUND_ID,
        goalAmount: "",
      },
    });
  });

  it("rejects code-point overflow, unsafe controls, and malformed fund input", () => {
    expect(
      validateChurchCampaignForm(
        form({
          name: `A${"🙏".repeat(120)}`,
          description: "Safe",
          fundId: FUND_ID,
          goalAmount: "10.00",
        }),
        "create",
        null,
      ),
    ).toMatchObject({ success: false, fieldErrors: { name: expect.any(String) } });

    expect(
      validateChurchCampaignForm(
        form({
          name: "Unsafe\nName",
          description: "Unsafe\u0000description",
          fundId: "other-tenant",
          goalAmount: "10.001",
        }),
        "update",
        CAMPAIGN_ID,
      ),
    ).toMatchObject({
      success: false,
      fieldErrors: {
        name: expect.any(String),
        description: expect.any(String),
        fundId: expect.any(String),
        goalAmount: expect.any(String),
      },
    });
  });

  it("discards every editable field for lifecycle operations", () => {
    expect(
      validateChurchCampaignForm(
        form({
          name: "Injected",
          description: "Injected",
          fundId: FUND_ID,
          goalAmount: "999.00",
        }),
        "archive",
        CAMPAIGN_ID,
      ),
    ).toEqual({
      success: true,
      input: {
        operation: "archive",
        campaignId: CAMPAIGN_ID,
        name: null,
        slug: null,
        description: null,
        fundId: null,
        goalAmountMinorText: null,
      },
      values: { name: "", description: "", fundId: "", goalAmount: "" },
    });
  });

  it("creates minimal serializable action state and exact retry values", () => {
    const state = createInitialChurchCampaignActionState(
      REQUEST_ID,
      7,
      "update",
      campaign,
    );
    expect(state).toMatchObject({
      requestId: REQUEST_ID,
      campaignsRevision: 7,
      operation: "update",
      campaignId: CAMPAIGN_ID,
      values: {
        name: "Community Centre",
        description: "A safe gathering place",
        fundId: FUND_ID,
        goalAmount: "1250.50",
      },
      retryRequired: false,
    });
    expect(state).not.toHaveProperty("slug");
    expect(
      churchCampaignValuesEqual(state.values, { ...state.values }),
    ).toBe(true);
    expect(
      churchCampaignValuesEqual(state.values, {
        ...state.values,
        goalAmount: "1250.51",
      }),
    ).toBe(false);
  });
});
