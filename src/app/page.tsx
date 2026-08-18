import Link from "next/link";
import { Brand, ChurchMark } from "@/components/brand";
import { ArrowRightIcon, ChartIcon, CheckIcon, HeartIcon, QrIcon, ShieldIcon, UsersIcon } from "@/components/icons";

const features = [
  { icon: QrIcon, title: "One scan to give", copy: "A permanent QR code opens a fast, church-branded giving page—no app required." },
  { icon: HeartIcon, title: "Giving that keeps going", copy: "Members can give once or create weekly and monthly gifts they control themselves." },
  { icon: ChartIcon, title: "Clarity for every church", copy: "Live totals, campaign progress, donor records and clean CSV reports in one place." },
];

const steps = [
  ["01", "Scan", "Open the church giving page from a QR code or direct link."],
  ["02", "Choose", "Select a fund, amount and one-time or recurring frequency."],
  ["03", "Give", "Complete secure card payment and receive a receipt instantly."],
];

export default function Home() {
  return (
    <main className="overflow-hidden bg-[var(--cream)]">
      <section className="relative min-h-[780px] bg-[var(--ink)] text-white">
        <div className="noise absolute inset-0" />
        <div className="absolute -left-32 top-40 size-[420px] rounded-full bg-[var(--sage)]/30 blur-[90px]" />
        <div className="absolute -right-48 -top-32 size-[560px] rounded-full bg-[var(--gold)]/20 blur-[120px]" />
        <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-12">
          <Brand inverted />
          <div className="hidden items-center gap-8 text-sm font-medium text-white/70 md:flex">
            <a className="transition hover:text-white" href="#how-it-works">How it works</a>
            <a className="transition hover:text-white" href="#features">Features</a>
            <Link className="transition hover:text-white" href="/church">Dashboard demo</Link>
          </div>
          <Link className="focus-ring rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white hover:text-[var(--ink)]" href="/login">Sign in</Link>
        </nav>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.04fr_.96fr] lg:px-12 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl animate-rise">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold tracking-wide text-white/80">
              <span className="size-1.5 rounded-full bg-[var(--gold)]" /> Simple digital giving for modern churches
            </div>
            <h1 className="font-display max-w-xl text-5xl leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[74px]">Generosity,<span className="block text-[#c9e0d7]">made effortless.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/66 sm:text-xl">Give in seconds. Stay connected to what matters. Help your church grow with a secure platform built for every generation.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link className="focus-ring inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[var(--gold)] px-7 text-sm font-bold text-[var(--ink)] transition hover:-translate-y-0.5 hover:bg-[#e1b665]" href="/give/harbour-grace">Preview giving page <ArrowRightIcon size={18} /></Link>
              <Link className="focus-ring inline-flex h-13 items-center justify-center rounded-full border border-white/20 px-7 text-sm font-semibold text-white transition hover:bg-white/10" href="/church">Explore church dashboard</Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-white/55">
              <span className="inline-flex items-center gap-2"><CheckIcon className="text-[#9dd0bd]" size={16} /> No app download</span>
              <span className="inline-flex items-center gap-2"><CheckIcon className="text-[#9dd0bd]" size={16} /> Secure card payments</span>
              <span className="inline-flex items-center gap-2"><CheckIcon className="text-[#9dd0bd]" size={16} /> Church-branded</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[520px] lg:ml-auto">
            <div className="dot-grid absolute -inset-10 opacity-20 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
            <div className="relative mx-auto w-[280px] rounded-[40px] border-[7px] border-[#f1eee6] bg-[var(--paper)] p-2 shadow-[0_40px_100px_rgba(0,0,0,.38)] sm:w-[320px]">
              <div className="overflow-hidden rounded-[29px] bg-[#fbfaf6] text-[var(--ink)]">
                <div className="flex items-center justify-center py-3"><span className="h-1.5 w-16 rounded-full bg-[var(--ink)]/12" /></div>
                <div className="px-5 pb-5">
                  <div className="flex flex-col items-center text-center">
                    <ChurchMark size="sm" />
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Harbour Grace Church</p>
                    <h2 className="font-display mt-2 text-[26px] leading-tight tracking-[-0.03em]">Give with purpose</h2>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {["$25", "$50", "$100", "$250"].map((amount, index) => <div className={`rounded-xl border px-3 py-2.5 text-center text-sm font-bold ${index === 1 ? "border-[var(--sage)] bg-[var(--sage-pale)] text-[var(--sage-dark)]" : "border-[var(--line)] bg-white"}`} key={amount}>{amount}</div>)}
                  </div>
                  <div className="mt-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"><p className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">Giving to</p><div className="mt-1 flex items-center justify-between text-sm font-semibold"><span>Tithes</span><span className="text-[var(--sage)]">⌄</span></div></div>
                  <div className="mt-3 flex rounded-xl bg-[#ece9e1] p-1 text-xs font-semibold"><span className="flex-1 rounded-lg bg-white py-2 text-center shadow-sm">One time</span><span className="flex-1 py-2 text-center text-[var(--muted)]">Monthly</span></div>
                  <div className="mt-4 rounded-xl bg-[var(--sage)] py-3 text-center text-sm font-bold text-white">Continue securely</div>
                </div>
              </div>
            </div>
            <div className="glass-panel absolute -right-3 top-16 hidden w-44 rounded-2xl p-4 text-[var(--ink)] sm:block lg:-right-10"><div className="flex items-center gap-2 text-xs font-bold"><span className="grid size-7 place-items-center rounded-full bg-[var(--sage-pale)] text-[var(--sage)]"><CheckIcon size={15} /></span> Gift received</div><p className="mt-3 text-2xl font-bold tracking-tight">$50.00</p><p className="mt-1 text-[10px] text-[var(--muted)]">Monthly · Tithes</p></div>
            <div className="glass-panel absolute -bottom-4 -left-3 hidden w-48 rounded-2xl p-4 text-[var(--ink)] sm:block lg:-left-10"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[var(--gold-pale)] text-[var(--gold)]"><UsersIcon size={19} /></div><div><p className="text-lg font-bold">128</p><p className="text-[10px] text-[var(--muted)]">active givers</p></div></div></div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-8 sm:grid-cols-4 sm:px-8 lg:px-12">
          {[["10 sec", "to complete a gift"], ["24/7", "giving availability"], ["100%", "church branded"], ["One", "simple dashboard"]].map(([value, label]) => <div className="text-center sm:border-r sm:border-[var(--line)] sm:last:border-0" key={label}><p className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{label}</p></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-12 lg:py-32" id="features">
        <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--sage)]">Built around people</p><h2 className="font-display mt-4 text-4xl tracking-[-0.035em] sm:text-5xl">Simple for members.<br />Powerful for churches.</h2><p className="mt-5 text-base leading-7 text-[var(--muted)]">Everything needed for thoughtful digital giving, without the complexity that gets in the way.</p></div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {features.map(({ icon: Icon, title, copy }) => <article className="soft-card rounded-[24px] p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(18,34,53,.1)]" key={title}><div className="grid size-12 place-items-center rounded-2xl bg-[var(--sage-pale)] text-[var(--sage)]"><Icon size={23} /></div><h3 className="mt-6 text-lg font-bold tracking-tight">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{copy}</p></article>)}
        </div>
      </section>

      <section className="bg-[#ebe7dd]" id="how-it-works">
        <div className="mx-auto grid max-w-7xl gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[.84fr_1.16fr] lg:px-12 lg:py-32">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--sage)]">The member experience</p><h2 className="font-display mt-4 text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">From scan to generosity in three easy steps.</h2><p className="mt-5 max-w-md text-base leading-7 text-[var(--muted)]">Designed mobile-first for Sunday mornings, events and every moment in between.</p><Link className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[var(--sage-dark)]" href="/give/harbour-grace">Try the giving flow <ArrowRightIcon size={17} /></Link></div>
          <div className="space-y-3">{steps.map(([number, title, copy]) => <div className="soft-card flex gap-5 rounded-2xl p-5 sm:items-center sm:p-6" key={number}><span className="font-display grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-sm font-bold text-white">{number}</span><div><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{copy}</p></div></div>)}</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
        <div className="relative overflow-hidden rounded-[32px] bg-[var(--sage)] px-6 py-14 text-white sm:px-12 lg:flex lg:items-center lg:justify-between lg:px-16 lg:py-16"><div className="absolute -right-24 -top-36 size-96 rounded-full border-[60px] border-white/[0.06]" /><div className="relative max-w-xl"><ShieldIcon className="mb-5 text-[#b9d7cb]" size={30} /><h2 className="font-display text-4xl tracking-[-0.035em]">A clearer way to care for your community.</h2><p className="mt-4 text-sm leading-6 text-white/70">Explore the working pilot across the giving, member, church and platform experiences.</p></div><div className="relative mt-8 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:flex-col"><Link className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[var(--sage-dark)]" href="/give/harbour-grace">Open giving demo <ArrowRightIcon size={17} /></Link><Link className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-semibold" href="/platform">Platform overview</Link></div></div>
      </section>

      <footer className="border-t border-[var(--line)] bg-[var(--paper)]"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><Brand /><p className="text-xs text-[var(--muted)]">Pilot foundation · Barbados · 2026</p></div></footer>
    </main>
  );
}
