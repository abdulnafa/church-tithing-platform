import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireMemberWorkspace } from "@/lib/auth/guards";
import {
  createShellIdentity,
  createShellWorkspace,
} from "@/lib/auth/workspaces";
import { loadMemberDonorProfile } from "@/lib/member-donor-profile";

export default async function MemberDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { identity, workspace } = await requireMemberWorkspace();
  const profileResult = await loadMemberDonorProfile(
    workspace.churchId,
    workspace.donorId,
  );
  const accountShellIdentity = createShellIdentity(identity, workspace);
  const shellIdentity = profileResult.ok
    ? createShellIdentity(
        { ...identity, displayName: profileResult.profile.displayName },
        workspace,
      )
    : accountShellIdentity;

  return (
    <DashboardShell
      identity={shellIdentity}
      kind="member"
      subtitle={`${workspace.displayName} | Your generosity, all in one place`}
      title="My giving"
      workspace={createShellWorkspace(workspace)}
    >
      {children}
    </DashboardShell>
  );
}
