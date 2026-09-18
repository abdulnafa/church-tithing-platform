import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { getChurchTransactionPage } from "./church-transactions-dal";
import {
  EMPTY_CHURCH_TRANSACTION_FILTERS,
  type ChurchTransactionFilters,
} from "./church-transactions";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CHURCH_ID = "20000000-0000-4000-8000-000000000001";
const FUND_ID = "30000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "40000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "50000000-0000-4000-8000-000000000006";
const OLDER_TRANSACTION_ID = "50000000-0000-4000-8000-000000000005";
const RECORDED_AT = "2026-08-16T13:04:00.123456+00:00";

const transactionRow = {
  transaction_id: TRANSACTION_ID,
  church_id: CHURCH_ID,
  donor_name: "Alicia Clarke",
  fund_id: FUND_ID,
  fund_name: "Tithes",
  campaign_id: CAMPAIGN_ID,
  campaign_name: "Community Centre",
  recorded_at: RECORDED_AT,
  frequency: "weekly",
  recurring_status: "active",
  amount_minor: 25_000,
  currency: "BBD",
  processing_fee_minor: 775,
  refunded_amount_minor: 0,
  net_amount_minor: 24_225,
  payment_method_brand: "Visa",
  payment_method_last4: "4242",
  payment_status: "succeeded",
  cancellation_state: "not_canceled",
} as const;

const fundOption = {
  fund_id: FUND_ID,
  fund_name: "Tithes",
  fund_status: "active",
} as const;

function pageRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    church_id: CHURCH_ID,
    church_timezone: "America/Barbados",
    transactions: [transactionRow],
    fund_options: [fundOption],
    next_cursor_created_at: null,
    next_cursor_transaction_id: null,
    has_more: false,
    ...overrides,
  };
}

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;

describe("church transactions database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: pageRow(), error: null });
  });

  it("calls the tenant RPC and maps only the minimum transaction DTO", async () => {
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      page: {
        churchId: CHURCH_ID,
        churchTimezone: "America/Barbados",
        transactions: [
          {
            id: TRANSACTION_ID,
            donorName: "Alicia Clarke",
            fundId: FUND_ID,
            fundName: "Tithes",
            campaignId: CAMPAIGN_ID,
            campaignName: "Community Centre",
            recordedAt: RECORDED_AT,
            frequency: "weekly",
            recurringStatus: "active",
            amountMinor: 25_000,
            currency: "BBD",
            processingFeeMinor: 775,
            refundedAmountMinor: 0,
            netAmountMinor: 24_225,
            paymentMethodBrand: "Visa",
            paymentMethodLast4: "4242",
            paymentStatus: "succeeded",
            cancellationState: "not_canceled",
          },
        ],
        fundOptions: [{ id: FUND_ID, name: "Tithes", status: "active" }],
        nextCursor: null,
        hasMore: false,
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_transaction_page", {
      target_church_id: CHURCH_ID,
      transaction_page_size: 20,
    });
  });

  it("passes every filter and both cursor fields using exact minor units", async () => {
    const filters: ChurchTransactionFilters = {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      donorQuery: "Alicia Clarke",
      minAmountMinor: 2_550,
      maxAmountMinor: 50_000,
      fundId: FUND_ID,
      recurringState: "active",
      last4: "4242",
      paymentStatus: "succeeded",
      cancellationState: "not_canceled",
    };
    const cursor = {
      createdAt: "2026-08-17T13:04:00+00:00",
      transactionId: "50000000-0000-4000-8000-000000000007",
    } as const;

    await expect(
      getChurchTransactionPage(client, CHURCH_ID, {
        pageSize: 25,
        filters,
        cursor,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("get_church_transaction_page", {
      target_church_id: CHURCH_ID,
      transaction_page_size: 25,
      transaction_cursor_created_at: cursor.createdAt,
      transaction_cursor_id: cursor.transactionId,
      transaction_date_from: "2026-08-01",
      transaction_date_to: "2026-08-31",
      transaction_donor_query: "Alicia Clarke",
      transaction_min_amount_minor: 2_550,
      transaction_max_amount_minor: 50_000,
      transaction_fund_id: FUND_ID,
      transaction_recurring_state: "active",
      transaction_last4: "4242",
      transaction_payment_status: "succeeded",
      transaction_cancellation_state: "not_canceled",
    });
  });

  it("drops hidden database fields from the returned DTO", async () => {
    rpc.mockResolvedValue({
      data: pageRow({
        transactions: [
          {
            ...transactionRow,
            donor_email: "alicia@example.test",
            donor_message: "private message",
            provider_payment_reference: "provider-secret-reference",
            prayer_request: "private prayer",
            failure_message: "private provider response",
          },
        ],
      }),
      error: null,
    });

    const result = await getChurchTransactionPage(client, CHURCH_ID);
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toMatch(
      /alicia@example|private message|provider-secret|private prayer|private provider/i,
    );
  });

  it.each([
    ["cross-tenant row", { church_id: OTHER_CHURCH_ID }],
    ["blank donor", { donor_name: "" }],
    ["half campaign", { campaign_name: null }],
    ["invalid timestamp", { recorded_at: "16 August 2026" }],
    ["half recurring state", { recurring_status: null }],
    ["string amount", { amount_minor: "25000" }],
    ["unsupported currency", { currency: "EUR" }],
    ["negative fee", { processing_fee_minor: -1 }],
    ["refund above gross", { refunded_amount_minor: 25_001 }],
    ["wrong net", { net_amount_minor: 24_224 }],
    ["unsafe brand", { payment_method_brand: "Visa\nsecret" }],
    ["invalid last four", { payment_method_last4: "424" }],
    ["unknown payment status", { payment_status: "complete" }],
    ["inconsistent cancellation", { cancellation_state: "payment_canceled" }],
  ])("fails closed for a malformed %s", async (_name, override) => {
    rpc.mockResolvedValue({
      data: pageRow({ transactions: [{ ...transactionRow, ...override }] }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("accepts coherent one-time, canceled, and refund states", async () => {
    rpc.mockResolvedValue({
      data: pageRow({
        transactions: [
          {
            ...transactionRow,
            frequency: null,
            recurring_status: null,
            payment_status: "canceled",
            cancellation_state: "payment_canceled",
          },
        ],
      }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
      page: {
        transactions: [
          {
            frequency: null,
            recurringStatus: null,
            paymentStatus: "canceled",
            cancellationState: "payment_canceled",
          },
        ],
      },
    });

    rpc.mockResolvedValue({
      data: pageRow({
        transactions: [
          {
            ...transactionRow,
            refunded_amount_minor: 25_000,
            net_amount_minor: -775,
            payment_status: "refunded",
          },
        ],
      }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("enforces unique descending keys and strict cursor boundaries", async () => {
    const older = {
      ...transactionRow,
      transaction_id: OLDER_TRANSACTION_ID,
      recorded_at: "2026-08-15T13:04:00+00:00",
    };
    rpc.mockResolvedValue({
      data: pageRow({ transactions: [older, transactionRow] }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpc.mockResolvedValue({
      data: pageRow({ transactions: [transactionRow, transactionRow] }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpc.mockResolvedValue({ data: pageRow(), error: null });
    await expect(
      getChurchTransactionPage(client, CHURCH_ID, {
        cursor: { createdAt: RECORDED_AT, transactionId: TRANSACTION_ID },
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("requires next cursor integrity and matching fund projections", async () => {
    rpc.mockResolvedValue({
      data: pageRow({
        has_more: true,
        next_cursor_created_at: RECORDED_AT,
        next_cursor_transaction_id: OLDER_TRANSACTION_ID,
      }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpc.mockResolvedValue({
      data: pageRow({
        fund_options: [{ ...fundOption, fund_name: "Renamed Tithes" }],
      }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns a verified keyset cursor only when more rows exist", async () => {
    rpc.mockResolvedValue({
      data: pageRow({
        has_more: true,
        next_cursor_created_at: RECORDED_AT,
        next_cursor_transaction_id: TRANSACTION_ID,
      }),
      error: null,
    });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
      page: {
        hasMore: true,
        nextCursor: { createdAt: RECORDED_AT, transactionId: TRANSACTION_ID },
      },
    });
  });

  it.each([
    ["CHURCH_TRANSACTIONS_FORBIDDEN", "forbidden"],
    ["CHURCH_TRANSACTIONS_INVALID_PAGE_SIZE", "invalid_request"],
    ["CHURCH_TRANSACTIONS_INVALID_CURSOR", "invalid_request"],
    ["private table detail", "unavailable"],
  ] as const)("maps safe database error %s", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects malformed inputs before calling the database", async () => {
    await expect(
      getChurchTransactionPage(client, "not-a-uuid"),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      getChurchTransactionPage(client, CHURCH_ID, { pageSize: 51 }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      getChurchTransactionPage(client, CHURCH_ID, {
        filters: {
          ...EMPTY_CHURCH_TRANSACTION_FILTERS,
          minAmountMinor: 500,
          maxAmountMinor: 499,
        },
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    await expect(
      getChurchTransactionPage(client, CHURCH_ID, {
        cursor: {
          createdAt: "2026-02-30T00:00:00Z",
          transactionId: TRANSACTION_ID,
        },
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails unavailable on thrown calls, malformed envelopes, or raw errors", async () => {
    rpc.mockRejectedValueOnce(new Error("network"));
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpc.mockResolvedValueOnce({ data: [pageRow(), pageRow()], error: null });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 42 } });
    await expect(getChurchTransactionPage(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
