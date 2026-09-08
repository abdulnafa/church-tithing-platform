import type {
  Donation,
  DonationStatus,
  GivingFrequency,
  GivingFund,
  Money,
} from "./types";

/**
 * Minimal transaction fields required by the interactive table. Keeping this
 * DTO separate prevents unrelated donation fields from crossing the RSC to
 * client boundary.
 */
export type ChurchTransactionRow = Readonly<{
  id: string;
  fundId: string;
  donorName: string;
  receiptNumber: string | null;
  createdAt: string;
  frequency: GivingFrequency;
  amount: Money;
  netAmount: Money;
  status: DonationStatus;
}>;

export type ChurchTransactionFundOption = Readonly<{
  id: string;
  name: string;
}>;

/** Demo-only CSV fields. P21 replaces this with an audited server export. */
export type ChurchTransactionExportDetail = Readonly<{
  transactionId: string;
  donorEmail: string;
  processingFee: Money;
}>;

export function createChurchTransactionRows(
  donations: readonly Donation[],
): readonly ChurchTransactionRow[] {
  return donations.map((donation) => ({
    id: donation.id,
    fundId: donation.fundId,
    donorName: donation.donor.name,
    receiptNumber: donation.receiptNumber,
    createdAt: donation.createdAt,
    frequency: donation.frequency,
    amount: {
      amountMinor: donation.amount.amountMinor,
      currency: donation.amount.currency,
    },
    netAmount: {
      amountMinor: donation.netAmount.amountMinor,
      currency: donation.netAmount.currency,
    },
    status: donation.status,
  }));
}

export function createChurchTransactionFundOptions(
  funds: readonly GivingFund[],
): readonly ChurchTransactionFundOption[] {
  return funds.map(({ id, name }) => ({ id, name }));
}

export function createChurchTransactionExportDetails(
  donations: readonly Donation[],
): readonly ChurchTransactionExportDetail[] {
  return donations.map((donation) => ({
    transactionId: donation.id,
    donorEmail: donation.donor.email,
    processingFee: {
      amountMinor: donation.processingFee.amountMinor,
      currency: donation.processingFee.currency,
    },
  }));
}
