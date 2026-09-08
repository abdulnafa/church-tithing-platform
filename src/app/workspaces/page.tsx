import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { ArrowRightIcon } from "@/components/icons";
import { requireActiveIdentity } from "@/lib/auth/guards";
import type { WorkspaceKind } from "@/lib/auth/identity-types";
import { getSafePostAuthDestination } from "@/lib/auth/redirects";
import {
  resolvePostAuthDestination,
  WORKSPACE_COOKIE_NAME,
} from "@/lib/auth/workspaces";

import { selectWorkspaceAction } from "./actions";

export const metadata: Metadata = { title: "Choose a workspace" };

type WorkspaceSearchParams = Promise<{
  next?: string | string[];
  kind?: string | string[];
  error?: string | string[];
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isWorkspaceKind(value: string | undefined): value is WorkspaceKind {
  return value === "member" || value === "church" || value === "platform";
}

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: WorkspaceSearchParams;
}) {
  const [identity, params, cookieStore] = await Promise.all([
    requireActiveIdentity("/workspaces"),
    searchParams,
    cookies(),
  ]);

  if (identity.workspaces.length < 2) {
    redirect(resolvePostAuthDestination(identity));
  }

  const requested = getSafePostAuthDestination(firstValue(params.next));
  const requestedKindValue = firstValue(params.kind);
  const requestedKind = isWorkspaceKind(requestedKindValue)
    ? requestedKindValue
    : null;
  const currentKey = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;
  const invalidSelection = firstValue(params.error) === "invalid";

  return (
    <main className="min-h-screen bg-[#f3f1eb] px-4 py-10 sm:py-16">
      <section className="mx-auto max-w-3xl">
        <Brand />
        <div className="mt-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
            Secure workspace
          </p>
          <h1 className="font-display mt-3 text-4xl tracking-[-0.04em] sm:text-5xl">
            Where would you like to go?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Choose the member, church, or platform workspace you want to use.
            Your access is checked again on every request.
          </p>
        </div>

        {invalidSelection ? (
          <p
            className="mt-6 rounded-2xl bg-[#f5e8e5] px-4 py-3 text-xs text-[#9b463b]"
            role="alert"
          >
            That workspace is no longer available. Choose another option.
          </p>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {identity.workspaces.map((workspace) => {
            const isRequestedKind = requestedKind === workspace.kind;
            const isCurrent = currentKey === workspace.key;

            return (
              <form action={selectWorkspaceAction} key={workspace.key}>
                <input name="workspace" type="hidden" value={workspace.key} />
                {requested ? (
                  <input name="next" type="hidden" value={requested} />
                ) : null}
                <button
                  className={`focus-ring soft-card flex h-full min-h-44 w-full flex-col items-start rounded-[22px] p-5 text-left transition hover:-translate-y-0.5 hover:border-[var(--sage)] ${
                    isRequestedKind ? "ring-2 ring-[var(--sage)]/25" : ""
                  }`}
                  type="submit"
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">
                    {workspace.kind === "member"
                      ? "Member portal"
                      : workspace.kind === "church"
                        ? "Church workspace"
                        : "Platform workspace"}
                  </span>
                  <strong className="mt-3 text-base">{workspace.displayName}</strong>
                  <span className="mt-1 text-[10px] text-[var(--muted)]">
                    {workspace.roleLabel}
                    {isCurrent ? " | Current selection" : ""}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[10px] font-bold text-[var(--ink)]">
                    Open workspace <ArrowRightIcon size={14} />
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </main>
  );
}
