import "server-only";

const LOCAL_APP_URL = "http://localhost:3000";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

export function parsePublicAppOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    const isHttps = url.protocol === "https:";
    const isLoopbackHttp =
      url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);

    if (
      (!isHttps && !isLoopbackHttp) ||
      url.username ||
      url.password ||
      url.hostname.includes("*") ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the public URL used in assets that must work away from the browser,
 * such as printable QR codes. Vercel system URLs are available during builds,
 * so a missing custom-domain variable never silently produces a localhost QR.
 */
export function getPublicAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl?.trim()) {
    const origin = parsePublicAppOrigin(configuredUrl);
    if (!origin) throw new Error("PUBLIC_APP_URL_INVALID");
    return origin;
  }

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelUrl?.trim()) {
    const origin = parsePublicAppOrigin(vercelUrl);
    if (!origin) throw new Error("VERCEL_APP_URL_INVALID");
    return origin;
  }

  return LOCAL_APP_URL;
}

export function isLocalAppUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Trusted deployment metadata only; never infer release state from Host. */
export function isVercelPreviewEnvironment() {
  return process.env.VERCEL_ENV === "preview";
}
