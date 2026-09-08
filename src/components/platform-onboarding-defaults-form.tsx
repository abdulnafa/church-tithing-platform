"use client";

import { useActionState } from "react";

import { updatePlatformOnboardingDefaultsAction } from "@/app/platform/settings/actions";
import { ShieldIcon } from "@/components/icons";
import {
  createInitialPlatformOnboardingDefaultsState,
  type PlatformOnboardingDefaultsField,
  type PlatformOnboardingDefaultsSnapshot,
} from "@/lib/platform/platform-onboarding-defaults";

const INPUT_CLASS =
  "focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none disabled:cursor-not-allowed disabled:bg-[#f0eee8] disabled:text-[var(--muted)]";

export function PlatformOnboardingDefaultsForm({
  requestId,
  snapshot,
}: Readonly<{
  requestId: string;
  snapshot: PlatformOnboardingDefaultsSnapshot;
}>) {
  const [state, formAction, isPending] = useActionState(
    updatePlatformOnboardingDefaultsAction,
    createInitialPlatformOnboardingDefaultsState(requestId, snapshot),
  );
  const values = state.values;
  const locked = state.retryRequired;

  return (
    <form action={formAction} className="soft-card min-w-0 rounded-[24px] p-5 sm:p-7">
      <input name="requestId" type="hidden" value={state.requestId} />
      <input
        name="expectedSettingsRevision"
        type="hidden"
        value={state.expectedRevision}
      />
      {locked ? (
        <>
          <input name="defaultCurrency" type="hidden" value={values.defaultCurrency} />
          <input name="defaultTimezone" type="hidden" value={values.defaultTimezone} />
          <input
            name="defaultPrimaryColor"
            type="hidden"
            value={values.defaultPrimaryColor}
          />
          <input
            name="defaultSecondaryColor"
            type="hidden"
            value={values.defaultSecondaryColor}
          />
        </>
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

      <div key={state.responseEpoch}>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0" htmlFor="platform-default-currency">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Default currency
            </span>
            <select
              aria-describedby={describedBy("defaultCurrency", state)}
              aria-invalid={Boolean(state.fieldErrors?.defaultCurrency)}
              className={INPUT_CLASS}
              defaultValue={values.defaultCurrency}
              disabled={locked}
              id="platform-default-currency"
              name="defaultCurrency"
              required
            >
              <option value="BBD">BBD | Barbados dollar</option>
              <option value="USD">USD | US dollar</option>
              <option value="CAD">CAD | Canadian dollar</option>
              <option value="XCD">XCD | East Caribbean dollar</option>
            </select>
            <FieldError error={state.fieldErrors?.defaultCurrency} field="defaultCurrency" />
          </label>

          <label className="min-w-0" htmlFor="platform-default-timezone">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Default IANA timezone
            </span>
            <input
              aria-describedby={describedBy("defaultTimezone", state)}
              aria-invalid={Boolean(state.fieldErrors?.defaultTimezone)}
              autoComplete="off"
              className={INPUT_CLASS}
              defaultValue={values.defaultTimezone}
              disabled={locked}
              id="platform-default-timezone"
              list="platform-timezone-options"
              maxLength={64}
              name="defaultTimezone"
              required
            />
            <datalist id="platform-timezone-options">
              <option value="America/Barbados" />
              <option value="America/Toronto" />
              <option value="America/New_York" />
              <option value="UTC" />
            </datalist>
            <FieldError error={state.fieldErrors?.defaultTimezone} field="defaultTimezone" />
          </label>

          <ColorField
            disabled={locked}
            error={state.fieldErrors?.defaultPrimaryColor}
            field="defaultPrimaryColor"
            label="Default primary colour"
            value={values.defaultPrimaryColor}
          />
          <ColorField
            disabled={locked}
            error={state.fieldErrors?.defaultSecondaryColor}
            field="defaultSecondaryColor"
            label="Default secondary colour"
            value={values.defaultSecondaryColor}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-[var(--sage-pale)] p-4">
        <p className="flex items-start gap-2 text-[10px] leading-5 text-[var(--sage-dark)]">
          <ShieldIcon className="mt-0.5 shrink-0" size={14} />
          These values prefill future church onboarding forms only. Every submitted
          church is still validated independently, and existing churches are not
          changed.
        </p>
      </div>

      {locked ? (
        <p className="mt-4 text-[10px] leading-5 text-[#79581f]" role="note">
          The values are locked because the previous save result is unknown. Retry
          this exact request before starting a different save.
        </p>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          className="focus-ring w-full rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Saving defaults..."
            : locked
              ? "Retry unchanged save"
              : "Save onboarding defaults"}
        </button>
      </div>
    </form>
  );
}

function ColorField({
  disabled,
  error,
  field,
  label,
  value,
}: Readonly<{
  disabled: boolean;
  error?: string;
  field: "defaultPrimaryColor" | "defaultSecondaryColor";
  label: string;
  value: string;
}>) {
  return (
    <label className="min-w-0" htmlFor={`platform-${field}`}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-2">
        <input
          aria-describedby={describedBy(field, { fieldErrors: error ? { [field]: error } : undefined })}
          aria-invalid={Boolean(error)}
          className="size-9 shrink-0 cursor-pointer rounded-xl border-0 bg-transparent p-0 disabled:cursor-not-allowed"
          defaultValue={value}
          disabled={disabled}
          id={`platform-${field}`}
          name={field}
          required
          type="color"
        />
        <span className="min-w-0 text-xs text-[var(--muted)]">
          Choose the default accent colour
        </span>
      </div>
      <FieldError error={error} field={field} />
    </label>
  );
}

function FieldError({
  error,
  field,
}: Readonly<{ error?: string; field: PlatformOnboardingDefaultsField }>) {
  return error ? (
    <span className="mt-2 block text-[10px] text-[#9b463b]" id={`${field}-error`}>
      {error}
    </span>
  ) : null;
}

function describedBy(
  field: PlatformOnboardingDefaultsField,
  state: Readonly<{
    fieldErrors?: Readonly<Partial<Record<PlatformOnboardingDefaultsField, string>>>;
  }>,
) {
  return state.fieldErrors?.[field] ? `${field}-error` : undefined;
}
