import "server-only";

import { parsePublicAppOrigin } from "@/lib/public-app-url";

const CHURCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QR_SHORT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/;

export function isPublicChurchSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 63 &&
    CHURCH_SLUG_PATTERN.test(value)
  );
}

export function isPublicQrShortCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 64 &&
    QR_SHORT_CODE_PATTERN.test(value)
  );
}

/**
 * P17 keeps the public giving page on a same-origin path. Host/subdomain
 * routing remains disabled until the client supplies and approves the final
 * platform domain and its DNS configuration.
 */
export function createPublicGivingPath(slug: unknown) {
  return isPublicChurchSlug(slug)
    ? (`/give/${encodeURIComponent(slug)}` as const)
    : null;
}

export function createPublicQrPath(shortCode: unknown) {
  return isPublicQrShortCode(shortCode)
    ? (`/q/${encodeURIComponent(shortCode)}` as const)
    : null;
}

export function createPublicQrUrl(appOrigin: string, shortCode: unknown) {
  const origin = parsePublicAppOrigin(appOrigin);
  const path = createPublicQrPath(shortCode);
  if (!origin || !path) return null;

  return new URL(path, `${origin}/`).toString();
}
