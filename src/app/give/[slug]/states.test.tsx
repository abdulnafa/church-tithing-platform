import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GivingPageError from "./error";
import GivingPageNotFound from "./not-found";

describe("public giving route states", () => {
  it("renders a neutral not-found state that does not reveal church status", () => {
    const markup = renderToStaticMarkup(<GivingPageNotFound />);

    expect(markup).toContain("This giving link is not available");
    expect(markup).toContain("contact the church directly");
    expect(markup).not.toMatch(/inactive|suspended|closed|database/i);
  });

  it("renders a retryable error boundary without displaying the error", () => {
    const markup = renderToStaticMarkup(<GivingPageError reset={vi.fn()} />);

    expect(markup).toContain("We could not display this giving page");
    expect(markup).toContain("No payment or personal information was submitted");
    expect(markup).toContain('type="button"');
    expect(markup).not.toMatch(/stack|digest|supabase|postgres/i);
  });
});
