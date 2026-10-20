import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ErrorNote, TextField } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { BoxIcon, RupeeIcon } from '../../../../storefront/layout/icons'
import { BigSwitch, PageHeader, showToast } from '../../../../storefront/pages/stores/ui'
import { supplierApi } from '../../api'
import type { SupplyItem } from '../../api'
import { money, useLoad } from '../../ui'

type Draft = { isOpen: boolean; variants: Record<string, { cost: string; isOpen: boolean }> }

const toDraft = (item: SupplyItem): Draft => ({
  isOpen: item.isOpen,
  variants: Object.fromEntries(
    item.variants.map((v) => [v.variantId, { cost: v.cost == null ? '' : costText(v.cost), isOpen: v.isOpen }]),
  ),
})

const COST_RE = /^\d+(\.\d{1,2})?$/
const costText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Products for sellers: the supplier's own products, each with an on/off
 * switch and a price for sellers per option (SU-11, SU-12). Bulk: tick
 * products → "Offer at shop price − N %", which fills the prices, still
 * editable after.
 */
export function SupplyPage() {
  const { store } = useManagedStore()
  const supply = useLoad(() => supplierApi.supply(store.id), [store.id])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pct, setPct] = useState('20')
  const [bulkBusy, setBulkBusy] = useState(false)

  const items = supply.data
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const bulk = async () => {
    const n = Number(pct)
    if (!(n >= 0 && n <= 90)) {
      showToast('Enter a discount from 0 to 90 %', 'danger')
      return
    }
    setBulkBusy(true)
    try {
      supply.setData(await supplierApi.bulk(store.id, [...selected], n))
      showToast(`${selected.size} product${selected.size === 1 ? '' : 's'} offered — check the prices below`)
      setSelected(new Set())
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={RupeeIcon}
        title="Products for sellers"
        description="Choose which of your products sellers can sell, and the price you charge them for each."
      />

      {supply.loading && !items && <PageSkeleton label="Loading your products" />}
      {supply.error && <ErrorState message={supply.error} onRetry={supply.reload} />}

      {items && items.length === 0 && (
        <EmptyState
          icon={BoxIcon}
          title="Add your products first"
          description="Add the products you'll supply, with photos, options and stock. Then come back to offer them to sellers."
          action={
            <Link to="../products" className={buttonClass({ variant: 'primary' })}>
              Add products
            </Link>
          }
        />
      )}

      {items && items.length > 0 && (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-alt p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="text-sm font-semibold text-fg">Offer many at once</p>
              <p className="text-xs text-muted">
                Tick products below, then set every option to your shop price minus a discount.
              </p>
            </div>
            <div className="w-full sm:w-36">
              <TextField
                label="Discount (%)"
                inputMode="numeric"
                value={pct}
                onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))}
              />
            </div>
            <Button disabled={selected.size === 0} loading={bulkBusy} onClick={bulk}>
              {selected.size === 0 ? 'Tick products to offer' : `Offer ${selected.size} at shop price − ${pct || 0}%`}
            </Button>
          </div>

          <ul className="space-y-3">
            {items.map((item) => (
              <SupplyRow
                key={item.productId}
                item={item}
                storeId={store.id}
                selected={selected.has(item.productId)}
                onSelect={() => toggle(item.productId)}
                onSaved={(saved) =>
                  supply.setData((prev) => prev?.map((p) => (p.productId === saved.productId ? saved : p)) ?? prev)
                }
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function SupplyRow({
  item,
  storeId,
  selected,
  onSelect,
  onSaved,
}: {
  item: SupplyItem
  storeId: string
  selected: boolean
  onSelect: () => void
  onSaved: (item: SupplyItem) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item))
  const [base, setBase] = useState(item)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A bulk offer replaces the item from outside: start again from it.
  if (base !== item) {
    setBase(item)
    setDraft(toDraft(item))
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(item))
  const single = item.variants.length === 1

  const setVariant = (id: string, patch: Partial<{ cost: string; isOpen: boolean }>) =>
    setDraft((d) => ({ ...d, variants: { ...d.variants, [id]: { ...d.variants[id]!, ...patch } } }))

  const save = async () => {
    const variants = item.variants.map((v) => {
      const d = draft.variants[v.variantId]!
      const isOpen = single ? draft.isOpen : d.isOpen
      return { variantId: v.variantId, cost: d.cost === '' ? null : Number(d.cost), isOpen }
    })
    const bad = variants.find((v, i) => v.isOpen && !COST_RE.test(draft.variants[item.variants[i]!.variantId]!.cost))
    if (draft.isOpen && bad) {
      setError('Enter a price for sellers for each option you offer')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await supplierApi.updateSupply(storeId, item.productId, { isOpen: draft.isOpen, variants }))
      showToast(draft.isOpen ? 'Saved — your sellers see the new prices' : 'No longer offered to sellers')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${item.name}`}
          className="mt-3 h-5 w-5 shrink-0 accent-[var(--brand)]"
        />
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          {item.imageUrl && (
            <MediaImg src={item.imageUrl} sizes="48px" alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-fg">{item.name}</p>
          {!item.isActive && <p className="text-xs text-muted">Hidden in your shop</p>}
          <BigSwitch
            checked={draft.isOpen}
            onChange={(on) => setDraft((d) => ({ ...d, isOpen: on }))}
            label={`Offer ${item.name} to sellers`}
            onText="Offered to sellers"
            offText="Not offered"
          />
        </div>
      </div>

      {draft.isOpen && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {item.variants.map((v) => {
            const d = draft.variants[v.variantId]!
            const cost = Number(d.cost)
            const above = d.cost !== '' && cost > v.price
            return (
              <div key={v.variantId} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  {!single && <p className="text-sm font-medium text-fg">{v.name}</p>}
                  <p className="text-xs text-muted">
                    Shop price {money(v.price)} · {v.stock} in stock
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-36">
                    <TextField
                      label="Price for sellers (₹)"
                      inputMode="decimal"
                      value={d.cost}
                      onChange={(e) => setVariant(v.variantId, { cost: e.target.value.replace(/[^\d.]/g, '') })}
                      disabled={!single && !d.isOpen}
                    />
                  </div>
                  {!single && (
                    <BigSwitch
                      checked={d.isOpen}
                      onChange={(on) => setVariant(v.variantId, { isOpen: on })}
                      label={`Offer ${v.name}`}
                      showState={false}
                    />
                  )}
                </div>
                {above && (
                  <p className="text-xs text-warning sm:basis-full">
                    Above your shop price — sellers will earn less selling it.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(item))}>
            Undo
          </Button>
          <Button size="sm" loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </li>
  )
}
