import type { CurrencyCode, GivingFrequency, Money } from "./types";

const DEFAULT_LOCALE = "en-BB";
const DEFAULT_TIME_ZONE = "America/Barbados";

const currencyFractionDigits: Readonly<Record<CurrencyCode, number>> = {
  USD: 2,
  CAD: 2,
  BBD: 2,
  XCD: 2,
};

export function cn(
  ...values: ReadonlyArray<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export function minorToMajor(money: Money): number {
  return money.amountMinor / 10 ** currencyFractionDigits[money.currency];
}

export function majorToMinor(
  amount: number,
  currency: CurrencyCode,
): number {
  if (!Number.isFinite(amount)) {
    throw new TypeError("Amount must be a finite number.");
  }

  return Math.round(amount * 10 ** currencyFractionDigits[currency]);
}

export function formatMoney(
  money: Money,
  locale: string = DEFAULT_LOCALE,
): string {
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: currencyFractionDigits[money.currency],
    maximumFractionDigits: currencyFractionDigits[money.currency],
  }).format(minorToMajor(money));

  return `${money.currency} ${formatted}`;
}

export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
  locale: string = DEFAULT_LOCALE,
): string {
  const date = toValidDate(value);
  return new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatDateTime(
  value: string | Date,
  timeZone = DEFAULT_TIME_ZONE,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = toValidDate(value);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatGivingFrequency(frequency: GivingFrequency): string {
  const labels: Readonly<Record<GivingFrequency, string>> = {
    one_time: "One-time",
    weekly: "Weekly",
    monthly: "Monthly",
  };

  return labels[frequency];
}

export function formatPercentage(value: number): string {
  const normalized = clamp(value, 0, 100);
  return `${Math.round(normalized)}%`;
}

export function calculateProgress(current: Money, goal: Money): number {
  if (current.currency !== goal.currency) {
    throw new Error("Progress amounts must use the same currency.");
  }

  if (goal.amountMinor <= 0) {
    return 0;
  }

  return clamp((current.amountMinor / goal.amountMinor) * 100, 0, 100);
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }

  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(2, localPart.length - visible.length))}@${domain}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function toValidDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid date: ${String(value)}`);
  }

  return date;
}
