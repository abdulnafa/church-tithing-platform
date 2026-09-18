import { describe, expect, it } from "vitest";

import {
  CHURCH_TRANSACTION_MAX_AMOUNT_MINOR,
  EMPTY_CHURCH_TRANSACTION_FILTERS,
  createChurchTransactionPageHref,
  formatChurchTransactionAmountInput,
  hasActiveChurchTransactionFilters,
  parseChurchTransactionSearchParams,
} from "./church-transactions";

const FUND_ID = "30000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "10000000-0000-4000-8000-000000001006";

describe("church transaction URL state", () => {
  it("returns one canonical empty filter set for an unfiltered first page", () => {
    expect(parseChurchTransactionSearchParams({})).toEqual({
      ok: true,
      filters: EMPTY_CHURCH_TRANSACTION_FILTERS,
      cursor: null,
    });
    expect(hasActiveChurchTransactionFilters(EMPTY_CHURCH_TRANSACTION_FILTERS)).toBe(
      false,
    );
    expect(
      createChurchTransactionPageHref(EMPTY_CHURCH_TRANSACTION_FILTERS),
    ).toBe("/church/transactions");
  });

  it("parses every supported filter and a complete keyset cursor", () => {
    const parsed = parseChurchTransactionSearchParams({
      from: "2026-08-01",
      to: "2026-08-31",
      donor: "  Alicia   Clarke  ",
      min: "25.5",
      max: "999999999.99",
      fund: FUND_ID.toUpperCase(),
      recurring: "active",
      last4: "0424",
      status: "succeeded",
      cancellation: "not_canceled",
      cursorCreatedAt: "2026-08-16T13:04:00.123456+00:00",
      cursorId: TRANSACTION_ID.toUpperCase(),
    });

    expect(parsed).toEqual({
      ok: true,
      filters: {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        donorQuery: "Alicia Clarke",
        minAmountMinor: 2_550,
        maxAmountMinor: CHURCH_TRANSACTION_MAX_AMOUNT_MINOR,
        fundId: FUND_ID,
        recurringState: "active",
        last4: "0424",
        paymentStatus: "succeeded",
        cancellationState: "not_canceled",
      },
      cursor: {
        createdAt: "2026-08-16T13:04:00.123456+00:00",
        transactionId: TRANSACTION_ID,
      },
    });
  });

  it.each([
    "from",
    "to",
    "donor",
    "min",
    "max",
    "fund",
    "recurring",
    "last4",
    "status",
    "cancellation",
    "cursorCreatedAt",
    "cursorId",
  ])("rejects duplicate-array input for %s", (name) => {
    expect(
      parseChurchTransactionSearchParams({ [name]: ["one", "two"] }),
    ).toEqual({ ok: false, reason: "invalid_request" });
  });

  it.each([
    { from: "1999-12-31" },
    { from: "2100-01-01", to: "2099-12-31" },
    { to: "2101-01-01" },
    { from: "2026-02-29" },
    { from: "2026-2-01" },
    { from: "not-a-date" },
  ])("rejects invalid or reversed date bounds %#", (query) => {
    expect(parseChurchTransactionSearchParams(query)).toEqual({
      ok: false,
      reason: "invalid_request",
    });
  });

  it.each([
    { min: "-1" },
    { min: "01.00" },
    { min: "1.001" },
    { min: "1e2" },
    { max: "1000000000.00" },
    { min: "10.00", max: "9.99" },
  ])("rejects noncanonical, imprecise, or reversed amounts %#", (query) => {
    expect(parseChurchTransactionSearchParams(query)).toEqual({
      ok: false,
      reason: "invalid_request",
    });
  });

  it("converts decimal filters to exact integer minor units", () => {
    for (const [input, expected] of [
      ["0", 0],
      ["0.01", 1],
      ["1", 100],
      ["1.2", 120],
      ["999999999.99", CHURCH_TRANSACTION_MAX_AMOUNT_MINOR],
    ] as const) {
      const result = parseChurchTransactionSearchParams({ min: input });
      expect(result).toMatchObject({
        ok: true,
        filters: { minAmountMinor: expected },
      });
      expect(formatChurchTransactionAmountInput(expected)).toBe(
        expected === 0
          ? "0.00"
          : expected === 1
            ? "0.01"
            : expected === 100
              ? "1.00"
              : expected === 120
                ? "1.20"
                : "999999999.99",
      );
    }
  });

  it.each([
    { donor: "\u0000Hidden" },
    { donor: "x".repeat(121) },
    { fund: "not-a-uuid" },
    { recurring: "weekly" },
    { last4: "424" },
    { last4: "424a" },
    { status: "complete" },
    { cancellation: "canceled" },
  ])("rejects an invalid bounded or enumerated filter %#", (query) => {
    expect(parseChurchTransactionSearchParams(query)).toEqual({
      ok: false,
      reason: "invalid_request",
    });
  });

  it.each([
    { cursorCreatedAt: "2026-08-16T13:04:00Z" },
    { cursorId: TRANSACTION_ID },
    { cursorCreatedAt: "16 August 2026", cursorId: TRANSACTION_ID },
    { cursorCreatedAt: "2026-08-16T13:04:00Z", cursorId: "not-a-uuid" },
  ])("rejects an incomplete or malformed cursor %#", (query) => {
    expect(parseChurchTransactionSearchParams(query)).toEqual({
      ok: false,
      reason: "invalid_request",
    });
  });

  it("builds a canonical filter-preserving next-page link", () => {
    const parsed = parseChurchTransactionSearchParams({
      from: "2026-08-01",
      donor: "Alicia Clarke",
      min: "25.5",
      fund: FUND_ID,
      recurring: "recurring",
      last4: "0424",
      status: "succeeded",
      cancellation: "any_canceled",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(hasActiveChurchTransactionFilters(parsed.filters)).toBe(true);
    expect(
      createChurchTransactionPageHref(parsed.filters, {
        createdAt: "2026-08-16T13:04:00+00:00",
        transactionId: TRANSACTION_ID,
      }),
    ).toBe(
      `/church/transactions?from=2026-08-01&donor=Alicia+Clarke&min=25.50&fund=${FUND_ID}&recurring=recurring&last4=0424&status=succeeded&cancellation=any_canceled&cursorCreatedAt=2026-08-16T13%3A04%3A00%2B00%3A00&cursorId=${TRANSACTION_ID}`,
    );
  });
});
