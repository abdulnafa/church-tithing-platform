import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createSafeRequestDestination,
  TRUSTED_REQUEST_DESTINATION_HEADER,
} from "@/lib/auth/request-path";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

const PROTECTED_ROOTS = ["/dashboard", "/church", "/platform", "/workspaces"];
const PRIVATE_CACHE_HEADERS = ["cache-control", "expires", "pragma"];

function getProtectedRoot(pathname: string) {
  return PROTECTED_ROOTS.find(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

function createLoginRedirect(
  request: NextRequest,
  refreshedResponse: NextResponse,
  requestedDestination: string,
) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.hash = "";
  loginUrl.searchParams.set("next", requestedDestination);

  const response = NextResponse.redirect(loginUrl);
  refreshedResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  PRIVATE_CACHE_HEADERS.forEach((name) => {
    const value = refreshedResponse.headers.get(name);
    if (value) response.headers.set(name, value);
  });

  return response;
}

export async function proxy(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  const protectedRoot = getProtectedRoot(request.nextUrl.pathname);
  const requestedDestination = createSafeRequestDestination(
    request.nextUrl.pathname,
    request.nextUrl.search,
    protectedRoot ?? "/",
  );
  forwardedHeaders.set(
    TRUSTED_REQUEST_DESTINATION_HEADER,
    requestedDestination,
  );

  let response = NextResponse.next({ request: { headers: forwardedHeaders } });
  let isAuthenticated = false;

  try {
    const refreshed = await refreshSupabaseSession(request, forwardedHeaders);
    response = refreshed.response;
    isAuthenticated = refreshed.isAuthenticated;
  } catch {
    // Public pages remain available during an Auth/configuration outage.
    // Protected leaf pages also enforce database-backed guards, while this
    // optimistic boundary fails closed to login without exposing provider data.
  }

  return protectedRoot && !isAuthenticated
    ? createLoginRedirect(request, response, requestedDestination)
    : response;
}

export const config = {
  // Asset-like paths skip this refresh optimization. Authorization never
  // depends on the matcher: every protected leaf page invokes a server guard.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|eot|mp4|webm|mp3|wav)$).*)",
  ],
};
