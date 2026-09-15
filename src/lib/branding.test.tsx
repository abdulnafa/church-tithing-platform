import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { metadata } from "@/app/layout";
import { Brand } from "@/components/brand";

import { BRAND_ASSETS, PRODUCT_NAME } from "./branding";

describe("product branding", () => {
  it("uses the approved product name in root metadata", () => {
    expect(PRODUCT_NAME).toBe("churchwithease");
    expect(metadata.title).toEqual({
      default: PRODUCT_NAME,
      template: `%s | ${PRODUCT_NAME}`,
    });
  });

  it("renders the approved horizontal logo without a text-drawn surrogate", () => {
    const markup = renderToStaticMarkup(<Brand />);

    expect(markup).toContain(`aria-label="${PRODUCT_NAME} home"`);
    expect(markup).toContain(`src="${BRAND_ASSETS.horizontal}"`);
    expect(markup).toContain('width="2000"');
    expect(markup).toContain('height="422"');
    expect(markup).toContain('alt=""');
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain(`>${PRODUCT_NAME}</span>`);
    expect(markup).not.toContain(">churchwith</span>");
    expect(markup).not.toContain(">ease</span>");
    expect(markup).not.toContain("uppercase");
    expect(markup).not.toMatch(/Kindred Giving|>Kindred<|>Giving</);
  });

  it("uses the official symbol for the compact accessible home link", () => {
    const markup = renderToStaticMarkup(<Brand compact />);

    expect(markup).toContain(`aria-label="${PRODUCT_NAME} home"`);
    expect(markup).toContain(`src="${BRAND_ASSETS.symbol}"`);
    expect(markup).toContain('width="1133"');
    expect(markup).toContain('height="784"');
    expect(markup).not.toContain(BRAND_ASSETS.horizontal);
    expect(markup).not.toContain("<svg");
  });

  it("keeps the supplied artwork unchanged on dark surfaces", () => {
    const markup = renderToStaticMarkup(<Brand inverted />);

    expect(markup).toContain(`src="${BRAND_ASSETS.horizontal}"`);
    expect(markup).not.toMatch(/brightness-|contrast-|grayscale|invert-/);
  });
});
