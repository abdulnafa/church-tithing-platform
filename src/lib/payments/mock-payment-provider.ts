import type {
  CurrencyCode,
  PaymentMethodSummary,
  RecurringGiftStatus,
} from "../types";
import {
  PaymentProviderError,
  type CheckoutSession,
  type CreateCheckoutSessionInput,
  type DonationPaymentProvider,
  type PaymentConnectionContext,
  type PaymentProviderCapabilities,
  type PaymentWebhookRequest,
  type ProviderPayment,
  type ProviderRecurringSchedule,
  type ProviderWebhookEvent,
  type RecurringFrequency,
  type UpdateRecurringScheduleInput,
} from "./payment-provider";

const MOCK_SIGNATURE = "mock-valid-signature";

const capabilities = {
  cardPayments: true,
  savedPaymentMethods: true,
  recurringFrequencies: ["weekly", "monthly"],
  automaticRetries: true,
  webhooks: true,
  refundsVisible: true,
  disputesVisible: true,
  supportedCurrencies: ["USD", "CAD", "BBD", "XCD"],
  settlementMode: "direct_to_church",
} satisfies PaymentProviderCapabilities;

interface StoredCheckout {
  readonly session: CheckoutSession;
  readonly connection: PaymentConnectionContext;
  readonly input: CreateCheckoutSessionInput;
}

export interface MockCheckoutCompletion {
  readonly session: CheckoutSession;
  readonly payment: ProviderPayment;
  readonly schedule: ProviderRecurringSchedule | null;
  readonly eventIds: readonly string[];
}

export interface MockPaymentProviderOptions {
  readonly checkoutBaseUrl?: string;
  readonly now?: () => Date;
}

/**
 * In-memory development gateway. It intentionally never models a platform
 * balance or payout: all payments are owned by the church merchant reference.
 * Replace this class with the selected Barbados gateway adapter for production.
 */
export class MockDonationPaymentProvider implements DonationPaymentProvider {
  readonly key = "mock-barbados-gateway";
  readonly displayName = "Mock Barbados Gateway";
  readonly settlementMode = "direct_to_church" as const;

  private readonly checkoutBaseUrl: string;
  private readonly now: () => Date;
  private sequence = 0;
  private readonly idempotencyKeys = new Map<string, string>();
  private readonly checkouts = new Map<string, StoredCheckout>();
  private readonly payments = new Map<string, ProviderPayment>();
  private readonly schedules = new Map<string, ProviderRecurringSchedule>();
  private readonly events = new Map<string, ProviderWebhookEvent>();

  constructor(options: MockPaymentProviderOptions = {}) {
    this.checkoutBaseUrl = (
      options.checkoutBaseUrl ?? "https://payments.example.test/checkout"
    ).replace(/\/$/, "");
    this.now = options.now ?? (() => new Date());
  }

  async getCapabilities(
    connection: PaymentConnectionContext,
  ): Promise<PaymentProviderCapabilities> {
    this.assertConnectionActive(connection);
    return capabilities;
  }

  async createCheckoutSession(
    connection: PaymentConnectionContext,
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSession> {
    this.assertConnectionActive(connection);
    this.validateCheckout(input);

    const idempotencyKey = `${connection.churchId}:${input.idempotencyKey}`;
    const existingSessionId = this.idempotencyKeys.get(idempotencyKey);
    if (existingSessionId) {
      const existing = this.checkouts.get(existingSessionId);
      if (existing) {
        return existing.session;
      }
    }

    const createdAt = this.now();
    const checkoutId = this.createId("checkout");
    const paymentReference = this.createId("payment");
    const recurringScheduleReference =
      input.frequency === "one_time" ? null : this.createId("schedule");
    const session: CheckoutSession = {
      id: checkoutId,
      providerKey: this.key,
      churchId: connection.churchId,
      hostedUrl: `${this.checkoutBaseUrl}/${checkoutId}`,
      status: "open",
      expiresAt: new Date(createdAt.getTime() + 30 * 60 * 1_000).toISOString(),
      paymentReference,
      recurringScheduleReference,
    };

    const payment: ProviderPayment = {
      reference: paymentReference,
      churchId: connection.churchId,
      merchantReference: connection.merchantReference,
      amount: input.amount,
      status: "pending",
      processingFee: null,
      netAmount: null,
      paymentMethod: null,
      createdAt: createdAt.toISOString(),
      processedAt: null,
    };

    this.idempotencyKeys.set(idempotencyKey, checkoutId);
    this.checkouts.set(checkoutId, { session, connection, input });
    this.payments.set(paymentReference, payment);
    return session;
  }

  async retrievePayment(
    connection: PaymentConnectionContext,
    paymentReference: string,
  ): Promise<ProviderPayment> {
    this.assertConnectionActive(connection);
    const payment = this.payments.get(paymentReference);
    if (!payment) {
      throw new PaymentProviderError("not_found", "Payment was not found.");
    }

    this.assertChurchOwnership(connection, payment);
    return payment;
  }

  async retrieveRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule> {
    this.assertConnectionActive(connection);
    const schedule = this.requireSchedule(scheduleReference);
    this.assertChurchOwnership(connection, schedule);
    return schedule;
  }

  async updateRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
    input: UpdateRecurringScheduleInput,
  ): Promise<ProviderRecurringSchedule> {
    this.assertConnectionActive(connection);
    const current = this.requireMutableSchedule(connection, scheduleReference);

    if (input.amount) {
      this.validateAmount(input.amount.amountMinor, input.amount.currency);
      if (input.amount.currency !== current.amount.currency) {
        throw new PaymentProviderError(
          "unsupported_currency",
          "A recurring schedule's currency cannot be changed.",
        );
      }
    }

    const updated: ProviderRecurringSchedule = {
      ...current,
      amount: input.amount ?? current.amount,
      fundId: input.fundId ?? current.fundId,
      campaignId:
        input.campaignId === undefined
          ? current.campaignId
          : input.campaignId,
    };
    this.schedules.set(scheduleReference, updated);
    this.recordScheduleEvent("recurring.updated", updated);
    return updated;
  }

  async pauseRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule> {
    const current = this.requireMutableSchedule(connection, scheduleReference);
    return this.setScheduleStatus(current, "paused", "recurring.paused");
  }

  async resumeRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule> {
    const current = this.requireMutableSchedule(connection, scheduleReference);
    if (current.status !== "paused" && current.status !== "past_due") {
      throw new PaymentProviderError(
        "invalid_state",
        "Only paused or past-due schedules can be resumed.",
      );
    }

    const resumed: ProviderRecurringSchedule = {
      ...current,
      status: "active",
      nextChargeAt: this.nextChargeDate(current.frequency, this.now()),
    };
    this.schedules.set(current.reference, resumed);
    this.recordScheduleEvent("recurring.resumed", resumed);
    return resumed;
  }

  async cancelRecurringSchedule(
    connection: PaymentConnectionContext,
    scheduleReference: string,
  ): Promise<ProviderRecurringSchedule> {
    const current = this.requireMutableSchedule(connection, scheduleReference);
    return this.setScheduleStatus(
      current,
      "cancelled",
      "recurring.cancelled",
    );
  }

  async verifyAndParseWebhook(
    request: PaymentWebhookRequest,
  ): Promise<readonly ProviderWebhookEvent[]> {
    if (request.headers["x-mock-signature"] !== MOCK_SIGNATURE) {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Mock webhook signature is invalid.",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(request.rawBody) as unknown;
    } catch {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Mock webhook body is not valid JSON.",
      );
    }

    if (!hasStringArray(payload, "eventIds")) {
      throw new PaymentProviderError(
        "invalid_webhook",
        "Mock webhook body must contain an eventIds array.",
      );
    }

    return payload.eventIds.map((eventId) => {
      const event = this.events.get(eventId);
      if (!event) {
        throw new PaymentProviderError(
          "invalid_webhook",
          `Mock webhook event ${eventId} was not found.`,
        );
      }
      return event;
    });
  }

  /** Completes a hosted checkout during local UI and webhook testing. */
  async simulateSuccessfulCheckout(
    checkoutId: string,
  ): Promise<MockCheckoutCompletion> {
    const stored = this.checkouts.get(checkoutId);
    if (!stored) {
      throw new PaymentProviderError("not_found", "Checkout was not found.");
    }
    if (stored.session.status !== "open") {
      throw new PaymentProviderError(
        "invalid_state",
        "Only an open checkout can be completed.",
      );
    }

    const processedAt = this.now();
    const feeMinor = Math.min(
      stored.input.amount.amountMinor,
      Math.round(stored.input.amount.amountMinor * 0.029) + 30,
    );
    const paymentMethod = this.createMockCard(stored.input.savePaymentMethod);
    const payment: ProviderPayment = {
      reference: stored.session.paymentReference,
      churchId: stored.connection.churchId,
      merchantReference: stored.connection.merchantReference,
      amount: stored.input.amount,
      status: "succeeded",
      processingFee: {
        amountMinor: feeMinor,
        currency: stored.input.amount.currency,
      },
      netAmount: {
        amountMinor: stored.input.amount.amountMinor - feeMinor,
        currency: stored.input.amount.currency,
      },
      paymentMethod,
      createdAt:
        this.payments.get(stored.session.paymentReference)?.createdAt ??
        processedAt.toISOString(),
      processedAt: processedAt.toISOString(),
    };
    const session: CheckoutSession = {
      ...stored.session,
      status: "completed",
    };

    this.payments.set(payment.reference, payment);
    this.checkouts.set(checkoutId, { ...stored, session });

    const eventIds: string[] = [];
    eventIds.push(this.recordPaymentEvent("payment.succeeded", payment));

    let schedule: ProviderRecurringSchedule | null = null;
    if (
      stored.input.frequency !== "one_time" &&
      session.recurringScheduleReference
    ) {
      schedule = {
        reference: session.recurringScheduleReference,
        churchId: stored.connection.churchId,
        merchantReference: stored.connection.merchantReference,
        amount: stored.input.amount,
        fundId: stored.input.fundId,
        campaignId: stored.input.campaignId,
        frequency: stored.input.frequency,
        status: "active",
        nextChargeAt: this.nextChargeDate(
          stored.input.frequency,
          processedAt,
        ),
      };
      this.schedules.set(schedule.reference, schedule);
      eventIds.push(this.recordScheduleEvent("recurring.created", schedule));
    }

    return { session, payment, schedule, eventIds };
  }

  createWebhookRequest(eventIds: readonly string[]): PaymentWebhookRequest {
    return {
      rawBody: JSON.stringify({ eventIds }),
      headers: { "x-mock-signature": MOCK_SIGNATURE },
    };
  }

  private validateCheckout(input: CreateCheckoutSessionInput): void {
    this.validateAmount(input.amount.amountMinor, input.amount.currency);

    if (
      input.frequency !== "one_time" &&
      !capabilities.recurringFrequencies.includes(input.frequency)
    ) {
      throw new PaymentProviderError(
        "unsupported_frequency",
        `${input.frequency} recurring gifts are not supported.`,
      );
    }
  }

  private validateAmount(amountMinor: number, currency: CurrencyCode): void {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new PaymentProviderError(
        "invalid_amount",
        "Payment amount must be a positive integer in minor units.",
      );
    }
    if (!capabilities.supportedCurrencies.includes(currency)) {
      throw new PaymentProviderError(
        "unsupported_currency",
        `${currency} is not supported by the payment provider.`,
      );
    }
  }

  private assertConnectionActive(connection: PaymentConnectionContext): void {
    if (connection.status !== "active") {
      throw new PaymentProviderError(
        "connection_inactive",
        "The church payment connection is not active.",
      );
    }
    if (!connection.merchantReference.trim()) {
      throw new PaymentProviderError(
        "connection_inactive",
        "The church merchant reference is missing.",
      );
    }
  }

  private assertChurchOwnership(
    connection: PaymentConnectionContext,
    record: { readonly churchId: string; readonly merchantReference: string },
  ): void {
    if (
      record.churchId !== connection.churchId ||
      record.merchantReference !== connection.merchantReference
    ) {
      throw new PaymentProviderError(
        "not_found",
        "The payment record does not belong to this church.",
      );
    }
  }

  private requireSchedule(reference: string): ProviderRecurringSchedule {
    const schedule = this.schedules.get(reference);
    if (!schedule) {
      throw new PaymentProviderError(
        "not_found",
        "Recurring schedule was not found.",
      );
    }
    return schedule;
  }

  private requireMutableSchedule(
    connection: PaymentConnectionContext,
    reference: string,
  ): ProviderRecurringSchedule {
    this.assertConnectionActive(connection);
    const schedule = this.requireSchedule(reference);
    this.assertChurchOwnership(connection, schedule);
    if (schedule.status === "cancelled") {
      throw new PaymentProviderError(
        "invalid_state",
        "A cancelled recurring schedule cannot be changed.",
      );
    }
    return schedule;
  }

  private setScheduleStatus(
    schedule: ProviderRecurringSchedule,
    status: RecurringGiftStatus,
    eventType: Extract<
      ProviderWebhookEvent["type"],
      "recurring.paused" | "recurring.cancelled"
    >,
  ): ProviderRecurringSchedule {
    if (schedule.status === status) {
      return schedule;
    }
    const updated: ProviderRecurringSchedule = {
      ...schedule,
      status,
      nextChargeAt: null,
    };
    this.schedules.set(schedule.reference, updated);
    this.recordScheduleEvent(eventType, updated);
    return updated;
  }

  private recordPaymentEvent(
    type: "payment.succeeded" | "payment.failed",
    payment: ProviderPayment,
  ): string {
    const event: ProviderWebhookEvent = {
      id: this.createId("event"),
      type,
      occurredAt: this.now().toISOString(),
      payment,
    };
    this.events.set(event.id, event);
    return event.id;
  }

  private recordScheduleEvent(
    type: Extract<ProviderWebhookEvent["type"], `recurring.${string}`>,
    schedule: ProviderRecurringSchedule,
  ): string {
    const event: ProviderWebhookEvent = {
      id: this.createId("event"),
      type,
      occurredAt: this.now().toISOString(),
      schedule,
    };
    this.events.set(event.id, event);
    return event.id;
  }

  private nextChargeDate(
    frequency: RecurringFrequency,
    from: Date,
  ): string {
    const next = new Date(from);
    if (frequency === "weekly") {
      next.setUTCDate(next.getUTCDate() + 7);
    } else {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next.toISOString();
  }

  private createMockCard(isSaved: boolean): PaymentMethodSummary {
    return {
      id: isSaved ? this.createId("payment_method") : "pm_mock_ephemeral",
      type: "card",
      brand: "Visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2030,
      isDefault: isSaved,
    };
  }

  private createId(resource: string): string {
    this.sequence += 1;
    return `mock_${resource}_${String(this.sequence).padStart(6, "0")}`;
  }
}

export function createMockDonationPaymentProvider(
  options?: MockPaymentProviderOptions,
): MockDonationPaymentProvider {
  return new MockDonationPaymentProvider(options);
}

function hasStringArray(
  value: unknown,
  key: string,
): value is Record<string, readonly string[]> {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return false;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return (
    Array.isArray(candidate) &&
    candidate.every((item: unknown) => typeof item === "string")
  );
}
