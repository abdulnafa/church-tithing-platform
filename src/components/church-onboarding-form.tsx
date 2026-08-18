"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, ShieldIcon } from "@/components/icons";

export function ChurchOnboardingForm() {
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submitted) {
    return (
      <section className="soft-card animate-rise rounded-[24px] p-6 sm:p-8">
        <span className="grid size-14 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage)]"><CheckIcon size={26} /></span>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">Preview complete</p>
        <h2 className="font-display mt-2 text-3xl tracking-[-0.035em]">Church setup captured.</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">This demo does not write tenant data. Once Supabase is connected, the same form will create the church workspace, default Tithes fund and permanent QR resolver in one transaction.</p>
        <div className="mt-6 rounded-2xl bg-[var(--gold-pale)] p-4 text-xs leading-5 text-[#79581f]">Live access remains disabled until subscription billing and the church&apos;s local merchant account have both been verified.</div>
        <Link className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--sage)] px-5 py-3 text-xs font-bold text-white" href="/platform">Return to platform <ArrowRightIcon size={15} /></Link>
      </section>
    );
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <section className="soft-card rounded-[24px] p-5 sm:p-7">
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">Step 1 · Church profile</p>
        <h2 className="mt-2 text-base font-bold">Basic information</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Church display name" name="name" placeholder="Harbour Grace Church" required />
          <Field label="Legal name" name="legalName" placeholder="Registered legal name" required />
          <Field label="Church email" name="email" placeholder="office@church.org" required type="email" />
          <Field label="Church phone" name="phone" placeholder="+1 (246) 000-0000" required type="tel" />
          <div className="sm:col-span-2"><Field label="Location" name="location" placeholder="City, parish, Barbados" required /></div>
        </div>
      </section>

      <section className="soft-card rounded-[24px] p-5 sm:p-7">
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">Step 2 · Giving identity</p>
        <h2 className="mt-2 text-base font-bold">URL, currency and branding</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Giving subdomain</span><div className="flex rounded-2xl border border-[var(--line)] bg-white"><input className="min-w-0 flex-1 rounded-l-2xl px-4 py-3.5 text-sm outline-none" defaultValue="harbour-grace" name="subdomain" pattern="[a-z0-9-]+" required /><span className="flex items-center border-l border-[var(--line)] px-3 text-[10px] text-[var(--muted)]">.platform-domain</span></div></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Default giving currency</span><select className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none" defaultValue="BBD" name="currency"><option value="BBD">BBD · Barbados dollar</option><option value="USD">USD · US dollar</option><option value="CAD">CAD · Canadian dollar</option><option value="XCD">XCD · East Caribbean dollar</option></select></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Primary colour</span><div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-2"><input className="size-9 cursor-pointer rounded-xl border-0 bg-transparent p-0" defaultValue="#1f6d60" name="primaryColor" type="color" /><span className="text-xs text-[var(--muted)]">Church page accent</span></div></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Logo</span><input accept="image/png,image/jpeg,image/svg+xml" className="block w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-3 text-[10px] text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--sage-pale)] file:px-3 file:py-1.5 file:text-[9px] file:font-bold file:text-[var(--sage-dark)]" name="logo" type="file" /></label>
          <label className="block sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Thank-you message</span><textarea className="focus-ring min-h-24 w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none" defaultValue="Thank you for giving generously. Your gift helps us serve our church and community." name="thankYouMessage" /></label>
        </div>
      </section>

      <section className="soft-card rounded-[24px] p-5 sm:p-7">
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--sage)]">Step 3 · Commercial setup</p>
        <h2 className="mt-2 text-base font-bold">Subscription and payments</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Summary label="Platform plan" value="USD $99 / month" /><Summary label="Free trial" value="None" /><Summary label="Donation gateway" value="Pending church provider" /><Summary label="Settlement" value="Direct to church" /></div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--sage-pale)] p-4"><input className="mt-0.5 size-4 accent-[var(--sage)]" required type="checkbox" /><span><span className="block text-xs font-bold">Keep live access disabled</span><span className="mt-1 block text-[10px] leading-5 text-[var(--muted)]">Required until SaaS billing, merchant approval, sandbox payment and webhook verification are complete.</span></span></label>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link className="focus-ring inline-flex items-center justify-center rounded-full border border-[var(--line)] bg-white px-5 py-3 text-xs font-bold" href="/platform">Cancel</Link><button className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-6 py-3 text-xs font-bold text-white" type="submit">Save pilot church <ArrowRightIcon size={15} /></button></div>
      <p className="flex items-start justify-center gap-2 text-center text-[9px] leading-4 text-[var(--muted)]"><ShieldIcon className="mt-0.5 shrink-0" size={13} /> No bank details or gateway secrets are collected in this form.</p>
    </form>
  );
}

function Field({ label, name, placeholder, required = false, type = "text" }: { label: string; name: string; placeholder: string; required?: boolean; type?: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">{label}</span><input className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]" name={name} placeholder={placeholder} required={required} type={type} /></label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[var(--line)] bg-white p-4"><p className="text-[9px] uppercase tracking-wider text-[var(--muted)]">{label}</p><p className="mt-2 text-xs font-bold">{value}</p></div>;
}
