export type CurrencyCode = "USD" | "CAD" | "BBD" | "XCD";

export type ChurchStatus =
  | "draft"
  | "onboarding"
  | "active"
  | "suspended"
  | "closed";

export type ConnectionStatus =
  | "not_connected"
  | "pending"
  | "active"
  | "restricted"
  | "disabled";

export type SubscriptionStatus =
  | "incomplete"
  | "active"
  | "past_due"
  | "cancelled";

export type StaffRole =
  | "church_owner"
  | "finance_admin"
  | "staff"
  | "accountant";

export type DonationStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "disputed";

export type GivingFrequency = "one_time" | "weekly" | "monthly";

export type RecurringGiftStatus =
  | "active"
  | "paused"
  | "past_due"
  | "cancelled";

export type CampaignStatus = "draft" | "active" | "ended" | "archived";

export interface Money {
  /** Integer minor units (for example, 1050 represents BBD 10.50). */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export interface ChurchBranding {
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly logoUrl: string | null;
  readonly thankYouMessage: string;
}

/**
 * Public, non-secret reference to the church's own merchant account.
 * Provider credentials must never be exposed through this object.
 */
export interface ChurchPaymentConnection {
  readonly providerKey: string;
  readonly externalMerchantReference: string | null;
  readonly status: ConnectionStatus;
  readonly settlementMode: "direct_to_church";
  readonly connectedAt: string | null;
}

export interface ChurchSubscription {
  readonly status: SubscriptionStatus;
  readonly planName: string;
  readonly monthlyPrice: Money;
  readonly renewsAt: string | null;
}

export interface Church {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly legalName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly address: string;
  readonly timezone: string;
  readonly status: ChurchStatus;
  readonly defaultCurrency: CurrencyCode;
  readonly supportedCurrencies: readonly CurrencyCode[];
  readonly branding: ChurchBranding;
  readonly paymentConnection: ChurchPaymentConnection;
  readonly subscription: ChurchSubscription;
  readonly createdAt: string;
}

export interface GivingFund {
  readonly id: string;
  readonly churchId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly displayOrder: number;
}

export interface Campaign {
  readonly id: string;
  readonly churchId: string;
  readonly fundId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly status: CampaignStatus;
  readonly goal: Money;
  readonly raised: Money;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly imageUrl: string | null;
}

export interface Member {
  readonly id: string;
  readonly churchId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly joinedAt: string;
  readonly emailVerifiedAt: string | null;
}

export interface ChurchStaffMember {
  readonly id: string;
  readonly churchId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: StaffRole;
  readonly status: "invited" | "active" | "disabled";
  readonly joinedAt: string | null;
}

export interface DonorSnapshot {
  readonly memberId: string | null;
  readonly name: string;
  readonly email: string;
}

export interface PaymentMethodSummary {
  readonly id: string;
  readonly type: "card";
  readonly brand: string;
  readonly last4: string;
  readonly expiryMonth: number;
  readonly expiryYear: number;
  readonly isDefault: boolean;
}

export interface Donation {
  readonly id: string;
  readonly churchId: string;
  readonly fundId: string;
  readonly campaignId: string | null;
  readonly recurringGiftId: string | null;
  readonly donor: DonorSnapshot;
  readonly amount: Money;
  readonly processingFee: Money;
  readonly netAmount: Money;
  readonly frequency: GivingFrequency;
  readonly status: DonationStatus;
  readonly paymentMethod: PaymentMethodSummary | null;
  readonly providerPaymentReference: string;
  readonly receiptNumber: string | null;
  readonly message: string | null;
  readonly hasPrayerRequest: boolean;
  readonly createdAt: string;
  readonly settledAt: string | null;
}

export interface RecurringGift {
  readonly id: string;
  readonly churchId: string;
  readonly memberId: string;
  readonly fundId: string;
  readonly campaignId: string | null;
  readonly amount: Money;
  readonly frequency: Exclude<GivingFrequency, "one_time">;
  readonly status: RecurringGiftStatus;
  readonly paymentMethod: PaymentMethodSummary;
  readonly providerScheduleReference: string;
  readonly startedAt: string;
  readonly nextChargeAt: string | null;
  readonly pausedAt: string | null;
  readonly cancelledAt: string | null;
}

export interface GivingSummary {
  readonly total: Money;
  readonly transactionCount: number;
  readonly activeRecurringCount: number;
  readonly uniqueDonorCount: number;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface GivingTrendPoint {
  readonly label: string;
  readonly total: Money;
}

export interface FundBreakdown {
  readonly fundId: string;
  readonly fundName: string;
  readonly total: Money;
  readonly percentage: number;
}
