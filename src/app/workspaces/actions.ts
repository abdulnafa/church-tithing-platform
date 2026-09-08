"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireActiveIdentity } from "@/lib/auth/guards";
import { getSafePostAuthDestination } from "@/lib/auth/redirects";
import {
  createWorkspaceKey,
  getDestinationWorkspaceKind,
  parseWorkspaceKey,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/auth/workspaces";

function normalizeSubmittedKey(value: FormDataEntryValue | null) {
  const parsed = parseWorkspaceKey(value);
  if (!parsed) return null;

  return parsed.kind === "platform"
    ? "platform"
    : createWorkspaceKey(parsed.kind, parsed.churchId);
}

export async function selectWorkspaceAction(formData: FormData) {
  const identity = await requireActiveIdentity("/workspaces");
  const submittedKey = normalizeSubmittedKey(formData.get("workspace"));
  const workspace = identity.workspaces.find(
    (candidate) => candidate.key === submittedKey,
  );

  if (!workspace) {
    redirect("/workspaces?error=invalid");
  }

  const cookieStore = await cookies();
  if (workspace.kind === "platform") {
    cookieStore.delete(WORKSPACE_COOKIE_NAME);
  } else {
    cookieStore.set(WORKSPACE_COOKIE_NAME, workspace.key, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  const requested = getSafePostAuthDestination(formData.get("next"));
  const destination =
    requested && getDestinationWorkspaceKind(requested) === workspace.kind
      ? requested
      : workspace.home;

  redirect(destination);
}
