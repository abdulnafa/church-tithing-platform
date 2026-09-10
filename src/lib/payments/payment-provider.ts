import type {
  CurrencyCode,
  GivingFrequency,
  Money,
  PaymentMethodSummary,
  RecurringGiftStatus,
} from "../types";

export type RecurringFrequency = Exclude<GivingFrequency, "one_time">;

export interface PaymentProviderCapabilities {
  readonly cardPayments: boolean;
  readonly savedPaymentMethods: boolean;
  readonly recurringFrequencies: readonly RecurringFrequency[];
  readonly automaticRetries: boolean;
  readonly webhooks: boolean;
  readonly refundsVisible: boolean;
  readonly disputesVisible: boolean;
  readonly supportedCurrencies: readonly CurrencyCode[];
  readonly settlementMode: "direct_to_church";
}

/**
 * A public connection handle. Secret API credentials remain in the server-side
 * provider implementation and must not be persisted in client-readable data.
 */
export interface PaymentConnectionContext {
  readonly churchId: string;
  readonly merchantReference: string;
  readonly status: "active" | "restricted" | "disabled";
  readonly defaultCurrency: CurrencyCode;
}

export interface CheckoutDonor {
  readonly memberId: string | null;
  readonly name: string;
  readonly email: string;
}

export interface CreateCheckoutSessionInput {
  readonly idempotencyKey: string;
  readonly amount: Money;
  readonly fundId: string;
  readonly campaignId: string | null;
  readonly frequency: GivingFrequency;
  readonly donor: CheckoutDonor;
  readonly message: string | null;
  readonly savePaymentMethod: boolean;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type CheckoutSessionStatus =
  | "open"
  | "completed"
  | "expired"
  | "cancelled";

export interface CheckoutSession {
  readonly id: string;
  readonly providerKey: string;
  readonly churchId: string;
  readonly hostedUrl: string;
  readonly status: CheckoutSessionStatus;
  readonly expiresAt: string;
  readonly paymentReference: string;
  readonly recurringScheduleReference: string | null;
}

export type ProviderPaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "disputed";

export interface ProviderPayment {
  readonly reference: string;
  readonly churchId: string;
  readonly merchantReference: string;
  readonly amount: Money;
  readonly status: ProviderPaymentStatus;
  readonly processingFee: Money | null;
  readonly netAmount: Money | null;
  readonly paymentMethod: PaymentMethodSummary | null;
  readonly createdAt: string;
  readonly processedAt: string | null;
}

export interface ProviderRecurringSchedule {
  readonly reference: string;
  readonly churchId: string;
  readonly merchantReference: string;
  readonly amount: Money;
  readonly fundId: string;
  readonly campaignId: string | null;
  readonly frequency: RecurringFrequency;
  readonly status: RecurringGiftStatus;
  readonly nextChargeAt: string | null;
}

export interface UpdateRecurringScheduleInput {
  readonly amount?: Money;
  readonly fundId?: string;
  readonly campaignId?: string | null;
  readonly paymentMethodToken?: string;
}

export type ProviderWebhookEvent =
  | {
      readonly id: string;
      readonly type: "payment.succeeded" | "payment.failed";
      readonly occurredAt: string;
      readonly payment: ProviderPayment;
    }
  | {
      readonly id: string;
      readonly type:
        | "recurring.created"
        | "recurring.updated"
        | "recurring.paused"
        | "recurring.resumed"
        | "recurring.cancelled";
      readonly occurredAt: string;
      readonly schedule: ProviderRecurringSchedule;
    };

export interface PaymentWebhookRequest {
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/**
 * Donation gateway contract for Option A. Every operation is scoped to the
 * church's own merchant account and settles directly to that church. Platform
 * subscription billing belongs in a separate integration.
 */
export interface DonationPaymentProvider {
  readonly key: string;
  readonly displayName: string;
  readonly settlementMode: "direct_to_church";

  getCapabilities(
    connection: PaymentConnectionContext,
  ): Promise<PaymentProviderCapabilities>;

  createCheckoutSession(
    connection: PaymentConnectionContext,
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSession>;

  retrievePayment(
    connection: PaymentConnectionContext,
    paymentReference: string,
  ): Promise<ProviderPayment>;

  retrieveRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule>;

  updateRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
    input: UpdateRecurringScheduleInput,
  ): Promise<ProviderRecurringSchedule>;

  pauseRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule>;

  resumeRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule>;

  cancelRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule>;

  verifyAndParseWebhook(
    request: PaymentWebhookRequest,
  ): Promise<readonly ProviderWebhookEvent[]>;
}

export type PaymentProviderErrorCode =
  | "connection_inactive"
  | "unsupported_currency"
  | "unsupported_frequency"
  | "invalid_amount"
  | "not_found"
  | "invalid_state"
  | "invalid_webhook";

export class PaymentProviderError extends Error {
  readonly code: PaymentProviderErrorCode;

  constructor(code: PaymentProviderErrorCode, message: string) {
    super(message);
    this.name = "PaymentProviderError";
    this.code = code;
  }
}
