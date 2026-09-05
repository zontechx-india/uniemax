import { isValueAvailable } from '../stores/productOptions'
import { formatPrice } from '../stores/storesApi'
import type {
  OptionValues,
  ProductOptionType,
  PublicStoreVariant,
} from '../stores/storesApi'

/** The storefront skin classes the picker needs — a structural subset. */
interface PickerSkin {
  muted: string
  border: string
  chip: string
  text: string
  cta: string
}

/**
 * One control per option type. A customer picks Size, then Colour, and the
 * page resolves the combination to a variant.
 *
 * A value is greyed when no in-stock variant has it GIVEN the other current
 * choices — "M" dims while Blue is selected if there is no M/Blue, and comes
 * back when Red is chosen. Greyed values stay clickable on purpose: choosing
 * one re-greys the other pickers relative to it, so a customer can always walk
 * to a combination that exists instead of being boxed in.
 *
 * With a single option type (every product that predates option types) each
 * chip also shows its price, exactly as the old flat picker did — with two or
 * more types a chip's price depends on the other choices, so only the
 * selected combination's price is shown, at the top of the card.
 */
export function OptionPicker({
  optionTypes,
  variants,
  selection,
  onChange,
  skin,
}: {
  optionTypes: ProductOptionType[]
  variants: PublicStoreVariant[]
  selection: OptionValues
  onChange: (next: OptionValues) => void
  skin: PickerSkin
}) {
  if (optionTypes.length === 0) return null
  const single = optionTypes.length === 1

  return (
    <div className="mt-6 space-y-4">
      {optionTypes.map((type) => {
        const chosen = selection[type.name]
        return (
          <div key={type.name}>
            <p
              className={`text-xs font-bold uppercase tracking-wide ${skin.muted}`}
            >
              {type.name}
              {chosen && (
                <span className="ml-1.5 font-semibold normal-case tracking-normal">
                  · {chosen}
                </span>
              )}
            </p>
            <div
              className="mt-2 flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={type.name}
            >
              {type.values.map((value) => {
                const selected = chosen === value
                const available = isValueAvailable(
                  variants,
                  optionTypes,
                  selection,
                  type.name,
                  value,
                )
                // Single dimension: the chip IS the variant, so its price is
                // unambiguous and worth showing.
                const only = single
                  ? variants.find((v) => v.optionValues[type.name] === value)
                  : undefined
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-disabled={available ? undefined : true}
                    onClick={() => onChange({ ...selection, [type.name]: value })}
                    title={
                      available ? undefined : 'Not available with your other choices'
                    }
                    className={`rounded-md border px-3.5 py-2 text-left text-sm font-semibold transition-colors ${
                      selected
                        ? `border-brand ${skin.cta}`
                        : `${skin.border} ${skin.chip} ${skin.text}`
                    } ${!available && !selected ? 'opacity-40 line-through' : ''}`}
                  >
                    {value}
                    {single && (
                      <span className="block text-[11px] font-normal no-underline opacity-80">
                        {!only || only.stockQuantity <= 0
                          ? 'Out of stock'
                          : formatPrice(only.price)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
