import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/icons", () => ({
  DownloadIcon: () => <span aria-hidden="true">download</span>,
}));

import { GivingQr } from "./giving-qr";

describe("giving QR artwork", () => {
  it("uses the validated tenant slug for an honest download filename", () => {
    const markup = renderToStaticMarkup(
      <GivingQr
        churchName="Current Church"
        churchSlug="current-church"
        value="https://giving.example/q/current-code"
      />,
    );

    expect(markup).toContain('aria-label="Giving QR code for Current Church"');
    expect(markup).toContain('download="current-church-giving-qr.svg"');
    expect(markup).toContain("data:image/svg+xml");
    expect(markup).not.toContain("harbour-grace-giving-qr.svg");
  });
});
