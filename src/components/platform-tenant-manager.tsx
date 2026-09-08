"use client";

import { useActionState } from "react";

import { mutatePlatformTenantLifecycleAction } from "@/app/platform/actions";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import {
  PLATFORM_READINESS_LABELS,
  PLATFORM_SUSPENSION_REASON_CODES,
  PLATFORM_SUSPENSION_REASON_LABELS,
  createInitialPlatformLifecycleState,
  getPlatformLifecycleOperationForStatus,
  type PlatformLifecycleOperation,
  type PlatformTenantSummary,
} from "@/lib/platform/platform-tenant-management";

type TenantActionItem = Readonly<{
  requestId: string | null;
  tenant: PlatformTenantSummary;
}>;

const STATUS_STYLES = {
  onboarding: "bg-[var(--gold-pale)] text-[#8a641f]",
  active: "bg-[var(--sage-pale)] text-[var(--sage-dark)]",
  suspended: "bg-[#f5e8e5] text-[#9b463b]",
  canceled: "bg-[#ece9e1] text-[var(--ink-soft)]",
  archived: "bg-[#ece9e1] text-[var(--muted)]",
} as const;

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function PlatformTenantManager({
  items,
}: Readonly<{ items: readonly TenantActionItem[] }>) {
  if (items.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
        <h3 className="text-sm font-bold">No churches on this page</h3>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          Create an onboarding church or return to the first tenant page.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 grid min-w-0 gap-4">
      {items.map(({ requestId, tenant }) => (
        <TenantCard key={tenant.churchId} requestId={requestId} tenant={tenant} />
      ))}
    </div>
  );
}

function TenantCard({ requestId, tenant }: Readonly<TenantActionItem>) {
  const operation = getPlatformLifecycleOperationForStatus(tenant.status);
  const canTransition = operation === "suspend" || tenant.foundationReady;
  const statusTimestamp =
    tenant.status === "suspended"
      ? tenant.suspendedAt
      : tenant.status === "active"
        ? tenant.activatedAt
        : null;

  return (
    <article className="min-w-0 rounded-[20px] border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="break-words text-sm font-bold">{tenant.displayName}</h3>
            <span
              className={`rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.1em] ${STATUS_STYLES[tenant.status]}`}
            >
              {tenant.status}
            </span>
          </div>
          <p className="mt-2 break-all text-[10px] text-[var(--muted)]">
            {tenant.slug} | {tenant.defaultCurrency ?? "Currency needs review"} |{" "}
            {tenant.timezone ?? "Timezone needs review"}
          </p>
          <p className="mt-1 text-[9px] text-[var(--muted)]">
            Created {formatUtcDate(tenant.createdAt)} | Revision {tenant.lifecycleRevision}
          </p>
          {statusTimestamp ? (
            <p className="mt-1 text-[9px] text-[var(--muted)]">
              {tenant.status === "suspended" ? "Suspended" : "Initially activated"}{" "}
              {formatUtcDate(statusTimestamp)}
            </p>
          ) : null}
        </div>
        {tenant.foundationReady ? (
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-[var(--sage-pale)] px-3 py-2 text-[9px] font-bold text-[var(--sage-dark)]">
            <CheckIcon size={13} /> Foundation ready
          </span>
        ) : (
          <span className="w-fit shrink-0 rounded-full bg-[var(--gold-pale)] px-3 py-2 text-[9px] font-bold text-[#8a641f]">
            Setup incomplete
          </span>
        )}
      </div>

      {tenant.missingReadinessCodes.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-[#f7f5ef] p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Required before {tenant.status === "suspended" ? "restoration" : "activation"}
          </p>
          <ul className="mt-2 grid gap-1.5 text-[10px] text-[var(--ink-soft)] sm:grid-cols-2">
            {tenant.missingReadinessCodes.map((code) => (
              <li className="flex items-start gap-2" key={code}>
                <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
                {PLATFORM_READINESS_LABELS[code]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {operation && requestId && canTransition ? (
        <TenantLifecycleForm operation={operation} requestId={requestId} tenant={tenant} />
      ) : (operation === "activate" || operation === "restore") && !canTransition ? (
        <p className="mt-4 text-[10px] leading-5 text-[#79581f]" role="note">
          {operation === "restore" ? "Restoration" : "Activation"} stays unavailable
          until every required foundation check is complete.
        </p>
      ) : (
        <p className="mt-4 text-[10px] leading-5 text-[var(--muted)]" role="note">
          This historical tenant status is read-only in the current workflow.
        </p>
      )}
    </article>
  );
}

function TenantLifecycleForm({
  operation,
  requestId,
  tenant,
}: Readonly<{
  operation: PlatformLifecycleOperation;
  requestId: string;
  tenant: PlatformTenantSummary;
}>) {
  const [state, formAction, isPending] = useActionState(
    mutatePlatformTenantLifecycleAction,
    createInitialPlatformLifecycleState({
      requestId,
      churchId: tenant.churchId,
      expectedRevision: tenant.lifecycleRevision,
      operation,
    }),
  );
  const locked = state.retryRequired;
  const actionLabel =
    operation === "activate"
      ? "Activate church"
      : operation === "suspend"
        ? "Suspend church"
        : "Restore church";
  const confirmationLabel =
    operation === "activate"
      ? "I confirm that the required foundation checks are complete."
      : operation === "suspend"
        ? "I confirm that this church should be suspended."
        : "I confirm that this church should be restored to active status.";

  return (
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <div aria-atomic="true" aria-live="polite">
        {state.status !== "idle" ? (
          <p
            className={`mb-3 rounded-xl px-3 py-2.5 text-[10px] leading-5 ${
              state.status === "success"
                ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
                : "bg-[#f5e8e5] text-[#9b463b]"
            }`}
            key={state.responseEpoch}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {state.status === "success" ? null : (
        <details className="group rounded-2xl border border-[var(--line)] bg-[#fbfaf7] p-3">
          <summary className="focus-ring cursor-pointer list-none rounded-xl text-[10px] font-bold [&::-webkit-details-marker]:hidden">
            {locked ? "Retry unconfirmed status request" : actionLabel}
          </summary>
          <form action={formAction} className="mt-4 min-w-0 space-y-4">
            <input name="requestId" type="hidden" value={state.requestId} />
            <input name="churchId" type="hidden" value={state.churchId} />
            <input name="operation" type="hidden" value={state.operation} />
            <input
              name="expectedLifecycleRevision"
              type="hidden"
              value={state.expectedRevision}
            />

            {operation === "suspend" ? (
              <label className="block min-w-0" htmlFor={`reason-${tenant.churchId}`}>
                <span className="mb-2 block text-[10px] font-bold">Suspension reason</span>
                {locked ? (
                  <input
                    name="suspensionReasonCode"
                    type="hidden"
                    value={state.suspensionReasonCode}
                  />
                ) : null}
                <select
                  className="focus-ring min-w-0 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-xs disabled:cursor-not-allowed disabled:bg-[#f0eee8]"
                  defaultValue={state.suspensionReasonCode}
                  disabled={locked}
                  id={`reason-${tenant.churchId}`}
                  key={state.responseEpoch}
                  name="suspensionReasonCode"
                  required
                >
                  <option disabled value="">Choose a reason</option>
                  {PLATFORM_SUSPENSION_REASON_CODES.map((reason) => (
                    <option key={reason} value={reason}>
                      {PLATFORM_SUSPENSION_REASON_LABELS[reason]}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input name="suspensionReasonCode" type="hidden" value="" />
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-[10px] leading-5">
              <input
                className="mt-0.5 size-4 shrink-0 accent-[var(--sage)]"
                name="confirmation"
                required
                type="checkbox"
              />
              <span>{confirmationLabel}</span>
            </label>

            <p className="flex items-start gap-2 text-[9px] leading-4 text-[var(--muted)]">
              <ShieldIcon className="mt-0.5 shrink-0" size={12} />
              This changes only the saved database tenant/public status. The preview
              /give and /q routes will enforce it when those live workflows are
              connected.
            </p>

            <button
              className={`focus-ring w-full rounded-full px-4 py-3 text-[10px] font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto ${
                operation === "suspend" ? "bg-[#9b463b]" : "bg-[var(--sage)]"
              }`}
              disabled={isPending}
              type="submit"
            >
              {isPending
                ? "Saving status..."
                : locked
                  ? "Retry unchanged request"
                  : actionLabel}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

function formatUtcDate(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.getUTCDate()} ${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} UTC`;
}
