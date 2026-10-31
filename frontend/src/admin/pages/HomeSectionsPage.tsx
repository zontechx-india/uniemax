import { useEffect, useState } from 'react'
import { adminApi } from '../features/adminApi'
import {
  Button,
  Card,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../ui/primitives'
import {
  DEFAULT_MARKET_HOME_SECTIONS,
  MARKET_HOME_SECTION_META,
  type MarketHomeSection,
} from '../../storefront/features/discovery/marketHomeSections'
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  FooterIcon,
  GripIcon,
  PanelLeftIcon,
} from '../../storefront/layout/icons'
import { BigSwitch } from '../../storefront/pages/stores/ui/BigSwitch'

/**
 * Homepage sections — the marketplace homepage (`/`) as a list the platform
 * team can rearrange and switch on or off. The platform's twin of a seller's
 * Store Builder section list, with the same three jobs per row: move it
 * (drag, or the up/down buttons for keyboard and touch), show or hide it.
 *
 * Every change saves at once: the list is updated optimistically, the server
 * answers with the full stored list, and a failed save puts the previous list
 * back. The header and footer are pinned rows — always at the top and bottom.
 */
export default function HomeSectionsPage() {
  const [sections, setSections] = useState<MarketHomeSection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const load = () => {
    setError(null)
    adminApi
      .getHomeSections()
      .then(setSections)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(load, [])

  const save = async (next: MarketHomeSection[]) => {
    const before = sections
    setSections(next) // optimistic — a drag must feel immediate
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      setSections(await adminApi.saveHomeSections(next))
      setSaved(true)
    } catch (err) {
      setSections(before)
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Move `from` so it lands immediately before `to`. */
  const drop = (from: string, to: string) => {
    if (!sections || from === to) return
    const moved = sections.find((s) => s.key === from)
    if (!moved) return
    const without = sections.filter((s) => s.key !== from)
    const at = without.findIndex((s) => s.key === to)
    without.splice(at === -1 ? without.length : at, 0, moved)
    void save(without)
  }

  const move = (index: number, delta: number) => {
    if (!sections) return
    const to = index + delta
    if (to < 0 || to >= sections.length) return
    const next = [...sections]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item!)
    void save(next)
  }

  const isDefault =
    sections !== null &&
    sections.every(
      (s, i) =>
        s.enabled && s.key === DEFAULT_MARKET_HOME_SECTIONS[i]?.key,
    )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Homepage sections"
        subtitle="Choose the order of the sections on the marketplace homepage, and switch any of them off. Changes are live as soon as you make them."
        actions={
          <>
            <Button
              variant="ghost"
              disabled={busy || !sections || isDefault}
              onClick={() => {
                if (
                  window.confirm(
                    'Put every section back in the original order and switch them all on?',
                  )
                ) {
                  void save(DEFAULT_MARKET_HOME_SECTIONS)
                }
              }}
            >
              Restore default
            </Button>
            {/* Plain <a>: the homepage is the storefront build, not this one. */}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-tap items-center gap-1.5 text-sm font-semibold text-fg underline decoration-line underline-offset-[6px] hover:text-brand"
            >
              View homepage <ExternalLinkIcon className="h-4 w-4" />
            </a>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {sections === null ? (
        !error && <Skeleton rows={8} />
      ) : (
        <Card className="max-w-2xl">
          <div className="space-y-3">
            <PinnedRow
              icon={PanelLeftIcon}
              label="Header"
              hint="Logo, search, cart — always at the top"
            />

            <div>
              <p className="px-1 pb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                Homepage
              </p>
              <ul className="space-y-1.5">
                {sections.map((section, index) => {
                  const meta = MARKET_HOME_SECTION_META[section.key]
                  const Icon = meta.icon
                  const isOver =
                    overKey === section.key && dragKey !== section.key

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
                      // The drop position is a line ABOVE the row, drawn on a
                      // slot that is always there, so nothing reflows mid-drag.
                      className={`rounded-lg border-t-2 transition-colors ${
                        isOver ? 'border-t-brand' : 'border-t-transparent'
                      } ${dragKey === section.key ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface pr-2 transition-colors hover:border-fg/25">
                        <span
                          className="shrink-0 cursor-grab py-3 pl-2 pr-1 text-muted active:cursor-grabbing"
                          aria-hidden
                          title="Drag to reorder"
                        >
                          <GripIcon className="h-5 w-5" />
                        </span>

                        <div className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5">
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
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                              {section.enabled
                                ? (meta.alwaysOn ?? meta.hint)
                                : 'Hidden from the homepage'}
                            </span>
                          </span>
                        </div>

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
                          disabled={busy || Boolean(meta.alwaysOn)}
                          label={`${section.enabled ? 'Hide' : 'Show'} ${meta.label}`}
                          showState={false}
                          onChange={(enabled) =>
                            void save(
                              sections.map((s) =>
                                s.key === section.key ? { ...s, enabled } : s,
                              ),
                            )
                          }
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <PinnedRow
              icon={FooterIcon}
              label="Footer"
              hint="Links and contact details — always at the bottom"
            />
          </div>

          <p className="mt-4 text-xs text-muted" aria-live="polite">
            {busy
              ? 'Saving…'
              : saved
                ? 'Saved — the homepage shows this order now.'
                : 'Some sections only appear when they have something to show (an empty cart, no recently viewed stores, a visitor who owns no store).'}
          </p>
        </Card>
      )}
    </div>
  )
}

/** Header and footer: shown for orientation, never moved or switched off. */
function PinnedRow({
  icon: Icon,
  label,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-line bg-surface/70 px-3 py-2.5">
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-fg">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">{hint}</span>
      </span>
    </div>
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
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="w-9 px-0! text-muted hover:text-fg"
    >
      <ChevronDownIcon
        className={`h-5 w-5 ${dir === 'up' ? 'rotate-180' : ''}`}
      />
    </Button>
  )
}
