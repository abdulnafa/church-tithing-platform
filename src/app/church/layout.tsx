import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function ChurchLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell
      kind="church"
      subtitle="Harbour Grace Church · Church workspace"
      title="Church overview"
    >
      {children}
    </DashboardShell>
  );
}
