import "server-only";

import { getSupabasePublicConfig } from "./config";

export type SupabaseSecretConfig = Readonly<{
  url: string;
  secretKey: string;
}>;

const SECRET_KEY_PREFIX = "sb_secret_";

export class SupabaseSecretConfigurationError extends Error {
  constructor() {
    super("The server-only Supabase key is unavailable or invalid.");
    this.name = "SupabaseSecretConfigurationError";
  }
}

export function parseSupabaseSecretKey(value: string | undefined) {
  const candidate = value?.trim();
  const randomPart = candidate?.slice(SECRET_KEY_PREFIX.length) ?? "";
  if (
    !candidate ||
    !candidate.startsWith(SECRET_KEY_PREFIX) ||
    randomPart.length < 20 ||
    !/^[A-Za-z0-9_-]+$/.test(randomPart)
  ) {
    throw new SupabaseSecretConfigurationError();
  }
  return candidate;
}

export function getSupabaseSecretConfig(): SupabaseSecretConfig {
  const { url } = getSupabasePublicConfig();
  return Object.freeze({
    url,
    secretKey: parseSupabaseSecretKey(process.env.SUPABASE_SECRET_KEY),
  });
}
