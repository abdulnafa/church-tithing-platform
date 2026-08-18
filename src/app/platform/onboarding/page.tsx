import { ChurchOnboardingForm } from "@/components/church-onboarding-form";
import { DashboardShell, SectionHeader } from "@/components/dashboard-shell";
import { CheckIcon } from "@/components/icons";

const outcomes = ["Creates a church-scoped workspace", "Adds the default Tithes fund", "Reserves a permanent QR resolver", "Keeps checkout disabled until verification"];

export default function ChurchOnboardingPage() {
  return (
    <DashboardShell kind="platform" subtitle="Manual setup · Super Admin only" title="Add a church">
      <div className="mx-auto grid max-w-6xl gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div><div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">New tenant</p><h1 className="font-display mt-2 text-3xl tracking-[-0.035em]">Set up a church workspace.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Capture the non-sensitive details needed to prepare a pilot church. Merchant credentials are configured separately through the approved provider.</p></div><ChurchOnboardingForm /></div>
        <aside className="soft-card rounded-[22px] p-5 lg:sticky lg:top-24"><SectionHeader eyebrow="On save" title="What this prepares" /><div className="mt-5 space-y-3">{outcomes.map((outcome) => <p className="flex items-start gap-2 text-[10px] leading-5 text-[var(--muted)]" key={outcome}><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage)]"><CheckIcon size={12} /></span>{outcome}</p>)}</div><div className="mt-6 rounded-2xl bg-[var(--gold-pale)] p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-[#8a641f]">Still required</p><p className="mt-2 text-[10px] leading-5 text-[#79581f]">Client-approved domain, Stripe subscription keys, local provider contract, sandbox merchant account and email provider.</p></div></aside>
      </div>
    </DashboardShell>
  );
}
