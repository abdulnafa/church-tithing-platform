"use client";

import { useMemo, useState } from "react";

import { ShieldIcon } from "@/components/icons";
import {
  DONOR_IDENTITY_LIMITS,
  getDonorDisplayNameError,
  getDonorEmailError,
  validateGuestIdentityValues,
  type GuestIdentityValues,
} from "@/lib/donor-identity";
import type {
  PublicGivingCampaignOption,
  PublicGivingChurch,
  PublicGivingFund,
} from "@/lib/public-giving";

type Frequency = "one_time" | "weekly" | "monthly";

type GivingFormProps = {
  churchName: string;
  currency: PublicGivingChurch["currency"];
  campaigns: readonly PublicGivingCampaignOption[];
  funds: readonly PublicGivingFund[];
};

const SUGGESTED_AMOUNTS = [25, 50, 100, 250] as const;
const FREQUENCIES = ["one_time", "weekly", "monthly"] as const;
const MAX_PREVIEW_AMOUNT = 1_000_000;

function formatAmount(
  currency: PublicGivingChurch["currency"],
  amount: number,
) {
  return `${currency} ${new Intl.NumberFormat("en-BB", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount)}`;
}

export function GivingForm({
  campaigns,
  churchName,
  currency,
  funds,
}: GivingFormProps) {
  const defaultFundId = funds.find((fund) => fund.isDefault)?.id ?? funds[0]?.id ?? "";
  const [amount, setAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState("");
  const [givingTarget, setGivingTarget] = useState(`fund:${defaultFundId}`);
  const [frequency, setFrequency] = useState<Frequency>("one_time");
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentityValues>({
    fullName: "",
    email: "",
  });
  const [touchedGuestFields, setTouchedGuestFields] = useState<
    Readonly<Record<keyof GuestIdentityValues, boolean>>
  >({ fullName: false, email: false });

  const selectedCampaign = givingTarget.startsWith("campaign:")
    ? campaigns.find(
        (campaign) => campaign.id === givingTarget.slice("campaign:".length),
      )
    : undefined;
  const selectedFundId = selectedCampaign?.fundId ?? givingTarget.slice("fund:".length);
  const selectedFund = funds.find((fund) => fund.id === selectedFundId);
  const selectedGivingName = selectedCampaign?.name ?? selectedFund?.name ?? "Giving option";
  const selectedGivingDescription =
    selectedCampaign?.description ?? selectedFund?.description;
  const parsedCustomAmount = Number(customAmount);
  const effectiveAmount = customAmount
    ? Number.isFinite(parsedCustomAmount) &&
      parsedCustomAmount > 0 &&
      parsedCustomAmount <= MAX_PREVIEW_AMOUNT
      ? parsedCustomAmount
      : 0
    : amount;
  const formattedAmount = useMemo(
    () => formatAmount(currency, effectiveAmount),
    [currency, effectiveAmount],
  );
  const guestIdentityValidation = validateGuestIdentityValues(guestIdentity);
  const guestNameError = touchedGuestFields.fullName
    ? getDonorDisplayNameError(guestIdentity.fullName)
    : undefined;
  const guestEmailError = touchedGuestFields.email
    ? getDonorEmailError(guestIdentity.email)
    : undefined;

  function chooseAmount(value: number) {
    setAmount(value);
    setCustomAmount("");
  }

  function updateGuestIdentity(
    field: keyof GuestIdentityValues,
    value: string,
  ) {
    setGuestIdentity((current) => ({ ...current, [field]: value }));
  }

  function markGuestFieldTouched(field: keyof GuestIdentityValues) {
    setTouchedGuestFields((current) => ({ ...current, [field]: true }));
  }

  if (funds.length === 0) {
    return (
      <section
        className="soft-card min-w-0 max-w-full rounded-[26px] p-6 sm:p-8"
        role="status"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          Giving unavailable
        </p>
        <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">
          No giving options are available yet.
        </h2>
        <p className="mt-4 break-words text-sm leading-6 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
          {churchName} has not published any funds for online giving. Please check
          again later.
        </p>
      </section>
    );
  }

  return (
    <section className="soft-card min-w-0 max-w-full overflow-hidden rounded-[26px] p-5 sm:p-8">
      <div
        className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-950"
        role="note"
      >
        Online payments are not enabled yet. The required name and email fields
        below are checked only in this page and are not sent or saved.
      </div>

      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
        Plan your gift
      </p>
      <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">
        Choose a giving option
      </h2>

      <fieldset className="mt-6">
        <legend className="mb-3 text-xs font-bold text-[var(--ink-soft)]">
          Amount
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SUGGESTED_AMOUNTS.map((value) => (
            <button
              aria-pressed={!customAmount && amount === value}
              className={`focus-ring min-w-0 rounded-2xl border px-2 py-3.5 text-sm font-bold transition sm:px-3 ${
                !customAmount && amount === value
                  ? "border-[var(--sage)] bg-[var(--sage-pale)] text-[var(--sage-dark)]"
                  : "border-[var(--line)] bg-white hover:border-[#b9c6c0]"
              }`}
              key={value}
              onClick={() => chooseAmount(value)}
              type="button"
            >
              {currency} ${value}
            </button>
          ))}
        </div>
        <label className="relative mt-2 block" htmlFor="giving-custom-amount">
          <span className="sr-only">Other amount in {currency}</span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--ink-soft)]"
          >
            $
          </span>
          <input
            className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white py-3.5 pl-8 pr-16 text-sm font-bold outline-none placeholder:font-normal"
            id="giving-custom-amount"
            inputMode="decimal"
            max={MAX_PREVIEW_AMOUNT}
            min="1"
            onChange={(event) => setCustomAmount(event.target.value)}
            placeholder="Other amount"
            step="0.01"
            type="number"
            value={customAmount}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--ink-soft)]"
          >
            {currency}
          </span>
        </label>
      </fieldset>

      <label className="mt-5 block" htmlFor="giving-target">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
          Give to
        </span>
        <select
          aria-describedby="giving-target-description"
          className="focus-ring min-w-0 max-w-full appearance-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm font-semibold outline-none"
          id="giving-target"
          onChange={(event) => setGivingTarget(event.target.value)}
          value={givingTarget}
        >
          <optgroup label="Funds">
            {funds.map((fund) => (
              <option key={fund.id} value={`fund:${fund.id}`}>
                {fund.name}
              </option>
            ))}
          </optgroup>
          {campaigns.length > 0 ? (
            <optgroup label="Campaigns">
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={`campaign:${campaign.id}`}>
                  {campaign.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <span
          className="mt-2 block min-h-5 break-words text-xs leading-5 text-[var(--ink-soft)] [overflow-wrap:anywhere]"
          id="giving-target-description"
        >
          {selectedGivingDescription ?? `Support ${churchName}.`}
        </span>
      </label>

      <fieldset className="mt-5">
        <legend className="mb-2 text-xs font-bold text-[var(--ink-soft)]">
          Intended frequency
        </legend>
        <div className="grid grid-cols-3 rounded-2xl bg-[#ece9e1] p-1">
          {FREQUENCIES.map((value) => (
            <button
              aria-pressed={frequency === value}
              className={`focus-ring rounded-xl px-2 py-3 text-xs font-bold capitalize transition ${
                frequency === value
                  ? "bg-white text-[var(--ink)] shadow-sm"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              key={value}
              onClick={() => setFrequency(value)}
              type="button"
            >
              {value === "one_time" ? "One time" : value}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[var(--ink-soft)]">
          Recurring options will depend on the approved payment provider.
        </p>
      </fieldset>

      <fieldset className="mt-6 rounded-[22px] border border-[var(--line)] bg-white/65 p-4 sm:p-5">
        <legend className="px-1 text-xs font-bold text-[var(--ink-soft)]">
          Guest details
        </legend>
        <p
          className="mb-4 text-[10px] leading-5 text-[var(--ink-soft)]"
          id="giving-guest-details-help"
        >
          Full name and email will be required for guest checkout. For now, they
          remain only in this unsaved page draft; no account lookup or donation
          submission occurs.
        </p>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0" htmlFor="giving-guest-name">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Full name
            </span>
            <input
              aria-describedby={[
                "giving-guest-details-help",
                guestNameError ? "giving-guest-name-error" : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-invalid={Boolean(guestNameError)}
              autoComplete="name"
              className="focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]"
              id="giving-guest-name"
              name="guestFullName"
              onBlur={() => markGuestFieldTouched("fullName")}
              onChange={(event) =>
                updateGuestIdentity("fullName", event.target.value)
              }
              placeholder="Your full name"
              required
              type="text"
              value={guestIdentity.fullName}
            />
            {guestNameError ? (
              <span
                className="mt-2 block text-[10px] text-[#9b463b]"
                id="giving-guest-name-error"
              >
                {guestNameError}
              </span>
            ) : null}
          </label>
          <label className="min-w-0" htmlFor="giving-guest-email">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">
              Email address
            </span>
            <input
              aria-describedby={[
                "giving-guest-details-help",
                guestEmailError ? "giving-guest-email-error" : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-invalid={Boolean(guestEmailError)}
              autoCapitalize="none"
              autoComplete="email"
              className="focus-ring min-w-0 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]"
              id="giving-guest-email"
              maxLength={DONOR_IDENTITY_LIMITS.email}
              name="guestEmail"
              onBlur={() => markGuestFieldTouched("email")}
              onChange={(event) =>
                updateGuestIdentity("email", event.target.value)
              }
              placeholder="you@example.com"
              required
              spellCheck={false}
              type="email"
              value={guestIdentity.email}
            />
            {guestEmailError ? (
              <span
                className="mt-2 block text-[10px] text-[#9b463b]"
                id="giving-guest-email-error"
              >
                {guestEmailError}
              </span>
            ) : null}
          </label>
        </div>
        <p
          aria-live="polite"
          className="mt-4 text-[10px] leading-5 text-[var(--ink-soft)]"
          role="status"
        >
          {guestIdentityValidation.success
            ? "These details look ready, but nothing has been submitted or saved."
            : "Complete both required fields before checkout is enabled in a later phase."}
        </p>
      </fieldset>

      <div className="mt-6 flex min-w-0 items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
        <div className="min-w-0">
          <p className="text-xs text-[var(--ink-soft)]">
            Planned {frequency === "one_time" ? "gift" : `${frequency} gift`}
          </p>
          <p className="mt-1 truncate text-sm font-semibold">{selectedGivingName}</p>
        </div>
        <p className="shrink-0 text-xl font-bold tracking-tight sm:text-2xl">
          {formattedAmount}
        </p>
      </div>

      <button
        className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-[#d6d9d7] px-5 py-4 text-sm font-bold text-[#59645f]"
        disabled
        type="button"
      >
        Online payments not yet available
      </button>
      <p className="mt-4 flex items-start justify-center gap-2 text-center text-[10px] font-medium leading-4 text-[var(--ink-soft)]">
        <ShieldIcon className="mt-0.5 shrink-0" size={13} />
        Name and email stay in this unsaved page draft. No prayer request or
        payment information is requested.
      </p>
    </section>
  );
}
