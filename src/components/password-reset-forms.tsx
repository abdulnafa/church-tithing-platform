"use client";

import { useActionState } from "react";

import {
  requestPasswordResetAction,
  updatePasswordAction,
  type AuthActionState,
} from "@/app/auth/actions";
import { ArrowRightIcon } from "@/components/icons";

const INITIAL_STATE: AuthActionState = { status: "idle", message: "" };

function ActionMessage({ state }: { state: AuthActionState }) {
  if (state.status === "idle") return null;

  return (
    <p
      className={`mb-5 rounded-2xl px-4 py-3 text-xs leading-5 ${
        state.status === "success"
          ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
          : "bg-[#f5e8e5] text-[#9b463b]"
      }`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function PasswordResetRequestForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="mt-7">
      <ActionMessage state={state} />
      <label className="block">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
          Email address
        </span>
        <input
          aria-describedby={state.fieldErrors?.email ? "reset-email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none"
          name="email"
          required
          type="email"
        />
        {state.fieldErrors?.email && (
          <span className="mt-2 block text-[10px] text-[#9b463b]" id="reset-email-error">
            {state.fieldErrors.email}
          </span>
        )}
      </label>
      <button
        className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-65"
        disabled={isPending || state.status === "success"}
        type="submit"
      >
        {isPending ? "Sending..." : "Send reset link"}
        {!isPending && <ArrowRightIcon size={17} />}
      </button>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePasswordAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="mt-7">
      <ActionMessage state={state} />
      <label className="block">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
          New password
        </span>
        <input
          aria-describedby={state.fieldErrors?.password ? "new-password-error" : "password-help"}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="new-password"
          className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none"
          minLength={8}
          name="password"
          required
          type="password"
        />
        <span className="mt-2 block text-[10px] text-[var(--muted)]" id="password-help">
          Use at least 8 characters.
        </span>
        {state.fieldErrors?.password && (
          <span className="mt-2 block text-[10px] text-[#9b463b]" id="new-password-error">
            {state.fieldErrors.password}
          </span>
        )}
      </label>
      <label className="mt-4 block">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
          Confirm new password
        </span>
        <input
          aria-describedby={
            state.fieldErrors?.confirmPassword
              ? "confirm-password-error"
              : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          autoComplete="new-password"
          className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
        {state.fieldErrors?.confirmPassword && (
          <span className="mt-2 block text-[10px] text-[#9b463b]" id="confirm-password-error">
            {state.fieldErrors.confirmPassword}
          </span>
        )}
      </label>
      <button
        className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-65"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Updating..." : "Update password"}
        {!isPending && <ArrowRightIcon size={17} />}
      </button>
    </form>
  );
}
