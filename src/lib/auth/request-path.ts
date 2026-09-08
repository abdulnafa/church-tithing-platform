export const TRUSTED_REQUEST_DESTINATION_HEADER =
  "x-kindred-request-destination";

export const MAX_REQUEST_DESTINATION_LENGTH = 2_048;

function isNextInternalQueryParameter(name: string) {
  const normalized = name.toLowerCase();
  return normalized === "_rsc" || normalized.startsWith("__next");
}

/**
 * Keeps a normal application destination byte-for-byte while stripping
 * framework transport parameters that must never survive an auth redirect.
 */
export function createSafeRequestDestination(
  pathname: string,
  search: string,
  fallback: string,
) {
  const originalDestination = `${pathname}${search}`;
  let destination = originalDestination;

  if (search) {
    const parameters = new URLSearchParams(search);
    const internalNames = Array.from(parameters.keys()).filter(
      isNextInternalQueryParameter,
    );

    if (internalNames.length > 0) {
      internalNames.forEach((name) => parameters.delete(name));
      const sanitizedSearch = parameters.toString();
      destination = sanitizedSearch ? `${pathname}?${sanitizedSearch}` : pathname;
    }
  }

  return destination.length <= MAX_REQUEST_DESTINATION_LENGTH
    ? destination
    : fallback;
}
