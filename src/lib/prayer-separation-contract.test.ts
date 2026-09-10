import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("prayer and financial boundary", () => {
  it.each([
    "lib/types.ts",
    "lib/payments/payment-provider.ts",
    "lib/payments/mock-payment-provider.ts",
    "lib/church-transaction-view.ts",
    "components/church-transactions.tsx",
    "app/church/transactions/page.tsx",
  ])("keeps prayer text and flags out of %s", (relativePath) => {
    expect(source(relativePath)).not.toMatch(
      /prayerRequest|hasPrayerRequest|prayer_request|prayer text/i,
    );
  });
});
