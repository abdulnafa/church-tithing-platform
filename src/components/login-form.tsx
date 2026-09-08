"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  signInAction,
  type AuthActionState,
} from "@/app/auth/actions";
import { ArrowRightIcon } from "@/components/icons";

const INITIAL_STATE: AuthActionState = { status: "idle", message: "" };

type LoginFormProps = Readonly<{
  nextPath: string | null;
  notice?: string;
}>;

export function LoginForm({ nextPath, notice }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="mt-7">
      {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
      {notice && (
        <p
          className="mb-5 rounded-2xl bg-[var(--sage-pale)] px-4 py-3 text-xs leading-5 text-[var(--sage-dark)]"
          role="status"
        >
          {notice}
        </p>
      )}
      {state.status === "error" && (
        <p
          className="mb-5 rounded-2xl bg-[#f5e8e5] px-4 py-3 text-xs leading-5 text-[#9b463b]"
          role="alert"
        >
          {state.message}
        </p>
      )}
      <label className="mt-5 block">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
          Email address
        </span>
        <input
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="username"
          className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]"
          name="email"
          required
          type="email"
        />
        {state.fieldErrors?.email && (
          <span className="mt-2 block text-[10px] text-[#9b463b]" id="email-error">
            {state.fieldErrors.email}
          </span>
        )}
      </label>
      <label className="mt-4 block">
        <span className="mb-2 flex items-center justify-between text-xs font-bold text-[var(--ink-soft)]">
          <span>Password</span>
          <Link className="text-[10px] text-[var(--sage)]" href="/forgot-password">
            Forgot password?
          </Link>
        </span>
        <input
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          autoComplete="current-password"
          className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none"
          minLength={8}
          name="password"
          required
          type="password"
        />
        {state.fieldErrors?.password && (
          <span className="mt-2 block text-[10px] text-[#9b463b]" id="password-error">
            {state.fieldErrors.password}
          </span>
        )}
      </label>
      <button
        className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)] disabled:cursor-wait disabled:opacity-65"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Signing in..." : "Sign in securely"}
        {!isPending && <ArrowRightIcon size={17} />}
      </button>
    </form>
  );
}
