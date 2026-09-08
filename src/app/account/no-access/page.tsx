import type { Metadata } from "next";

import { AccountStatePage } from "@/components/account-state-page";

export const metadata: Metadata = { title: "No workspace access" };

export default function NoWorkspaceAccessPage() {
  return (
    <AccountStatePage
      description="Your sign-in is valid, but it is not connected to an active member, church staff, or platform workspace yet."
      eyebrow="No workspace"
      title="Access has not been assigned."
    />
  );
}
