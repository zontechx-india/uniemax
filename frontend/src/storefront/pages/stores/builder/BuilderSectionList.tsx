import { useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  HomepageSection,
  HomepageSectionKey,
} from '../../../features/stores/storesApi'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FooterIcon,
  GripIcon,
  InfoIcon,
  PanelLeftIcon,
} from '../../../layout/icons'
import { BigSwitch } from '../ui/BigSwitch'
import { BUILDER_SECTIONS } from './builderSections'
import type { SectionCounts } from './useSectionCounts'

/**
 * The storefront's structure, as a list the seller can rearrange.
 *
 * Three jobs per row and no more: **move it**, **show or hide it**, **open
 * it**. Everything else about a section lives in its editor, because a list
 * that tries to be a control panel stops being scannable — and scanning is
 * what this list is for.
 *
 * Reordering is offered twice on purpose. Dragging is the obvious gesture on a
 * mouse; the up/down buttons are the one that works with a keyboard, with a
 * screen reader, and on a phone, where dragging inside a scrolling column is a
 * fight. Both write the same list.
 *
 * The header and the footer bracket the list as **pinned rows**: they are real
 * parts of the storefront the seller can open and edit, but they are not
 * sections — the header is always at the top and the footer always at the
 * bottom, so neither has a handle or a switch.
 */

/** What the panel is currently editing. Not all of them are sections. */
export type BuilderTarget = HomepageSectionKey | 'header' | 'footer'

export function BuilderSectionList({
  sections,
  activeKey,
  busy,
  counts,
  storePath,
  onSelect,
  onToggle,
  onReorder,
}: {
  sections: HomepageSection[]
  activeKey: BuilderTarget | null
  busy: boolean
  /** What each section has to show; null while loading (or if it failed). */
  counts: SectionCounts | null
  /** The store management root, for the "add products" links. */
  storePath: string
  onSelect: (key: BuilderTarget) => void
  onToggle: (key: HomepageSectionKey, enabled: boolean) => void
  onReorder: (next: HomepageSection[]) => void
}) {
  const [dragKey, setDragKey] = useState<HomepageSectionKey | null>(null)
  const [overKey, setOverKey] = useState<HomepageSectionKey | null>(null)
  /** Move `from` so it lands immediately before `to`. */
  const drop = (from: HomepageSectionKey, to: HomepageSectionKey) => {
    if (from === to) return
    const moved = sections.find((s) => s.key === from)
    if (!moved) return
    const without = sections.filter((s) => s.key !== from)
    const at = without.findIndex((s) => s.key === to)
    without.splice(at === -1 ? without.length : at, 0, moved)
    onReorder(without)
  }

  const move = (index: number, delta: number) => {
    const to = index + delta
    if (to < 0 || to >= sections.length) return
    const next = [...sections]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item!)
    onReorder(next)
  }

  return (
    <div className="space-y-3">
      <PinnedRow
        icon={PanelLeftIcon}
        label="Top bar"
        hint="Logo, search, cart — always at the top"
        active={activeKey === 'header'}
        onClick={() => onSelect('header')}
      />

      <div>
        <p className="px-1 pb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">
          Your storefront
        </p>
        {counts?.smallShop && (
          // Without this a seller marks Best Sellers, sees no Best Sellers
          // row in the shop, and decides the shop is broken. The rule itself
          // lives in StoreHomePage (`shapeHome`).
          <p className="mb-2 flex gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-hint text-fg">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>
              Your shop has {counts.catalogSize} products, so they all show once
              in <span className="font-semibold">All Products</span>. Products
              you mark as Featured, Best Seller or New Arrival come first there.
              They get rows of their own when you have more than 12 products.
            </span>
          </p>
        )}
        <ul className="space-y-1.5">
          {sections.map((section, index) => {
            const meta = BUILDER_SECTIONS[section.key]
            const Icon = meta.icon
            const isDragging = dragKey === section.key
            const isOver = overKey === section.key && dragKey !== section.key
            const isActive = activeKey === section.key

            return (
              <li
                key={section.key}
                draggable={!busy}
                onDragStart={() => setDragKey(section.key)}
                onDragEnd={() => {
                  setDragKey(null)
                  setOverKey(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (overKey !== section.key) setOverKey(section.key)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragKey) drop(dragKey, section.key)
                  setDragKey(null)
                  setOverKey(null)
                }}
                // The drop position is a line ABOVE the row, drawn as a border
                // on a transparent slot that is always there — so nothing
                // moves, grows or reflows while a card is in the air.
                className={`rounded-lg border-t-2 transition-colors ${
                  isOver ? 'border-t-brand' : 'border-t-transparent'
                } ${isDragging ? 'opacity-40' : ''}`}
              >
                <div
                  className={`flex items-center gap-1 rounded-lg border pr-2 transition-colors ${
                    isActive
                      ? 'border-brand bg-brand-soft'
                      : 'border-line bg-surface hover:border-fg/25'
                  }`}
                >
                  <span
                    // The handle is the drag affordance; the row as a whole is
                    // the click target, so the handle must not also open it.
                    className="hidden shrink-0 cursor-grab py-3 pl-2 pr-1 text-muted active:cursor-grabbing lg:block"
                    aria-hidden
                    title="Drag to reorder"
                  >
                    <GripIcon className="h-5 w-5" />
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelect(section.key)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 text-left lg:pl-0"
                  >
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${
                        section.enabled ? 'text-brand' : 'text-muted'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-base font-semibold leading-snug ${
                          section.enabled ? 'text-fg' : 'text-muted'
                        }`}
                      >
                        {meta.label}
                      </span>
                      <SectionStatusLine
                        sectionKey={section.key}
                        enabled={section.enabled}
                        hint={meta.hint}
                        counts={counts}
                      />
                    </span>
                  </button>

                  <div className="flex shrink-0 flex-col">
                    <MoveButton
                      dir="up"
                      label={`Move ${meta.label} up`}
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <MoveButton
                      dir="down"
                      label={`Move ${meta.label} down`}
                      disabled={busy || index === sections.length - 1}
                      onClick={() => move(index, 1)}
                    />
                  </div>

                  <BigSwitch
                    checked={section.enabled}
                    disabled={busy}
                    label={`${section.enabled ? 'Hide' : 'Show'} ${meta.label}`}
                    showState={false}
                    onChange={(next) => onToggle(section.key, next)}
                  />
                </div>
                {section.enabled &&
                  counts &&
                  counts.counts[section.key] === 0 &&
                  meta.source && (
                    <Link
                      to={`${storePath}/${meta.source.to}`}
                      className="ml-3 mt-1 inline-flex min-h-tap items-center gap-1 text-hint font-semibold text-brand hover:underline"
                    >
                      {meta.source.label}
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  )}
              </li>
            )
          })}
        </ul>

        {/* No "Add section" box: every section the shop can draw is already
            in this list, and a hidden one comes back with its own switch.
            Offering it a second time (the old "Add a section back") listed
            rows the seller could already see. */}
        {sections.some((section) => !section.enabled) && (
          <p className="mt-2 px-1 text-xs text-muted">
            Turn on a switch to show a hidden part again.
          </p>
        )}
      </div>

      <PinnedRow
        icon={FooterIcon}
        label="Bottom of your shop"
        hint="Contact details, links and social — always at the bottom"
        active={activeKey === 'footer'}
        onClick={() => onSelect('footer')}
      />
    </div>
  )
}

/**
 * The line under a section's name: what it will show in the shop right now
 * ("4 products", "Empty: …"), from the same data the shop renders. Falls back
 * to the section's plain description while the counts load.
 */
function SectionStatusLine({
  sectionKey,
  enabled,
  hint,
  counts,
}: {
  sectionKey: HomepageSectionKey
  enabled: boolean
  hint: string
  counts: SectionCounts | null
}) {
  let text = hint
  let empty = false
  if (!enabled) {
    text = 'Hidden from your shop'
  } else if (counts) {
    const n = counts.counts[sectionKey]
    // Product rows load at most 12; more than that is simply "12+".
    const products = (count: number) =>
      count >= 12 ? '12+ products' : `${count} product${count === 1 ? '' : 's'}`
    switch (sectionKey) {
      case 'banners':
        empty = n === 0
        text = empty ? 'No banners yet: tap to add one' : `${n} banner${n === 1 ? '' : 's'}`
        break
      case 'categories':
        empty = n === 0
        text = empty
          ? 'Not shown: needs products in 2 or more categories'
          : `${n} categories`
        break
      case 'featured':
      case 'newArrivals':
      case 'bestSellers': {
        const flag =
          sectionKey === 'featured'
            ? 'Featured'
            : sectionKey === 'newArrivals'
              ? 'New Arrival'
              : 'Best Seller'
        empty = n === 0
        text = empty
          ? `Empty: mark products as ${flag}`
          : counts.smallShop
            ? `${products(n)} · shown first in All Products`
            : products(n)
        break
      }
      case 'categoryRows':
        empty = n === 0 || counts.smallShop
        text = counts.smallShop
          ? 'Not shown: All Products already shows everything'
          : n === 0
            ? 'Empty: add products to your categories'
            : `${n} categor${n === 1 ? 'y' : 'ies'}`
        break
      case 'catalog':
        empty = n === 0
        text = empty ? 'Empty: add your first product' : products(n)
        break
    }
  }
  return (
    <span
      className={`mt-0.5 line-clamp-2 block text-hint ${
        empty ? 'font-medium text-pending' : 'text-muted'
      }`}
    >
      {text}
    </span>
  )
}

/** Header and footer: openable, but never moved and never switched off. */
function PinnedRow({
  icon: Icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[56px] w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-brand bg-brand-soft'
          : 'border-line bg-surface/70 hover:border-fg/25'
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-fg">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-hint text-muted">{hint}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
    </button>
  )
}

function MoveButton({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: 'up' | 'down'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex size-tap items-center justify-center rounded-xl text-muted transition hover:bg-fg/5 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <ChevronDownIcon
        className={`h-5 w-5 ${dir === 'up' ? 'rotate-180' : ''}`}
      />
    </button>
  )
}
