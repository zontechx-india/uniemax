import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../features/adminApi'
import type { ProductDetail } from '../../features/adminApi'
import { useAdminQuery } from '../../features/useAdminQuery'
import { Dialog } from '../../ui/Dialog'
import { Button, Chip, ErrorState, Skeleton } from '../../ui/primitives'
import { ActiveChip } from '../../ui/statusMeta'
import {
  formatCount,
  formatDateTime,
  formatMoneyExact,
  formatPriceRange,
} from '../../ui/format'
import { ExternalIcon } from '../../layout/icons'
import { ProductVisibilityDialog } from './ProductVisibilityDialog'

/**
 * One seller listing in full, opened over whichever list led to it (the
 * catalog table or a store's page) so the admin never loses their place.
 *
 * Read-only by design — the seller owns name, price, stock and copy. What
 * the console needs is to SEE what the shopper sees when a report comes in:
 * every image, the description, the option matrix, the spec table, the
 * delivery area. The single write, hide/restore, sits in the footer.
 *
 * The dialog is keyed on `productId`: mounting fresh per product means the
 * fetch, the selected image and any error state can never leak from one
 * listing into the next.
 */
export function ProductDetailDialog({
  productId,
  onClose,
  onChanged,
}: {
  /** The listing to show; `null` keeps the dialog closed. */
  productId: string | null
  onClose: () => void
  /** Fired after hide/restore lands, so the list behind can refresh. */
  onChanged?: () => void
}) {
  if (!productId) return null
  return (
    <ProductDetailPanel
      key={productId}
      productId={productId}
      onClose={onClose}
      {...(onChanged ? { onChanged } : {})}
    />
  )
}

function ProductDetailPanel({
  productId,
  onClose,
  onChanged,
}: {
  productId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const { data: product, loading, error, refresh } = useAdminQuery(
    () => adminApi.getProduct(productId),
    [productId],
  )
  const [moderating, setModerating] = useState(false)

  return (
    <>
      <Dialog
        open
        size="lg"
        title={product?.name ?? 'Product'}
        subtitle={
          product ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                to={`/stores/${product.store.id}`}
                className="text-accent hover:underline"
                onClick={onClose}
              >
                {product.store.name}
              </Link>
              <span aria-hidden>·</span>
              <span>{product.category.name}</span>
              <ActiveChip isActive={product.isActive} />
            </span>
          ) : null
        }
        onClose={onClose}
        footer={
          product ? (
            <>
              <a
                href={`/store/${product.store.slug}/product/${product.slug}`}
                target="_blank"
                rel="noreferrer"
                className="mr-auto inline-flex items-center gap-1 text-sm text-accent hover:underline"
              >
                Open on storefront
                <ExternalIcon />
              </a>
              <Button onClick={onClose}>Close</Button>
              <Button
                variant={product.isActive ? 'danger' : 'primary'}
                onClick={() => setModerating(true)}
              >
                {product.isActive ? 'Hide product' : 'Restore product'}
              </Button>
            </>
          ) : null
        }
      >
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !product || loading ? (
          <Skeleton rows={8} />
        ) : (
          <ProductBody product={product} />
        )}
      </Dialog>

      <ProductVisibilityDialog
        product={moderating && product ? product : null}
        onClose={() => setModerating(false)}
        onDone={() => {
          refresh()
          onChanged?.()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Body sections
// ---------------------------------------------------------------------------

function ProductBody({ product }: { product: ProductDetail }) {
  const flags = [
    product.isFeatured ? 'Featured' : null,
    product.isBestSeller ? 'Best seller' : null,
    product.isNewArrival ? 'New arrival' : null,
  ].filter((flag): flag is string => flag !== null)

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_1fr]">
        <Gallery media={product.media} name={product.name} />

        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="Price">{formatPriceRange(product.priceMin, product.priceMax)}</Fact>
            <Fact label="Stock">
              {product.stockTotal === 0 ? (
                <Chip tone="danger">Out of stock</Chip>
              ) : product.stockTotal <= 5 ? (
                <Chip tone="warning">{product.stockTotal} left</Chip>
              ) : (
                `${formatCount(product.stockTotal)} units`
              )}
            </Fact>
            <Fact label="Options">
              {product.optionTypes.length === 0
                ? 'Single product'
                : `${product.optionTypes.length} type${product.optionTypes.length === 1 ? '' : 's'} · ${product.variantCount} variants`}
            </Fact>
            <Fact label="Search">
              {product.hideFromSearch ? <Chip tone="warning">Hidden</Chip> : 'Searchable'}
            </Fact>
            <Fact label="Created">{formatDateTime(product.createdAt)}</Fact>
            <Fact label="Last updated">{formatDateTime(product.updatedAt)}</Fact>
          </dl>

          <div>
            <SectionLabel>Homepage sections</SectionLabel>
            {flags.length === 0 ? (
              <p className="text-sm text-muted">Not pinned to any section.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {flags.map((flag) => (
                  <Chip key={flag} tone="brand">
                    {flag}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Delivery area</SectionLabel>
            <DeliveryArea rule={product.deliveryRule} />
          </div>
        </div>
      </div>

      <section>
        <SectionLabel>Description</SectionLabel>
        {product.description ? (
          <p className="whitespace-pre-line text-sm text-fg">{product.description}</p>
        ) : (
          <p className="text-sm text-muted">The seller hasn't written a description.</p>
        )}
      </section>

      {product.optionTypes.length > 0 ? (
        <section>
          <SectionLabel>Options</SectionLabel>
          <ul className="space-y-2">
            {product.optionTypes.map((type) => (
              <li key={type.name} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm font-medium text-fg">{type.name}:</span>
                {type.values.map((value) => (
                  <Chip key={value}>{value}</Chip>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionLabel>
          {product.optionTypes.length > 0 ? 'Variants & pricing' : 'Pricing'}
        </SectionLabel>
        <VariantsTable product={product} />
      </section>

      {product.specifications.length > 0 ? (
        <section>
          <SectionLabel>Specifications</SectionLabel>
          <dl className="overflow-hidden rounded-md border border-line">
            {product.specifications.map((spec, index) => (
              <div
                key={`${spec.label}-${index}`}
                className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 border-b border-line px-3 py-2 text-sm last:border-0 odd:bg-surface-alt/60"
              >
                <dt className="text-muted">{spec.label}</dt>
                <dd className="text-fg">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h3>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-fg">{children}</dd>
    </div>
  )
}

/**
 * Every image the seller uploaded, in their order, with the first shown
 * large — the same order the storefront carousel uses, so what the admin
 * sees matches what was reported.
 */
function Gallery({ media, name }: { media: ProductDetail['media']; name: string }) {
  const items = media.filter((item) => item.url !== null)
  const [index, setIndex] = useState(0)
  const current = items[index] ?? items[0]

  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line bg-surface-alt text-sm text-muted">
        No images
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-line bg-surface-alt">
        {current.type === 'VIDEO' ? (
          <video src={current.url ?? undefined} controls className="aspect-square w-full object-contain" />
        ) : (
          <img
            src={current.url ?? undefined}
            alt={current.altText ?? name}
            className="aspect-square w-full object-contain"
          />
        )}
      </div>
      {items.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {items.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(itemIndex)}
              aria-label={`Show media ${itemIndex + 1}`}
              aria-pressed={itemIndex === index}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-surface-alt ${
                itemIndex === index ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-muted'
              }`}
            >
              {item.type === 'VIDEO' ? (
                <span className="flex h-full w-full items-center justify-center text-xs font-medium text-muted">
                  Video
                </span>
              ) : (
                <img src={item.url ?? undefined} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function DeliveryArea({ rule }: { rule: ProductDetail['deliveryRule'] }) {
  const [expanded, setExpanded] = useState(false)
  if (!rule) return <p className="text-sm text-fg">Follows the store's default rule.</p>
  if (rule.type === 'ALL') return <p className="text-sm text-fg">Delivers everywhere the store ships.</p>

  const PREVIEW = 12
  const shown = expanded ? rule.pincodes : rule.pincodes.slice(0, PREVIEW)
  const hidden = rule.pincodes.length - shown.length

  return (
    <div>
      <p className="text-sm text-fg">
        {rule.type === 'INCLUDE'
          ? `Delivers only to ${formatCount(rule.pincodes.length)} pincodes`
          : `Delivers everywhere except ${formatCount(rule.pincodes.length)} pincodes`}
        <span className="text-muted"> (product override)</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {shown.map((pincode) => (
          <Chip key={pincode} tone={rule.type === 'INCLUDE' ? 'info' : 'warning'}>
            {pincode}
          </Chip>
        ))}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-accent hover:underline"
          >
            +{hidden} more
          </button>
        ) : null}
      </div>
    </div>
  )
}

function VariantsTable({ product }: { product: ProductDetail }) {
  const hasOptions = product.optionTypes.length > 0
  const typeNames = product.optionTypes.map((type) => type.name)

  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt text-left text-xs text-muted">
          <tr>
            {hasOptions ? (
              typeNames.map((name) => (
                <th key={name} className="px-3 py-2 font-medium">
                  {name}
                </th>
              ))
            ) : (
              <th className="px-3 py-2 font-medium">Item</th>
            )}
            <th className="px-3 py-2 text-right font-medium">Price</th>
            <th className="px-3 py-2 text-right font-medium">Stock</th>
            <th className="px-3 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {product.variants.map((variant) => (
            <tr
              key={variant.id}
              className={`border-t border-line ${variant.isActive ? '' : 'text-muted'}`}
            >
              {hasOptions ? (
                typeNames.map((name) => (
                  <td key={name} className="px-3 py-2">
                    {variant.optionValues?.[name] ?? variant.name}
                  </td>
                ))
              ) : (
                <td className="px-3 py-2">{variant.isDefault ? product.name : variant.name}</td>
              )}
              <td className="px-3 py-2 text-right font-medium text-fg">
                {formatMoneyExact(variant.price)}
              </td>
              <td className="px-3 py-2 text-right">
                {variant.stockQuantity === 0 ? (
                  <span className="text-danger">0</span>
                ) : (
                  formatCount(variant.stockQuantity)
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {variant.isActive ? (
                  <Chip tone="success">Selling</Chip>
                ) : (
                  <Chip>Not sold</Chip>
                )}
              </td>
            </tr>
          ))}
          {product.variants.length === 0 ? (
            <tr className="border-t border-line">
              <td colSpan={(hasOptions ? typeNames.length : 1) + 3} className="px-3 py-4 text-center text-muted">
                No variants — this product can't be bought yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
