import type { Enums } from "@/lib/supabase/database.types";

import type { ChurchPermission } from "./permissions";

export type WorkspaceKind = "member" | "church" | "platform";

type BaseWorkspace = Readonly<{
  key: string;
  kind: WorkspaceKind;
  displayName: string;
  home: "/dashboard" | "/church" | "/platform";
  roleLabel: string;
}>;

export type MemberWorkspace = BaseWorkspace &
  Readonly<{
    kind: "member";
    churchId: string;
    donorId: string;
    churchSlug: string;
    home: "/dashboard";
    roleLabel: "Member";
  }>;

export type ChurchWorkspace = BaseWorkspace &
  Readonly<{
    kind: "church";
    churchId: string;
    membershipId: string;
    churchSlug: string;
    churchStatus: "onboarding" | "active";
    role: Enums<"church_member_role">;
    permissions: readonly ChurchPermission[];
    home: "/church";
  }>;

export type PlatformWorkspace = BaseWorkspace &
  Readonly<{
    key: "platform";
    kind: "platform";
    home: "/platform";
    roleLabel: "Platform Admin";
  }>;

export type Workspace =
  | MemberWorkspace
  | ChurchWorkspace
  | PlatformWorkspace;

export type AnonymousIdentity = Readonly<{ state: "anonymous" }>;

export type SetupRequiredIdentity = Readonly<{
  state: "setup_required";
  userId: string;
}>;

export type InactiveIdentity = Readonly<{
  state: "inactive";
  userId: string;
  displayName: string;
}>;

export type ActiveIdentity = Readonly<{
  state: "active";
  userId: string;
  displayName: string;
  workspaces: readonly Workspace[];
}>;

export type RequestIdentity =
  | AnonymousIdentity
  | SetupRequiredIdentity
  | InactiveIdentity
  | ActiveIdentity;

export type ShellIdentity = Readonly<{
  displayName: string;
  initials: string;
  roleLabel: string;
}>;

export type ShellWorkspace = Readonly<{
  displayName: string;
  kind: WorkspaceKind;
  permissions: readonly ChurchPermission[];
}>;
