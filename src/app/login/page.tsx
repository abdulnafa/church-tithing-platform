import type { Metadata } from "next";

import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginForm } from "@/components/login-form";
import { getSafePostAuthDestination } from "@/lib/auth/redirects";
import { getRequestIdentity } from "@/lib/auth/request-identity";
import {
  resolvePostAuthDestination,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/auth/workspaces";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in securely to your Kindred Giving portal.",
};

type LoginSearchParams = Promise<{
  next?: string | string[];
  password?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const [params, identity, cookieStore] = await Promise.all([
    searchParams,
    getRequestIdentity(),
    cookies(),
  ]);
  const nextPath = getSafePostAuthDestination(firstValue(params.next));

  if (identity.state !== "anonymous") {
    redirect(
      resolvePostAuthDestination(
        identity,
        nextPath,
        cookieStore.get(WORKSPACE_COOKIE_NAME)?.value,
      ),
    );
  }

  const notice =
    firstValue(params.password) === "updated"
      ? "Your password has been updated. Sign in with your new password."
      : undefined;

  return (
    <AuthPageShell
      description="Use the verified email address and password connected to your account."
      eyebrow="Welcome back"
      title="Sign in to continue."
    >
      <LoginForm nextPath={nextPath} notice={notice} />
      <p className="mt-6 rounded-2xl bg-[var(--sage-pale)] p-4 text-[10px] leading-5 text-[var(--muted)]">
        Authentication sessions are handled securely by Supabase.
      </p>
    </AuthPageShell>
  );
}
