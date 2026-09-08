import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type {
  ActiveIdentity,
  Workspace,
  WorkspaceKind,
} from "./identity-types";
import type { ChurchPermission } from "./permissions";
import {
  hasAnyChurchPermission,
  hasChurchPermission,
  hasEveryChurchPermission,
} from "./permissions";
import { getRequestIdentity } from "./request-identity";
import { TRUSTED_REQUEST_DESTINATION_HEADER } from "./request-path";
import { getSafePostAuthDestination } from "./redirects";
import {
  createLoginHref,
  createWorkspaceKey,
  createWorkspaceSelectionHref,
  getDestinationWorkspaceKind,
  getWorkspaceForKind,
  parseWorkspaceKey,
  WORKSPACE_COOKIE_NAME,
} from "./workspaces";

const WORKSPACE_ROOT: Readonly<Record<WorkspaceKind, string>> = {
  member: "/dashboard",
  church: "/church",
  platform: "/platform",
};

function getNormalizedSelectedKey(value: string | undefined) {
  const parsed = parseWorkspaceKey(value);

  if (!parsed) return null;
  return parsed.kind === "platform"
    ? "platform"
    : createWorkspaceKey(parsed.kind, parsed.churchId);
}

export async function requireActiveIdentity(
  requestedDestination = "/dashboard",
): Promise<ActiveIdentity> {
  const identity = await getRequestIdentity();

  if (identity.state === "anonymous") {
    redirect(createLoginHref(requestedDestination));
  }
  if (identity.state === "setup_required") {
    redirect("/account/setup-required");
  }
  if (identity.state === "inactive") {
    redirect("/account/disabled");
  }

  return identity;
}

export async function requireWorkspace(
  kind: WorkspaceKind,
): Promise<Readonly<{ identity: ActiveIdentity; workspace: Workspace }>> {
  const root = WORKSPACE_ROOT[kind];
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const forwardedDestination = getSafePostAuthDestination(
    requestHeaders.get(TRUSTED_REQUEST_DESTINATION_HEADER),
  );
  const requestedDestination =
    forwardedDestination &&
    getDestinationWorkspaceKind(forwardedDestination) === kind
      ? forwardedDestination
      : root;
  const identity = await requireActiveIdentity(requestedDestination);
  const selectedKey = getNormalizedSelectedKey(
    cookieStore.get(WORKSPACE_COOKIE_NAME)?.value,
  );
  const decision = getWorkspaceForKind(identity, kind, selectedKey);

  if (decision.state === "forbidden") {
    redirect("/account/no-access");
  }
  if (decision.state === "choose") {
    redirect(createWorkspaceSelectionHref(requestedDestination, kind));
  }

  return { identity, workspace: decision.workspace };
}

export async function requireMemberWorkspace() {
  const result = await requireWorkspace("member");
  return {
    identity: result.identity,
    workspace: result.workspace as Extract<Workspace, { kind: "member" }>,
  };
}

export async function requireChurchWorkspace() {
  const result = await requireWorkspace("church");
  return {
    identity: result.identity,
    workspace: result.workspace as Extract<Workspace, { kind: "church" }>,
  };
}

/**
 * Authoritative leaf-route guard for one named church capability. The
 * membership role is display metadata only; an absent or empty permission
 * grant always fails closed.
 */
export async function requireChurchPermission(permission: ChurchPermission) {
  const result = await requireChurchWorkspace();

  if (!hasChurchPermission(result.workspace.permissions, permission)) {
    redirect("/account/no-access");
  }

  return result;
}

/** Require every named capability for a page that combines concerns. */
export async function requireChurchPermissions(
  permissions: readonly ChurchPermission[],
) {
  const result = await requireChurchWorkspace();

  if (!hasEveryChurchPermission(result.workspace.permissions, permissions)) {
    redirect("/account/no-access");
  }

  return result;
}

/** Require at least one named capability for a page that combines concerns. */
export async function requireAnyChurchPermission(
  permissions: readonly ChurchPermission[],
) {
  const result = await requireChurchWorkspace();

  if (!hasAnyChurchPermission(result.workspace.permissions, permissions)) {
    redirect("/account/no-access");
  }

  return result;
}

export async function requirePlatformSuperAdmin() {
  const result = await requireWorkspace("platform");
  return {
    identity: result.identity,
    workspace: result.workspace as Extract<Workspace, { kind: "platform" }>,
  };
}
