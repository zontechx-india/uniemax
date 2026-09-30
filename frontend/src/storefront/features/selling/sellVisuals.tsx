import { colourFor, initialsOf } from '../../../shared/media/letterLogo'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '../../../shared/ui/socialIcons'
import { BellIcon, CheckIcon, LinkIcon } from '../../layout/icons'
import { DEMO_STORES, rupees } from './demoStores'
import { previewStoreSlug } from './startSelling'
import { StorePhone } from './StorePhone'

/**
 * The /sell page's small product illustrations. Everything here is a picture
 * of the real UI with invented content (see `demoStores.ts`) — decorative
 * markup, hidden from assistive tech or labelled as one image.
 */

const HERO_STORE = DEMO_STORES[0]!
const HERO_PRODUCT = HERO_STORE.products[0]

/** Store addresses are `/store/{slug}` on the marketplace domain. */
const heroLink = `uniemax.com/store/${previewStoreSlug(HERO_STORE.name)}`

/**
 * The hero's product shot: the storefront on a phone, the seller's new-order
 * alert dropping in over it, and the store's link beneath.
 *
 * The alert's wording is the real one — title and body exactly as
 * `orders.notifications.ts` sends a seller on a new order.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="sell-enter flex justify-center" style={{ animationDelay: '120ms' }}>
        <StorePhone store={HERO_STORE} />
      </div>

      <div
        aria-hidden="true"
        className="sell-light sell-notify absolute right-0 top-14 w-[272px] rounded-2xl bg-surface p-3.5 shadow-[0_24px_48px_-16px_rgb(5_7_13/0.6)] sm:-right-6"
      >
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-contrast">
            <BellIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline justify-between gap-2 text-[13px] font-semibold text-fg">
              <span className="truncate">New order · {HERO_STORE.name}</span>
              <span className="shrink-0 text-[11px] font-normal text-muted">now</span>
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted">
              UM-MG7K2QX4-R8TP — 1 item, {rupees(HERO_PRODUCT.price)}. Confirm it to get started.
            </p>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="sell-light sell-float absolute bottom-3 left-0 flex items-center gap-2.5 rounded-pill bg-surface py-2 pl-2 pr-4 shadow-[0_20px_40px_-16px_rgb(5_7_13/0.6)] sm:-left-6"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand">
          <LinkIcon className="h-4 w-4" />
        </span>
        <span className="text-[12.5px] font-medium text-fg">{heroLink}</span>
      </div>
    </div>
  )
}

/** Checkout's payment choice, as a customer sees it. */
export function PaymentChoiceVisual() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <PaymentRow label="Cash on Delivery" detail="Pay when it arrives" selected />
      <PaymentRow label="Pay online" detail="Secure payment via Cashfree" />
    </div>
  )
}

function PaymentRow({
  label,
  detail,
  selected = false,
}: {
  label: string
  detail: string
  selected?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 ${
        selected ? 'border-brand ring-4 ring-brand/10' : 'border-line'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-brand' : 'border-line'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </div>
  )
}

/**
 * A store's order statuses, in order — the dashboard's forward-only track,
 * labelled as the seller's own screens label them (`orderMeta.tsx`).
 */
const ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'] as const

/** An order part-way along its track (three of five done). */
export function OrderStatusVisual() {
  const reached = 3
  return (
    <div aria-hidden="true" className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-muted">UM-MG7K2QX4-R8TP</span>
        <span className="text-xs font-semibold text-fg">{rupees(HERO_PRODUCT.price)}</span>
      </div>
      <ol className="mt-4 grid grid-cols-5">
        {ORDER_STATUSES.map((status, index) => {
          const done = index < reached
          return (
            <li key={status} className="relative flex flex-col items-center gap-2">
              {index > 0 && (
                <span
                  className={`absolute right-1/2 top-[9px] h-0.5 w-full ${
                    index < reached ? 'bg-brand' : 'bg-line'
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full ${
                  done ? 'bg-brand text-brand-contrast' : 'border-2 border-line bg-surface'
                }`}
              >
                {done && <CheckIcon className="h-3 w-3" />}
              </span>
              <span className={`text-[11px] ${done ? 'font-semibold text-fg' : 'text-muted'}`}>
                {status}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Step 1 — the Create Store wizard's first screen, letter logo and all. */
export function StepStoreVisual() {
  const name = HERO_STORE.name
  return (
    <div aria-hidden="true" className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white"
        style={{ backgroundColor: colourFor(name) }}
      >
        {initialsOf(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted">Store name</span>
        <span className="block truncate text-sm font-semibold text-fg">{name}</span>
      </span>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    </div>
  )
}

/** Step 2 — a product with its sizes and stock. */
export function StepProductVisual() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-2xl">
          {HERO_PRODUCT.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{HERO_PRODUCT.name}</span>
          <span className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-fg">{rupees(HERO_PRODUCT.price)}</span>
            {HERO_PRODUCT.mrp !== undefined && (
              <span className="text-xs text-muted line-through">{rupees(HERO_PRODUCT.mrp)}</span>
            )}
          </span>
        </span>
        <span className="rounded-pill bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
          12 in stock
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {['S', 'M', 'L', 'XL'].map((size, index) => (
          <span
            key={size}
            className={`flex h-7 min-w-9 items-center justify-center rounded-md border px-2 text-xs font-semibold ${
              index === 1 ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'
            }`}
          >
            {size}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Step 3 — the Publish switch, and the link it makes worth sharing. */
export function StepPublishVisual() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-fg">Store published</span>
        <span className="flex h-6 w-11 items-center justify-end rounded-full bg-success p-0.5">
          <span className="h-5 w-5 rounded-full bg-white shadow-floating" />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2 text-xs text-fg">
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-brand" />
        <span className="truncate">{heroLink}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <ShareChip label="WhatsApp" className="text-[#25d366]">
          <WhatsAppIcon className="h-4 w-4" />
        </ShareChip>
        <ShareChip label="Instagram" className="text-[#e1306c]">
          <InstagramIcon className="h-4 w-4" />
        </ShareChip>
        <ShareChip label="Facebook" className="text-[#1877f2]">
          <FacebookIcon className="h-4 w-4" />
        </ShareChip>
      </div>
    </div>
  )
}

function ShareChip({
  label,
  className,
  children,
}: {
  label: string
  className: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line text-[11px] font-medium text-fg">
      <span className={className}>{children}</span>
      {label}
    </span>
  )
}
