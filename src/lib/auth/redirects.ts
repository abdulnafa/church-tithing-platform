import {
  createSafeRequestDestination,
  MAX_REQUEST_DESTINATION_LENGTH,
} from "./request-path";

const POST_AUTH_ROOTS = ["/dashboard", "/church", "/platform"] as const;
const CALLBACK_ONLY_DESTINATIONS = new Set(["/reset-password"]);
const APP_FALLBACK_ORIGIN = "http://localhost:3000";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const ENCODED_CONTROL_CHARACTER_PATTERN = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

function isAllowedRoot(pathname: string) {
  return POST_AUTH_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

function parseInternalDestination(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    return null;
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(value) ||
    ENCODED_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(value);

    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      CONTROL_CHARACTER_PATTERN.test(decoded)
    ) {
      return null;
    }

    const parsed = new URL(value, APP_FALLBACK_ORIGIN);
    return parsed.origin === APP_FALLBACK_ORIGIN ? parsed : null;
  } catch {
    return null;
  }
}

export function getSafePostAuthDestination(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > MAX_REQUEST_DESTINATION_LENGTH
  ) {
    return null;
  }

  const parsed = parseInternalDestination(value);
  const root = parsed
    ? POST_AUTH_ROOTS.find(
        (candidate) =>
          parsed.pathname === candidate ||
          parsed.pathname.startsWith(`${candidate}/`),
      )
    : null;

  return parsed && root
    ? `${createSafeRequestDestination(parsed.pathname, parsed.search, root)}${parsed.hash}`
    : null;
}

export function getSafePostAuthRedirect(
  value: unknown,
  fallback = "/dashboard",
) {
  return getSafePostAuthDestination(value) ?? fallback;
}

export function getSafeAuthCallbackRedirect(
  value: unknown,
  fallback = "/dashboard",
) {
  const parsed = parseInternalDestination(value);

  if (
    parsed &&
    (isAllowedRoot(parsed.pathname) ||
      CALLBACK_ONLY_DESTINATIONS.has(parsed.pathname))
  ) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  return fallback;
}

export function createTrustedAppRedirect(appUrl: string, destination: string) {
  const appOrigin = new URL(appUrl);
  const parsedDestination = parseInternalDestination(destination);

  if (
    (appOrigin.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(appOrigin.hostname)) ||
    appOrigin.username ||
    appOrigin.password ||
    !parsedDestination
  ) {
    throw new Error("The configured application redirect is not trusted.");
  }

  return new URL(
    `${parsedDestination.pathname}${parsedDestination.search}${parsedDestination.hash}`,
    appOrigin.origin,
  ).toString();
}
