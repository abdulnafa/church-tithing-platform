import type { Metadata } from "next";

import { AccountStatePage } from "@/components/account-state-page";

export const metadata: Metadata = { title: "Account setup required" };

export default function AccountSetupRequiredPage() {
  return (
    <AccountStatePage
      description="Your secure sign-in exists, but the application profile could not be found. Please contact the platform administrator before continuing."
      eyebrow="Setup required"
      title="Your profile needs attention."
    />
  );
}
