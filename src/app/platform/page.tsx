import Link from "next/link";
import { DashboardShell, SectionHeader, StatCard } from "@/components/dashboard-shell";
import { ArrowRightIcon, CardIcon, ChartIcon, CheckIcon, HeartIcon, SettingsIcon, ShieldIcon, UsersIcon } from "@/components/icons";
import { demoChurch, demoGivingSummary, formatMoney } from "@/lib";

const churches = [
  { name: "Harbour Grace Church", location: "Bridgetown, Barbados", status: "Pilot preview", subscription: "Test mode", provider: "Mock adapter", volume: "BBD $1,275", initials: "HG" },
  { name: "New Life Fellowship", location: "St. Michael, Barbados", status: "Onboarding", subscription: "Pending", provider: "Not connected", volume: "—", initials: "NL" },
  { name: "St. James Community", location: "Holetown, Barbados", status: "Demo booked", subscription: "Not started", provider: "Not connected", volume: "—", initials: "SJ" },
] as const;

const onboardingSteps = [
  ["Church profile", "Complete"],
  ["Subscription", "Complete"],
  ["Local merchant connection", "Waiting"],
  ["Test donation and webhook", "Waiting"],
  ["Go-live review", "Waiting"],
] as const;

export default function PlatformDashboardPage() {
  return (
    <DashboardShell kind="platform" subtitle="Pilot control centre · Barbados" title="Platform overview">
      <div className="mx-auto max-w-[1320px] pb-24">
        <div className="mb-7 lg:hidden"><p className="text-xs text-[var(--muted)]">Tuesday, 18 August</p><h1 className="font-display mt-1 text-3xl tracking-[-0.035em]">Platform overview</h1></div>

        <section className="mb-6 grid gap-4 rounded-[22px] border border-[#cddfd8] bg-[var(--sage-pale)] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--sage)] text-white"><ShieldIcon size={19} /></span><div><p className="text-sm font-bold">Option A architecture is enforced</p><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">Stripe bills churches for the platform subscription only. Donor funds use each church&apos;s own merchant account and never enter the platform&apos;s balance.</p></div></div>
          <span className="w-fit rounded-full bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--sage-dark)]">Direct settlement</span>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<UsersIcon size={19} />} label="Church pipeline" note="1 preview · 2 in progress" value="3" />
          <StatCard icon={<CardIcon size={19} />} label="Plan price" note="Canadian Stripe · test mode" tone="gold" value="USD $99" />
          <StatCard icon={<HeartIcon size={19} />} label="Demo donation volume" note="Seeded data · never held" tone="blue" value={formatMoney(demoGivingSummary.total)} />
          <StatCard icon={<ChartIcon size={19} />} label="Launch controls" note="2 of 5 complete" tone="coral" value="40%" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="min-w-0 space-y-6">
            <section className="soft-card rounded-[22px] p-5 sm:p-6" id="churches">
              <SectionHeader action={<Link className="focus-ring rounded-full bg-[var(--ink)] px-4 py-2.5 text-[10px] font-bold !text-white" href="/platform/onboarding">+ Add church</Link>} eyebrow="Tenant management" title="Churches" />
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[700px] table-fixed border-collapse text-left">
                  <thead><tr className="border-b border-[var(--line)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]"><th className="w-[30%] px-2 py-3">Church</th><th className="w-[16%] px-2 py-3">Access</th><th className="w-[16%] px-2 py-3">Subscription</th><th className="w-[20%] px-2 py-3">Donation provider</th><th className="w-[18%] whitespace-nowrap px-2 py-3 text-right">7-day giving</th></tr></thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {churches.map((church, index) => (
                      <tr className="text-xs" key={church.name}>
                        <td className="px-2 py-4"><div className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl text-[9px] font-bold ${index === 0 ? "bg-[var(--sage)] text-white" : "bg-[#ece9e1] text-[var(--ink-soft)]"}`}>{church.initials}</span><div><p className="font-bold">{church.name}</p><p className="mt-1 text-[9px] text-[var(--muted)]">{church.location}</p></div></div></td>
                        <td className="px-2 py-4"><Status value={church.status} /></td>
                        <td className="px-2 py-4 font-semibold">{church.subscription}</td>
                        <td className="px-2 py-4 text-[var(--muted)]">{church.provider}</td>
                        <td className="whitespace-nowrap px-2 py-4 text-right font-bold">{church.volume}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2" id="reports">
              <article className="soft-card rounded-[22px] p-5 sm:p-6">
                <SectionHeader eyebrow="Money flow 01" title="Platform subscription" />
                <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[var(--gold-pale)] p-4"><span className="grid size-11 place-items-center rounded-2xl bg-white text-[#a97722]"><CardIcon size={20} /></span><div><p className="text-sm font-bold">USD $99 / church / month</p><p className="mt-1 text-[10px] text-[var(--muted)]">Charged through the platform&apos;s Canadian Stripe account</p></div></div>
                <div className="mt-5 space-y-3 text-[10px]"><FlowRow label="Active subscriptions" value="1" /><FlowRow label="Next renewal" value="1 Sep 2026" /><FlowRow label="Past due" value="0" /></div>
              </article>
              <article className="soft-card rounded-[22px] p-5 sm:p-6">
                <SectionHeader eyebrow="Money flow 02" title="Church donations" />
                <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[var(--sage-pale)] p-4"><span className="grid size-11 place-items-center rounded-2xl bg-white text-[var(--sage)]"><HeartIcon size={20} /></span><div><p className="text-sm font-bold">Direct to each church</p><p className="mt-1 text-[10px] text-[var(--muted)]">Platform observes provider status; it does not custody funds</p></div></div>
                <div className="mt-5 space-y-3 text-[10px]"><FlowRow label="Gross giving observed" value={formatMoney(demoGivingSummary.total)} /><FlowRow label="Platform balance" value="BBD $0.00" /><FlowRow label="Connected live gateways" value="0" /></div>
              </article>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="soft-card rounded-[22px] p-5 sm:p-6">
              <SectionHeader eyebrow="Pilot church" title="Launch checklist" />
              <div className="mt-5 space-y-1">
                {onboardingSteps.map(([label, status], index) => (
                  <div className="flex items-center gap-3 py-2.5" key={label}>
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[9px] font-bold ${status === "Complete" ? "bg-[var(--sage)] text-white" : "border border-[var(--line)] bg-white text-[var(--muted)]"}`}>{status === "Complete" ? <CheckIcon size={14} /> : index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-bold">{label}</p><p className={`mt-0.5 text-[8px] font-bold uppercase tracking-wider ${status === "Complete" ? "text-[var(--sage)]" : "text-[#b27d25]"}`}>{status}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ece9e1]"><div className="h-full w-2/5 rounded-full bg-[var(--sage)]" /></div>
              <p className="mt-2 text-[9px] text-[var(--muted)]">2 of 5 launch controls complete</p>
            </section>

            <section className="rounded-[22px] bg-[var(--ink)] p-5 text-white" id="settings">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-white/[0.08] text-[#b9d7cb]"><SettingsIcon size={19} /></span><div><p className="text-xs font-bold">Integration status</p><p className="mt-1 text-[9px] text-white/45">Production services</p></div></div>
              <div className="mt-5 space-y-2"><Integration label="Supabase" status="Configuration needed" /><Integration label="Stripe SaaS billing" status="Test keys needed" /><Integration label="Donation gateway" status="Provider decision needed" /><Integration label="Transactional email" status="Provider decision needed" /></div>
            </section>

            <section className="soft-card rounded-[22px] p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--sage)]">Pilot tenant</p>
              <h2 className="mt-2 text-sm font-bold">{demoChurch.name}</h2>
              <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">Review the church workspace and the full donor experience using seeded pilot data.</p>
              <Link className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-4 py-3 text-[10px] font-bold text-white" href="/church">Open church workspace <ArrowRightIcon size={15} /></Link>
            </section>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}

function Status({ value }: { value: string }) {
  const active = value === "Active";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[8px] font-bold uppercase ${active ? "bg-[var(--sage-pale)] text-[var(--sage-dark)]" : "bg-[var(--gold-pale)] text-[#95691f]"}`}><span className={`size-1.5 rounded-full ${active ? "bg-[var(--sage)]" : "bg-[var(--gold)]"}`} />{value}</span>;
}

function FlowRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"><span className="text-[var(--muted)]">{label}</span><strong>{value}</strong></div>;
}

function Integration({ label, status }: { label: string; status: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.055] px-3 py-3"><span className="text-[9px] font-bold">{label}</span><span className="max-w-28 text-right text-[8px] text-[#e0bd7b]">{status}</span></div>;
}
