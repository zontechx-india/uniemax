import { isValueAvailable } from '../stores/productOptions'
import { formatPrice } from '../stores/storesApi'
import type {
  OptionValues,
  ProductOptionType,
  PublicProductMediaItem,
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
 * When the seller gave a value's variants their own photo (the pink saree's
 * pink photo), the value is shown AS that photo — a swatch with the name
 * under it, the way a shopper expects to choose a colour. A type whose values
 * have no photos stays a row of text chips.
 *
 * With a single option type each chip also shows its price — with two or
 * more types a chip's price depends on the other choices, so only the
 * selected combination's price is shown, at the top of the card.
 */
export function OptionPicker({
  optionTypes,
  variants,
  media,
  selection,
  onChange,
  skin,
}: {
  optionTypes: ProductOptionType[]
  variants: PublicStoreVariant[]
  /** The gallery, to resolve a variant's `mediaId` into a picture. */
  media: PublicProductMediaItem[]
  selection: OptionValues
  onChange: (next: OptionValues) => void
  skin: PickerSkin
}) {
  if (optionTypes.length === 0) return null
  const single = optionTypes.length === 1

  /**
   * The photo that stands for `value`: from a variant with that value which
   * agrees with the other current choices (so Red shows the M/Red photo
   * while M is chosen), else any variant with that value that has a photo.
   */
  const imageFor = (typeName: string, value: string): string | null => {
    const withPhoto = variants.filter(
      (variant) => variant.optionValues[typeName] === value && variant.mediaId,
    )
    const preferred =
      withPhoto.find((variant) =>
        optionTypes.every(
          (type) =>
            type.name === typeName ||
            selection[type.name] === undefined ||
            variant.optionValues[type.name] === selection[type.name],
        ),
      ) ?? withPhoto[0]
    if (!preferred) return null
    return media.find((item) => item.id === preferred.mediaId)?.url ?? null
  }

  return (
    <div className="mt-6 space-y-4">
      {optionTypes.map((type) => {
        const chosen = selection[type.name]
        const pictures = new Map(
          type.values.map((value) => [value, imageFor(type.name, value)]),
        )
        const swatches = [...pictures.values()].some(Boolean)
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
                const priceLine = single ? (
                  <span className="block text-[11px] font-normal no-underline opacity-80">
                    {!only || only.stockQuantity <= 0
                      ? 'Out of stock'
                      : formatPrice(only.price)}
                  </span>
                ) : null
                const common = {
                  type: 'button' as const,
                  role: 'radio',
                  'aria-checked': selected,
                  'aria-disabled': available ? undefined : true,
                  onClick: () => onChange({ ...selection, [type.name]: value }),
                  title: available ? undefined : 'Not available with your other choices',
                }
                const picture = pictures.get(value) ?? null

                if (swatches) {
                  return (
                    <button
                      key={value}
                      {...common}
                      className={`w-[4.5rem] overflow-hidden rounded-lg border text-center transition-colors sm:w-20 ${
                        selected
                          ? 'border-brand ring-2 ring-brand/40'
                          : `${skin.border} hover:border-brand`
                      } ${!available && !selected ? 'opacity-40' : ''}`}
                    >
                      <span className={`block aspect-[3/4] ${skin.chip}`}>
                        {picture ? (
                          <img
                            src={picture}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span
                            className={`flex h-full w-full items-center justify-center px-1 text-xs font-semibold ${skin.text}`}
                          >
                            {value}
                          </span>
                        )}
                      </span>
                      <span
                        className={`block truncate px-1 py-1 text-[11px] font-semibold ${
                          selected ? 'text-brand' : skin.text
                        } ${!available && !selected ? 'line-through' : ''}`}
                      >
                        {value}
                        {priceLine}
                      </span>
                    </button>
                  )
                }

                return (
                  <button
                    key={value}
                    {...common}
                    className={`rounded-md border px-3.5 py-2 text-left text-sm font-semibold transition-colors ${
                      selected
                        ? `border-brand ${skin.cta}`
                        : `${skin.border} ${skin.chip} ${skin.text}`
                    } ${!available && !selected ? 'opacity-40 line-through' : ''}`}
                  >
                    {value}
                    {priceLine}
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
