import "server-only";

const LOCAL_APP_URL = "http://localhost:3000";

function normalizePublicUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Resolve the public URL used in assets that must work away from the browser,
 * such as printable QR codes. Vercel system URLs are available during builds,
 * so a missing custom-domain variable never silently produces a localhost QR.
 */
export function getPublicAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl?.trim()) return normalizePublicUrl(configuredUrl);

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelUrl?.trim()) return normalizePublicUrl(vercelUrl);

  return LOCAL_APP_URL;
}

export function isLocalAppUrl(value: string) {
  return value.startsWith("http://localhost") || value.startsWith("http://127.0.0.1");
}
