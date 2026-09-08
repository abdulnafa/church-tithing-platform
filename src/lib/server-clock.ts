import "server-only";

/**
 * Captures request-time wall clock data outside React's render scope.
 * Consumers should call this once and pass the value through their server DTO.
 */
export async function getServerNowMilliseconds() {
  return Date.now();
}
