import type { Metadata } from "next";
import Link from "next/link";

import { AuthPageShell } from "@/components/auth-page-shell";
import { PasswordResetRequestForm } from "@/components/password-reset-forms";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a secure Kindred Giving password-reset link.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      description="Enter your account email. If it matches an account, we will send a secure reset link."
      eyebrow="Account recovery"
      title="Reset your password."
    >
      <PasswordResetRequestForm />
      <Link
        className="focus-ring mt-5 block text-center text-xs font-bold text-[var(--sage)]"
        href="/login"
      >
        Back to sign in
      </Link>
    </AuthPageShell>
  );
}
