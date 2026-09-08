import "client-only";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

export function createBrowserSupabaseClient() {
  const { publishableKey, url } = getSupabasePublicConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
