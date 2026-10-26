import { useState } from 'react'
import { Button } from '../../../../shared/ui/Button'
import { TextField } from '../../../../shared/ui/form'
import type { SupplyItem } from '../../api'
import { offerableVariants } from '../../offers'
import type { OfferDraft } from '../../offers'
import { money } from '../../ui'

/**
 * The price a supplier charges sellers, per option — asked on the product
 * editor's last step, so a new product is offered without a trip to another
 * page. Nothing is prefilled: the supplier types each price (an empty option
 * isn't offered). With several options, one "same price for all" fills them.
 */
export function OfferPrices({
  item,
  draft,
  onChange,
  disabled = false,
}: {
  item: SupplyItem
  draft: OfferDraft
  onChange: (draft: OfferDraft) => void
  disabled?: boolean
}) {
  const variants = offerableVariants(item)
  const single = variants.length === 1
  const [all, setAll] = useState('')
  const clean = (s: string) => s.replace(/[^\d.]/g, '').slice(0, 10)

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div>
        <h3 className="text-base font-semibold text-fg">Your price for sellers</h3>
        <p className="mt-0.5 text-sm text-muted">
          What you charge a seller for one piece. Sellers add their own margin on top.
          {!single && ' Leave an option empty if you don’t offer it.'}
        </p>
      </div>

      {!single && (
        <div className="flex items-end gap-2">
          <div className="w-40">
            <TextField
              label="Same price for all (₹)"
              inputMode="decimal"
              placeholder="e.g. 450"
              value={all}
              onChange={(e) => setAll(clean(e.target.value))}
              disabled={disabled}
            />
          </div>
          <Button
            variant="secondary"
            disabled={disabled || all === ''}
            onClick={() => onChange(Object.fromEntries(variants.map((v) => [v.variantId, all])))}
          >
            Apply to all
          </Button>
        </div>
      )}

      <ul className="divide-y divide-line">
        {variants.map((v) => {
          const typed = draft[v.variantId] ?? ''
          const above = typed !== '' && Number(typed) > v.price
          return (
            <li key={v.variantId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                {!single && <p className="text-sm font-medium text-fg">{v.name}</p>}
                <p className="text-xs text-muted">
                  Suggested price {money(v.price)} · {v.stock} in stock
                </p>
                {above && (
                  <p className="mt-1 text-xs text-warning">
                    Above your suggested price — sellers earn less selling it.
                  </p>
                )}
              </div>
              <div className="w-full sm:w-40">
                <TextField
                  label="Price for sellers (₹)"
                  inputMode="decimal"
                  placeholder="e.g. 450"
                  value={typed}
                  onChange={(e) => onChange({ ...draft, [v.variantId]: clean(e.target.value) })}
                  disabled={disabled}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
