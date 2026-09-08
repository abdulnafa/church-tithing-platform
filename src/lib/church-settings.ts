import type { Database } from "@/lib/supabase/database.types";

export const CHURCH_SETTINGS_LIMITS = {
  displayName: 120,
  legalName: 160,
  email: 254,
  timezone: 64,
  thankYouMessage: 500,
} as const;

export const CHURCH_LOGO_MAX_BYTES = 768_000;
export const CHURCH_LOGO_BUCKET = "church-logos";
export const CHURCH_LOGO_ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ChurchLogoAction = "keep" | "replace" | "remove";
export type ChurchStatus = Database["public"]["Enums"]["church_status"];

export type ChurchSettingsSnapshot = Readonly<{
  churchId: string;
  displayName: string;
  legalName: string;
  slug: string;
  status: ChurchStatus;
  defaultCurrency: string;
  supportEmail: string;
  timezone: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  thankYouMessage: string | null;
  logoStoragePath: string | null;
  settingsRevision: number;
}>;

export type ChurchSettingsValues = Readonly<{
  displayName: string;
  legalName: string;
  supportEmail: string;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
  thankYouMessage: string;
  removeLogo: boolean;
}>;

export type ChurchSettingsInput = Readonly<{
  displayName: string;
  legalName: string;
  supportEmail: string;
  timezone: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  thankYouMessage: string | null;
  logoAction: ChurchLogoAction;
  logoStoragePath: string | null;
}>;

export type ChurchSettingsField = keyof ChurchSettingsValues | "logo";
export type ChurchSettingsFieldErrors = Readonly<
  Partial<Record<ChurchSettingsField, string>>
>;

export type ChurchSettingsActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  settingsRevision: number;
  values: ChurchSettingsValues;
  logoPublicUrl: string | null;
  logoChanged: boolean;
  cleanupPending: boolean;
  retryLogoAction?: ChurchLogoAction;
  fieldErrors?: ChurchSettingsFieldErrors;
}>;

export type ChurchSettingsValidation =
  | Readonly<{
      success: true;
      data: Omit<ChurchSettingsInput, "logoStoragePath">;
      logoFile: File | null;
      values: ChurchSettingsValues;
    }>
  | Readonly<{
      success: false;
      fieldErrors: ChurchSettingsFieldErrors;
      values: ChurchSettingsValues;
    }>;

const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHURCH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function createInitialChurchSettingsState(
  requestId: string,
  snapshot: ChurchSettingsSnapshot,
  logoPublicUrl: string | null,
): ChurchSettingsActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    settingsRevision: snapshot.settingsRevision,
    values: {
      displayName: snapshot.displayName,
      legalName: snapshot.legalName,
      supportEmail: snapshot.supportEmail,
      timezone: snapshot.timezone,
      primaryColor: snapshot.primaryColor ?? "",
      secondaryColor: snapshot.secondaryColor ?? "",
      thankYouMessage: snapshot.thankYouMessage ?? "",
      removeLogo: false,
    },
    logoPublicUrl,
    logoChanged: false,
    cleanupPending: false,
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
  return value.trim();
}

function normalizeTimezone(value: string) {
  const candidate = value.trim();

  if (!candidate || candidate.length > CHURCH_SETTINGS_LIMITS.timezone) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en", { timeZone: candidate }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

function isValidEmail(value: string) {
  const separator = value.indexOf("@");
  const localPart = separator >= 0 ? value.slice(0, separator) : "";

  return (
    value.length >= 3 &&
    value.length <= CHURCH_SETTINGS_LIMITS.email &&
    localPart.length >= 1 &&
    localPart.length <= 64 &&
    EMAIL_PATTERN.test(value) &&
    !value.includes("..") &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !UNSAFE_SINGLE_LINE_PATTERN.test(value)
  );
}

function normalizeOptionalColor(value: string) {
  const candidate = value.trim().toUpperCase();
  return candidate || null;
}

function getLogoFile(value: FormDataEntryValue | null) {
  if (typeof value === "string" || value === null) return null;
  return value.size > 0 ? value : null;
}

export function isChurchSettingsRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isChurchId(value: unknown): value is string {
  return typeof value === "string" && CHURCH_ID_PATTERN.test(value);
}

export function createChurchLogoStoragePath(churchId: string, requestId: string) {
  return isChurchId(churchId) && isChurchSettingsRequestId(requestId)
    ? `${churchId}/${requestId}.webp`
    : null;
}

export function isManagedChurchLogoStoragePath(
  value: unknown,
  churchId: string,
): value is string {
  if (typeof value !== "string" || !isChurchId(churchId)) return false;

  const [pathChurchId, fileName, extra] = value.split("/");
  if (extra !== undefined || pathChurchId !== churchId || !fileName) return false;

  const requestId = fileName.endsWith(".webp")
    ? fileName.slice(0, -".webp".length)
    : "";
  return isChurchSettingsRequestId(requestId);
}

export function parseChurchSettingsRevision(value: unknown) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return null;
  }

  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

export function churchSettingsValuesEqual(
  left: ChurchSettingsValues,
  right: ChurchSettingsValues,
) {
  return (
    left.displayName === right.displayName &&
    left.legalName === right.legalName &&
    left.supportEmail === right.supportEmail &&
    left.timezone === right.timezone &&
    left.primaryColor === right.primaryColor &&
    left.secondaryColor === right.secondaryColor &&
    left.thankYouMessage === right.thankYouMessage &&
    left.removeLogo === right.removeLogo
  );
}

export function validateChurchSettingsForm(
  formData: FormData,
): ChurchSettingsValidation {
  const rawDisplayName = getFormText(formData, "displayName");
  const rawLegalName = getFormText(formData, "legalName");
  const displayName = normalizeSingleLine(rawDisplayName);
  const legalName = normalizeSingleLine(rawLegalName);
  const supportEmail = getFormText(formData, "supportEmail").trim().toLowerCase();
  const timezoneInput = getFormText(formData, "timezone").trim();
  const timezone = normalizeTimezone(timezoneInput);
  const primaryColor = normalizeOptionalColor(
    getFormText(formData, "primaryColor"),
  );
  const secondaryColor = normalizeOptionalColor(
    getFormText(formData, "secondaryColor"),
  );
  const thankYouMessage = normalizeMultiline(
    getFormText(formData, "thankYouMessage"),
  );
  const removeLogo = formData.get("removeLogo") === "on";
  const logoEntry = formData.get("logo");
  const logoFile = getLogoFile(logoEntry);
  const values: ChurchSettingsValues = {
    displayName,
    legalName,
    supportEmail,
    timezone: timezone ?? timezoneInput,
    primaryColor: primaryColor ?? "",
    secondaryColor: secondaryColor ?? "",
    thankYouMessage,
    removeLogo,
  };
  const fieldErrors: Partial<Record<ChurchSettingsField, string>> = {};

  if (
    displayName.length < 2 ||
    displayName.length > CHURCH_SETTINGS_LIMITS.displayName ||
    UNSAFE_SINGLE_LINE_PATTERN.test(rawDisplayName)
  ) {
    fieldErrors.displayName =
      "Enter a church display name from 2 to 120 characters.";
  }

  if (
    legalName.length < 2 ||
    legalName.length > CHURCH_SETTINGS_LIMITS.legalName ||
    UNSAFE_SINGLE_LINE_PATTERN.test(rawLegalName)
  ) {
    fieldErrors.legalName = "Enter a legal name from 2 to 160 characters.";
  }

  if (!isValidEmail(supportEmail)) {
    fieldErrors.supportEmail = "Enter a valid support email address.";
  }

  if (!timezone) {
    fieldErrors.timezone = "Enter a valid IANA timezone.";
  }

  if (primaryColor !== null && !HEX_COLOR_PATTERN.test(primaryColor)) {
    fieldErrors.primaryColor =
      "Enter a six-digit hex colour such as #1F6D60, or leave it blank.";
  }

  if (secondaryColor !== null && !HEX_COLOR_PATTERN.test(secondaryColor)) {
    fieldErrors.secondaryColor =
      "Enter a six-digit hex colour such as #E1B85A, or leave it blank.";
  }

  if (
    thankYouMessage.length > CHURCH_SETTINGS_LIMITS.thankYouMessage ||
    UNSAFE_MULTILINE_PATTERN.test(thankYouMessage)
  ) {
    fieldErrors.thankYouMessage =
      "Keep the thank-you message at 500 characters or fewer.";
  }

  if (typeof logoEntry === "string" && logoEntry.length > 0) {
    fieldErrors.logo = "Choose a PNG, JPEG, or WebP logo file.";
  } else if (logoFile && removeLogo) {
    fieldErrors.logo = "Choose either a replacement logo or remove the current logo.";
  } else if (logoFile && logoFile.size > CHURCH_LOGO_MAX_BYTES) {
    fieldErrors.logo = "Choose a logo smaller than 750 KB.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors, values };
  }

  return {
    success: true,
    data: {
      displayName,
      legalName,
      supportEmail,
      timezone: timezone as string,
      primaryColor,
      secondaryColor,
      thankYouMessage: thankYouMessage || null,
      logoAction: removeLogo ? "remove" : logoFile ? "replace" : "keep",
    },
    logoFile,
    values: {
      ...values,
      timezone: timezone as string,
    },
  };
}
