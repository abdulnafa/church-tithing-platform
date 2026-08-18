import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader } from "@/components/dashboard-shell";
import { GivingQr } from "@/components/giving-qr";
import { ArrowRightIcon, CheckIcon, QrIcon, ShieldIcon } from "@/components/icons";
import { demoChurch, demoQrCode } from "@/lib";
import { getPublicAppUrl, isLocalAppUrl } from "@/lib/public-app-url";

export const metadata: Metadata = {
  title: "Church giving QR",
  description: "Download and manage the permanent giving QR code for Harbour Grace Church.",
};

const printChecklist = [
  "Keep a clear white border around the code.",
  "Print at least 3 cm wide for handouts and pew cards.",
  "Test the final printed version with two different phones.",
  "Place a short giving instruction beside the QR code.",
] as const;

export default function ChurchQrPage() {
  const appUrl = getPublicAppUrl();
  const givingUrl = `${appUrl}/q/${demoQrCode}`;

  return (
    <main className="mx-auto max-w-[1180px] pb-24">
        <div className="mb-6 lg:hidden">
          <p className="text-xs text-[var(--muted)]">Sunday ready</p>
          <h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Giving QR</h1>
        </div>

        <section className="mb-6 flex flex-col gap-4 rounded-[22px] bg-[var(--ink)] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#2f796b]"><QrIcon size={20} /></span>
            <div>
              <p className="text-sm font-bold">One permanent QR code</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/60">Use this resolver code on screens, bulletins and signage. Its destination can be updated later without reprinting the artwork.</p>
            </div>
          </div>
          <Link className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold !text-[#122235]" href={`/give/${demoChurch.slug}`}>
            Preview giving page <ArrowRightIcon size={15} />
          </Link>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,.85fr)_minmax(0,1.15fr)]">
          <section className="soft-card rounded-[24px] p-5 sm:p-7">
            <SectionHeader eyebrow="Download" title="Harbour Grace giving code" />
            <div className="mt-6 rounded-[24px] bg-[#eeece5] p-5 text-center sm:p-8">
              <GivingQr churchName={demoChurch.name} value={givingUrl} />
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Encoded destination</p>
              <p className="mt-2 break-all text-[10px] leading-5 text-[var(--ink-soft)]">{givingUrl}</p>
            </div>
            {isLocalAppUrl(appUrl) && (
              <p className="mt-3 rounded-xl bg-[var(--gold-pale)] px-3 py-2.5 text-center text-[10px] leading-4 text-[#8a641f]">Local preview QR. Set NEXT_PUBLIC_APP_URL to the approved public domain before printing.</p>
            )}
          </section>

          <div className="space-y-6">
            <section className="soft-card rounded-[24px] p-5 sm:p-7">
              <SectionHeader eyebrow="Status" title="QR destination" />
              <dl className="mt-5 divide-y divide-[var(--line)]">
                <div className="flex items-start justify-between gap-5 py-4 first:pt-0">
                  <dt>
                    <p className="text-xs font-bold">Permanent resolver</p>
                    <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">The short route printed inside the code.</p>
                  </dt>
                  <dd className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sage-pale)] px-3 py-1.5 text-[9px] font-bold text-[var(--sage-dark)]"><CheckIcon size={13} /> Active</dd>
                </div>
                <div className="flex items-start justify-between gap-5 py-4">
                  <dt>
                    <p className="text-xs font-bold">Destination page</p>
                    <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Public church giving homepage.</p>
                  </dt>
                  <dd className="max-w-44 break-all text-right text-[10px] font-semibold text-[var(--sage-dark)]">/give/{demoChurch.slug}</dd>
                </div>
                <div className="flex items-start justify-between gap-5 py-4 last:pb-0">
                  <dt>
                    <p className="text-xs font-bold">Checkout status</p>
                    <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">Requires verified merchant connection.</p>
                  </dt>
                  <dd className="rounded-full bg-[var(--gold-pale)] px-3 py-1.5 text-[9px] font-bold text-[#8b621f]">Preview only</dd>
                </div>
              </dl>
            </section>

            <section className="soft-card rounded-[24px] p-5 sm:p-7">
              <SectionHeader eyebrow="Print guide" title="Before you publish" />
              <ul className="mt-5 space-y-3">
                {printChecklist.map((item) => (
                  <li className="flex items-start gap-3 rounded-2xl bg-[#f3f1eb] px-4 py-3" key={item}>
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--sage)] text-white"><CheckIcon size={12} /></span>
                    <span className="text-[11px] leading-5 text-[var(--ink-soft)]">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[24px] border border-[#c9dbd4] bg-[var(--sage-pale)] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-[var(--sage-dark)]"><ShieldIcon size={19} /></span>
                <div>
                  <h2 className="text-sm font-bold">Safe to reuse</h2>
                  <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">The QR stores only the public resolver URL. It contains no member, card or merchant credentials.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
    </main>
  );
}
