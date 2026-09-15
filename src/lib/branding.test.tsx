import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { metadata } from "@/app/layout";
import { Brand } from "@/components/brand";

import { PRODUCT_NAME } from "./branding";

describe("product branding", () => {
  it("uses the approved product name in root metadata", () => {
    expect(PRODUCT_NAME).toBe("churchwithease");
    expect(metadata.title).toEqual({
      default: PRODUCT_NAME,
      template: `%s | ${PRODUCT_NAME}`,
    });
  });

  it("renders the approved full wordmark without the retired placeholder", () => {
    const markup = renderToStaticMarkup(<Brand />);

    expect(markup).toContain(`>${PRODUCT_NAME}</span>`);
    expect(markup).not.toContain(">churchwith</span>");
    expect(markup).not.toContain(">ease</span>");
    expect(markup).not.toContain("uppercase");
    expect(markup).not.toMatch(/Kindred Giving|>Kindred<|>Giving</);
  });

  it("gives the compact mark an exact branded accessible name", () => {
    const markup = renderToStaticMarkup(<Brand compact />);

    expect(markup).toContain(`>${PRODUCT_NAME} home</span>`);
    expect(markup).not.toContain("Kindred Giving home");
  });
});
