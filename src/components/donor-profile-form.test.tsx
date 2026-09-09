import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/dashboard/profile-actions", () => ({
  updateDonorProfileAction: vi.fn(),
}));

import { DonorProfileForm } from "./donor-profile-form";

const REQUEST_ID = "30000000-0000-4000-8000-000000000f15";
const snapshot = {
  displayName: "Alicia Clarke",
  email: "alicia@example.test",
  profileRevision: 3,
} as const;

describe("donor profile form", () => {
  it("renders one editable name and a read-only verified email", () => {
    const markup = renderToStaticMarkup(
      <DonorProfileForm
        churchName="Harbour Grace Church"
        requestId={REQUEST_ID}
        snapshot={snapshot}
      />,
    );

    expect(markup).toContain("Your giving profile");
    expect(markup).toContain("Harbour Grace Church");
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('autoComplete="name"');
    expect(markup).toContain("alicia@example.test");
    expect(markup).toContain("Read-only here");
    expect(markup).not.toMatch(/name="email"|name="phone"|name="churchId"|name="donorId"|name="userId"/);
  });

  it("labels validation relationships and protects sensitive boundary copy", () => {
    const markup = renderToStaticMarkup(
      <DonorProfileForm
        churchName="Harbour Grace Church"
        requestId={REQUEST_ID}
        snapshot={snapshot}
      />,
    );

    expect(markup).toContain('for="donor-profile-display-name"');
    expect(markup).toContain(
      'aria-describedby="donor-profile-display-name-help"',
    );
    expect(markup).toContain("does not merge or claim earlier guest donations");
    expect(markup).toContain("never used to auto-claim guest giving history");
    expect(markup).toContain("Other contact details, tax");
    expect(markup).toContain('aria-live="polite"');
  });

  it("contains exact-retry locking with no account-enrollment or linking action", () => {
    const source = readFileSync(
      new URL("./donor-profile-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("state.retryRequired");
    expect(source).toContain('name="expectedProfileRevision"');
    expect(source).toContain("Retry unchanged save");
    expect(source).not.toContain("text-[var(--muted)]");
    expect(source).not.toMatch(/create account|sign up|link guest|claim donation/i);
  });

  it("uses narrow-screen-safe controls and only expands at responsive breakpoints", () => {
    const source = readFileSync(
      new URL("./donor-profile-form.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("min-w-0 w-full");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).toContain("sm:w-auto");
    expect(source).toContain("[overflow-wrap:anywhere]");
    expect(source).not.toContain("min-w-[");
  });
});
