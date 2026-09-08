import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPageShell } from "@/components/auth-page-shell";
import { UpdatePasswordForm } from "@/components/password-reset-forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Choose a new password for your Kindred Giving account.",
};

export default async function ResetPasswordPage() {
  let hasVerifiedSession = false;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getClaims();
    hasVerifiedSession = !error && Boolean(data?.claims?.sub);
  } catch {
    hasVerifiedSession = false;
  }

  if (!hasVerifiedSession) redirect("/auth/error");

  return (
    <AuthPageShell
      description="Choose a strong password for your account. You will sign in again after it is updated."
      eyebrow="Secure recovery"
      title="Choose a new password."
    >
      <UpdatePasswordForm />
    </AuthPageShell>
  );
}
