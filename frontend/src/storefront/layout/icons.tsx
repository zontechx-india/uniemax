/**
 * Inline stroke icons for the storefront shell (nav + sidebar controls).
 * Same convention as `shared/ui/form.tsx`: no external icon assets.
 */

function Svg({
  className = 'h-5 w-5',
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function HomeIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z" />
      <path d="M9 21v-8h6v8" />
    </Svg>
  )
}

export function BagIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M6 7h12l1 14H5L6 7Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
    </Svg>
  )
}

export function HeartIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 20.5s-7.5-4.7-9.3-9A5.2 5.2 0 0 1 12 6.6a5.2 5.2 0 0 1 9.3 4.9c-1.8 4.3-9.3 9-9.3 9Z" />
    </Svg>
  )
}

export function SettingsIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 20.91 11H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </Svg>
  )
}

export function LogoutIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  )
}

export function MenuIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  )
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  )
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  )
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  )
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  )
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </Svg>
  )
}

export function MapPinIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Svg>
  )
}

export function StoreIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 9.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5" />
      <path d="M3.5 6 5 3h14l1.5 3a2.5 2.5 0 0 1-5 .5 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0A2.5 2.5 0 0 1 3.5 6Z" />
      <path d="M9.5 20v-5.5h5V20" />
    </Svg>
  )
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function PaletteIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h6a3 3 0 0 0 3-3c0-3.5-4-6-9-6Z" />
      <circle cx="7.5" cy="11" r="0.5" />
      <circle cx="9.5" cy="7" r="0.5" />
      <circle cx="14.5" cy="6.5" r="0.5" />
    </Svg>
  )
}

export function TagIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M20.6 13.4 12.4 5.2A2 2 0 0 0 11 4.6H5.6a1 1 0 0 0-1 1V11c0 .5.2 1 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8Z" />
      <circle cx="8.5" cy="8.5" r="1" />
    </Svg>
  )
}

export function BoxIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </Svg>
  )
}

export function ImageIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15.5-5-5L7 19" />
    </Svg>
  )
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  )
}

export function PencilIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14.5 6.5l3 3" />
    </Svg>
  )
}

export function GlobeIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" />
    </Svg>
  )
}

export function ShareIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="m8.7 10.7 6.6-3.4M8.7 13.3l6.6 3.4" />
    </Svg>
  )
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  )
}

export function EyeIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function CartIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.4a1 1 0 0 0 1-.8L20.5 8H6" />
    </Svg>
  )
}

export function MinusIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Svg>
  )
}

export function StarIcon({
  className,
  filled = false,
}: {
  className?: string
  filled?: boolean
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9L12 3.5Z" />
    </svg>
  )
}

export function GripIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  )
}

export function SlidersIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </Svg>
  )
}

/** Page frame with a highlighted bottom band — the storefront footer. */
export function FooterIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 15h18" />
      <path d="M7 17.5h4" />
    </Svg>
  )
}

export function PhoneCallIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.27a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.7 2.03Z" />
    </Svg>
  )
}

export function MailIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  )
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  )
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </Svg>
  )
}

/** Bank building — the payout accounts section. */
export function BankIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m3 9 9-6 9 6" />
      <path d="M4 9.5h16" />
      <path d="M6 13v5M10 13v5M14 13v5M18 13v5" />
      <path d="M3 20.5h18" />
    </Svg>
  )
}

/** Credit card — the payment settings section. */
export function CardIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </Svg>
  )
}

/** Delivery truck — the shipping settings section. */
export function TruckIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M2.5 6.5h11v10h-11z" />
      <path d="M13.5 10h4l3 3v3.5h-7" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </Svg>
  )
}

/** Clipboard with form lines — the checkout-fields section. */
export function ClipboardIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a3 3 0 0 1 6 0" />
      <path d="M9 10.5h6M9 14h6M9 17.5h3.5" />
    </Svg>
  )
}

/** Padlock — the secure-checkout trust cue. */
export function LockIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.3" />
    </Svg>
  )
}

/** U-turn arrow — the return/refund cue on the product page. */
export function ReturnIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 8.5h11a4.5 4.5 0 0 1 0 9H8" />
      <path d="m7.5 5 -3.5 3.5 3.5 3.5" />
    </Svg>
  )
}

/** Shield with a tick — the "genuine product" trust cue. */
export function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  )
}

/** Bar chart — the seller dashboard section. */
export function ChartIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 20.5h16" />
      <path d="M6.5 20.5v-7M12 20.5V5.5M17.5 20.5v-11" />
    </Svg>
  )
}

/** Life-buoy — the Help & Support section. */
export function LifebuoyIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" />
    </Svg>
  )
}

/** Speech bubble — a ticket thread / reply. */
export function ChatIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.3A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z" />
    </Svg>
  )
}
