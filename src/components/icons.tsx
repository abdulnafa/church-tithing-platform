import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return <IconBase {...props}><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></IconBase>;
}

export function CheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></IconBase>;
}

export function HeartIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20.2 5.8a5.4 5.4 0 0 0-7.7 0L12 6.3l-.5-.5a5.4 5.4 0 1 0-7.7 7.7l.5.5L12 21.2l7.7-7.2.5-.5a5.4 5.4 0 0 0 0-7.7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>;
}

export function ShieldIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 3 4.5 6v5.3c0 4.7 3 8.2 7.5 9.7 4.5-1.5 7.5-5 7.5-9.7V6L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /><path d="m9 12 2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>;
}

export function QrIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm11 0h2v2h-2v-2Zm3 0h2v4h-2v-4Zm-4 4h4v2h-4v-2Z" fill="currentColor" /></IconBase>;
}

export function ChartIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 20V10m5 10V4m6 16v-7m5 7V7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></IconBase>;
}

export function UsersIcon(props: IconProps) {
  return <IconBase {...props}><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20m6.5-9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-1.5a3 3 0 0 0 0-5.8m4.5 16.8v-1.5a4 4 0 0 0-3-3.9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>;
}

export function HomeIcon(props: IconProps) {
  return <IconBase {...props}><path d="m3 11 9-8 9 8v9H6a3 3 0 0 1-3-3v-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /><path d="M9 20v-6h6v6" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>;
}

export function CardIcon(props: IconProps) {
  return <IconBase {...props}><rect height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" width="20" x="2" y="4.5" /><path d="M2 9h20M6 15h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>;
}

export function CalendarIcon(props: IconProps) {
  return <IconBase {...props}><rect height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" width="18" x="3" y="4" /><path d="M8 2v4m8-4v4M3 9h18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>;
}

export function SettingsIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.7" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></IconBase>;
}

export function BellIcon(props: IconProps) {
  return <IconBase {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8.5 12h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>;
}

export function SearchIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></IconBase>;
}

export function DownloadIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>;
}

export function MoreIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="5" cy="12" fill="currentColor" r="1.5" /><circle cx="12" cy="12" fill="currentColor" r="1.5" /><circle cx="19" cy="12" fill="currentColor" r="1.5" /></IconBase>;
}

export function MenuIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></IconBase>;
}

export function CloseIcon(props: IconProps) {
  return <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></IconBase>;
}

export function ChevronDownIcon(props: IconProps) {
  return <IconBase {...props}><path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></IconBase>;
}

export function LogoutIcon(props: IconProps) {
  return <IconBase {...props}><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m5-4 4-4-4-4m4 4H9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></IconBase>;
}
