import Link from "next/link";

type BrandProps = {
  compact?: boolean;
  href?: string;
  inverted?: boolean;
};

export function Brand({ compact = false, href = "/", inverted = false }: BrandProps) {
  return (
    <Link className="focus-ring inline-flex items-center gap-3 rounded-lg" href={href}>
      <span className={`grid size-10 place-items-center rounded-[14px] ${inverted ? "bg-white text-[var(--sage-dark)]" : "bg-[var(--sage)] text-white"}`}>
        <svg aria-hidden="true" fill="none" viewBox="0 0 32 32" className="size-6">
          <path d="M16 26V10" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <path d="M16 15c-5.8 0-9-3.1-9-8 5.8 0 9 3.1 9 8Z" fill="currentColor" opacity=".86" />
          <path d="M16 20c5.8 0 9-3.1 9-8-5.8 0-9 3.1-9 8Z" fill="currentColor" opacity=".58" />
        </svg>
      </span>
      {compact && <span className="sr-only">Kindred Giving home</span>}
      {!compact && (
        <span className="leading-none">
          <span className={`block text-[17px] font-bold tracking-[-0.03em] ${inverted ? "text-white" : "text-[var(--ink)]"}`}>Kindred</span>
          <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] ${inverted ? "text-white/60" : "text-[var(--muted)]"}`}>Giving</span>
        </span>
      )}
    </Link>
  );
}

export function ChurchMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "size-16 rounded-[22px]" : size === "sm" ? "size-10 rounded-[14px]" : "size-12 rounded-2xl";
  return (
    <div className={`grid place-items-center bg-[var(--ink)] text-[var(--gold)] shadow-sm ${dimensions}`}>
      <svg aria-hidden="true" className={size === "lg" ? "size-9" : "size-7"} fill="none" viewBox="0 0 32 32">
        <path d="M16 5v22M9 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
        <path d="M7 27h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
      </svg>
    </div>
  );
}
