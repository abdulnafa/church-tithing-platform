import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Creates a new user-scoped Supabase client for the current request.
 */
export async function createServerSupabaseClient(responseHeaders?: Headers) {
  const cookieStore = await cookies();
  const { publishableKey, url } = getSupabasePublicConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            responseHeaders?.set(name, value);
          });
        } catch {
          // Server Components cannot write cookies. The request proxy refreshes
          // sessions before rendering, while Server Actions and Route Handlers
          // can persist authentication mutations through this same callback.
        }
      },
    },
  });
}
