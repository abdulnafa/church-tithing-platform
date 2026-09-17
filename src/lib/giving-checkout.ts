import {
  validateGuestIdentityValues,
  type GuestIdentityValues,
} from "@/lib/donor-identity";

export const MOCK_GIVING_LIMITS = {
  minimumAmountMinor: 100,
  maximumAmountMinor: 100_000_000,
} as const;

export const MOCK_GIVING_FREQUENCIES = [
  "one_time",
  "weekly",
  "monthly",
] as const;

export type MockGivingFrequency = (typeof MOCK_GIVING_FREQUENCIES)[number];
export type MockGivingTargetKind = "fund" | "campaign";

export type MockGivingCheckoutInput = Readonly<{
  requestId: string;
  churchSlug: string;
  targetKind: MockGivingTargetKind;
  targetId: string;
  amountMinor: number;
  frequency: MockGivingFrequency;
  donor: GuestIdentityValues;
}>;

export type MockGivingCheckoutValidation =
  | Readonly<{ success: true; data: MockGivingCheckoutInput }>
  | Readonly<{
      success: false;
      code:
        | "invalid_request"
        | "invalid_church"
        | "invalid_target"
        | "invalid_amount"
        | "invalid_frequency"
        | "invalid_donor";
    }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHURCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AMOUNT_PATTERN = /^(?:0|[1-9][0-9]{0,6})(?:\.([0-9]{1,2}))?$/;
const SENSITIVE_EXTRA_KEYS = new Set([
  "prayerConsent",
  "prayerConsentDraft",
  "prayerRequest",
  "prayerRequestDraft",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChurchSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 63 &&
    CHURCH_SLUG_PATTERN.test(value)
  );
}

export function parseGivingAmountToMinor(value: unknown) {
  if (typeof value !== "string" || value !== value.trim()) return null;

  const match = AMOUNT_PATTERN.exec(value);
  if (!match) return null;

  const [wholePart, fraction = ""] = value.split(".");
  const paddedFraction = fraction.padEnd(2, "0");
  const amountMinor =
    BigInt(wholePart) * BigInt(100) + BigInt(paddedFraction || "0");

  if (
    amountMinor < BigInt(MOCK_GIVING_LIMITS.minimumAmountMinor) ||
    amountMinor > BigInt(MOCK_GIVING_LIMITS.maximumAmountMinor)
  ) {
    return null;
  }

  return Number(amountMinor);
}

export function parseMockGivingTarget(value: unknown) {
  if (typeof value !== "string") return null;
  const separator = value.indexOf(":");
  if (separator < 0 || value.indexOf(":", separator + 1) >= 0) return null;

  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if ((kind !== "fund" && kind !== "campaign") || !UUID_PATTERN.test(id)) {
    return null;
  }

  return { kind, id } as const;
}

export function validateMockGivingCheckoutRequest(
  value: unknown,
): MockGivingCheckoutValidation {
  if (!isRecord(value)) return { success: false, code: "invalid_request" };
  if (Object.keys(value).some((key) => SENSITIVE_EXTRA_KEYS.has(key))) {
    return { success: false, code: "invalid_request" };
  }
  if (typeof value.requestId !== "string" || !UUID_V4_PATTERN.test(value.requestId)) {
    return { success: false, code: "invalid_request" };
  }

  if (!isChurchSlug(value.churchSlug)) {
    return { success: false, code: "invalid_church" };
  }

  const target = parseMockGivingTarget(value.givingTarget);
  if (!target) return { success: false, code: "invalid_target" };

  const amountMinor = parseGivingAmountToMinor(value.amount);
  if (amountMinor === null) {
    return { success: false, code: "invalid_amount" };
  }

  if (
    typeof value.frequency !== "string" ||
    !MOCK_GIVING_FREQUENCIES.includes(value.frequency as MockGivingFrequency)
  ) {
    return { success: false, code: "invalid_frequency" };
  }

  if (typeof value.fullName !== "string" || typeof value.email !== "string") {
    return { success: false, code: "invalid_donor" };
  }
  const donor = validateGuestIdentityValues({
    fullName: value.fullName,
    email: value.email,
  });
  if (!donor.success) return { success: false, code: "invalid_donor" };

  return {
    success: true,
    data: {
      requestId: value.requestId,
      churchSlug: value.churchSlug,
      targetKind: target.kind,
      targetId: target.id,
      amountMinor,
      frequency: value.frequency as MockGivingFrequency,
      donor: donor.data,
    },
  };
}
