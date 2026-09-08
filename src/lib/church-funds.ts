export const CHURCH_FUND_LIMITS = {
  name: 120,
  slug: 80,
  description: 500,
} as const;

export const CHURCH_FUND_ACTIONS = [
  "create",
  "update",
  "set_default",
  "move_up",
  "move_down",
  "archive",
  "restore",
] as const;

export type ChurchFundAction = (typeof CHURCH_FUND_ACTIONS)[number];
export type ChurchFundStatus = "active" | "archived";

export type ChurchFund = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ChurchFundStatus;
  isDefault: boolean;
  sortOrder: number;
}>;

export type ChurchFundsSnapshot = Readonly<{
  churchId: string;
  fundsRevision: number;
  funds: readonly ChurchFund[];
}>;

export type ChurchFundValues = Readonly<{
  name: string;
  slug: string;
  description: string;
}>;

export type ChurchFundFieldErrors = Readonly<
  Partial<Record<"name" | "description", string>>
>;

export type ChurchFundActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  fundsRevision: number;
  operation: ChurchFundAction;
  fundId: string | null;
  values: ChurchFundValues;
  retryRequired: boolean;
  fieldErrors?: ChurchFundFieldErrors;
}>;

export type ChurchFundMutationInput = Readonly<{
  operation: ChurchFundAction;
  fundId: string | null;
  name: string | null;
  slug: string | null;
  description: string | null;
}>;

export type ChurchFundFormValidation =
  | Readonly<{
      success: true;
      input: ChurchFundMutationInput;
      values: ChurchFundValues;
    }>
  | Readonly<{
      success: false;
      values: ChurchFundValues;
      fieldErrors: ChurchFundFieldErrors;
    }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function isChurchFundId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isChurchFundRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isChurchFundSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 80 &&
    SLUG_PATTERN.test(value)
  );
}

export function isChurchFundAction(value: unknown): value is ChurchFundAction {
  return (
    typeof value === "string" &&
    (CHURCH_FUND_ACTIONS as readonly string[]).includes(value)
  );
}

export function deriveChurchFundSlug(name: string) {
  const slug = normalizeName(name)
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CHURCH_FUND_LIMITS.slug)
    .replace(/-+$/g, "");

  return isChurchFundSlug(slug) ? slug : null;
}

export function parseFundsRevision(value: unknown) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return null;
  }

  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

export function createInitialChurchFundActionState(
  requestId: string,
  fundsRevision: number,
  operation: ChurchFundAction,
  fund: Pick<ChurchFund, "id" | "name" | "description"> | null = null,
): ChurchFundActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    fundsRevision,
    operation,
    fundId: fund?.id ?? null,
    values: {
      name: fund?.name ?? "",
      slug: "",
      description: fund?.description ?? "",
    },
    retryRequired: false,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDescription(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function getText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function churchFundValuesEqual(
  left: ChurchFundValues,
  right: ChurchFundValues,
) {
  return (
    left.name === right.name &&
    left.slug === right.slug &&
    left.description === right.description
  );
}

export function validateChurchFundForm(
  formData: FormData,
  operation: ChurchFundAction,
  fundId: string | null,
): ChurchFundFormValidation {
  const rawName = getText(formData, "name");
  const rawDescription = getText(formData, "description");
  const name = normalizeName(rawName);
  const derivedSlug = operation === "create" ? deriveChurchFundSlug(name) : null;
  const description = normalizeDescription(rawDescription);
  const submittedValues = { name, slug: derivedSlug ?? "", description };

  if (operation !== "create" && !isChurchFundId(fundId)) {
    return {
      success: false,
      values: { name: "", slug: "", description: "" },
      fieldErrors: {},
    };
  }

  if (operation !== "create" && operation !== "update") {
    return {
      success: true,
      input: {
        operation,
        fundId,
        name: null,
        slug: null,
        description: null,
      },
      values: { name: "", slug: "", description: "" },
    };
  }

  const fieldErrors: Partial<Record<"name" | "description", string>> = {};

  if (
    name.length < 2 ||
    name.length > CHURCH_FUND_LIMITS.name ||
    UNSAFE_SINGLE_LINE_PATTERN.test(rawName)
  ) {
    fieldErrors.name = "Enter a fund name from 2 to 120 characters.";
  }

  if (operation === "create" && !derivedSlug && !fieldErrors.name) {
    fieldErrors.name =
      "Use a fund name containing at least one Latin letter or number.";
  }

  if (
    description.length > CHURCH_FUND_LIMITS.description ||
    UNSAFE_MULTILINE_PATTERN.test(description)
  ) {
    fieldErrors.description =
      "Keep the description at 500 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      values:
        operation === "create"
          ? submittedValues
          : { ...submittedValues, slug: "" },
      fieldErrors,
    };
  }

  return {
    success: true,
    input: {
      operation,
      fundId,
      name,
      slug: derivedSlug,
      description: description || null,
    },
    values:
      operation === "create"
        ? submittedValues
        : { ...submittedValues, slug: "" },
  };
}
