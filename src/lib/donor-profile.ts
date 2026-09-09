import {
  getDonorDisplayNameError,
  normalizeDonorDisplayName,
} from "./donor-identity";

export type DonorProfileSnapshot = Readonly<{
  displayName: string;
  email: string;
  profileRevision: number;
}>;

export type DonorProfileValues = Readonly<{
  displayName: string;
}>;

export type DonorProfileField = keyof DonorProfileValues;
export type DonorProfileFieldErrors = Readonly<
  Partial<Record<DonorProfileField, string>>
>;

export type DonorProfileValidation =
  | Readonly<{
      success: true;
      data: Readonly<{ displayName: string }>;
      values: DonorProfileValues;
    }>
  | Readonly<{
      success: false;
      fieldErrors: DonorProfileFieldErrors;
      values: DonorProfileValues;
    }>;

export type DonorProfileActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  expectedRevision: number;
  values: DonorProfileValues;
  retryRequired: boolean;
  fieldErrors?: DonorProfileFieldErrors;
  replayed?: boolean;
}>;

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function getFormText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function isDonorProfileRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isDonorProfileRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function createInitialDonorProfileActionState(
  requestId: string,
  snapshot: DonorProfileSnapshot,
): DonorProfileActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    expectedRevision: snapshot.profileRevision,
    values: {
      displayName: snapshot.displayName,
    },
    retryRequired: false,
  };
}

export function donorProfileValuesEqual(
  left: DonorProfileValues,
  right: DonorProfileValues,
) {
  return left.displayName === right.displayName;
}

export function validateDonorProfileForm(
  formData: FormData,
): DonorProfileValidation {
  const rawDisplayName = getFormText(formData, "displayName");
  const displayName = normalizeDonorDisplayName(rawDisplayName);
  const values = { displayName };
  const fieldErrors: Partial<Record<DonorProfileField, string>> = {};
  const displayNameError = getDonorDisplayNameError(rawDisplayName);

  if (displayNameError) fieldErrors.displayName = displayNameError;

  return Object.keys(fieldErrors).length > 0
    ? { success: false, fieldErrors, values }
    : {
        success: true,
        data: { displayName },
        values,
      };
}
