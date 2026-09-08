import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireMemberWorkspace } from "@/lib/auth/guards";
import {
  createShellIdentity,
  createShellWorkspace,
} from "@/lib/auth/workspaces";

export default async function MemberDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { identity, workspace } = await requireMemberWorkspace();

  return (
    <DashboardShell
      identity={createShellIdentity(identity, workspace)}
      kind="member"
      subtitle={`${workspace.displayName} | Your generosity, all in one place`}
      title="My giving"
      workspace={createShellWorkspace(workspace)}
    >
      {children}
    </DashboardShell>
  );
}
