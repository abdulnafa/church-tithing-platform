export const MOCK_CHECKOUT_COOKIE = "cwe_mock_checkout";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createMockCheckoutCookieValue(
  checkoutId: string,
  capabilityToken: string,
) {
  if (!UUID_PATTERN.test(checkoutId) || !UUID_V4_PATTERN.test(capabilityToken)) {
    return null;
  }
  return `${checkoutId}.${capabilityToken}`;
}

export function parseMockCheckoutCookie(
  value: string | undefined,
  expectedCheckoutId: string,
) {
  if (!value || !UUID_PATTERN.test(expectedCheckoutId)) return null;
  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    parts[0] !== expectedCheckoutId ||
    !UUID_V4_PATTERN.test(parts[1] ?? "")
  ) {
    return null;
  }

  return { checkoutId: parts[0], capabilityToken: parts[1] } as const;
}
