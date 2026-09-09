export const DONOR_IDENTITY_LIMITS = {
  displayName: 120,
  email: 254,
} as const;

export type GuestIdentityValues = Readonly<{
  fullName: string;
  email: string;
}>;

export type GuestIdentityFieldErrors = Readonly<
  Partial<Record<keyof GuestIdentityValues, string>>
>;

export type GuestIdentityValidation =
  | Readonly<{
      success: true;
      data: GuestIdentityValues;
      values: GuestIdentityValues;
    }>
  | Readonly<{
      success: false;
      fieldErrors: GuestIdentityFieldErrors;
      values: GuestIdentityValues;
    }>;

const SINGLE_LINE_CONTROL_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function codePointLength(value: string) {
  return Array.from(value).length;
}

export function normalizeDonorDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function getDonorDisplayNameError(value: string) {
  const normalized = normalizeDonorDisplayName(value);
  const length = codePointLength(normalized);

  if (length < 2) return "Enter your full name.";
  if (length > DONOR_IDENTITY_LIMITS.displayName) {
    return `Use ${DONOR_IDENTITY_LIMITS.displayName} characters or fewer.`;
  }
  if (SINGLE_LINE_CONTROL_PATTERN.test(value)) {
    return "Use a single-line name without control characters.";
  }
  return undefined;
}

export function normalizeDonorEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getDonorEmailError(value: string) {
  const normalized = normalizeDonorEmail(value);
  const separator = normalized.indexOf("@");
  const localPart = separator >= 0 ? normalized.slice(0, separator) : "";

  if (
    normalized.length < 3 ||
    normalized.length > DONOR_IDENTITY_LIMITS.email ||
    localPart.length < 1 ||
    localPart.length > 64 ||
    normalized.includes("..") ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    SINGLE_LINE_CONTROL_PATTERN.test(normalized) ||
    !EMAIL_PATTERN.test(normalized)
  ) {
    return "Enter a valid email address.";
  }
  return undefined;
}

export function validateGuestIdentityValues(
  input: GuestIdentityValues,
): GuestIdentityValidation {
  const values = {
    fullName: normalizeDonorDisplayName(input.fullName),
    email: normalizeDonorEmail(input.email),
  };
  const fieldErrors: Partial<Record<keyof GuestIdentityValues, string>> = {};
  const fullNameError = getDonorDisplayNameError(input.fullName);
  const emailError = getDonorEmailError(input.email);

  if (fullNameError) fieldErrors.fullName = fullNameError;
  if (emailError) fieldErrors.email = emailError;

  return Object.keys(fieldErrors).length > 0
    ? { success: false, fieldErrors, values }
    : { success: true, data: values, values };
}
