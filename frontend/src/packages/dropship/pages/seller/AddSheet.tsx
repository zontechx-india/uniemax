import { useMemo, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, InfoNote, Select, TextField } from '../../../../shared/ui/form'
import { BoxIcon } from '../../../../storefront/layout/icons'
import { BigSwitch } from '../../../../storefront/pages/stores/ui'
import { suppliedApi } from '../../api'
import type { Catalog, CatalogItem } from '../../api'
import { capAtMrp, earnTone, onTop, priceOk, resultLine } from '../../pricing'
import { money } from '../../ui'

const NEW_SHELF = 'new'

/**
 * The add sheet (docs/dropshipping/supplier-products → Flows): one product
 * with its price per option, or many at once with one "Add on top" rule. The
 * result line uses this store's own delivery charge; it warns, never blocks.
 */
export function AddSheet({
  storeId,
  items,
  context,
  onClose,
  onAdded,
}: {
  storeId: string
  items: CatalogItem[]
  context: Catalog['store']
  onClose: () => void
  onAdded: (count: number, firstProductId: string | null) => void
}) {
  const one = items.length === 1 ? items[0]! : null
  const sameCost = one ? new Set(one.variants.map((v) => v.cost)).size === 1 : false
  const firstCategory = items[0]?.category ?? null

  // Price: one field when every option costs the same; otherwise "add on top"
  // with the result per option, or each price by hand.
  const startPrice = one ? Math.min(...one.variants.map((v) => v.suggested)) : 0
  const [single, setSingle] = useState(String(startPrice))
  const cheapest = (item: CatalogItem) => item.variants.reduce((a, b) => (b.cost < a.cost ? b : a))
  const [topMode, setTopMode] = useState<'amount' | 'percent'>(one ? 'amount' : 'percent')
  const [topValue, setTopValue] = useState(() =>
    one ? String(Math.max(0, cheapest(one).suggested - cheapest(one).cost)) : '30',
  )
  const [byHand, setByHand] = useState(false)
  const [hand, setHand] = useState<Record<string, string>>(() =>
    Object.fromEntries((one?.variants ?? []).map((v) => [v.supplyVariantId, String(v.suggested)])),
  )
  const [fixed, setFixed] = useState(false)
  const matching = context.shelves.find((s) => firstCategory && s.globalCategoryId === firstCategory.id)
  const [shelf, setShelf] = useState<string>(
    matching?.id ?? (firstCategory ? NEW_SHELF : context.shelves[0]?.id ?? ''),
  )
  const [delivery, setDelivery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const top = Number(topValue)
  const priceFor = (v: CatalogItem['variants'][number]) => {
    if (one && sameCost) return capAtMrp(Number(single), v.mrp)
    if (one && byHand) return Number(hand[v.supplyVariantId])
    return onTop(v.cost, topMode, Number.isFinite(top) ? top : 0, v.mrp)
  }

  const rows = useMemo(
    () =>
      items.map((item) => {
        const prices = item.variants.map((v) => ({ v, price: priceFor(v) }))
        const low = prices.reduce((a, b) => (b.price - b.v.cost < a.price - a.v.cost ? b : a))
        const line = resultLine({
          price: low.price,
          cost: low.v.cost,
          rate: pickupOnly(context) ? { type: 'FLAT', amount: Number(delivery) || 0, freeAbove: null } : context.deliveryRate,
          supplierShipping: item.supplierShippingFee,
          platformFeePct: context.platformFeePct,
        })
        return { item, prices, line, tone: earnTone(line.youEarn, low.price, context.minMarginWarnPct) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, single, topMode, topValue, byHand, hand, delivery, context],
  )

  const bad = rows.flatMap((r) => r.prices.filter((p) => !priceOk(p.price, p.v.cost, p.v.mrp)).map((p) => ({ r, p })))
  const minMrp = one ? Math.min(...one.variants.map((v) => v.mrp ?? Infinity)) : Infinity
  const earn = rows[0]?.line.youEarn ?? 0

  const submit = async () => {
    setError(null)
    if (bad.length > 0) {
      const { r, p } = bad[0]!
      setError(
        `${r.item.name}${p.v.isDefault ? '' : ` (${p.v.name})`}: price must be between ${money(p.v.cost)} and ${
          p.v.mrp != null ? money(p.v.mrp) + ' (MRP)' : 'any amount above it'
        }.`,
      )
      return
    }
    if (!shelf) {
      setError('Choose a shelf for it')
      return
    }
    if (pickupOnly(context) && !(Number(delivery) >= 0 && delivery !== '')) {
      setError('Set your delivery charge — supplier products need home delivery')
      return
    }
    setBusy(true)
    try {
      const res = await suppliedApi.add(storeId, {
        items: items.map((item) => ({
          supplyProductId: item.supplyProductId,
          ...(one
            ? { prices: rows[0]!.prices.map((p) => ({ supplyVariantId: p.v.supplyVariantId, price: p.price })) }
            : {}),
        })),
        shelf: shelf === NEW_SHELF ? { newShelf: true } : { shelfId: shelf },
        ...(!one ? { addOnTop: topMode === 'amount' ? { amount: top } : { percent: top } } : {}),
        followCost: !fixed,
        ...(pickupOnly(context) ? { deliveryAmount: Number(delivery) } : {}),
      })
      onAdded(res.filter((r) => r.added).length, res[0]?.productId ?? null)
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  const toneClass = (tone: 'ok' | 'low' | 'loss') =>
    tone === 'loss' ? 'text-danger' : tone === 'low' ? 'text-warning' : 'text-success'

  return (
    <Dialog
      open
      title={one ? 'Add to my store' : `Add ${items.length} to my store`}
      subtitle={one ? `Supplied by ${one.supplier.name}` : 'One price rule for all of them; you can change each later.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            {one ? 'Add to my store' : `Add ${items.length} to my store`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {one && (
          <div className="flex items-center gap-3">
            <span className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt text-muted">
              {one.imageUrl ? (
                <MediaImg src={one.imageUrl} sizes="56px" alt="" className="h-full w-full object-cover" />
              ) : (
                <BoxIcon className="m-4 h-6 w-6" />
              )}
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-fg">{one.name}</p>
              <p className="text-xs text-muted">
                Supplier price {one.costMin === one.costMax ? money(one.costMin) : `${money(one.costMin)}–${money(one.costMax)}`}
              </p>
            </div>
          </div>
        )}

        {/* ---- price ---- */}
        {one && sameCost ? (
          <TextField
            label="Your selling price (₹)"
            inputMode="decimal"
            value={single}
            onChange={(e) => setSingle(e.target.value.replace(/[^\d.]/g, ''))}
            hint={minMrp !== Infinity ? `Can't be more than ${money(minMrp)} (MRP).` : undefined}
          />
        ) : (
          <div className="space-y-3">
            {!byHand && (
              <div>
                <span className="mb-1.5 block text-sm font-medium text-fg">Add on top of supplier price</span>
                <div className="flex gap-2">
                  <Select
                    className="h-field"
                    containerClassName="w-24"
                    value={topMode}
                    onChange={(e) => setTopMode(e.target.value as 'amount' | 'percent')}
                    aria-label="Add on top as rupees or percent"
                  >
                    <option value="amount">₹</option>
                    <option value="percent">%</option>
                  </Select>
                  <div className="flex-1">
                    <TextField
                      label=""
                      aria-label="How much to add on top"
                      inputMode="decimal"
                      value={topValue}
                      onChange={(e) => setTopValue(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                </div>
              </div>
            )}
            {one && (
              <ul className="divide-y divide-line rounded-md border border-line">
                {rows[0]!.prices.map(({ v, price }) => (
                  <li key={v.supplyVariantId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-fg">{v.name}</p>
                      <p className="text-xs text-muted">
                        Supplier {money(v.cost)}
                        {v.mrp != null ? ` · MRP ${money(v.mrp)}` : ''}
                      </p>
                    </div>
                    {byHand ? (
                      <div className="w-28">
                        <TextField
                          label=""
                          aria-label={`Your price for ${v.name}`}
                          inputMode="decimal"
                          value={hand[v.supplyVariantId] ?? ''}
                          onChange={(e) =>
                            setHand((h) => ({ ...h, [v.supplyVariantId]: e.target.value.replace(/[^\d.]/g, '') }))
                          }
                        />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-fg">{money(price)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {one && (
              <Button variant="ghost" size="sm" onClick={() => setByHand((b) => !b)}>
                {byHand ? 'Use one rule for all options' : 'Set each price myself'}
              </Button>
            )}
          </div>
        )}

        {/* ---- result ---- */}
        {one ? (
          <div className="rounded-md bg-surface-alt p-3 text-sm text-fg">
            If someone buys 1: customer pays {money(rows[0]!.line.customerPays)}
            {rows[0]!.line.delivery > 0 ? ` (${money(rows[0]!.line.customerPays - rows[0]!.line.delivery)} + ${money(rows[0]!.line.delivery)} delivery)` : ''} →
            supplier gets {money(rows[0]!.line.supplierGets - one.supplierShippingFee)}
            {one.supplierShippingFee > 0 ? ` + ${money(one.supplierShippingFee)} shipping` : ''}
            {rows[0]!.line.fee > 0 ? ` → UnieMax fee ${money(rows[0]!.line.fee)}` : ''} →{' '}
            <span className={`font-semibold ${toneClass(rows[0]!.tone)}`}>you earn {money(rows[0]!.line.youEarn)}</span>
            {rows[0]!.tone === 'loss' && <span className="block text-xs text-danger">You'd lose money on each sale at this price.</span>}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map(({ item, prices, line, tone }) => (
              <li key={item.supplyProductId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{item.name}</p>
                  <p className="text-xs text-muted">
                    Your price {money(Math.min(...prices.map((p) => p.price)))}
                    {prices.length > 1 ? '+' : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${toneClass(tone)}`}>You earn {money(line.youEarn)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ---- follow ---- */}
        <div className="space-y-2">
          <p className="text-sm text-fg">
            {fixed
              ? 'Your price stays as it is. If the supplier raises theirs above it, the product pauses until you change your price.'
              : one
                ? `If the supplier changes their price, yours changes by the same amount, so you keep earning ${money(earn)}.`
                : 'If a supplier changes their price, yours changes by the same amount, so you keep earning the same.'}
          </p>
          <BigSwitch
            checked={fixed}
            onChange={setFixed}
            label="Keep my price fixed instead"
            onText="Price fixed"
            offText="Follows the supplier"
          />
        </div>

        {/* ---- shelf ---- */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fg">Shelf in your shop</span>
          <Select className="h-field" value={shelf} onChange={(e) => setShelf(e.target.value)}>
            {!matching && firstCategory && (
              <option value={NEW_SHELF}>
                {one ? `+ New shelf: ${firstCategory.name ?? 'its category'}` : '+ Each on its own category shelf'}
              </option>
            )}
            {matching && !one && <option value={NEW_SHELF}>Each on its own category shelf</option>}
            {context.shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>

        {pickupOnly(context) && (
          <div className="rounded-md border border-line bg-surface-alt p-3">
            <p className="text-sm text-fg">
              Supplier products need home delivery. Turn on delivery for your shop:
            </p>
            <div className="mt-2">
              <TextField
                label="Delivery charge per order (₹)"
                inputMode="decimal"
                placeholder="0 for free delivery"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
          </div>
        )}

        {one && !one.codAllowed && <InfoNote>Online payment only for this supplier's products.</InfoNote>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Dialog>
  )
}

const pickupOnly = (context: Catalog['store']) => context.mode === 'PICKUP'
