import type { ReactNode } from 'react'
import { RowMenu } from './RowMenu'
import type { RowMenuAction } from './RowMenu'

/**
 * One item in a seller list — a product, a category, a bank account, a
 * footer location.
 *
 * The layout every one of those rows was improvising, made once:
 *
 *   [photo]  Name                       [status]
 *            two short facts at most
 *            ─────────────────────────────────────
 *            [ primary action ]  [switch]   [⋯ More]
 *
 * On a phone the actions drop to their own line under the text, so the name
 * keeps the full width instead of being squeezed to ~150px by a cluster of
 * icons; from `sm` up they sit on the right. Exactly ONE primary action is
 * shown with a word; everything rarer goes in `menu` (see `RowMenu`).
 *
 * Plain, not glass: rows live inside ONE `GlassCard` (`divide-y`), so a
 * forty-row list costs one blurred layer, not forty.
 */
export function ActionRow({
  leading,
  title,
  meta,
  below,
  status,
  primary,
  toggle,
  menu,
  menuTitle,
  onOpen,
}: {
  /** A 48px photo/logo, or an icon chip. */
  leading?: ReactNode
  title: ReactNode
  /** Up to two short facts ("₹499 · 12 in stock"). Wraps, never truncates. */
  meta?: ReactNode
  /** A third line under the facts — a progress nudge, linked-product chips. */
  below?: ReactNode
  /** A `StatusPill`, beside the title. */
  status?: ReactNode
  /** The ONE labelled action — usually an Edit button. */
  primary?: ReactNode
  /** A `BigSwitch` — kept apart from the menu so Delete is never beside it. */
  toggle?: ReactNode
  menu?: RowMenuAction[]
  /** Sheet heading for the menu; defaults to the title when it is text. */
  menuTitle?: string
  /** Makes the text block itself open the item (the primary is still shown). */
  onOpen?: () => void
}) {
  const text = (
    <>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-base font-semibold text-fg">{title}</span>
        {status}
      </span>
      {meta && <span className="mt-1 block text-hint text-muted">{meta}</span>}
    </>
  )

  const hasActions = primary || toggle || (menu && menu.length > 0)

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="block w-full min-w-0 rounded-md text-left outline-offset-4"
          >
            {text}
          </button>
        ) : (
          <div className="min-w-0">{text}</div>
        )}
        {below && <div className="mt-2">{below}</div>}
        </div>
      </div>

      {hasActions && (
        <div className="flex items-center gap-2 sm:shrink-0">
          {primary}
          {toggle && <div className="ml-auto sm:ml-2">{toggle}</div>}
          {menu && menu.length > 0 && (
            <div className={toggle ? '' : 'ml-auto'}>
              <RowMenu
                title={menuTitle ?? (typeof title === 'string' ? title : 'More')}
                actions={menu}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
