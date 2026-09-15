import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ErrorNote } from '../../../../shared/ui/form'
import { CHANNELS, partnerApi } from '../../api'
import type { AffiliateLink, Channel, PartnerProduct, PartnerStore } from '../../api'
import { CopyButton, Empty, Pager, StatusChip, inputClass, money, rateText, useLoad } from '../../ui'

/** Pick a store, browse what it lets you promote, get a link for it. */
export function StoresPage() {
  const stores = useLoad(() => partnerApi.stores(), [])
  const [selected, setSelected] = useState<PartnerStore | null>(null)
  const active = selected ?? stores.data?.[0] ?? null

  if (stores.loading) return <p className="text-sm text-muted">Loading…</p>
  if (stores.error) return <ErrorNote>{stores.error}</ErrorNote>
  if (!stores.data?.length) return <Empty>No store partnerships yet.</Empty>

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <ul className="space-y-2">
        {stores.data.map((store) => (
          <li key={store.id}>
            <button
              type="button"
              onClick={() => setSelected(store)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                active?.id === store.id ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface-alt'
              }`}
            >
              <p className="text-sm font-semibold text-fg">{store.storeName}</p>
              <p className="mt-0.5 text-xs text-muted">
                {rateText(store.commissionType, store.commissionRate)}
                {!store.programEnabled && ' · programme paused'}
              </p>
              <div className="mt-1.5">
                <StatusChip status={store.status} />
              </div>
            </button>
          </li>
        ))}
      </ul>

      {active && <StoreProducts key={active.id} store={active} />}
    </div>
  )
}

function StoreProducts({ store }: { store: PartnerStore }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const products = useLoad(
    () => partnerApi.products(store.storeId, { page, q: q || undefined }),
    [store.storeId, page, q],
  )
  const usable = store.status === 'ACTIVE' && store.programEnabled

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-fg">{store.storeName}</h2>
        <a
          href={`/store/${store.storeSlug}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-brand hover:underline"
        >
          Visit store
        </a>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Search products"
          className={`${inputClass} ml-auto max-w-xs`}
        />
      </div>

      {!usable && (
        <p className="mt-3 rounded-md bg-surface-alt p-3 text-sm text-muted">
          Links for this store are paused right now. Existing orders keep their commission.
        </p>
      )}

      {usable && <StoreLinkRow store={store} />}

      {products.error && <div className="mt-3"><ErrorNote>{products.error}</ErrorNote></div>}
      {products.data && products.data.items.length === 0 && (
        <div className="mt-3"><Empty>No products open to affiliates{q ? ' match your search' : ''}.</Empty></div>
      )}

      <ul className="mt-3 space-y-2">
        {products.data?.items.map((product) => (
          <ProductRow key={product.id} store={store} product={product} usable={usable} />
        ))}
      </ul>
      {products.data && <Pager meta={products.data.meta} onPage={setPage} />}
    </div>
  )
}

/** A link to the store's home page rather than one product. */
function StoreLinkRow({ store }: { store: PartnerStore }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-line bg-surface-alt/50 p-3">
      <div>
        <p className="text-sm font-semibold text-fg">Whole store</p>
        <p className="text-xs text-muted">Lands on the store home page. Every product bought still earns.</p>
      </div>
      <GetLink storeId={store.storeId} productId={null} label="Get store link" />
    </div>
  )
}

function ProductRow({
  store,
  product,
  usable,
}: {
  store: PartnerStore
  product: PartnerProduct
  usable: boolean
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line p-3">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-md bg-surface-alt" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{product.name}</p>
        <p className="text-xs text-muted">
          {money(product.price)} · you earn {rateText(product.commissionType, product.commissionRate)}
          {product.estimatedCommission != null && ` ≈ ${money(product.estimatedCommission)}`}
        </p>
      </div>
      {usable && <GetLink storeId={store.storeId} productId={product.id} label="Get product link" />}
    </li>
  )
}

/** Creates a link on demand and shows it inline with a copy button. */
function GetLink({
  storeId,
  productId,
  label,
}: {
  storeId: string
  productId: string | null
  label: string
}) {
  const [channel, setChannel] = useState<Channel | ''>('')
  const [link, setLink] = useState<AffiliateLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setLink(await partnerApi.createLink({ storeId, productId, channel: channel || null }))
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (link) {
    return (
      <div className="flex max-w-xs items-center gap-2">
        <code className="truncate rounded-md bg-surface-alt px-2 py-1 text-xs text-fg">{link.url}</code>
        <CopyButton text={link.url} />
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value as Channel | '')}
        className="h-9 rounded-md border border-line bg-input px-2 text-xs text-fg"
        aria-label="Channel"
      >
        <option value="">Any channel</option>
        {CHANNELS.map((c) => (
          <option key={c} value={c}>
            {c.charAt(0) + c.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      <Button size="sm" variant="ring" loading={busy} onClick={create}>
        {label}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
