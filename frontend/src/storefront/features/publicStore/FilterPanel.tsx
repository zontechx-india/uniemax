import { useEffect, useState } from 'react'
import { Button } from '../../../shared/ui/Button'
import { ModalClose, ModalShell } from '../../../shared/ui/ModalShell'
import { fieldClass } from '../../../shared/ui/field'
import { activeFilterCount, NO_FILTERS, type CatalogFilters } from './catalog'
import type { Skin } from './storeTheme'

/**
 * Filter panel — a right slide-over on desktop, a bottom sheet on mobile.
 * Live filters (Availability, Price Range) are derived from the catalog we
 * already have; Brand / Rating / Discount are future filters, shown disabled so
 * the layout is ready for them without a redesign. Edits are held in a draft
 * and committed on Apply (or Clear), so partial price typing never thrashes the
 * grid.
 */
export function FilterPanel({
  open,
  onClose,
  filters,
  onApply,
  skin,
}: {
  open: boolean
  onClose: () => void
  filters: CatalogFilters
  onApply: (filters: CatalogFilters) => void
  skin: Skin
}) {
  const [draft, setDraft] = useState<CatalogFilters>(filters)

  // Re-seed the draft each time the panel opens.
  useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  if (!open) return null

  const apply = () => {
    onApply(draft)
    onClose()
  }
  const clear = () => {
    setDraft(NO_FILTERS)
    onApply(NO_FILTERS)
    onClose()
  }

  return (
    <ModalShell
      onClose={onClose}
      placement="drawer-right"
      label="Filters"
      portal={false}
      panelClassName="flex flex-col overflow-hidden"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line py-2 pr-2 pl-4">
          <h2 className="text-lg font-semibold text-fg">Filters</h2>
          <ModalClose onClick={onClose} />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {/* Availability */}
          <section>
            <h3 className={`text-sm font-semibold ${skin.text}`}>
              Availability
            </h3>
            <label className="mt-2.5 flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={draft.inStockOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, inStockOnly: e.target.checked }))
                }
                className="h-4 w-4 accent-[var(--brand)]"
              />
              <span className={`text-sm ${skin.text}`}>In stock only</span>
            </label>
          </section>

          {/* Price range */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wide ${skin.muted}`}>
              Price Range
            </h3>
            <div className="mt-2.5 flex items-center gap-2">
              <PriceInput
                label="Min"
                value={draft.minPrice}
                placeholder="Min"
                onChange={(v) => setDraft((d) => ({ ...d, minPrice: v }))}
              />
              <span className={skin.muted}>–</span>
              <PriceInput
                label="Max"
                value={draft.maxPrice}
                placeholder="Max"
                onChange={(v) => setDraft((d) => ({ ...d, maxPrice: v }))}
              />
            </div>
          </section>

          {/* Future filters — wired-ready, disabled for now */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wide ${skin.muted}`}>
              More filters
            </h3>
            <ul className={`mt-2.5 space-y-2 text-sm ${skin.muted}`}>
              {['Brand', 'Rating', 'Discount'].map((label) => (
                <li key={label} className="flex items-center justify-between">
                  <span>{label}</span>
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                    Soon
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={clear}
            disabled={activeFilterCount(draft) === 0}
          >
            Clear all
          </Button>
          <Button className="flex-1" onClick={apply}>
            Apply
          </Button>
        </div>
    </ModalShell>
  )
}

function PriceInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: number | null
  placeholder: string
  onChange: (value: number | null) => void
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label} price</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.trim()
          onChange(raw === '' ? null : Math.max(0, Number(raw)))
        }}
        className={fieldClass({ dense: true })}
      />
    </label>
  )
}
