"use client";

import Image from "next/image";
import { useActionState } from "react";

import { updateChurchSettingsAction } from "@/app/church/settings/actions";
import { CheckIcon, ShieldIcon } from "@/components/icons";
import {
  CHURCH_SETTINGS_LIMITS,
  createInitialChurchSettingsState,
  type ChurchSettingsActionState,
  type ChurchSettingsField,
  type ChurchSettingsSnapshot,
} from "@/lib/church-settings";

type ChurchSettingsFormProps = Readonly<{
  requestId: string;
  settings: ChurchSettingsSnapshot;
  logoPublicUrl: string | null;
}>;

const INPUT_CLASS =
  "focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]";
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function ChurchSettingsForm({
  requestId,
  settings,
  logoPublicUrl,
}: ChurchSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateChurchSettingsAction,
    createInitialChurchSettingsState(requestId, settings, logoPublicUrl),
  );
  const values = state.values;

  return (
    <form
      action={formAction}
      className="min-w-0 space-y-6"
      key={state.responseEpoch}
    >
      <input name="requestId" type="hidden" value={state.requestId} />
      <input
        name="expectedSettingsRevision"
        type="hidden"
        value={state.settingsRevision}
      />

      <div aria-atomic="true" aria-live="polite">
        {state.status !== "idle" ? (
          <p
            className={`rounded-2xl px-4 py-3 text-xs leading-5 ${
              state.status === "success"
                ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]"
                : "bg-[#f5e8e5] text-[#9b463b]"
            }`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      {state.retryLogoAction ? (
        <div className="rounded-2xl bg-[var(--gold-pale)] p-4 text-xs leading-5 text-[#79581f]">
          <p>
            This request has an unconfirmed settings save. Do not change the
            fields or reload this page until the same request reaches a confirmed
            result. If a replacement file picker is empty, select the same logo
            again before retrying.
          </p>
        </div>
      ) : null}

      <fieldset className="soft-card rounded-[24px] p-5 sm:p-7">
        <legend className="sr-only">Church profile</legend>
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
          Profile
        </p>
        <h2 className="mt-2 text-base font-bold">Church identity and contact</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          These details are stored for this church and used in future giving and
          receipt experiences.
        </p>

        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="organization"
            error={state.fieldErrors?.displayName}
            field="displayName"
            label="Church display name"
            maxLength={CHURCH_SETTINGS_LIMITS.displayName}
            placeholder="Harbour Grace Church"
            value={values.displayName}
          />
          <TextField
            autoComplete="organization"
            error={state.fieldErrors?.legalName}
            field="legalName"
            label="Registered legal name"
            maxLength={CHURCH_SETTINGS_LIMITS.legalName}
            placeholder="Registered legal name"
            value={values.legalName}
          />
          <TextField
            autoComplete="email"
            error={state.fieldErrors?.supportEmail}
            field="supportEmail"
            label="Church support email"
            maxLength={CHURCH_SETTINGS_LIMITS.email}
            placeholder="office@church.org"
            type="email"
            value={values.supportEmail}
          />
          <TextField
            autoComplete="off"
            error={state.fieldErrors?.timezone}
            field="timezone"
            help="Use an IANA timezone such as America/Barbados."
            label="Timezone"
            maxLength={CHURCH_SETTINGS_LIMITS.timezone}
            placeholder="America/Barbados"
            value={values.timezone}
          />
        </div>
      </fieldset>

      <fieldset className="soft-card rounded-[24px] p-5 sm:p-7">
        <legend className="sr-only">Church branding</legend>
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
          Branding
        </p>
        <h2 className="mt-2 text-base font-bold">Logo, colours, and thank-you</h2>

        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="grid size-28 place-items-center overflow-hidden rounded-[24px] border border-[var(--line)] bg-[#f3f1eb]">
              {state.logoPublicUrl ? (
                <Image
                  alt={`${values.displayName || "Church"} logo`}
                  className="size-full object-contain p-2"
                  height={112}
                  sizes="112px"
                  src={state.logoPublicUrl}
                  unoptimized
                  width={112}
                />
              ) : (
                <span
                  aria-label="No church logo uploaded"
                  className="text-xl font-bold text-[var(--sage-dark)]"
                  role="img"
                >
                  {getInitials(values.displayName)}
                </span>
              )}
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[var(--muted)]">
              {state.logoPublicUrl ? "Current stored logo" : "Initials placeholder"}
            </p>
          </div>

          <div className="min-w-0 space-y-4">
            <label className="block min-w-0" htmlFor="church-logo">
              <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
                Replace logo
              </span>
              <input
                accept="image/png,image/jpeg,image/webp"
                aria-describedby={describedBy(
                  "logo",
                  state,
                  "church-logo-help",
                )}
                aria-invalid={Boolean(state.fieldErrors?.logo)}
                className="focus-ring block min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-3 text-[10px] text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--sage-pale)] file:px-3 file:py-1.5 file:text-[9px] file:font-bold file:text-[var(--sage-dark)]"
                id="church-logo"
                name="logo"
                type="file"
              />
              <span
                className="mt-2 block text-[10px] leading-5 text-[var(--muted)]"
                id="church-logo-help"
              >
                PNG, JPEG, or WebP under 750 KB. The server removes metadata,
                rejects animation, and stores a bounded WebP copy only.
              </span>
              <FieldError error={state.fieldErrors?.logo} field="logo" />
            </label>

            <label
              className={`flex items-start gap-3 rounded-2xl border border-[var(--line)] p-4 ${
                state.logoPublicUrl ? "cursor-pointer bg-white" : "bg-[#f3f1eb]"
              }`}
              htmlFor="remove-church-logo"
            >
              <input
                className="mt-0.5 size-4 accent-[var(--sage)]"
                defaultChecked={values.removeLogo}
                disabled={!state.logoPublicUrl}
                id="remove-church-logo"
                name="removeLogo"
                type="checkbox"
              />
              <span>
                <span className="block text-xs font-bold">Remove current logo</span>
                <span className="mt-1 block text-[10px] leading-5 text-[var(--muted)]">
                  Logo removal is applied only after the database confirms the
                  settings revision.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          <ColorField
            error={state.fieldErrors?.primaryColor}
            field="primaryColor"
            label="Primary colour (optional)"
            placeholder="#1F6D60"
            value={values.primaryColor}
          />
          <ColorField
            error={state.fieldErrors?.secondaryColor}
            field="secondaryColor"
            label="Secondary colour (optional)"
            placeholder="#E1B85A"
            value={values.secondaryColor}
          />

          <label className="block min-w-0 sm:col-span-2" htmlFor="thank-you-message">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Thank-you message (optional)
            </span>
            <textarea
              aria-describedby={describedBy(
                "thankYouMessage",
                state,
                "thank-you-message-help",
              )}
              aria-invalid={Boolean(state.fieldErrors?.thankYouMessage)}
              className={`${INPUT_CLASS} min-h-32 resize-y`}
              defaultValue={values.thankYouMessage}
              id="thank-you-message"
              maxLength={CHURCH_SETTINGS_LIMITS.thankYouMessage}
              name="thankYouMessage"
            />
            <span
              className="mt-2 block text-[10px] text-[var(--muted)]"
              id="thank-you-message-help"
            >
              Plain text, up to 500 characters. It will be used after the real
              giving flow is connected.
            </span>
            <FieldError
              error={state.fieldErrors?.thankYouMessage}
              field="thankYouMessage"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-[9px] leading-4 text-[var(--muted)]">
          <ShieldIcon className="mt-0.5 shrink-0" size={13} />
          Only the church owner can save these settings in the current release.
        </p>
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? "Saving settings..."
            : state.retryLogoAction
              ? "Retry same request"
              : "Save church settings"}
          {!isPending ? <CheckIcon size={15} /> : null}
        </button>
      </div>
    </form>
  );
}

type TextFieldProps = Readonly<{
  autoComplete?: string;
  error?: string;
  field: Extract<
    ChurchSettingsField,
    "displayName" | "legalName" | "supportEmail" | "timezone"
  >;
  help?: string;
  label: string;
  maxLength: number;
  placeholder: string;
  type?: "email" | "text";
  value: string;
}>;

function TextField({
  autoComplete,
  error,
  field,
  help,
  label,
  maxLength,
  placeholder,
  type = "text",
  value,
}: TextFieldProps) {
  const inputId = `church-${field}`;
  const helpId = help ? `${field}-help` : undefined;

  return (
    <label className="block min-w-0" htmlFor={inputId}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        {label}
      </span>
      <input
        aria-describedby={describedById(field, error, helpId)}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className={INPUT_CLASS}
        defaultValue={value}
        id={inputId}
        maxLength={maxLength}
        name={field}
        placeholder={placeholder}
        required
        spellCheck={field === "timezone" ? false : undefined}
        type={type}
      />
      {help ? (
        <span className="mt-2 block text-[10px] text-[var(--muted)]" id={helpId}>
          {help}
        </span>
      ) : null}
      <FieldError error={error} field={field} />
    </label>
  );
}

function ColorField({
  error,
  field,
  label,
  placeholder,
  value,
}: Readonly<{
  error?: string;
  field: "primaryColor" | "secondaryColor";
  label: string;
  placeholder: string;
  value: string;
}>) {
  const inputId = `church-${field}`;
  const safePreview = HEX_COLOR_PATTERN.test(value) ? value : "transparent";

  return (
    <label className="block min-w-0" htmlFor={inputId}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3">
        <span
          aria-hidden="true"
          className="size-7 shrink-0 rounded-full border border-[var(--line)]"
          style={{ backgroundColor: safePreview }}
        />
        <input
          aria-describedby={error ? `${field}-error` : undefined}
          aria-invalid={Boolean(error)}
          autoCapitalize="characters"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm uppercase outline-none"
          defaultValue={value}
          id={inputId}
          maxLength={7}
          name={field}
          pattern="^#[0-9A-Fa-f]{6}$"
          placeholder={placeholder}
          spellCheck={false}
          type="text"
        />
      </span>
      <FieldError error={error} field={field} />
    </label>
  );
}

function FieldError({
  error,
  field,
}: Readonly<{ error?: string; field: ChurchSettingsField }>) {
  return error ? (
    <span className="mt-2 block text-[10px] text-[#9b463b]" id={`${field}-error`}>
      {error}
    </span>
  ) : null;
}

function describedBy(
  field: ChurchSettingsField,
  state: Pick<ChurchSettingsActionState, "fieldErrors">,
  helpId?: string,
) {
  return describedById(field, state.fieldErrors?.[field], helpId);
}

function describedById(
  field: ChurchSettingsField,
  error: string | undefined,
  helpId?: string,
) {
  return [helpId, error ? `${field}-error` : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "CH";
}
