import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabaseSecretConfig } from "./secret-config";

/**
 * Creates a cookie-free service-role client for narrowly reviewed server-only
 * operations. Never return this client, its headers, or its key to a browser.
 */
export function createPrivilegedServerSupabaseClient() {
  const { secretKey, url } = getSupabaseSecretConfig();
  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
