import type { Enums } from "@/lib/supabase/database.types";

import type {
  ActiveIdentity,
  RequestIdentity,
  ShellIdentity,
  ShellWorkspace,
  Workspace,
  WorkspaceKind,
} from "./identity-types";
import type { ChurchPermission } from "./permissions";
import { getSafePostAuthDestination } from "./redirects";

export const WORKSPACE_COOKIE_NAME = "kg_workspace_v1";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SPACE_PATTERN = /\s+/g;
const ROLE_LABELS: Readonly<Record<Enums<"church_member_role">, string>> = {
  owner: "Church Owner",
  finance_admin: "Finance Admin",
  staff: "Church Staff",
  accountant: "Accountant",
};

export type ChurchIdentityRow = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: Enums<"church_status">;
}>;

export type MembershipIdentityRow = Readonly<{
  id: string;
  church_id: string;
  role: Enums<"church_member_role">;
}>;

export type DonorIdentityRow = Readonly<{
  id: string;
  church_id: string;
}>;

export type WorkspaceSource = Readonly<{
  memberships: readonly MembershipIdentityRow[];
  donors: readonly DonorIdentityRow[];
  memberChurches: readonly ChurchIdentityRow[];
  donorChurches: readonly ChurchIdentityRow[];
  isPlatformSuperAdmin: boolean;
  permissionsByChurch?: Readonly<Record<string, readonly ChurchPermission[]>>;
}>;

export type WorkspaceDecision =
  | Readonly<{ state: "allowed"; workspace: Workspace }>
  | Readonly<{ state: "choose" }>
  | Readonly<{ state: "forbidden" }>;

function normalizeDisplayName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().replace(SPACE_PATTERN, " ");
  return normalized ? normalized.slice(0, 80) : fallback;
}

export function createWorkspaceKey(
  kind: "member" | "church",
  churchId: string,
) {
  if (!UUID_PATTERN.test(churchId)) {
    throw new Error("A valid church identifier is required.");
  }

  return `${kind}:${churchId.toLowerCase()}`;
}

export function parseWorkspaceKey(value: unknown) {
  if (value === "platform") {
    return { kind: "platform" as const, churchId: null };
  }

  if (typeof value !== "string") return null;
  const [kind, churchId, extra] = value.split(":");

  if (
    extra !== undefined ||
    (kind !== "member" && kind !== "church") ||
    !churchId ||
    !UUID_PATTERN.test(churchId)
  ) {
    return null;
  }

  return {
    kind: kind as "member" | "church",
    churchId: churchId.toLowerCase(),
  };
}

export function buildWorkspaces(source: WorkspaceSource): readonly Workspace[] {
  const memberChurches = new Map(
    source.memberChurches.map((church) => [church.id, church]),
  );
  const donorChurches = new Map(
    source.donorChurches.map((church) => [church.id, church]),
  );
  const workspaces: Workspace[] = [];

  source.donors.forEach((donor) => {
    const church = donorChurches.get(donor.church_id);
    if (!church || church.status !== "active") return;

    workspaces.push({
      key: createWorkspaceKey("member", church.id),
      kind: "member",
      churchId: church.id,
      donorId: donor.id,
      churchSlug: church.slug,
      displayName: normalizeDisplayName(church.name, "Church giving"),
      home: "/dashboard",
      roleLabel: "Member",
    });
  });

  source.memberships.forEach((membership) => {
    const church = memberChurches.get(membership.church_id);
    if (
      !church ||
      (church.status !== "active" && church.status !== "onboarding")
    ) {
      return;
    }

    workspaces.push({
      key: createWorkspaceKey("church", church.id),
      kind: "church",
      churchId: church.id,
      membershipId: membership.id,
      churchSlug: church.slug,
      churchStatus: church.status,
      role: membership.role,
      permissions: source.permissionsByChurch?.[church.id] ?? [],
      displayName: normalizeDisplayName(church.name, "Church workspace"),
      home: "/church",
      roleLabel: ROLE_LABELS[membership.role],
    });
  });

  if (source.isPlatformSuperAdmin) {
    workspaces.push({
      key: "platform",
      kind: "platform",
      displayName: "Platform administration",
      home: "/platform",
      roleLabel: "Platform Admin",
    });
  }

  const kindOrder: Readonly<Record<WorkspaceKind, number>> = {
    member: 0,
    church: 1,
    platform: 2,
  };

  return workspaces.toSorted(
    (left, right) =>
      kindOrder[left.kind] - kindOrder[right.kind] ||
      left.displayName.localeCompare(right.displayName) ||
      left.key.localeCompare(right.key),
  );
}

export function getWorkspaceForKind(
  identity: ActiveIdentity,
  kind: WorkspaceKind,
  selectedKey?: string | null,
): WorkspaceDecision {
  const matching = identity.workspaces.filter(
    (workspace) => workspace.kind === kind,
  );

  if (matching.length === 0) return { state: "forbidden" };
  if (matching.length === 1) {
    return { state: "allowed", workspace: matching[0] };
  }

  const selected = matching.find((workspace) => workspace.key === selectedKey);
  return selected
    ? { state: "allowed", workspace: selected }
    : { state: "choose" };
}

export function getDestinationWorkspaceKind(destination: string) {
  const pathname = new URL(destination, "http://localhost").pathname;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "member" as const;
  }
  if (pathname === "/church" || pathname.startsWith("/church/")) {
    return "church" as const;
  }
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    return "platform" as const;
  }

  return null;
}

export function createLoginHref(destination: string) {
  const params = new URLSearchParams({ next: destination });
  return `/login?${params.toString()}`;
}

export function createWorkspaceSelectionHref(
  destination?: string | null,
  kind?: WorkspaceKind,
) {
  const params = new URLSearchParams();
  const safeDestination = getSafePostAuthDestination(destination);

  if (safeDestination) params.set("next", safeDestination);
  if (kind) params.set("kind", kind);

  const query = params.toString();
  return query ? `/workspaces?${query}` : "/workspaces";
}

export function resolvePostAuthDestination(
  identity: RequestIdentity,
  requestedDestination?: unknown,
  selectedKey?: string | null,
) {
  const requested = getSafePostAuthDestination(requestedDestination);

  if (identity.state === "anonymous") {
    return createLoginHref(requested ?? "/dashboard");
  }
  if (identity.state === "setup_required") return "/account/setup-required";
  if (identity.state === "inactive") return "/account/disabled";

  if (requested) {
    const kind = getDestinationWorkspaceKind(requested);
    if (!kind) return "/account/no-access";

    const decision = getWorkspaceForKind(identity, kind, selectedKey);
    if (decision.state === "allowed") return requested;
    if (decision.state === "choose") {
      return createWorkspaceSelectionHref(requested, kind);
    }
    return "/account/no-access";
  }

  if (identity.workspaces.length === 0) return "/account/no-access";
  if (identity.workspaces.length === 1) return identity.workspaces[0].home;
  return "/workspaces";
}

export function createShellIdentity(
  identity: ActiveIdentity,
  workspace: Workspace,
): ShellIdentity {
  const displayName = normalizeDisplayName(identity.displayName, "Kindred user");
  const words = displayName.split(SPACE_PATTERN).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");

  return {
    displayName,
    initials: initials || "KG",
    roleLabel: workspace.roleLabel,
  };
}

export function createShellWorkspace(workspace: Workspace): ShellWorkspace {
  return {
    displayName: workspace.displayName,
    kind: workspace.kind,
    permissions: workspace.kind === "church" ? workspace.permissions : [],
  };
}
