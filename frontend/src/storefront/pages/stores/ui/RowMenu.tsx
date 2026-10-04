import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Dialog } from '../../../../shared/ui/Dialog'
import { DotsIcon } from '../../../layout/icons'

export interface RowMenuAction {
  label: string
  icon: ComponentType<{ className?: string }>
  /** One plain line under the label — what happens if you tap it. */
  note?: string
  /** Red, and always listed last. The caller still confirms before deleting. */
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

/**
 * "⋯ More" — where a row's rarer actions live (Edit details, Set as main,
 * Delete), so the row itself shows ONE labelled action and the destructive
 * one is never a stray tap away from a switch.
 *
 * Opens as a bottom sheet of thumb-sized rows that say what they do. The
 * trigger carries the word "More" from `sm` up and on phones keeps a 44px
 * square with an accessible name (`title` is the row's name, so a screen
 * reader hears "More for Cotton Saree").
 */
export function RowMenu({
  title,
  subtitle,
  actions,
  triggerLabel = 'More',
}: {
  /** Names the thing the actions are for — the sheet's heading. */
  title: ReactNode
  subtitle?: ReactNode
  actions: RowMenuAction[]
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  // Destructive actions last, whatever order the caller listed them in.
  const ordered = [...actions.filter((a) => !a.danger), ...actions.filter((a) => a.danger)]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={typeof title === 'string' ? `${triggerLabel} for ${title}` : triggerLabel}
        className="inline-flex h-tap min-w-tap shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface/60 px-2.5 text-[14px] font-semibold text-fg transition-colors hover:bg-surface"
      >
        <DotsIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{triggerLabel}</span>
      </button>

      <Dialog open={open} title={title} subtitle={subtitle} onClose={close} flush>
        <ul className="divide-y divide-line pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {ordered.map(({ label, icon: Icon, note, danger, disabled, onSelect }) => (
            <li key={label}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  close()
                  onSelect()
                }}
                className={`flex min-h-[56px] w-full items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-fg/5 disabled:cursor-not-allowed disabled:opacity-45 ${
                  danger ? 'text-danger' : 'text-fg'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    danger ? 'bg-danger/10' : 'bg-brand-soft text-brand'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{label}</span>
                  {note && <span className="mt-0.5 block text-hint text-muted">{note}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  )
}
