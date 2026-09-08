import { signOutAction } from "@/app/auth/actions";
import { Brand } from "@/components/brand";

type AccountStatePageProps = Readonly<{
  eyebrow: string;
  title: string;
  description: string;
}>;

export function AccountStatePage({
  eyebrow,
  title,
  description,
}: AccountStatePageProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f1eb] px-4 py-10">
      <section className="soft-card w-full max-w-lg rounded-[28px] p-7 sm:p-10">
        <Brand />
        <p className="mt-10 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sage)]">
          {eyebrow}
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-[-0.04em]">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
        <form action={signOutAction} className="mt-8">
          <button
            className="focus-ring inline-flex rounded-full bg-[var(--ink)] px-5 py-3 text-xs font-bold text-white"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
