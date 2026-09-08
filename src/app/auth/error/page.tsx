import type { Metadata } from "next";
import Link from "next/link";

import { AuthPageShell } from "@/components/auth-page-shell";

export const metadata: Metadata = {
  title: "Authentication link unavailable",
};

type AuthErrorPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { reason } = await searchParams;
  const signOutFailed = reason === "signout";

  return (
    <AuthPageShell
      description={
        signOutFailed
          ? "We could not securely close this session. Please try signing out again."
          : "This authentication link is invalid, expired or has already been used."
      }
      eyebrow={signOutFailed ? "Sign out unavailable" : "Secure link unavailable"}
      title={signOutFailed ? "Your session is still active." : "Let's get you a new link."}
    >
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link
          className="focus-ring inline-flex items-center justify-center rounded-full bg-[var(--sage)] px-5 py-3.5 text-xs font-bold text-white"
          href="/forgot-password"
        >
          Request reset link
        </Link>
        <Link
          className="focus-ring inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-white px-5 py-3.5 text-xs font-bold text-[var(--ink)]"
          href="/login"
        >
          Back to sign in
        </Link>
      </div>
    </AuthPageShell>
  );
}
