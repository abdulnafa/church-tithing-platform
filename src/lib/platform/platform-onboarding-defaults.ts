import type { ChurchCurrency } from "./church-provisioning";
import { CHURCH_CURRENCIES, CHURCH_PROVISIONING_LIMITS } from "./church-provisioning";

export type PlatformOnboardingDefaults = Readonly<{
  defaultCurrency: ChurchCurrency;
  defaultTimezone: string;
  defaultPrimaryColor: string;
  defaultSecondaryColor: string;
}>;

export type PlatformOnboardingDefaultsSnapshot = PlatformOnboardingDefaults &
  Readonly<{
    settingsRevision: number;
    updatedAt: string;
  }>;

export type PlatformOnboardingDefaultsValues = Readonly<{
  defaultCurrency: string;
  defaultTimezone: string;
  defaultPrimaryColor: string;
  defaultSecondaryColor: string;
}>;

export type PlatformOnboardingDefaultsField =
  keyof PlatformOnboardingDefaultsValues;

export type PlatformOnboardingDefaultsFieldErrors = Readonly<
  Partial<Record<PlatformOnboardingDefaultsField, string>>
>;

export type PlatformOnboardingDefaultsValidation =
  | Readonly<{
      success: true;
      data: PlatformOnboardingDefaults;
      values: PlatformOnboardingDefaultsValues;
    }>
  | Readonly<{
      success: false;
      fieldErrors: PlatformOnboardingDefaultsFieldErrors;
      values: PlatformOnboardingDefaultsValues;
    }>;

export type PlatformOnboardingDefaultsActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  expectedRevision: number;
  values: PlatformOnboardingDefaultsValues;
  retryRequired: boolean;
  fieldErrors?: PlatformOnboardingDefaultsFieldErrors;
  replayed?: boolean;
}>;

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;

function getFormText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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

export function createInitialPlatformOnboardingDefaultsState(
  requestId: string,
  snapshot: PlatformOnboardingDefaultsSnapshot,
): PlatformOnboardingDefaultsActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    expectedRevision: snapshot.settingsRevision,
    values: {
      defaultCurrency: snapshot.defaultCurrency,
      defaultTimezone: snapshot.defaultTimezone,
      defaultPrimaryColor: snapshot.defaultPrimaryColor,
      defaultSecondaryColor: snapshot.defaultSecondaryColor,
    },
    retryRequired: false,
  };
}

export function platformOnboardingDefaultsValuesEqual(
  left: PlatformOnboardingDefaultsValues,
  right: PlatformOnboardingDefaultsValues,
) {
  return (
    left.defaultCurrency === right.defaultCurrency &&
    left.defaultTimezone === right.defaultTimezone &&
    left.defaultPrimaryColor === right.defaultPrimaryColor &&
    left.defaultSecondaryColor === right.defaultSecondaryColor
  );
}

export function validatePlatformOnboardingDefaultsForm(
  formData: FormData,
): PlatformOnboardingDefaultsValidation {
  const defaultCurrency = getFormText(formData, "defaultCurrency")
    .trim()
    .toUpperCase();
  const timezoneInput = getFormText(formData, "defaultTimezone").trim();
  const defaultTimezone = normalizeTimezone(timezoneInput);
  const defaultPrimaryColor = getFormText(formData, "defaultPrimaryColor")
    .trim()
    .toUpperCase();
  const defaultSecondaryColor = getFormText(formData, "defaultSecondaryColor")
    .trim()
    .toUpperCase();
  const values: PlatformOnboardingDefaultsValues = {
    defaultCurrency,
    defaultTimezone: defaultTimezone ?? timezoneInput,
    defaultPrimaryColor,
    defaultSecondaryColor,
  };
  const fieldErrors: Partial<
    Record<PlatformOnboardingDefaultsField, string>
  > = {};

  if (!CHURCH_CURRENCIES.includes(defaultCurrency as ChurchCurrency)) {
    fieldErrors.defaultCurrency = "Choose BBD, USD, CAD, or XCD.";
  }
  if (
    !defaultTimezone ||
    UNSAFE_SINGLE_LINE_PATTERN.test(timezoneInput)
  ) {
    fieldErrors.defaultTimezone = "Enter a valid IANA timezone.";
  }
  if (!HEX_COLOR_PATTERN.test(defaultPrimaryColor)) {
    fieldErrors.defaultPrimaryColor =
      "Enter a six-digit hex colour such as #1F6D60.";
  }
  if (!HEX_COLOR_PATTERN.test(defaultSecondaryColor)) {
    fieldErrors.defaultSecondaryColor =
      "Enter a six-digit hex colour such as #E1B85A.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors, values };
  }

  return {
    success: true,
    data: {
      defaultCurrency: defaultCurrency as ChurchCurrency,
      defaultTimezone: defaultTimezone as string,
      defaultPrimaryColor,
      defaultSecondaryColor,
    },
    values: {
      ...values,
      defaultTimezone: defaultTimezone as string,
    },
  };
}
