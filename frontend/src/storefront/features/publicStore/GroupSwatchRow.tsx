import { Link } from 'react-router-dom'
import { formatPrice, storeProductUrl } from '../stores/storesApi'
import type { PublicProductGroup } from '../stores/storesApi'
import { SaleTag } from './CartControls'

/** The storefront skin classes the row needs — a structural subset. */
interface RowSkin {
  muted: string
  border: string
  chip: string
  text: string
}

/**
 * One row per product FAMILY, above the option pickers: "Colour · Maroon"
 * and a swatch for every member — its cover, its value, its own price and
 * Sale — where the current page is ringed and every other swatch is a link
 * to that product's page. Choosing a colour here changes everything below
 * (gallery, price, sizes, stock), because it IS another product; the picker
 * under it changes only the variant of this one. Same markup as the
 * picker's swatches so the two rows read as one control.
 */
export function GroupSwatchRow({
  groups,
  storeSlug,
  skin,
}: {
  groups: PublicProductGroup[]
  storeSlug: string
  skin: RowSkin
}) {
  if (groups.length === 0) return null
  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => (
        <div key={group.optionName}>
          <p className={`text-xs font-bold uppercase tracking-wide ${skin.muted}`}>
            {group.optionName}
            <span className="ml-1.5 font-semibold normal-case tracking-normal">
              · {group.value}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label={group.optionName}>
            {group.members.map((member) => {
              const onSale =
                member.compareAtPrice !== null &&
                member.price !== null &&
                Number(member.compareAtPrice) > Number(member.price)
              const inner = (
                <>
                  <span className={`block aspect-[3/4] ${skin.chip}`}>
                    {member.image?.url ? (
                      <img
                        src={member.image.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        className={`flex h-full w-full items-center justify-center px-1 text-xs font-semibold ${skin.text}`}
                      >
                        {member.value}
                      </span>
                    )}
                  </span>
                  <span
                    className={`block truncate px-1 py-1 text-[11px] font-semibold ${
                      member.isCurrent ? 'text-brand' : skin.text
                    }`}
                  >
                    {member.value}
                    <span className="block text-[11px] font-normal opacity-80">
                      {member.stockQuantity <= 0
                        ? 'Out of stock'
                        : member.price
                          ? formatPrice(member.price)
                          : ''}
                    </span>
                    {onSale && (
                      <span className="mt-0.5 block">
                        <SaleTag />
                      </span>
                    )}
                  </span>
                </>
              )
              const className = `w-[4.5rem] overflow-hidden rounded-lg border text-center transition-colors sm:w-20 ${
                member.isCurrent
                  ? 'border-brand ring-2 ring-brand/40'
                  : `${skin.border} hover:border-brand`
              }`
              return (
                <div key={member.id} role="listitem">
                  {member.isCurrent ? (
                    <span aria-current="page" className={`block ${className}`}>
                      {inner}
                    </span>
                  ) : (
                    <Link
                      to={storeProductUrl(storeSlug, member.slug)}
                      className={`block ${className}`}
                      title={member.name}
                    >
                      {inner}
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
