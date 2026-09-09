"use client";

import { useActionState } from "react";

import { updateDonorProfileAction } from "@/app/dashboard/profile-actions";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import {
  createInitialDonorProfileActionState,
  type DonorProfileField,
  type DonorProfileSnapshot,
} from "@/lib/donor-profile";

export function DonorProfileForm({
  churchName,
  requestId,
  snapshot,
}: Readonly<{
  churchName: string;
  requestId: string;
  snapshot: DonorProfileSnapshot;
}>) {
  const [state, formAction, isPending] = useActionState(
    updateDonorProfileAction,
    createInitialDonorProfileActionState(requestId, snapshot),
  );
  const locked = state.retryRequired;

  return (
    <form
      action={formAction}
      className="soft-card min-w-0 rounded-[22px] p-5 sm:p-6"
      id="profile"
    >
      <input name="requestId" type="hidden" value={state.requestId} />
      <input
        name="expectedProfileRevision"
        type="hidden"
        value={state.expectedRevision}
      />
      {locked ? (
        <input
          name="displayName"
          type="hidden"
          value={state.values.displayName}
        />
      ) : null}

      <div aria-atomic="true" aria-live="polite">
        {state.status !== "idle" ? (
          <p
            className={`mb-5 rounded-2xl px-4 py-3 text-xs leading-5 ${
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">
            Personal details
          </p>
          <h2 className="mt-2 text-base font-bold">Your giving profile</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--ink-soft)]">
            This profile is scoped only to {churchName}. It does not merge or
            claim earlier guest donations by matching an email address.
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--sage-pale)] px-3 py-1.5 text-[9px] font-bold text-[var(--sage-dark)]">
          Church-scoped
        </span>
      </div>

      {locked ? (
        <p
          className="mt-5 rounded-2xl bg-[var(--gold-pale)] p-4 text-[10px] leading-5 text-[#79581f]"
          role="note"
        >
          The previous save result is unknown. Your name is locked so this exact
          request can be retried safely without creating a second update.
        </p>
      ) : null}

      <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2" key={state.responseEpoch}>
        <label className="min-w-0" htmlFor="donor-profile-display-name">
          <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
            Full name
          </span>
          <input
            aria-describedby={[
              "donor-profile-display-name-help",
              state.fieldErrors?.displayName
                ? "donor-profile-display-name-error"
                : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={Boolean(state.fieldErrors?.displayName)}
            autoComplete="name"
            className="focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4] disabled:cursor-not-allowed disabled:bg-[#f0eee8]"
            defaultValue={state.values.displayName}
            disabled={locked}
            id="donor-profile-display-name"
            name="displayName"
            required
            type="text"
          />
          <span
            className="mt-2 block text-[10px] leading-5 text-[var(--ink-soft)]"
            id="donor-profile-display-name-help"
          >
            Used as your name within this church&apos;s giving experience.
          </span>
          <FieldError
            error={state.fieldErrors?.displayName}
            field="displayName"
          />
        </label>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold text-[var(--ink-soft)]">
            Verified sign-in email
          </p>
          <p className="min-w-0 break-words rounded-2xl border border-[var(--line)] bg-[#f0eee8] px-4 py-3.5 text-sm [overflow-wrap:anywhere]">
            {snapshot.email}
          </p>
          <p className="mt-2 text-[10px] leading-5 text-[var(--ink-soft)]">
            Read-only here. Email changes require a separate verified-email flow,
            and this address is never used to auto-claim guest giving history.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-xl items-start gap-2 text-[9px] leading-4 text-[var(--ink-soft)]">
          <ShieldIcon className="mt-0.5 shrink-0" size={13} />
          This save updates the linked name only. Other contact details, tax
          identifiers, payment details, prayer requests, and financial records are
          not changed.
        </p>
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Saving profile..."
            : locked
              ? "Retry unchanged save"
              : "Save giving profile"}
          {!isPending ? <CheckIcon size={15} /> : null}
        </button>
      </div>
    </form>
  );
}

function FieldError({
  error,
  field,
}: Readonly<{ error?: string; field: DonorProfileField }>) {
  return error ? (
    <span
      className="mt-2 block text-[10px] text-[#9b463b]"
      id={`donor-profile-${field === "displayName" ? "display-name" : field}-error`}
    >
      {error}
    </span>
  ) : null;
}
