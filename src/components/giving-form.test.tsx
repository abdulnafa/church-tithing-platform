import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GivingForm } from "./giving-form";

const FUND_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_FUND_ID = "20000000-0000-4000-8000-000000000002";

const funds = [
  {
    id: FUND_ID,
    name: "Tithes",
    description: "Support the life and ministry of our church.",
    isDefault: true,
  },
  {
    id: CAMPAIGN_FUND_ID,
    name: "Community Care",
    description: null,
    isDefault: false,
  },
] as const;

const campaigns = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    fundId: CAMPAIGN_FUND_ID,
    name: "Community Centre",
    description: "Create a welcoming community space.",
  },
] as const;

describe("public giving option selector", () => {
  it("renders real choices and a clearly labelled mock checkout", () => {
    const markup = renderToStaticMarkup(
      <GivingForm
        campaigns={campaigns}
        churchName="Harbour Grace Church"
        churchSlug="harbour-grace"
        currency="BBD"
        funds={funds}
      />,
    );

    expect(markup).toContain("Tithes");
    expect(markup).toContain("Community Centre");
    expect(markup).toContain('value="fund:20000000-0000-4000-8000-000000000001"');
    expect(markup).toContain('value="campaign:30000000-0000-4000-8000-000000000001"');
    expect(markup).toContain("Continue to demo checkout");
    expect(markup).toContain("Development demo only");
    expect(markup).toContain("Full name");
    expect(markup).toContain("Email address");
    expect(markup).toContain('autoComplete="name"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toMatch(/<input[^>]*required=""[^>]*name="guestFullName"/);
    expect(markup).toMatch(/<input[^>]*required=""[^>]*name="guestEmail"/);
    expect(markup).toContain("saved as a new guest record");
    expect(markup).toContain("never used to find, claim, or");
    expect(markup).toContain("Optional prayer request draft");
    expect(markup).not.toContain('name="prayerRequestDraft"');
    expect(markup).toContain('autoComplete="off"');
    expect(markup).toContain('spellCheck="false"');
    expect(markup).toContain("0/2000 characters maximum");
    expect(markup).not.toContain('name="prayerConsentDraft"');
    expect(markup).toContain("Provisional consent");
    expect(markup).toContain("deliberately excluded from");
    expect(markup).toContain("outside donation receipts, statements");
    expect(markup).toContain("does not send prayer text by email");
    expect(markup).toContain("Final email handling, access, retention");
    expect(markup).not.toMatch(/Phone number|secure checkout|payment is handled/i);
  });

  it("uses labelled controls and a default target that work without horizontal overflow", () => {
    const markup = renderToStaticMarkup(
      <GivingForm
        campaigns={campaigns}
        churchName="Harbour Grace Church"
        churchSlug="harbour-grace"
        currency="BBD"
        funds={funds}
      />,
    );
    const source = readFileSync(
      new URL("./giving-form.tsx", import.meta.url),
      "utf8",
    );

    expect(markup).toContain("<legend");
    expect(markup).toContain('for="giving-custom-amount"');
    expect(markup).toContain('for="giving-target"');
    expect(markup).toContain('for="giving-guest-name"');
    expect(markup).toContain('for="giving-guest-email"');
    expect(markup).toContain('for="giving-prayer-request"');
    expect(markup).toContain('for="giving-prayer-consent"');
    expect(markup).toContain('aria-describedby="giving-target-description"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('value="fund:20000000-0000-4000-8000-000000000001" selected=""');
    expect(source).toContain("min-w-0");
    expect(source).toContain("max-w-full");
    expect(source).not.toContain("min-w-[");
  });

  it("has a defensive empty-fund state and does not render invalid controls", () => {
    const markup = renderToStaticMarkup(
      <GivingForm
        campaigns={[]}
        churchName="Harbour Grace Church"
        churchSlug="harbour-grace"
        currency="BBD"
        funds={[]}
      />,
    );

    expect(markup).toContain("No giving options are available yet");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("giving-target");
    expect(markup).not.toContain("Continue to demo checkout");
  });

  it("keeps financial campaign goals out of the client component contract", () => {
    const source = readFileSync(
      new URL("./giving-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("PublicGivingCampaignOption");
    expect(source).not.toMatch(/goalAmountMinor|raised|donation total/i);
  });

  it("submits only an explicit checkout allowlist while keeping prayer local", () => {
    const source = readFileSync(
      new URL("./giving-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("useState<GuestIdentityValues>");
    expect(source).toContain('useState("")');
    expect(source).toContain("setPrayerConsent(false)");
    expect(source).toContain("required={canConsentToPrayerDraft}");
    expect(source).toContain("disabled={!canConsentToPrayerDraft}");
    expect(source).toContain(
      "checked={canConsentToPrayerDraft && prayerConsent}",
    );
    expect(source).toContain("limitPrayerRequestDraft");
    expect(source).toContain("getPrayerDraftConsentBoundary");
    expect(source).toContain("aria-invalid={Boolean(prayerBodyError)}");
    expect(source).toContain("unsupported control or text-direction");
    expect(source).toContain(
      "!getPrayerDraftConsentBoundary(limitedValue, prayerConsent).consented",
    );
    expect(source).not.toContain("maxLength={PRAYER_REQUEST_LIMITS.body}");
    expect(source).toContain("validateGuestIdentityValues");
    expect(source).toContain("onBlur");
    expect(source).not.toMatch(/localStorage|sessionStorage|\.rpc\(|formAction|action=|onSubmit/);
    expect(source).toContain('fetch("/api/mock-giving/checkouts"');
    const bodyStart = source.indexOf("body: JSON.stringify({");
    const requestBody = source.slice(
      bodyStart,
      source.indexOf("}),", bodyStart) + 3,
    );
    expect(requestBody).toMatch(
      /requestId[\s\S]*churchSlug[\s\S]*givingTarget[\s\S]*amount[\s\S]*frequency[\s\S]*fullName[\s\S]*email/,
    );
    expect(requestBody).not.toMatch(/prayer|consent/i);
    expect(source).not.toContain('name="prayerRequestDraft"');
    expect(source).not.toContain('name="prayerConsentDraft"');
    expect(source).not.toMatch(/guest.*password|auth_user|donorId|churchId/i);
  });

  it("wraps long persisted descriptions on narrow screens", () => {
    const markup = renderToStaticMarkup(
      <GivingForm
        campaigns={[]}
        churchName="Harbour Grace Church"
        churchSlug="harbour-grace"
        currency="BBD"
        funds={[
          {
            ...funds[0],
            description: "a".repeat(500),
          },
        ]}
      />,
    );

    expect(markup).toContain("overflow-wrap:anywhere");
    expect(markup).toContain("a".repeat(500));
  });
});
