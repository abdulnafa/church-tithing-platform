import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Creates a cookie-free anonymous client for explicit public projections.
 * It must never receive, persist, or refresh a signed-in user's session.
 */
export function createPublicServerSupabaseClient() {
  const { publishableKey, url } = getSupabasePublicConfig();

  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
