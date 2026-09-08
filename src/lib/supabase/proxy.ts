import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/** Refresh the request session and mirror every auth cookie onto the response. */
export async function refreshSupabaseSession(
  request: NextRequest,
  forwardedHeaders = new Headers(request.headers),
) {
  let response = NextResponse.next({ request: { headers: forwardedHeaders } });
  try {
    const { publishableKey, url } = getSupabasePublicConfig();
    const supabase = createServerClient<Database>(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          forwardedHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: forwardedHeaders } });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    });

    // Do not place application logic between client creation and this call.
    // getClaims validates the access token and refreshes it when necessary.
    const { data, error } = await supabase.auth.getClaims();

    return {
      response,
      isAuthenticated:
        !error &&
        typeof data?.claims?.sub === "string" &&
        data.claims.sub.length > 0,
    };
  } catch {
    return { response, isAuthenticated: false };
  }
}
