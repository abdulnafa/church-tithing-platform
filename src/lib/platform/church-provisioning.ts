export const CHURCH_CURRENCIES = ["BBD", "USD", "CAD", "XCD"] as const;

export type ChurchCurrency = (typeof CHURCH_CURRENCIES)[number];

export const CHURCH_PROVISIONING_LIMITS = {
  displayName: 120,
  legalName: 160,
  email: 254,
  timezone: 64,
  thankYouMessage: 500,
} as const;

export type ChurchProvisioningValues = Readonly<{
  displayName: string;
  legalName: string;
  ownerEmail: string;
  supportEmail: string;
  slug: string;
  currency: string;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
  thankYouMessage: string;
  acknowledgement: boolean;
}>;

export type ChurchProvisioningInput = Readonly<{
  displayName: string;
  legalName: string;
  ownerEmail: string;
  supportEmail: string;
  slug: string;
  currency: ChurchCurrency;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
  thankYouMessage: string | null;
}>;

export type ChurchProvisioningDefaults = Readonly<{
  currency: ChurchCurrency;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
}>;

export type ChurchProvisioningField = keyof ChurchProvisioningValues;

export type ChurchProvisioningFieldErrors = Readonly<
  Partial<Record<ChurchProvisioningField, string>>
>;

export type ProvisionedChurchSummary = Readonly<{
  churchId: string;
  displayName: string;
  slug: string;
  status: "onboarding";
  ownerMembershipStatus: "active" | "invited";
  qrShortCode: string;
  replayed: boolean;
}>;

export type ChurchProvisioningActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  requestId: string;
  values: ChurchProvisioningValues;
  fieldErrors?: ChurchProvisioningFieldErrors;
  result?: ProvisionedChurchSummary;
}>;

export type ChurchProvisioningValidation =
  | Readonly<{
      success: true;
      data: ChurchProvisioningInput;
      values: ChurchProvisioningValues;
    }>
  | Readonly<{
      success: false;
      fieldErrors: ChurchProvisioningFieldErrors;
      values: ChurchProvisioningValues;
    }>;

const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function createInitialChurchProvisioningState(
  requestId: string,
  defaults: ChurchProvisioningDefaults,
): ChurchProvisioningActionState {
  return {
    status: "idle",
    message: "",
    requestId,
    values: {
      displayName: "",
      legalName: "",
      ownerEmail: "",
      supportEmail: "",
      slug: "",
      currency: defaults.currency,
      timezone: defaults.timezone,
      primaryColor: defaults.primaryColor,
      secondaryColor: defaults.secondaryColor,
      thankYouMessage: "",
      acknowledgement: false,
    },
  };
}

function getFormText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalizeSingleLine(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeMultiline(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizeTimezone(value: string) {
  const candidate = value.trim();

  if (!candidate || candidate.length > CHURCH_PROVISIONING_LIMITS.timezone) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en", { timeZone: candidate }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

function hasSafeSingleLine(value: string) {
  return !UNSAFE_SINGLE_LINE_PATTERN.test(value);
}

function isValidEmail(value: string) {
  const localPart = value.slice(0, value.indexOf("@"));

  return (
    value.length >= 3 &&
    value.length <= CHURCH_PROVISIONING_LIMITS.email &&
    localPart.length >= 1 &&
    localPart.length <= 64 &&
    EMAIL_PATTERN.test(value) &&
    !value.includes("..") &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    hasSafeSingleLine(value)
  );
}

export function isChurchProvisioningRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function validateChurchProvisioningForm(
  formData: FormData,
): ChurchProvisioningValidation {
  const rawDisplayName = getFormText(formData, "displayName");
  const rawLegalName = getFormText(formData, "legalName");
  const displayName = normalizeSingleLine(rawDisplayName);
  const legalName = normalizeSingleLine(rawLegalName);
  const ownerEmail = getFormText(formData, "ownerEmail").trim().toLowerCase();
  const supportEmail = getFormText(formData, "supportEmail").trim().toLowerCase();
  const slug = getFormText(formData, "slug");
  const currency = getFormText(formData, "currency").trim().toUpperCase();
  const timezoneInput = getFormText(formData, "timezone").trim();
  const timezone = normalizeTimezone(timezoneInput);
  const primaryColor = getFormText(formData, "primaryColor").trim().toUpperCase();
  const secondaryColor = getFormText(formData, "secondaryColor").trim().toUpperCase();
  const thankYouMessage = normalizeMultiline(
    getFormText(formData, "thankYouMessage"),
  );
  const acknowledgement = formData.get("acknowledgement") === "on";
  const values: ChurchProvisioningValues = {
    displayName,
    legalName,
    ownerEmail,
    supportEmail,
    slug,
    currency,
    timezone: timezone ?? timezoneInput,
    primaryColor,
    secondaryColor,
    thankYouMessage,
    acknowledgement,
  };
  const fieldErrors: Partial<Record<ChurchProvisioningField, string>> = {};

  if (
    displayName.length < 2 ||
    displayName.length > CHURCH_PROVISIONING_LIMITS.displayName ||
    !hasSafeSingleLine(rawDisplayName)
  ) {
    fieldErrors.displayName = "Enter a church display name from 2 to 120 characters.";
  }

  if (
    legalName.length < 2 ||
    legalName.length > CHURCH_PROVISIONING_LIMITS.legalName ||
    !hasSafeSingleLine(rawLegalName)
  ) {
    fieldErrors.legalName = "Enter a legal name from 2 to 160 characters.";
  }

  if (!isValidEmail(ownerEmail)) {
    fieldErrors.ownerEmail = "Enter a valid owner email address.";
  }

  if (!isValidEmail(supportEmail)) {
    fieldErrors.supportEmail = "Enter a valid support email address.";
  }

  if (slug.length < 2 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    fieldErrors.slug =
      "Use 2 to 63 lowercase letters, numbers, or single hyphens.";
  }

  if (!CHURCH_CURRENCIES.includes(currency as ChurchCurrency)) {
    fieldErrors.currency = "Choose BBD, USD, CAD, or XCD.";
  }

  if (!timezone) {
    fieldErrors.timezone = "Enter a valid IANA timezone.";
  }

  if (!HEX_COLOR_PATTERN.test(primaryColor)) {
    fieldErrors.primaryColor = "Enter a six-digit hex colour such as #1F6D60.";
  }

  if (!HEX_COLOR_PATTERN.test(secondaryColor)) {
    fieldErrors.secondaryColor = "Enter a six-digit hex colour such as #E1B85A.";
  }

  if (
    thankYouMessage.length > CHURCH_PROVISIONING_LIMITS.thankYouMessage ||
    UNSAFE_MULTILINE_PATTERN.test(thankYouMessage)
  ) {
    fieldErrors.thankYouMessage =
      "Keep the thank-you message at 500 characters or fewer.";
  }

  if (!acknowledgement) {
    fieldErrors.acknowledgement =
      "Confirm that live giving will remain disabled during onboarding.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors, values };
  }

  return {
    success: true,
    data: {
      displayName,
      legalName,
      ownerEmail,
      supportEmail,
      slug,
      currency: currency as ChurchCurrency,
      timezone: timezone as string,
      primaryColor,
      secondaryColor,
      thankYouMessage: thankYouMessage || null,
    },
    values: {
      ...values,
      timezone: timezone as string,
    },
  };
}
