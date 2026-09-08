import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { requirePlatformSuperAdmin } from "@/lib/auth/guards";
import {
  createShellIdentity,
  createShellWorkspace,
} from "@/lib/auth/workspaces";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { identity, workspace } = await requirePlatformSuperAdmin();

  return (
    <DashboardShell
      identity={createShellIdentity(identity, workspace)}
      kind="platform"
      subtitle="Pilot control centre | Barbados"
      title="Platform overview"
      workspace={createShellWorkspace(workspace)}
    >
      {children}
    </DashboardShell>
  );
}
