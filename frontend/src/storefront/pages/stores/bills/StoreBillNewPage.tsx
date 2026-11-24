import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '../../../../shared/useGoBack'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote } from '../../../../shared/ui/form'
import { FIELD_LABEL, fieldClass } from '../../../../shared/ui/field'
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl'
import { billsApi } from '../../../features/bills/billsApi'
import type { PickerProduct, PickerVariant } from '../../../features/bills/billsApi'
import { publicOrderApi } from '../../../features/stores/storesApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { ArrowLeftIcon, ArrowRightIcon, ClockIcon, PlusIcon, ReceiptIcon, SearchIcon } from '../../../layout/icons'
import { PageHeader } from '../ui/PageHeader'
import { PanelCard } from '../ui/PanelCard'
import { ItemPicker, Stepper } from './ItemPicker'
import { lineKey, loadDraft, rupees, saveDraft, Thumb, variantLabel } from './billUi'
import type { BillDraft } from './billUi'

/**
 * Create a bill — the seller fills the cart for a customer who ordered by
 * phone or is in the shop. Prices come from the products (the server prices
 * the bill once and keeps those prices). Next, the seller shares it from the
 * bill page. Phone-first: steps in one column, a sticky total + Review bar.
 */

const digits = (s: string) => s.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10)

/** "+91 98400 11223" for the review header. */
const spacedPhone = (s: string) => {
  const d = digits(s)
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : s
}

export function StoreBillNewPage() {
  const { store } = useManagedStore()
  const navigate = useNavigate()
  const goBack = useGoBack(`/mystores/${store.slug}/bills`)
  const [draft, setDraft] = useState<BillDraft>(() => loadDraft(store.id))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [autoShipping, setAutoShipping] = useState<number | null>(null)

  useEffect(() => saveDraft(store.id, draft), [store.id, draft])

  // The store's usual delivery charge for these lines (the checkout quote).
  const quoteKey = draft.lines.map((l) => `${l.key}x${l.qty}`).join(',')
  useEffect(() => {
    if (draft.lines.length === 0) {
      setAutoShipping(null)
      return
    }
    let live = true
    const handle = setTimeout(() => {
      publicOrderApi
        .quote(store.slug, {
          fulfilment: 'DELIVERY',
          items: draft.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.qty })),
        })
        .then((quote) => live && setAutoShipping(Number(quote.shippingCharge)))
        .catch(() => live && setAutoShipping(null))
    }, 400)
    return () => {
      live = false
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteKey stands for the lines
  }, [store.slug, quoteKey])

  const set = <K extends keyof BillDraft>(key: K, value: BillDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((e) => {
      const { [key]: _gone, ...rest } = e
      return rest
    })
  }

  const subtotal = draft.lines.reduce((s, l) => s + Number(l.price) * l.qty, 0)
  const itemCount = draft.lines.reduce((s, l) => s + l.qty, 0)
  const discountRaw = Number(draft.discount) || 0
  const discount = Math.min(subtotal, Math.round(draft.discountType === 'PERCENT' ? (subtotal * Math.min(discountRaw, 100)) / 100 : discountRaw))
  const shipping = draft.shipping.trim() === '' ? autoShipping : Math.max(0, Math.round(Number(draft.shipping) || 0))
  const total = subtotal - discount + (shipping ?? 0)

  const addLine = (p: PickerProduct, v: PickerVariant, qty: number) => {
    const key = lineKey(p.id, v.id)
    setDraft((d) => {
      const found = d.lines.find((l) => l.key === key)
      const lines = found
        ? d.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(v.stock, l.qty + qty), stock: v.stock } : l))
        : [
            ...d.lines,
            {
              key,
              productId: p.id,
              variantId: v.id,
              name: p.name,
              variantLabel: variantLabel(p, v),
              price: v.price,
              stock: v.stock,
              imageUrl: v.imageUrl ?? p.imageUrl,
              qty: Math.min(v.stock, qty),
            },
          ]
      return { ...d, lines }
    })
    setErrors(({ items: _gone, ...rest }) => rest)
  }
  const changeQty = (key: string, by: number) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.flatMap((l) => (l.key !== key ? [l] : l.qty + by <= 0 ? [] : [{ ...l, qty: Math.min(l.stock, l.qty + by) }])),
    }))

  const review = () => {
    const e: Record<string, string> = {}
    if (digits(draft.phone).length !== 10) e.phone = 'Enter a 10-digit mobile number.'
    if (draft.lines.length === 0) e.items = 'Add at least one item.'
    if (draft.discountType === 'PERCENT' && discountRaw > 100) e.discount = 'A discount cannot be more than 100%.'
    if (draft.discountType === 'AMOUNT' && subtotal > 0 && discountRaw > subtotal) e.discount = `A discount cannot be more than the items (${rupees(subtotal)}).`
    if (!e.items && !e.discount && subtotal - discount + (shipping ?? 0) <= 0) e.discount = 'The total must be more than ₹0.'
    setErrors(e)
    if (Object.keys(e).length === 0) {
      setSaveError(null)
      setReviewOpen(true)
    }
  }

  const make = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const bill = await billsApi.create(store.id, {
        customerPhone: digits(draft.phone),
        customerName: draft.name.trim() || undefined,
        items: draft.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.qty })),
        shippingCharge: draft.shipping.trim() === '' ? null : Math.max(0, Number(draft.shipping) || 0),
        discountType: draft.discountType,
        discountValue: discountRaw,
        note: draft.note.trim() || undefined,
        expiryDays: draft.expiryDays,
      })
      saveDraft(store.id, null)
      navigate(`/mystores/${store.slug}/bills/${bill.id}`, { replace: true })
    } catch (err) {
      setSaveError(toApiError(err).message)
      setSaving(false)
    }
  }

  const step = (n: number, title: string) => (
    <>
      <span className="text-muted">{n}.</span> {title}
    </>
  )

  return (
    <div className="ws-form space-y-4">
      <Button variant="ghost" size="md" className="-ml-2 px-2!" onClick={goBack}>
        <ArrowLeftIcon className="h-5 w-5" />
        Bills
      </Button>
      <PageHeader icon={ReceiptIcon} title="Create a bill" description="Pick what they are buying from your shop. Prices come from your products." />

      <PanelCard title={step(1, 'Customer')} description="Their WhatsApp number — you send them the bill.">
        <div className="space-y-4">
          <label className="block">
            <span className={FIELD_LABEL}>Mobile number</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-base text-muted">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                maxLength={14}
                value={draft.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="98400 11223"
                aria-invalid={errors.phone ? true : undefined}
                className={fieldClass({ invalid: !!errors.phone, className: 'pl-14' })}
              />
            </div>
            {errors.phone && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors.phone}</p>}
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>
              Name <span className="font-normal text-muted">(optional)</span>
            </span>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoComplete="off" placeholder="Shown on the bill" className={fieldClass()} />
          </label>
        </div>
      </PanelCard>

      <PanelCard
        title={step(2, 'What they are buying')}
        description={draft.lines.length ? `${itemCount} item${itemCount === 1 ? '' : 's'} · ${rupees(subtotal)}` : 'Search your shop by name, size, colour or code.'}
      >
        {draft.lines.length > 0 && (
          <ul className="-mt-2 mb-3 divide-y divide-line">
            {draft.lines.map((l) => (
              <li key={l.key} className="flex gap-3 py-3">
                <Thumb src={l.imageUrl} size="h-12 w-12" px="48px" />
                <div className="min-w-0 flex-1">
                  <p className="text-base leading-snug font-medium break-words text-fg">{l.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {l.variantLabel && <span className="font-medium text-fg">{l.variantLabel} · </span>}
                    {rupees(l.price)} each
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Stepper qty={l.qty} max={l.stock} label={l.name} onChange={(by) => changeQty(l.key, by)} />
                    <span className="ml-auto font-figure text-base font-semibold tabular-nums text-fg">{rupees(Number(l.price) * l.qty)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button variant={draft.lines.length ? 'secondary' : 'ink'} size="lg" full onClick={() => setPickerOpen(true)}>
          {draft.lines.length ? <PlusIcon className="h-5 w-5" /> : <SearchIcon className="h-5 w-5" />}
          {draft.lines.length ? 'Add more items' : 'Add items'}
        </Button>
        {errors.items && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors.items}</p>}
      </PanelCard>

      <PanelCard title={step(3, 'Delivery, discount and note')}>
        <div className="space-y-4">
          <label className="block">
            <span className={FIELD_LABEL}>Delivery charge (₹)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={draft.shipping}
              onChange={(e) => set('shipping', e.target.value)}
              placeholder={autoShipping === null ? 'Your usual rate' : autoShipping === 0 ? '0 — free' : String(autoShipping)}
              className={fieldClass()}
            />
            <span className="mt-1.5 block text-sm text-muted">Leave empty to use your usual delivery rate.</span>
          </label>
          <div>
            <span className={FIELD_LABEL}>
              Discount <span className="font-normal text-muted">(optional)</span>
            </span>
            <div className="flex gap-2">
              <SegmentedControl
                label="Discount type"
                value={draft.discountType}
                onChange={(v) => set('discountType', v)}
                options={[
                  { value: 'AMOUNT', label: '₹' },
                  { value: 'PERCENT', label: '%' },
                ]}
                cellClassName="min-h-10 px-3.5"
              />
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.discount}
                onChange={(e) => set('discount', e.target.value)}
                placeholder={draft.discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 200'}
                aria-label={draft.discountType === 'PERCENT' ? 'Discount in percent' : 'Discount in rupees'}
                aria-invalid={errors.discount ? true : undefined}
                className={fieldClass({ invalid: !!errors.discount })}
              />
            </div>
            {errors.discount && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors.discount}</p>}
          </div>
          <label className="block">
            <span className={FIELD_LABEL}>
              Note to the customer <span className="font-normal text-muted">(optional)</span>
            </span>
            <textarea value={draft.note} onChange={(e) => set('note', e.target.value)} maxLength={200} rows={2} placeholder="e.g. Blouse stitched to your size" className={fieldClass({ multiline: true })} />
          </label>
          <div>
            <span className={FIELD_LABEL}>Link stays open for</span>
            <SegmentedControl
              label="Link stays open for"
              value={String(draft.expiryDays) as '1' | '3' | '7'}
              onChange={(v) => set('expiryDays', Number(v) as 1 | 3 | 7)}
              options={[
                { value: '1', label: '1 day' },
                { value: '3', label: '3 days' },
                { value: '7', label: '7 days' },
              ]}
              className="w-full"
              cellClassName="min-h-10 px-3"
            />
            <span className="mt-1.5 block text-sm text-muted">They add their address when they pay. Stock goes down only when they pay.</span>
          </div>
        </div>
      </PanelCard>

      <div className="sticky bottom-[calc(var(--seller-dock,0px)+0.75rem)] z-20">
        <div className="ws-bar flex items-center gap-3 rounded-lg p-2 sm:p-3">
          <div className="min-w-0 flex-1 px-2">
            <p className="text-xs text-muted">
              {itemCount} item{itemCount === 1 ? '' : 's'}
              {shipping === null && draft.lines.length > 0 ? ' · + delivery' : ''}
            </p>
            <p className="font-figure text-xl leading-tight font-semibold tabular-nums text-fg">{rupees(total)}</p>
          </div>
          <Button variant="ink" size="lg" onClick={review}>
            Review bill
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ItemPicker storeId={store.id} open={pickerOpen} lines={draft.lines} onAdd={addLine} onQty={changeQty} onClose={() => setPickerOpen(false)} />

      <Dialog
        open={reviewOpen}
        onClose={() => !saving && setReviewOpen(false)}
        title="Review bill"
        // Who it is for, once: the name when given, and the number readable.
        subtitle={[draft.name.trim(), spacedPhone(draft.phone)].filter(Boolean).join(' · ')}
        footer={
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="secondary" size="lg" className="flex-1 sm:flex-none" onClick={() => setReviewOpen(false)} disabled={saving}>
              Edit
            </Button>
            <Button variant="ink" size="lg" className="flex-1 sm:flex-none" loading={saving} onClick={make}>
              Make bill
            </Button>
          </div>
        }
      >
        <div className="ws-form space-y-4">
          <ul className="-my-1 divide-y divide-line">
            {draft.lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-3">
                <Thumb src={l.imageUrl} size="h-10 w-10" px="40px" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-fg">{l.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {l.variantLabel && <>{l.variantLabel} · </>}
                    {l.qty} × {rupees(l.price)}
                  </p>
                </div>
                <span className="shrink-0 font-figure text-base font-medium tabular-nums text-fg">{rupees(Number(l.price) * l.qty)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-2 rounded-lg bg-surface-alt px-4 py-3 text-sm">
            <div className="flex justify-between text-muted">
              <dt>Items ({itemCount})</dt>
              <dd className="font-figure tabular-nums text-fg">{rupees(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Delivery</dt>
              <dd className="font-figure tabular-nums text-fg">{shipping === null ? 'Your usual rate' : shipping === 0 ? 'Free' : rupees(shipping)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted">
                <dt>Discount</dt>
                <dd className="font-figure tabular-nums text-fg">− {rupees(discount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="text-base font-semibold text-fg">Total</dt>
              <dd className="font-figure text-xl font-semibold tabular-nums text-fg">{rupees(total)}</dd>
            </div>
          </dl>

          <p className="flex items-start gap-2 text-sm text-muted">
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Link open for {draft.expiryDays} day{draft.expiryDays === 1 ? '' : 's'}. You send it from your WhatsApp next; it becomes a confirmed order when they pay.
            </span>
          </p>
          {saveError && <ErrorNote>{saveError}</ErrorNote>}
        </div>
      </Dialog>
    </div>
  )
}
