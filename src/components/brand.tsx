import Image from "next/image";
import Link from "next/link";

import { BRAND_ASSETS, PRODUCT_NAME } from "@/lib/branding";

type BrandProps = {
  compact?: boolean;
  href?: string;
  inverted?: boolean;
};

export function Brand({ compact = false, href = "/", inverted = false }: BrandProps) {
  return (
    <Link
      aria-label={`${PRODUCT_NAME} home`}
      className={`focus-ring inline-flex shrink-0 items-center rounded-lg ${
        compact ? "min-h-11 min-w-11 justify-center" : ""
      } ${inverted ? "drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]" : ""}`}
      href={href}
    >
      <Image
        alt=""
        className={
          compact
            ? "h-auto w-11"
            : "h-auto w-[172px] sm:w-[184px]"
        }
        height={compact ? 784 : 422}
        loading="eager"
        src={compact ? BRAND_ASSETS.symbol : BRAND_ASSETS.horizontal}
        unoptimized
        width={compact ? 1133 : 2000}
      />
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
