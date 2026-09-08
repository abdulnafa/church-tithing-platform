export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

export type SupabasePublicConfigInput = Readonly<{
  url?: string;
  publishableKey?: string;
}>;

export type SupabaseConfigurationErrorCode =
  | "missing_url"
  | "invalid_url"
  | "insecure_url"
  | "missing_publishable_key"
  | "invalid_publishable_key";

const PUBLISHABLE_KEY_PREFIX = "sb_publishable_";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class SupabaseConfigurationError extends Error {
  readonly code: SupabaseConfigurationErrorCode;

  constructor(code: SupabaseConfigurationErrorCode, message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
    this.code = code;
  }
}

function parseSupabaseUrl(value: string | undefined): string {
  const candidate = value?.trim();

  if (!candidate) {
    throw new SupabaseConfigurationError(
      "missing_url",
      "NEXT_PUBLIC_SUPABASE_URL is required before a Supabase client can be created.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(candidate);
  } catch {
    throw new SupabaseConfigurationError(
      "invalid_url",
      "NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTP or HTTPS URL.",
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SupabaseConfigurationError(
      "invalid_url",
      "NEXT_PUBLIC_SUPABASE_URL must use the HTTP or HTTPS protocol.",
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new SupabaseConfigurationError(
      "invalid_url",
      "NEXT_PUBLIC_SUPABASE_URL must not contain embedded credentials.",
    );
  }

  if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
    throw new SupabaseConfigurationError(
      "invalid_url",
      "NEXT_PUBLIC_SUPABASE_URL must be the project origin without a path, query, or fragment.",
    );
  }

  if (parsedUrl.protocol !== "https:" && !LOCAL_HOSTNAMES.has(parsedUrl.hostname)) {
    throw new SupabaseConfigurationError(
      "insecure_url",
      "NEXT_PUBLIC_SUPABASE_URL must use HTTPS unless it points to a local development host.",
    );
  }

  return parsedUrl.origin;
}

function parsePublishableKey(value: string | undefined): string {
  const candidate = value?.trim();

  if (!candidate) {
    throw new SupabaseConfigurationError(
      "missing_publishable_key",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required before a Supabase client can be created.",
    );
  }

  const randomPart = candidate.slice(PUBLISHABLE_KEY_PREFIX.length);
  const hasValidShape =
    candidate.startsWith(PUBLISHABLE_KEY_PREFIX) &&
    randomPart.length >= 20 &&
    /^[A-Za-z0-9_-]+$/.test(randomPart);

  if (!hasValidShape) {
    throw new SupabaseConfigurationError(
      "invalid_publishable_key",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must contain a modern Supabase publishable key, never a secret key.",
    );
  }

  return candidate;
}

export function parseSupabasePublicConfig(
  input: SupabasePublicConfigInput,
): SupabasePublicConfig {
  return Object.freeze({
    url: parseSupabaseUrl(input.url),
    publishableKey: parsePublishableKey(input.publishableKey),
  });
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return parseSupabasePublicConfig({
    // Direct references are required so Next.js can inline public values safely.
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
