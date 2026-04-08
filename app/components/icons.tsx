import type { SVGProps } from "react";

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v5h-7z" />
      <path d="M13 11h7v9h-7z" />
      <path d="M4 13h7v7H4z" />
    </IconBase>
  );
}

export function BillingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <circle cx="8" cy="14" r="1.5" />
      <path d="M13 14h5" />
    </IconBase>
  );
}

export function CollectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 3h6" />
      <path d="M10 3v5l-5 8a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 16l-5-8V3" />
      <path d="M8 14h8" />
    </IconBase>
  );
}

export function ResultEntryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 6h10" />
      <path d="M4 12h10" />
      <path d="M4 18h7" />
      <path d="m15 15 5-5" />
      <path d="m17 19 3-3" />
    </IconBase>
  );
}

export function ApprovalsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m12 3 2.5 2.2 3.3-.3.8 3.2 2.9 1.6-1.6 2.9.3 3.3-3.2.8L12 21l-2.2-2.5-3.3.3-.8-3.2L3 13.9l1.6-2.9-.3-3.3 3.2-.8L12 3Z" />
      <path d="m9.5 12.2 1.7 1.8 3.4-3.8" />
    </IconBase>
  );
}

export function ReportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 15v-4" />
      <path d="M12 15V9" />
      <path d="M16 15v-2" />
    </IconBase>
  );
}


export function RangeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 7h12" />
      <path d="M4 12h8" />
      <path d="M4 17h12" />
      <path d="M18 5v14" />
      <path d="m15 8 3-3 3 3" />
      <path d="m15 16 3 3 3-3" />
    </IconBase>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </IconBase>
  );
}

export function LocationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 20s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2" />
    </IconBase>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M15 18H5l1.5-1.7V11a5.5 5.5 0 0 1 11 0v5.3L19 18h-4" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
    </IconBase>
  );
}

export function ExportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </IconBase>
  );
}

export function TDlaiLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 280 80" fill="none" {...props}>
      {/* TD in Teal */}
      <text x="30" y="65" fontSize="72" fontWeight="900" fontFamily="Arial, sans-serif" fill="#0b8d92">
        TD
      </text>
      {/* Vertical separator line in Gray */}
      <line x1="155" y1="15" x2="155" y2="70" strokeWidth="8" stroke="#6b7280" />
      {/* ai in Red */}
      <text x="180" y="65" fontSize="72" fontWeight="700" fontFamily="Arial, sans-serif" fill="#c52d2f">
        ai
      </text>
    </svg>
  );
}


