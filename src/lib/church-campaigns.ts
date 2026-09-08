export const CHURCH_CAMPAIGN_LIMITS = {
  name: 120,
  slug: 80,
  description: 1_000,
  goalAmountMinorText: "9007199254740991",
} as const;

export const CHURCH_CAMPAIGN_ACTIONS = [
  "create",
  "update",
  "activate",
  "close",
  "archive",
  "restore",
] as const;

export type ChurchCampaignAction =
  (typeof CHURCH_CAMPAIGN_ACTIONS)[number];
export type ChurchCampaignStatus =
  | "draft"
  | "active"
  | "closed"
  | "archived";

export type ChurchCampaign = Readonly<{
  id: string;
  fundId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ChurchCampaignStatus;
  goalAmountMinorText: string | null;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type ChurchCampaignsSnapshot = Readonly<{
  churchId: string;
  campaignsRevision: number;
  campaigns: readonly ChurchCampaign[];
}>;

export type ChurchCampaignProgress = Readonly<{
  campaignId: string;
  currency: string;
  raisedAmountMinorText: string;
  eligibleDonationCountText: string;
}>;

export type ChurchCampaignValues = Readonly<{
  name: string;
  description: string;
  fundId: string;
  goalAmount: string;
}>;

export type ChurchCampaignFieldErrors = Readonly<
  Partial<Record<"name" | "description" | "fundId" | "goalAmount", string>>
>;

export type ChurchCampaignActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  responseEpoch: number;
  requestId: string;
  campaignsRevision: number;
  operation: ChurchCampaignAction;
  campaignId: string | null;
  values: ChurchCampaignValues;
  retryRequired: boolean;
  fieldErrors?: ChurchCampaignFieldErrors;
}>;

export type ChurchCampaignMutationInput = Readonly<{
  operation: ChurchCampaignAction;
  campaignId: string | null;
  name: string | null;
  slug: string | null;
  description: string | null;
  fundId: string | null;
  goalAmountMinorText: string | null;
}>;

export type ChurchCampaignFormValidation =
  | Readonly<{
      success: true;
      input: ChurchCampaignMutationInput;
      values: ChurchCampaignValues;
    }>
  | Readonly<{
      success: false;
      values: ChurchCampaignValues;
      fieldErrors: ChurchCampaignFieldErrors;
    }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^(?:BBD|CAD|USD|XCD)$/;
const UNSAFE_SINGLE_LINE_PATTERN = /[\u0000-\u001f\u007f]/;
const UNSAFE_MULTILINE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAJOR_AMOUNT_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;
const POSITIVE_MINOR_PATTERN = /^[1-9][0-9]*$/;
const NONNEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const MAX_PROGRESS_DIGITS = 100;

export function isChurchCampaignId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isChurchCampaignRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isChurchCampaignSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).length >= 1 &&
    Array.from(value).length <= CHURCH_CAMPAIGN_LIMITS.slug &&
    SLUG_PATTERN.test(value)
  );
}

export function isChurchCampaignCurrency(value: unknown): value is string {
  return typeof value === "string" && CURRENCY_PATTERN.test(value);
}

export function isChurchCampaignAction(
  value: unknown,
): value is ChurchCampaignAction {
  return (
    typeof value === "string" &&
    (CHURCH_CAMPAIGN_ACTIONS as readonly string[]).includes(value)
  );
}

export function isCanonicalPositiveCampaignMinorText(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    POSITIVE_MINOR_PATTERN.test(value) &&
    compareUnsignedDecimalText(
      value,
      CHURCH_CAMPAIGN_LIMITS.goalAmountMinorText,
    ) <= 0
  );
}

export function isCanonicalNonnegativeDecimalText(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_PROGRESS_DIGITS &&
    NONNEGATIVE_DECIMAL_PATTERN.test(value)
  );
}

export function deriveChurchCampaignSlug(name: string) {
  const slug = normalizeName(name)
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CHURCH_CAMPAIGN_LIMITS.slug)
    .replace(/-+$/g, "");

  return isChurchCampaignSlug(slug) ? slug : null;
}

export function parseCampaignsRevision(value: unknown) {
  if (typeof value !== "string" || !NONNEGATIVE_DECIMAL_PATTERN.test(value)) {
    return null;
  }

  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

export function parseCampaignGoalAmount(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return { success: true, goalAmount: "", minorText: null } as const;
  }

  const match = MAJOR_AMOUNT_PATTERN.exec(normalized);
  if (!match) return { success: false, goalAmount: normalized } as const;

  const [whole = "", fraction = ""] = normalized.split(".");
  const minorWithZeros = `${whole}${fraction.padEnd(2, "0")}`;
  const minorText = minorWithZeros.replace(/^0+(?=\d)/, "");
  if (!isCanonicalPositiveCampaignMinorText(minorText)) {
    return { success: false, goalAmount: normalized } as const;
  }

  return {
    success: true,
    goalAmount: `${whole}.${fraction.padEnd(2, "0")}`,
    minorText,
  } as const;
}

export function campaignMinorTextToGoalInput(value: string | null) {
  if (value === null) return "";
  if (!isCanonicalPositiveCampaignMinorText(value)) return null;

  const padded = value.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

export function formatCampaignMinorAmount(
  minorText: string,
  currency: string,
) {
  if (
    !isCanonicalNonnegativeDecimalText(minorText) ||
    !isChurchCampaignCurrency(currency)
  ) {
    return null;
  }

  const padded = minorText.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} $${whole}.${padded.slice(-2)}`;
}

export function calculateCampaignProgress(
  raisedAmountMinorText: string,
  goalAmountMinorText: string,
) {
  if (
    !isCanonicalNonnegativeDecimalText(raisedAmountMinorText) ||
    !isCanonicalPositiveCampaignMinorText(goalAmountMinorText)
  ) {
    return null;
  }

  const raised = BigInt(raisedAmountMinorText);
  const goal = BigInt(goalAmountMinorText);
  const ten = BigInt(10);
  const roundedTenths =
    (raised * BigInt(1_000) + goal / BigInt(2)) / goal;
  const percentageText = `${roundedTenths / ten}.${roundedTenths % ten}%`;
  const basisPoints =
    raised >= goal
      ? BigInt(10_000)
      : (raised * BigInt(10_000)) / goal;

  return {
    percentageText,
    cappedPercentage: Number(basisPoints) / 100,
  } as const;
}

export function createInitialChurchCampaignActionState(
  requestId: string,
  campaignsRevision: number,
  operation: ChurchCampaignAction,
  campaign: Pick<
    ChurchCampaign,
    "id" | "fundId" | "name" | "description" | "goalAmountMinorText"
  > | null = null,
): ChurchCampaignActionState {
  return {
    status: "idle",
    message: "",
    responseEpoch: 0,
    requestId,
    campaignsRevision,
    operation,
    campaignId: campaign?.id ?? null,
    values:
      operation === "create" || operation === "update"
        ? {
            name: campaign?.name ?? "",
            description: campaign?.description ?? "",
            fundId: campaign?.fundId ?? "",
            goalAmount:
              campaignMinorTextToGoalInput(
                campaign?.goalAmountMinorText ?? null,
              ) ?? "",
          }
        : emptyCampaignValues(),
    retryRequired: false,
  };
}

export function churchCampaignValuesEqual(
  left: ChurchCampaignValues,
  right: ChurchCampaignValues,
) {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.fundId === right.fundId &&
    left.goalAmount === right.goalAmount
  );
}

export function validateChurchCampaignForm(
  formData: FormData,
  operation: ChurchCampaignAction,
  campaignId: string | null,
): ChurchCampaignFormValidation {
  if (operation !== "create" && !isChurchCampaignId(campaignId)) {
    return {
      success: false,
      values: emptyCampaignValues(),
      fieldErrors: {},
    };
  }

  if (operation !== "create" && operation !== "update") {
    return {
      success: true,
      input: {
        operation,
        campaignId,
        name: null,
        slug: null,
        description: null,
        fundId: null,
        goalAmountMinorText: null,
      },
      values: emptyCampaignValues(),
    };
  }

  const rawName = getText(formData, "name");
  const rawDescription = getText(formData, "description");
  const name = normalizeName(rawName);
  const description = normalizeDescription(rawDescription);
  const fundId = getText(formData, "fundId");
  const goal = parseCampaignGoalAmount(getText(formData, "goalAmount"));
  const derivedSlug =
    operation === "create" ? deriveChurchCampaignSlug(name) : null;
  const values: ChurchCampaignValues = {
    name,
    description,
    fundId,
    goalAmount: goal.goalAmount,
  };
  const fieldErrors: Partial<
    Record<"name" | "description" | "fundId" | "goalAmount", string>
  > = {};

  if (
    codePointLength(name) < 2 ||
    codePointLength(name) > CHURCH_CAMPAIGN_LIMITS.name ||
    UNSAFE_SINGLE_LINE_PATTERN.test(rawName)
  ) {
    fieldErrors.name = "Enter a campaign name from 2 to 120 characters.";
  } else if (operation === "create" && !derivedSlug) {
    fieldErrors.name =
      "Use a campaign name containing at least one Latin letter or number.";
  }

  if (
    codePointLength(description) > CHURCH_CAMPAIGN_LIMITS.description ||
    UNSAFE_MULTILINE_PATTERN.test(description)
  ) {
    fieldErrors.description =
      "Keep the description at 1,000 characters or fewer.";
  }

  if (!isChurchCampaignId(fundId)) {
    fieldErrors.fundId = "Choose an active fund for this campaign.";
  }

  if (!goal.success) {
    fieldErrors.goalAmount =
      "Enter a positive goal with no more than 2 decimal places.";
  }

  if (Object.keys(fieldErrors).length > 0 || !goal.success) {
    return { success: false, values, fieldErrors };
  }

  return {
    success: true,
    input: {
      operation,
      campaignId,
      name,
      slug: derivedSlug,
      description: description || null,
      fundId,
      goalAmountMinorText: goal.minorText,
    },
    values,
  };
}

function codePointLength(value: string) {
  return Array.from(value).length;
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

function emptyCampaignValues(): ChurchCampaignValues {
  return { name: "", description: "", fundId: "", goalAmount: "" };
}

function compareUnsignedDecimalText(left: string, right: string) {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
