import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPrivilegedServerSupabaseClientMock,
  createPublicServerSupabaseClientMock,
  rpcMock,
} = vi.hoisted(() => ({
  createPrivilegedServerSupabaseClientMock: vi.fn(),
  createPublicServerSupabaseClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicServerSupabaseClient: createPublicServerSupabaseClientMock,
}));
vi.mock("@/lib/supabase/privileged-server", () => ({
  createPrivilegedServerSupabaseClient: createPrivilegedServerSupabaseClientMock,
}));

import {
  beginMockGivingCheckout,
  cancelMockGivingCheckout,
  completeMockGivingCheckout,
  getMockGivingCheckout,
} from "./mock-giving-dal";

const REQUEST_ID = "90000000-0000-4000-8000-000000000001";
const CHECKOUT_ID = "90000000-0000-4000-8000-000000000002";
const DONATION_ID = "90000000-0000-4000-8000-000000000003";
const FUND_ID = "20000000-0000-4000-8000-000000000001";

const startInput = {
  requestId: REQUEST_ID,
  churchSlug: "harbour-grace",
  targetKind: "fund" as const,
  targetId: FUND_ID,
  amountMinor: 5_000,
  frequency: "one_time" as const,
  donor: { fullName: "Guest Donor", email: "guest@example.test" },
};

const startRow = {
  checkout_id: CHECKOUT_ID,
  donation_id: DONATION_ID,
  expires_at: "2026-09-17T12:30:00+00:00",
  replayed: false,
};

const checkoutRow = {
  checkout_id: CHECKOUT_ID,
  church_slug: "harbour-grace",
  church_name: "Harbour Grace Church",
  fund_name: "Tithes",
  campaign_name: null,
  amount_minor_text: "5000",
  currency: "BBD",
  frequency: "one_time",
  checkout_status: "open",
  expires_at: "2026-09-17T12:30:00+00:00",
  provider_payment_reference: `mock_payment_${CHECKOUT_ID.replaceAll("-", "")}`,
  provider_schedule_reference: null,
  thank_you_message: "Thank you for supporting our church.",
  created_at: "2026-09-17T12:00:00+00:00",
};

describe("mock giving database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPrivilegedServerSupabaseClientMock.mockReturnValue({ rpc: rpcMock });
    createPublicServerSupabaseClientMock.mockReturnValue({ rpc: rpcMock });
  });

  it("creates one pending checkout through the cookie-free anonymous RPC", async () => {
    rpcMock.mockResolvedValue({ data: startRow, error: null });

    await expect(beginMockGivingCheckout(startInput)).resolves.toEqual({
      ok: true,
      checkoutId: CHECKOUT_ID,
      expiresAt: "2026-09-17T12:30:00+00:00",
      replayed: false,
    });
    expect(createPrivilegedServerSupabaseClientMock).toHaveBeenCalledOnce();
    expect(createPublicServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("begin_mock_giving_checkout", {
      church_slug: "harbour-grace",
      capability_token: REQUEST_ID,
      target_kind: "fund",
      target_id: FUND_ID,
      amount_minor: 5_000,
      frequency: "one_time",
      donor_display_name: "Guest Donor",
      donor_email: "guest@example.test",
    });
    expect(JSON.stringify(rpcMock.mock.calls[0])).not.toMatch(
      /prayer|card|bank|password/i,
    );
  });

  it.each([
    ["MOCK_CHECKOUT_INVALID_REQUEST", "invalid_request"],
    ["MOCK_CHECKOUT_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["MOCK_CHECKOUT_UNAVAILABLE", "unavailable"],
  ])("maps begin error %s without leaking provider details", async (message, reason) => {
    rpcMock.mockResolvedValue({ data: null, error: { message } });
    await expect(beginMockGivingCheckout(startInput)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("reads and validates the minimum capability-scoped snapshot", async () => {
    rpcMock.mockResolvedValue({ data: [checkoutRow], error: null });

    await expect(getMockGivingCheckout(CHECKOUT_ID, REQUEST_ID)).resolves.toEqual({
      ok: true,
      checkout: {
        checkoutId: CHECKOUT_ID,
        churchSlug: "harbour-grace",
        churchName: "Harbour Grace Church",
        fundName: "Tithes",
        campaignName: null,
        amountMinor: "5000",
        currency: "BBD",
        frequency: "one_time",
        checkoutStatus: "open",
        expiresAt: "2026-09-17T12:30:00+00:00",
        providerPaymentReference: `mock_payment_${CHECKOUT_ID.replaceAll("-", "")}`,
        providerScheduleReference: null,
        thankYouMessage: "Thank you for supporting our church.",
        createdAt: "2026-09-17T12:00:00+00:00",
      },
    });
    expect(rpcMock).toHaveBeenCalledWith("get_mock_giving_checkout", {
      checkout_id: CHECKOUT_ID,
      capability_token: REQUEST_ID,
    });
  });

  it("distinguishes a missing capability result from infrastructure failure", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(getMockGivingCheckout(CHECKOUT_ID, REQUEST_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });

    rpcMock.mockRejectedValueOnce(new Error("private network detail"));
    await expect(getMockGivingCheckout(CHECKOUT_ID, REQUEST_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it.each([
    { amount_minor_text: "0" },
    { currency: "EUR" },
    { checkout_status: "paid" },
    { provider_payment_reference: "real-secret-reference" },
    { provider_schedule_reference: "mock_schedule_bad" },
    { church_name: " Unsafe" },
    { created_at: "not-a-timestamp" },
  ])("fails closed for a malformed checkout snapshot", async (override) => {
    rpcMock.mockResolvedValue({
      data: [{ ...checkoutRow, ...override }],
      error: null,
    });
    await expect(getMockGivingCheckout(CHECKOUT_ID, REQUEST_ID)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("cancels and completes through separate narrow RPC calls", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          checkout_id: CHECKOUT_ID,
          checkout_status: "canceled",
          donation_status: "canceled",
          recurring_status: null,
          replayed: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          checkout_id: CHECKOUT_ID,
          checkout_status: "completed",
          donation_status: "succeeded",
          recurring_status: "active",
          replayed: false,
          webhook_event_id: "90000000-0000-4000-8000-000000000004",
          webhook_status: "processed",
          webhook_outcome: "donation_succeeded",
        },
        error: null,
      });

    await expect(cancelMockGivingCheckout(CHECKOUT_ID, REQUEST_ID)).resolves.toMatchObject({
      ok: true,
      state: { checkoutStatus: "canceled" },
    });
    await expect(
      completeMockGivingCheckout(CHECKOUT_ID, REQUEST_ID, {
        rawBody: '{"safe":true}',
        signature: "a".repeat(64),
      }),
    ).resolves.toMatchObject({
      ok: true,
      state: {
        checkoutStatus: "completed",
        donationStatus: "succeeded",
        webhookStatus: "processed",
        webhookOutcome: "donation_succeeded",
      },
    });
    expect(rpcMock.mock.calls[0]).toEqual([
      "cancel_mock_giving_checkout",
      { checkout_id: CHECKOUT_ID, capability_token: REQUEST_ID },
    ]);
    expect(rpcMock.mock.calls[1]).toEqual([
      "process_mock_giving_webhook",
      {
        checkout_id: CHECKOUT_ID,
        capability_token: REQUEST_ID,
        raw_body: '{"safe":true}',
        signature: "a".repeat(64),
      },
    ]);
    expect(createPublicServerSupabaseClientMock).toHaveBeenCalledOnce();
    expect(createPrivilegedServerSupabaseClientMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["processed", "donation_failed", false],
    ["ignored", "ignored_older_event", false],
    ["ignored", "ignored_terminal_state", true],
  ])(
    "accepts the safe webhook result %s/%s without treating provider failure as handler failure",
    async (webhookStatus, webhookOutcome, replayed) => {
      rpcMock.mockResolvedValue({
        data: {
          checkout_id: CHECKOUT_ID,
          checkout_status: "open",
          donation_status:
            webhookOutcome === "donation_failed" ? "failed" : "succeeded",
          recurring_status: null,
          replayed,
          webhook_event_id: "90000000-0000-4000-8000-000000000004",
          webhook_status: webhookStatus,
          webhook_outcome: webhookOutcome,
        },
        error: null,
      });

      await expect(
        completeMockGivingCheckout(CHECKOUT_ID, REQUEST_ID, {
          rawBody: '{"safe":true}',
          signature: "a".repeat(64),
        }),
      ).resolves.toMatchObject({
        ok: true,
        state: { webhookStatus, webhookOutcome, replayed },
      });
      expect(createPrivilegedServerSupabaseClientMock).toHaveBeenCalledOnce();
      expect(createPublicServerSupabaseClientMock).not.toHaveBeenCalled();
    },
  );

  it.each(["partially_refunded", "refunded", "disputed"])(
    "acknowledges a webhook ignored for an existing %s donation",
    async (donationStatus) => {
      rpcMock.mockResolvedValue({
        data: {
          checkout_id: CHECKOUT_ID,
          checkout_status: "completed",
          donation_status: donationStatus,
          recurring_status: null,
          replayed: false,
          webhook_event_id: "90000000-0000-4000-8000-000000000004",
          webhook_status: "ignored",
          webhook_outcome: "ignored_terminal_state",
        },
        error: null,
      });

      await expect(
        completeMockGivingCheckout(CHECKOUT_ID, REQUEST_ID, {
          rawBody: '{"safe":true}',
          signature: "a".repeat(64),
        }),
      ).resolves.toMatchObject({
        ok: true,
        state: {
          donationStatus,
          webhookStatus: "ignored",
          webhookOutcome: "ignored_terminal_state",
        },
      });
    },
  );

  it("keeps a journaled handler failure retryable", async () => {
    rpcMock.mockResolvedValue({
      data: {
        checkout_id: CHECKOUT_ID,
        checkout_status: "open",
        donation_status: "pending",
        recurring_status: null,
        replayed: false,
        webhook_event_id: "90000000-0000-4000-8000-000000000004",
        webhook_status: "failed",
        webhook_outcome: "handler_failed",
      },
      error: null,
    });

    await expect(
      completeMockGivingCheckout(CHECKOUT_ID, REQUEST_ID, {
        rawBody: '{"safe":true}',
        signature: "a".repeat(64),
      }),
    ).resolves.toEqual({ ok: false, reason: "handler_failed" });
  });

  it.each([
    { webhook_event_id: "not-a-uuid" },
    { webhook_status: "processed", webhook_outcome: "ignored_older_event" },
    { webhook_status: "ignored", webhook_outcome: "donation_succeeded" },
    { webhook_status: "failed", webhook_outcome: "donation_failed" },
  ])("fails closed for a malformed webhook result", async (override) => {
    rpcMock.mockResolvedValue({
      data: {
        checkout_id: CHECKOUT_ID,
        checkout_status: "completed",
        donation_status: "succeeded",
        recurring_status: null,
        replayed: false,
        webhook_event_id: "90000000-0000-4000-8000-000000000004",
        webhook_status: "processed",
        webhook_outcome: "donation_succeeded",
        ...override,
      },
      error: null,
    });

    await expect(
      completeMockGivingCheckout(CHECKOUT_ID, REQUEST_ID, {
        rawBody: '{"safe":true}',
        signature: "a".repeat(64),
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["MOCK_WEBHOOK_EVENT_LIMIT", "invalid_webhook"],
    ["MOCK_WEBHOOK_EVENT_COLLISION", "event_collision"],
    ["private database detail", "unavailable"],
  ])("maps completion error %s to %s", async (message, reason) => {
    rpcMock.mockResolvedValue({ data: null, error: { message } });

    await expect(
      completeMockGivingCheckout(CHECKOUT_ID, REQUEST_ID, {
        rawBody: '{"safe":true}',
        signature: "a".repeat(64),
      }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it.each([
    ["MOCK_CHECKOUT_FORBIDDEN", "forbidden"],
    ["MOCK_CHECKOUT_INVALID_STATE", "invalid_state"],
    ["MOCK_CHECKOUT_INVALID_WEBHOOK", "invalid_webhook"],
    ["private database detail", "unavailable"],
  ])("maps mutation error %s to %s", async (message, reason) => {
    rpcMock.mockResolvedValue({ data: null, error: { message } });
    await expect(cancelMockGivingCheckout(CHECKOUT_ID, REQUEST_ID)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it("rejects malformed identifiers before creating a client", async () => {
    await expect(getMockGivingCheckout("not-a-uuid", REQUEST_ID)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    await expect(cancelMockGivingCheckout(CHECKOUT_ID, "not-a-token")).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(createPrivilegedServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(createPublicServerSupabaseClientMock).not.toHaveBeenCalled();
  });
});
