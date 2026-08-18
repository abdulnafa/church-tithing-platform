"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Campaign, GivingFund } from "@/lib";
import { ArrowRightIcon, CheckIcon, ShieldIcon } from "@/components/icons";

type Frequency = "one_time" | "weekly" | "monthly";

type GivingFormProps = {
  churchName: string;
  currency: string;
  campaigns?: readonly Campaign[];
  funds: readonly GivingFund[];
};

const suggestedAmounts = [25, 50, 100, 250];

export function GivingForm({ campaigns = [], churchName, currency, funds }: GivingFormProps) {
  const [amount, setAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("");
  const defaultFundId = funds.find((fund) => fund.isDefault)?.id ?? funds[0]?.id ?? "";
  const [givingTarget, setGivingTarget] = useState(`fund:${defaultFundId}`);
  const [frequency, setFrequency] = useState<Frequency>("one_time");
  const [step, setStep] = useState<"gift" | "details" | "ready">("gift");
  const [hasPrayerRequest, setHasPrayerRequest] = useState(false);

  const selectedCampaign = givingTarget.startsWith("campaign:")
    ? campaigns.find((campaign) => campaign.id === givingTarget.slice("campaign:".length))
    : undefined;
  const selectedFundId = selectedCampaign?.fundId ?? givingTarget.slice("fund:".length);
  const selectedFund = funds.find((fund) => fund.id === selectedFundId);
  const selectedGivingName = selectedCampaign?.name ?? selectedFund?.name;
  const selectedGivingDescription = selectedCampaign?.description ?? selectedFund?.description;
  const effectiveAmount = customAmount ? Number(customAmount) || 0 : amount;
  const formattedAmount = useMemo(
    () => `${currency} ${new Intl.NumberFormat("en-BB", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(effectiveAmount)}`,
    [currency, effectiveAmount],
  );

  function chooseAmount(value: number) {
    setAmount(value);
    setCustomAmount("");
  }

  function handleDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (effectiveAmount > 0 && selectedFundId) setStep("details");
  }

  function handleDonor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("ready");
  }

  if (step === "ready") {
    return (
      <div className="soft-card animate-rise min-w-0 max-w-full rounded-[26px] p-6 sm:p-8">
        <div className="grid size-14 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage)]"><CheckIcon size={26} /></div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">Giving details ready</p>
        <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">Your secure checkout is next.</h2>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          The form has prepared a {formattedAmount} {frequency === "one_time" ? "gift" : frequency + " gift"} to {selectedGivingName}. Card collection will be enabled through the church&apos;s approved Barbados payment provider.
        </p>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Pilot mode: no card details are collected or stored in this demo.
        </div>
        <button className="focus-ring mt-6 w-full rounded-full bg-[var(--sage)] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)]" onClick={() => setStep("gift")} type="button">
          Return to giving form
        </button>
      </div>
    );
  }

  if (step === "details") {
    return (
      <form className="soft-card animate-rise min-w-0 max-w-full overflow-hidden rounded-[26px] p-5 sm:p-8" onSubmit={handleDonor}>
        <button className="focus-ring mb-5 rounded-lg text-xs font-bold text-[var(--sage)]" onClick={() => setStep("gift")} type="button">← Back to gift</button>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">Step 2 of 2</p>
        <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">About you</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">We use these details for your receipt and giving history.</p>
        <div className="mt-6 space-y-4">
          <Field label="Full name" name="name" placeholder="Your full name" required />
          <Field label="Email address" name="email" placeholder="you@example.com" required type="email" />
          <Field label="Phone number" name="phone" placeholder="+1 (246) 000-0000" required type="tel" />
          <label className="block">
            <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Message <span className="font-normal text-[var(--muted)]">(optional)</span></span>
            <textarea className="focus-ring min-h-24 w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none placeholder:text-[#a0a9b4]" placeholder={`Share a note with ${churchName}`} />
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
            <input className="mt-0.5 size-4 accent-[var(--sage)]" checked={hasPrayerRequest} onChange={(event) => setHasPrayerRequest(event.target.checked)} type="checkbox" />
            <span><span className="block text-sm font-bold">Include a prayer request</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Your request will be shared with authorised church staff.</span></span>
          </label>
          {hasPrayerRequest && (
            <label className="block animate-rise">
              <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Prayer request</span>
              <textarea className="focus-ring min-h-28 w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none" required />
              <span className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-[var(--muted)]"><ShieldIcon className="mt-0.5 shrink-0" size={13} /> By submitting, you consent to sharing this request with authorised church staff.</span>
            </label>
          )}
        </div>
        <div className="mt-6 rounded-2xl bg-[var(--sage-pale)] p-4">
          <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-[var(--muted)]">{selectedGivingName} · {frequency === "one_time" ? "One time" : frequency}</span><strong className="shrink-0">{formattedAmount}</strong></div>
        </div>
        <button className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)]" type="submit">Continue to secure payment <ArrowRightIcon size={18} /></button>
      </form>
    );
  }

  return (
    <form className="soft-card min-w-0 max-w-full overflow-hidden rounded-[26px] p-5 sm:p-8" onSubmit={handleDetails}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sage)]">Step 1 of 2</p>
      <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">Choose your gift</h2>
      <div className="mt-6">
        <p className="mb-3 text-xs font-bold text-[var(--ink-soft)]">Amount</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {suggestedAmounts.map((value) => (
            <button className={`focus-ring rounded-2xl border px-3 py-3.5 text-sm font-bold transition ${!customAmount && amount === value ? "border-[var(--sage)] bg-[var(--sage-pale)] text-[var(--sage-dark)]" : "border-[var(--line)] bg-white hover:border-[#b9c6c0]"}`} key={value} onClick={() => chooseAmount(value)} type="button">
              {currency} ${value}
            </button>
          ))}
        </div>
        <label className="relative mt-2 block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--muted)]">$</span>
          <input className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white py-3.5 pl-8 pr-16 text-sm font-bold outline-none placeholder:font-normal" inputMode="decimal" min="1" onChange={(event) => setCustomAmount(event.target.value)} placeholder="Other amount" step="0.01" type="number" value={customAmount} />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--muted)]">{currency}</span>
        </label>
      </div>

      <label className="mt-5 block">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Give to</span>
        <select className="focus-ring w-full appearance-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm font-semibold outline-none" onChange={(event) => setGivingTarget(event.target.value)} value={givingTarget}>
          <optgroup label="Funds">
            {funds.filter((fund) => fund.isActive).map((fund) => <option key={fund.id} value={`fund:${fund.id}`}>{fund.name}</option>)}
          </optgroup>
          {campaigns.length > 0 && <optgroup label="Campaigns">{campaigns.filter((campaign) => campaign.status === "active").map((campaign) => <option key={campaign.id} value={`campaign:${campaign.id}`}>{campaign.name}</option>)}</optgroup>}
        </select>
        <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">{selectedGivingDescription}</span>
      </label>

      <div className="mt-5">
        <p className="mb-2 text-xs font-bold text-[var(--ink-soft)]">Frequency</p>
        <div className="grid grid-cols-3 rounded-2xl bg-[#ece9e1] p-1">
          {(["one_time", "weekly", "monthly"] as const).map((value) => (
            <button className={`focus-ring rounded-xl px-2 py-3 text-xs font-bold capitalize transition ${frequency === value ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`} key={value} onClick={() => setFrequency(value)} type="button">{value === "one_time" ? "One time" : value}</button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><div className="min-w-0"><p className="text-xs text-[var(--muted)]">Your {frequency === "one_time" ? "gift" : frequency + " gift"}</p><p className="mt-1 truncate text-sm font-semibold">{selectedGivingName}</p></div><p className="shrink-0 text-xl font-bold tracking-tight sm:text-2xl">{formattedAmount}</p></div>
      <button className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)] disabled:cursor-not-allowed disabled:opacity-50" disabled={effectiveAmount <= 0 || !selectedFundId} type="submit">Continue <ArrowRightIcon size={18} /></button>
      <p className="mt-4 flex items-center justify-center gap-2 text-[10px] font-medium text-[var(--muted)]"><ShieldIcon size={13} /> Payment is handled by the church&apos;s secure provider</p>
    </form>
  );
}

function Field({ label, name, placeholder, type = "text", required = false }: { label: string; name: string; placeholder: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">{label}</span>
      <input className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]" name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}
