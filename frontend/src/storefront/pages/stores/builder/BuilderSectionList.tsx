import { useState } from 'react'
import type {
  HomepageSection,
  HomepageSectionKey,
} from '../../../features/stores/storesApi'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FooterIcon,
  GripIcon,
  PanelLeftIcon,
  PlusIcon,
} from '../../../layout/icons'
import { ActiveSwitch } from '../ActiveSwitch'
import { BUILDER_SECTIONS } from './builderSections'

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
  onSelect,
  onToggle,
  onReorder,
}: {
  sections: HomepageSection[]
  activeKey: BuilderTarget | null
  busy: boolean
  onSelect: (key: BuilderTarget) => void
  onToggle: (key: HomepageSectionKey, enabled: boolean) => void
  onReorder: (next: HomepageSection[]) => void
}) {
  const [dragKey, setDragKey] = useState<HomepageSectionKey | null>(null)
  const [overKey, setOverKey] = useState<HomepageSectionKey | null>(null)
  const [adding, setAdding] = useState(false)

  const hidden = sections.filter((section) => !section.enabled)

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
        label="Store header"
        hint="Logo, search, cart — always at the top"
        active={activeKey === 'header'}
        onClick={() => onSelect('header')}
      />

      <div>
        <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Your storefront
        </p>
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
                    className="shrink-0 cursor-grab py-3 pl-2 pr-1 text-muted active:cursor-grabbing"
                    aria-hidden
                    title="Drag to reorder"
                  >
                    <GripIcon className="h-5 w-5" />
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelect(section.key)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 text-left"
                  >
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${
                        section.enabled ? 'text-brand' : 'text-muted'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-semibold ${
                          section.enabled ? 'text-fg' : 'text-muted'
                        }`}
                      >
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {section.enabled ? meta.hint : 'Hidden from your shop'}
                      </span>
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

                  <ActiveSwitch
                    checked={section.enabled}
                    disabled={busy}
                    label={`${section.enabled ? 'Hide' : 'Show'} ${meta.label}`}
                    onChange={(next) => onToggle(section.key, next)}
                  />
                </div>
              </li>
            )
          })}
        </ul>

        {/* Adding a section means bringing a hidden one back: the storefront
            has a fixed, supported set, and offering to "add" anything else
            would be offering something the shop cannot render. */}
        <div className="mt-2">
          {adding && hidden.length > 0 ? (
            <div className="rounded-lg border border-line bg-surface p-2">
              <p className="px-1 pb-1 text-xs font-semibold text-fg">
                Add a section back
              </p>
              <ul className="space-y-1">
                {hidden.map((section) => {
                  const meta = BUILDER_SECTIONS[section.key]
                  const Icon = meta.icon
                  return (
                    <li key={section.key}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onToggle(section.key, true)
                          onSelect(section.key)
                          setAdding(false)
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-alt disabled:opacity-50"
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">
                            {meta.label}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {meta.hint}
                          </span>
                        </span>
                        <PlusIcon className="h-4 w-4 shrink-0 text-muted" />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-alt hover:text-fg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={hidden.length === 0}
              onClick={() => setAdding(true)}
              title={
                hidden.length === 0
                  ? 'Every section is already on your homepage'
                  : undefined
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-sm font-semibold text-muted transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-line disabled:text-muted/60 disabled:hover:border-line"
            >
              <PlusIcon className="h-4 w-4" />
              {hidden.length === 0 ? 'All sections are on' : 'Add section'}
            </button>
          )}
        </div>
      </div>

      <PinnedRow
        icon={FooterIcon}
        label="Footer"
        hint="Contact details, links and social — always at the bottom"
        active={activeKey === 'footer'}
        onClick={() => onSelect('footer')}
      />
    </div>
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
      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-brand bg-brand-soft'
          : 'border-line bg-surface hover:border-fg/25'
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">{hint}</span>
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
      className="rounded p-0.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <ChevronDownIcon
        className={`h-4 w-4 ${dir === 'up' ? 'rotate-180' : ''}`}
      />
    </button>
  )
}
