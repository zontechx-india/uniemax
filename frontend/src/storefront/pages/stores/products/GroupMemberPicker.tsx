import { useEffect, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { formatPrice, storeCatalogApi } from '../../../features/stores/storesApi'
import type { GroupCandidate } from '../../../features/stores/storesApi'
import { BoxIcon, SearchIcon } from '../../../layout/icons'

/**
 * "Select products" — the store's own products as the values of an option.
 * A list to tick, not a search box to link from: the seller sees every
 * product with its cover, price and shelf, same shelf first because that is
 * where the other colours usually are. A row that cannot be picked says why
 * in one line instead of silently missing, so a seller never wonders where
 * the blue one went.
 */
export function GroupMemberPicker({
  open,
  storeId,
  productId,
  optionName,
  selectedIds,
  onClose,
  onAdd,
}: {
  open: boolean
  storeId: string
  productId: string
  /** The axis being filled — decides which products are eligible. */
  optionName: string
  /** Members already on the card (shown ticked and locked). */
  selectedIds: Set<string>
  onClose: () => void
  onAdd: (candidates: GroupCandidate[]) => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<GroupCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setPicked(new Set())
    setQ('')
  }, [open])

  // A short debounce so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      storeCatalogApi
        .listGroupCandidates(storeId, productId, {
          optionName,
          q: q.trim() || undefined,
        })
        .then((list) => {
          if (!cancelled) {
            setRows(list)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(toApiError(err).message)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, storeId, productId, optionName, q])

  const toggle = (id: string) =>
    setPicked((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const add = () => {
    if (!rows) return
    onAdd(rows.filter((row) => picked.has(row.id)))
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={`Other ${optionName} products`}
      subtitle="Tick the products of your store that are this item in another version."
      onClose={onClose}
      footer={
        <>
          <Button variant="ring" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="rise" size="sm" onClick={add} disabled={picked.size === 0}>
            {picked.size === 0 ? 'Add' : `Add ${picked.size}`}
          </Button>
        </>
      }
    >
      <label className="relative block">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your products…"
          autoFocus
          className="h-11 w-full rounded-md border border-line bg-input pl-10 pr-3.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
      </label>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {rows === null ? (
        <p className="mt-4 text-sm text-muted">Loading your products…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {q.trim()
            ? 'No product matches that name.'
            : 'No other products yet — create one for this value instead.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {rows.map((row) => {
            const locked = selectedIds.has(row.id) || row.eligibility === 'in-this-group'
            const blocked =
              !locked &&
              (row.eligibility === 'in-other-group' ||
                row.eligibility === 'has-typed-option' ||
                row.eligibility === 'too-many-options')
            const checked = locked || picked.has(row.id)
            return (
              <li key={row.id}>
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    blocked ? 'opacity-60' : 'cursor-pointer hover:bg-surface-alt'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked || blocked}
                    onChange={() => toggle(row.id)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  {row.imageUrl ? (
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
                      <BoxIcon className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">
                      {row.name}
                      {row.isDraft && (
                        <span className="ml-1.5 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          Draft
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {row.category.name}
                      {row.price && Number(row.price) > 0 && ` · ${formatPrice(row.price)}`}
                      {locked && ' · already in this group'}
                      {row.eligibility === 'in-other-group' &&
                        ` · already in another ${row.conflictGroup?.optionName ?? optionName} group${
                          row.conflictGroup?.otherName
                            ? ` (with "${row.conflictGroup.otherName}")`
                            : ''
                        }`}
                      {row.eligibility === 'has-typed-option' &&
                        ` · has its own typed ${optionName} values`}
                      {row.eligibility === 'too-many-options' && ' · already has 3 options'}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
