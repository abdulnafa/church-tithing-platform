import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireChurchWorkspace } from "@/lib/auth/guards";
import {
  createShellIdentity,
  createShellWorkspace,
} from "@/lib/auth/workspaces";

export default async function ChurchLayout({ children }: { children: ReactNode }) {
  const { identity, workspace } = await requireChurchWorkspace();

  return (
    <DashboardShell
      identity={createShellIdentity(identity, workspace)}
      kind="church"
      subtitle="Church workspace"
      title="Church overview"
      workspace={createShellWorkspace(workspace)}
    >
      {children}
    </DashboardShell>
  );
}
