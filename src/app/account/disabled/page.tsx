import type { Metadata } from "next";

import { AccountStatePage } from "@/components/account-state-page";

export const metadata: Metadata = { title: "Account unavailable" };

export default function AccountDisabledPage() {
  return (
    <AccountStatePage
      description="This account is currently inactive. Please contact the church or platform administrator who manages your access."
      eyebrow="Access paused"
      title="Your account is unavailable."
    />
  );
}
