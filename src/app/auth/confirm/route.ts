import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  createTrustedAppRedirect,
  getSafeAuthCallbackRedirect,
  getSafePostAuthRedirect,
} from "@/lib/auth/redirects";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ALLOWED_EMAIL_OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isAllowedEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && ALLOWED_EMAIL_OTP_TYPES.has(value);
}

function trustedRedirect(destination: string, headers?: Headers) {
  const response = NextResponse.redirect(
    createTrustedAppRedirect(getPublicAppUrl(), destination),
  );
  headers?.forEach((value, name) => response.headers.set(name, value));
  return response;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const requestedDestination = request.nextUrl.searchParams.get("next");
  const responseHeaders = new Headers();

  try {
    const supabase = await createServerSupabaseClient(responseHeaders);

    if (tokenHash || type) {
      if (!tokenHash || !isAllowedEmailOtpType(type) || code) {
        return trustedRedirect("/auth/error", responseHeaders);
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) return trustedRedirect("/auth/error", responseHeaders);

      const destination =
        type === "recovery"
          ? "/reset-password"
          : getSafePostAuthRedirect(requestedDestination);

      return trustedRedirect(destination, responseHeaders);
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) return trustedRedirect("/auth/error", responseHeaders);

      return trustedRedirect(
        getSafeAuthCallbackRedirect(requestedDestination),
        responseHeaders,
      );
    }
  } catch {
    return trustedRedirect("/auth/error", responseHeaders);
  }

  return trustedRedirect("/auth/error");
}
