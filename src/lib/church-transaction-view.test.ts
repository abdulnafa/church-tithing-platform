import { describe, expect, it } from "vitest";

import { demoDonations, demoFunds } from "./demo-data";
import {
  createChurchTransactionExportDetails,
  createChurchTransactionFundOptions,
  createChurchTransactionRows,
} from "./church-transaction-view";

describe("church transaction client DTOs", () => {
  it("keeps display rows and fund options free of export-only or unrelated fields", () => {
    const clientData = {
      rows: createChurchTransactionRows(demoDonations),
      funds: createChurchTransactionFundOptions(demoFunds),
    };
    const serialized = JSON.stringify(clientData);

    expect(clientData.rows[0]).toEqual({
      id: "donation_1006",
      fundId: "fund_tithes",
      donorName: "Alicia Clarke",
      receiptNumber: "HGC-2026-001006",
      createdAt: "2026-08-16T13:04:00.000Z",
      frequency: "weekly",
      amount: { amountMinor: 25_000, currency: "BBD" },
      netAmount: { amountMinor: 24_225, currency: "BBD" },
      status: "succeeded",
    });
    expect(serialized).not.toContain("@example.com");
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("providerPaymentReference");
    expect(serialized).not.toContain("paymentMethod");
    expect(serialized).not.toContain("hasPrayerRequest");
  });

  it("limits the optional demo export DTO to the reviewed CSV fields", () => {
    expect(createChurchTransactionExportDetails(demoDonations)[0]).toEqual({
      transactionId: "donation_1006",
      donorEmail: "alicia.clarke@example.com",
      processingFee: { amountMinor: 775, currency: "BBD" },
    });
  });
});
