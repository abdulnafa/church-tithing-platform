"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import {
  createTrustedAppRedirect,
  getSafePostAuthDestination,
} from "@/lib/auth/redirects";
import { resolveRequestIdentity } from "@/lib/auth/request-identity";
import {
  resolvePostAuthDestination,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/auth/workspaces";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthActionState = Readonly<{
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Readonly<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>;
}>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 256;

function getFormText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function normalizeEmail(formData: FormData) {
  return getFormText(formData, "email").trim().toLowerCase();
}

function getEmailError(email: string) {
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }

  return null;
}

function getPasswordError(password: string) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAXIMUM_PASSWORD_LENGTH) {
    return "Password is too long.";
  }

  return null;
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData);
  const password = getFormText(formData, "password");
  const emailError = getEmailError(email);
  const passwordError = getPasswordError(password);

  if (emailError || passwordError) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        ...(emailError ? { email: emailError } : {}),
        ...(passwordError ? { password: passwordError } : {}),
      },
    };
  }

  const requestedDestination = getSafePostAuthDestination(formData.get("next"));
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return {
        status: "error",
        message: "Email or password is incorrect, or the email is not verified.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "Sign-in is temporarily unavailable. Please try again.",
    };
  }

  let destination: string;

  try {
    const [identity, cookieStore] = await Promise.all([
      resolveRequestIdentity({ authenticatedClient: supabase }),
      cookies(),
    ]);
    destination = resolvePostAuthDestination(
      identity,
      requestedDestination,
      cookieStore.get(WORKSPACE_COOKIE_NAME)?.value,
    );
  } catch {
    return {
      status: "error",
      message:
        "You are signed in, but workspace access could not be verified. Please try again.",
    };
  }

  redirect(destination);
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData);
  const emailError = getEmailError(email);

  if (emailError) {
    return {
      status: "error",
      message: "Check the highlighted field and try again.",
      fieldErrors: { email: emailError },
    };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const redirectTo = createTrustedAppRedirect(
      getPublicAppUrl(),
      "/auth/confirm",
    );

    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // Use the same response for unknown accounts, rate limits, and provider
    // failures so this public action cannot be used to enumerate members.
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, a password-reset link has been sent.",
  };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = getFormText(formData, "password");
  const confirmPassword = getFormText(formData, "confirmPassword");
  const passwordError = getPasswordError(password);
  const confirmationError =
    password === confirmPassword ? null : "Passwords do not match.";

  if (passwordError || confirmationError) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        ...(passwordError ? { password: passwordError } : {}),
        ...(confirmationError ? { confirmPassword: confirmationError } : {}),
      },
    };
  }

  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims?.sub) {
      return {
        status: "error",
        message: "This password-reset session is invalid or has expired.",
      };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      return {
        status: "error",
        message: "We could not update your password. Request a new reset link.",
      };
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });

    if (signOutError) {
      return {
        status: "success",
        message:
          "Your password was updated, but this session could not be closed. Please use Sign out before leaving this device.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "Password reset is temporarily unavailable. Please try again.",
    };
  }

  redirect("/login?password=updated");
}

export async function signOutAction(): Promise<void> {
  let signOutFailed = false;

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    signOutFailed = Boolean(error);
  } catch {
    signOutFailed = true;
  }

  try {
    const cookieStore = await cookies();
    cookieStore.delete(WORKSPACE_COOKIE_NAME);
  } catch {
    // The auth result determines the fixed destination; a stale workspace
    // preference is revalidated before it can influence future access.
  }

  redirect(signOutFailed ? "/auth/error?reason=signout" : "/login");
}
