"use client";

import Link from "next/link";
import { useActionState } from "react";

import { provisionChurchAction } from "@/app/platform/onboarding/actions";
import { ArrowRightIcon, CheckIcon, ShieldIcon } from "@/components/icons";
import {
  CHURCH_PROVISIONING_LIMITS,
  createInitialChurchProvisioningState,
  type ChurchProvisioningActionState,
  type ChurchProvisioningDefaults,
  type ChurchProvisioningField,
} from "@/lib/platform/church-provisioning";

type ChurchOnboardingFormProps = Readonly<{
  requestId: string;
  defaults: ChurchProvisioningDefaults;
}>;

const INPUT_CLASS =
  "focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]";

export function ChurchOnboardingForm({
  requestId,
  defaults,
}: ChurchOnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    provisionChurchAction,
    createInitialChurchProvisioningState(requestId, defaults),
  );

  if (state.status === "success" && state.result) {
    return <ProvisioningSuccess state={state} />;
  }

  const values = state.values;

  return (
    <form action={formAction} className="space-y-6">
      <input name="requestId" type="hidden" value={state.requestId} />

      <div aria-atomic="true" aria-live="polite">
        {state.status === "error" ? (
          <p
            className="rounded-2xl bg-[#f5e8e5] px-4 py-3 text-xs leading-5 text-[#9b463b]"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <fieldset className="soft-card rounded-[24px] p-5 sm:p-7">
        <legend className="sr-only">Church profile</legend>
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
          Step 1 | Church profile
        </p>
        <h2 className="mt-2 text-base font-bold">Church and owner details</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="organization"
            error={state.fieldErrors?.displayName}
            field="displayName"
            label="Church display name"
            maxLength={CHURCH_PROVISIONING_LIMITS.displayName}
            placeholder="Harbour Grace Church"
            value={values.displayName}
          />
          <TextField
            autoComplete="organization"
            error={state.fieldErrors?.legalName}
            field="legalName"
            label="Registered legal name"
            maxLength={CHURCH_PROVISIONING_LIMITS.legalName}
            placeholder="Registered legal name"
            value={values.legalName}
          />
          <TextField
            autoComplete="email"
            error={state.fieldErrors?.ownerEmail}
            field="ownerEmail"
            help="An existing active account is assigned now; otherwise owner access is reserved for this email."
            label="Owner email"
            maxLength={CHURCH_PROVISIONING_LIMITS.email}
            placeholder="owner@church.org"
            type="email"
            value={values.ownerEmail}
          />
          <TextField
            autoComplete="email"
            error={state.fieldErrors?.supportEmail}
            field="supportEmail"
            label="Church support email"
            maxLength={CHURCH_PROVISIONING_LIMITS.email}
            placeholder="office@church.org"
            type="email"
            value={values.supportEmail}
          />
        </div>
      </fieldset>

      <fieldset className="soft-card rounded-[24px] p-5 sm:p-7">
        <legend className="sr-only">Giving identity</legend>
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
          Step 2 | Giving identity
        </p>
        <h2 className="mt-2 text-base font-bold">
          Subdomain, currency, and church defaults
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block" htmlFor="church-slug">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Giving subdomain slug
            </span>
            <div className="flex rounded-2xl border border-[var(--line)] bg-white">
              <input
                aria-describedby={describedBy("slug", state, "church-slug-help")}
                aria-invalid={Boolean(state.fieldErrors?.slug)}
                autoCapitalize="none"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-l-2xl px-4 py-3.5 text-sm outline-none"
                defaultValue={values.slug}
                id="church-slug"
                maxLength={63}
                minLength={2}
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="harbour-grace"
                required
                spellCheck={false}
              />
              <span className="flex items-center border-l border-[var(--line)] px-3 text-[10px] text-[var(--muted)]">
                .platform-domain
              </span>
            </div>
            <span className="mt-2 block text-[10px] text-[var(--muted)]" id="church-slug-help">
              This reserves a slug only. The public resolver is enabled in a later task.
            </span>
            <FieldError error={state.fieldErrors?.slug} field="slug" />
          </label>

          <label className="block" htmlFor="church-currency">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Default giving currency
            </span>
            <select
              aria-describedby={describedBy("currency", state)}
              aria-invalid={Boolean(state.fieldErrors?.currency)}
              className={INPUT_CLASS}
              defaultValue={values.currency}
              id="church-currency"
              name="currency"
              required
            >
              <option value="BBD">BBD | Barbados dollar</option>
              <option value="USD">USD | US dollar</option>
              <option value="CAD">CAD | Canadian dollar</option>
              <option value="XCD">XCD | East Caribbean dollar</option>
            </select>
            <FieldError error={state.fieldErrors?.currency} field="currency" />
          </label>

          <label className="block sm:col-span-2" htmlFor="church-timezone">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              IANA timezone
            </span>
            <input
              aria-describedby={describedBy("timezone", state, "church-timezone-help")}
              aria-invalid={Boolean(state.fieldErrors?.timezone)}
              autoComplete="off"
              className={INPUT_CLASS}
              defaultValue={values.timezone}
              id="church-timezone"
              list="church-timezone-options"
              maxLength={CHURCH_PROVISIONING_LIMITS.timezone}
              name="timezone"
              placeholder="America/Barbados"
              required
              spellCheck={false}
            />
            <datalist id="church-timezone-options">
              <option value="America/Barbados" />
              <option value="America/Toronto" />
              <option value="America/New_York" />
              <option value="UTC" />
            </datalist>
            <span className="mt-2 block text-[10px] text-[var(--muted)]" id="church-timezone-help">
              Used for church reports and recurring schedule dates.
            </span>
            <FieldError error={state.fieldErrors?.timezone} field="timezone" />
          </label>

          <ColorField
            error={state.fieldErrors?.primaryColor}
            field="primaryColor"
            label="Primary colour"
            value={values.primaryColor}
          />
          <ColorField
            error={state.fieldErrors?.secondaryColor}
            field="secondaryColor"
            label="Secondary colour"
            value={values.secondaryColor}
          />

          <label className="block sm:col-span-2" htmlFor="thank-you-message">
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
              className={`${INPUT_CLASS} min-h-28 resize-y`}
              defaultValue={values.thankYouMessage}
              id="thank-you-message"
              maxLength={CHURCH_PROVISIONING_LIMITS.thankYouMessage}
              name="thankYouMessage"
            />
            <span className="mt-2 block text-[10px] text-[var(--muted)]" id="thank-you-message-help">
              Up to 500 characters. This can be updated later in Church Settings.
            </span>
            <FieldError
              error={state.fieldErrors?.thankYouMessage}
              field="thankYouMessage"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="soft-card rounded-[24px] p-5 sm:p-7">
        <legend className="sr-only">Launch control acknowledgement</legend>
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">
          Step 3 | Launch control
        </p>
        <h2 className="mt-2 text-base font-bold">Keep the church in onboarding</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Summary
            label="Planned platform plan"
            value="USD $99 / month - pending billing setup"
          />
          <Summary label="Workspace status" value="Onboarding" />
          <Summary label="Donation gateway" value="Not connected" />
          <Summary label="Settlement" value="Direct to church" />
        </div>
        <label
          className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--sage-pale)] p-4"
          htmlFor="onboarding-acknowledgement"
        >
          <input
            aria-describedby={describedBy("acknowledgement", state)}
            aria-invalid={Boolean(state.fieldErrors?.acknowledgement)}
            className="mt-0.5 size-4 accent-[var(--sage)]"
            defaultChecked={values.acknowledgement}
            id="onboarding-acknowledgement"
            name="acknowledgement"
            required
            type="checkbox"
          />
          <span>
            <span className="block text-xs font-bold">
              I understand that live giving stays disabled
            </span>
            <span className="mt-1 block text-[10px] leading-5 text-[var(--muted)]">
              The server always creates this workspace in onboarding status. Billing,
              merchant approval, sandbox payments, and webhook verification are separate.
            </span>
          </span>
        </label>
        <FieldError
          error={state.fieldErrors?.acknowledgement}
          field="acknowledgement"
        />
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          className="focus-ring inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-white px-5 py-3 text-xs font-bold"
          href="/platform"
        >
          Cancel
        </Link>
        <button
          aria-describedby="provisioning-submit-help"
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-65"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Creating church..." : "Create onboarding church"}
          {!isPending ? <ArrowRightIcon size={15} /> : null}
        </button>
      </div>
      <p
        className="flex items-start justify-center gap-2 text-center text-[9px] leading-4 text-[var(--muted)]"
        id="provisioning-submit-help"
      >
        <ShieldIcon className="mt-0.5 shrink-0" size={13} />
        No bank details, card data, provider secrets, or logo files are collected here.
      </p>
    </form>
  );
}

function ProvisioningSuccess({
  state,
}: Readonly<{ state: ChurchProvisioningActionState }>) {
  const result = state.result;
  if (!result) return null;

  return (
    <section
      aria-atomic="true"
      aria-live="polite"
      className="soft-card animate-rise rounded-[24px] p-6 sm:p-8"
    >
      <span className="grid size-14 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage)]">
        <CheckIcon size={26} />
      </span>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
        Church workspace created
      </p>
      <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">
        {result.displayName}
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
        {state.message} The database confirmed the required Tithes fund and one
        permanent QR record in the same transaction.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <ResultItem label="Reserved subdomain slug" value={result.slug} />
        <ResultItem label="Workspace status" value="Onboarding" />
        <ResultItem
          label="Owner access"
          value={
            result.ownerMembershipStatus === "active"
              ? "Active account assigned"
              : "Membership invitation reserved"
          }
        />
        <ResultItem label="Reserved QR code" value={result.qrShortCode} />
      </dl>

      {result.replayed ? (
        <p className="mt-5 rounded-2xl bg-[var(--sage-pale)] p-4 text-xs leading-5 text-[var(--sage-dark)]">
          This is the confirmed result of the original request. No duplicate church
          was created.
        </p>
      ) : null}

      <div className="mt-5 rounded-2xl bg-[var(--gold-pale)] p-4 text-xs leading-5 text-[#79581f]">
        No invitation email has been sent. The public QR resolver, logo upload,
        subscription billing, and donation provider setup are not enabled yet.
      </div>

      <Link
        className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white"
        href="/platform"
      >
        Return to platform <ArrowRightIcon size={15} />
      </Link>
    </section>
  );
}

type TextFieldProps = Readonly<{
  autoComplete?: string;
  error?: string;
  field: Extract<
    ChurchProvisioningField,
    "displayName" | "legalName" | "ownerEmail" | "supportEmail"
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
  const errorId = error ? `${field}-error` : undefined;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        {label}
      </span>
      <input
        aria-describedby={[helpId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className={INPUT_CLASS}
        defaultValue={value}
        id={inputId}
        maxLength={maxLength}
        name={field}
        placeholder={placeholder}
        required
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
  value,
}: Readonly<{
  error?: string;
  field: "primaryColor" | "secondaryColor";
  label: string;
  value: string;
}>) {
  const inputId = `church-${field}`;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
        {label}
      </span>
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-2">
        <input
          aria-describedby={error ? `${field}-error` : undefined}
          aria-invalid={Boolean(error)}
          className="size-9 cursor-pointer rounded-xl border-0 bg-transparent p-0"
          defaultValue={value}
          id={inputId}
          name={field}
          required
          type="color"
        />
        <span className="text-xs text-[var(--muted)]">Six-digit church accent colour</span>
      </div>
      <FieldError error={error} field={field} />
    </label>
  );
}

function FieldError({
  error,
  field,
}: Readonly<{ error?: string; field: ChurchProvisioningField }>) {
  return error ? (
    <span className="mt-2 block text-[10px] text-[#9b463b]" id={`${field}-error`}>
      {error}
    </span>
  ) : null;
}

function describedBy(
  field: ChurchProvisioningField,
  state: Pick<ChurchProvisioningActionState, "fieldErrors">,
  helpId?: string,
) {
  return [helpId, state.fieldErrors?.[field] ? `${field}-error` : undefined]
    .filter(Boolean)
    .join(" ") || undefined;
}

function Summary({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
      <p className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-xs font-bold">{value}</p>
    </div>
  );
}

function ResultItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
      <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-2 break-all text-xs font-bold text-[var(--ink)]">{value}</dd>
    </div>
  );
}
