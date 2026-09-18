import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHURCH_TRANSACTION_PAGE_SIZE,
  EMPTY_CHURCH_TRANSACTION_FILTERS,
} from "@/lib/church-transactions";

const {
  createServerSupabaseClientMock,
  getChurchTransactionPageMock,
  requireChurchPermissionMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  getChurchTransactionPageMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/church-transactions-dal", () => ({
  getChurchTransactionPage: getChurchTransactionPageMock,
}));

import ChurchTransactionsPage from "./page";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "30000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "40000000-0000-4000-8000-000000000001";
const NEXT_TRANSACTION_ID = "40000000-0000-4000-8000-000000000002";
const client = { rpc: vi.fn() };

const transaction = {
  id: TRANSACTION_ID,
  donorName: "Jordan Reed",
  fundId: FUND_ID,
  fundName: "Community Care",
  campaignId: CAMPAIGN_ID,
  campaignName: "Family Support",
  recordedAt: "2026-09-18T14:30:00.000Z",
  frequency: "monthly",
  recurringStatus: "active",
  amountMinor: 12_500,
  currency: "BBD",
  processingFeeMinor: 375,
  refundedAmountMinor: 0,
  netAmountMinor: 12_125,
  paymentMethodBrand: "Visa",
  paymentMethodLast4: "4242",
  paymentStatus: "succeeded",
  cancellationState: "not_canceled",
} as const;

function successPage(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ok: true,
    page: {
      churchId: CHURCH_ID,
      churchTimezone: "America/Barbados",
      transactions: [transaction],
      fundOptions: [
        { id: FUND_ID, name: "Community Care", status: "active" },
      ],
      nextCursor: null,
      hasMore: false,
      ...overrides,
    },
  };
}

describe("church transaction page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: {
        kind: "church",
        churchId: CHURCH_ID,
        permissions: ["workspace_read", "financial_read"],
      },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    getChurchTransactionPageMock.mockResolvedValue(successPage());
  });

  it("guards before reading and renders the safe real transaction projection", async () => {
    const markup = renderToStaticMarkup(await ChurchTransactionsPage());

    expect(requireChurchPermissionMock).toHaveBeenCalledWith("financial_read");
    expect(requireChurchPermissionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createServerSupabaseClientMock.mock.invocationCallOrder[0],
    );
    expect(getChurchTransactionPageMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      {
        pageSize: CHURCH_TRANSACTION_PAGE_SIZE,
        filters: EMPTY_CHURCH_TRANSACTION_FILTERS,
        cursor: null,
      },
    );
    expect(markup).toContain("All transactions");
    expect(markup).toContain("Jordan Reed");
    expect(markup).toContain("Community Care");
    expect(markup).toContain("Family Support");
    expect(markup).toContain("Current plan: Active");
    expect(markup).toContain("BBD $125.00");
    expect(markup).toContain("Succeeded");
    expect(markup).toContain("Not canceled");
    expect(markup).toContain("Card ending 4242");
    expect(markup).not.toMatch(/demo|harbour grace|export csv/i);
    expect(markup).not.toMatch(
      /@example\.com|donor_message|provider_payment|prayer request/i,
    );
  });

  it("parses every filter and preserves it in a server pagination link", async () => {
    const nextCursor = {
      createdAt: "2026-09-18T13:00:00.000Z",
      transactionId: NEXT_TRANSACTION_ID,
    };
    getChurchTransactionPageMock.mockResolvedValue(
      successPage({ hasMore: true, nextCursor }),
    );
    const query = {
      from: "2026-09-01",
      to: "2026-09-18",
      donor: "Jordan Reed",
      min: "10.00",
      max: "200.00",
      fund: FUND_ID,
      recurring: "active",
      last4: "4242",
      status: "succeeded",
      cancellation: "not_canceled",
    } as const;

    const markup = renderToStaticMarkup(
      await ChurchTransactionsPage({ searchParams: Promise.resolve(query) }),
    );

    expect(getChurchTransactionPageMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      {
        pageSize: CHURCH_TRANSACTION_PAGE_SIZE,
        filters: {
          dateFrom: "2026-09-01",
          dateTo: "2026-09-18",
          donorQuery: "Jordan Reed",
          minAmountMinor: 1_000,
          maxAmountMinor: 20_000,
          fundId: FUND_ID,
          recurringState: "active",
          last4: "4242",
          paymentStatus: "succeeded",
          cancellationState: "not_canceled",
        },
        cursor: null,
      },
    );
    expect(markup).toContain("Next transactions");
    expect(markup).toContain("Clear filters");
    expect(markup).toContain("from=2026-09-01");
    expect(markup).toContain("donor=Jordan+Reed");
    expect(markup).toContain(`fund=${FUND_ID}`);
    expect(markup).toContain("recurring=active");
    expect(markup).toContain("status=succeeded");
    expect(markup).toContain("cancellation=not_canceled");
    expect(markup).toContain("cursorCreatedAt=2026-09-18T13%3A00%3A00.000Z");
    expect(markup).toContain(`cursorId=${NEXT_TRANSACTION_ID}`);
  });

  it.each([
    { from: ["2026-09-01", "2026-09-02"] },
    { min: "20.00", max: "10.00" },
    { last4: "42" },
    { cursorCreatedAt: "2026-09-18T13:00:00.000Z" },
  ])("rejects an invalid filter link before creating a client", async (query) => {
    const markup = renderToStaticMarkup(
      await ChurchTransactionsPage({ searchParams: Promise.resolve(query) }),
    );

    expect(markup).toContain("This transaction link is invalid");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(getChurchTransactionPageMock).not.toHaveBeenCalled();
  });

  it("renders unavailable, empty, filtered-empty, and stale-page states", async () => {
    getChurchTransactionPageMock.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    let markup = renderToStaticMarkup(await ChurchTransactionsPage());
    expect(markup).toContain("Transactions could not be loaded");
    expect(markup).not.toContain("Filter transactions");

    getChurchTransactionPageMock.mockResolvedValue(
      successPage({ transactions: [] }),
    );
    markup = renderToStaticMarkup(await ChurchTransactionsPage());
    expect(markup).toContain("No saved transactions yet");

    markup = renderToStaticMarkup(
      await ChurchTransactionsPage({
        searchParams: Promise.resolve({ donor: "No Match" }),
      }),
    );
    expect(markup).toContain("No matching transactions");

    markup = renderToStaticMarkup(
      await ChurchTransactionsPage({
        searchParams: Promise.resolve({
          cursorCreatedAt: "2026-09-18T15:00:00.000Z",
          cursorId: NEXT_TRANSACTION_ID,
        }),
      }),
    );
    expect(markup).toContain("No transactions on this page");
    expect(markup).toContain("Open first page");
  });
});
