import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { ErrorNote } from '../../../../../shared/ui/form'
import { formatPrice, storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { BoxIcon, CheckIcon } from '../../../../layout/icons'
import { BasicsStep } from './BasicsStep'
import { DeliveryStep } from './DeliveryStep'
import { DetailsStep } from './DetailsStep'
import { PhotosStep } from './PhotosStep'
import { PricingStep } from './PricingStep'
import { STEPS, StepButtons, StepShell, categoryOptions } from './shared'
import type { StepKey } from './shared'

/**
 * Adding — or finishing — a product, one question at a time.
 *
 * Six steps, a progress bar, and a draft on the server from the end of the
 * first step, so every later step saves on Continue and "finish later" always
 * keeps what was done. The same screen edits an existing product: the header
 * lets the seller jump to any step, and the review step says what is still
 * missing before it can go live (a photo and a price — nothing else is
 * required).
 */
export function ProductWizard({
  storeId,
  categories,
  product: initial,
  startAt = 'basics',
  onProductChange,
  onClose,
}: {
  storeId: string
  categories: StoreCategory[]
  /** null = adding a new product. */
  product: StoreProduct | null
  startAt?: StepKey
  onProductChange: (product: StoreProduct) => void
  onClose: () => void
}) {
  const [product, setProduct] = useState<StoreProduct | null>(initial)
  const [step, setStep] = useState<StepKey>(initial ? startAt : 'basics')

  const index = STEPS.findIndex((s) => s.key === step)
  const go = (delta: number) => {
    const target = STEPS[index + delta]
    if (target) setStep(target.key)
  }
  const saved = (next: StoreProduct) => {
    setProduct(next)
    onProductChange(next)
  }

  // A tick means the step's work is actually done, wherever the seller is
  // standing — an edited product opened at step 3 still shows what step 4
  // is missing. Delivery has valid defaults, so it is done once the draft is.
  const missing = new Set(product?.completeness.missing ?? [])
  const done: Record<StepKey, boolean> = {
    basics: product !== null,
    photos: product !== null && !missing.has('photo'),
    pricing: product !== null && !missing.has('price'),
    details: product !== null && !missing.has('description'),
    delivery: product !== null,
    review: product?.isActive ?? false,
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-surface-alt">
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold text-fg">
            {product ? product.name : 'Add a product'}
            {product?.isDraft && (
              <span className="ml-2 rounded-sm bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Draft
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-muted transition hover:text-fg"
          >
            {product ? 'Finish later' : 'Cancel'}
          </button>
        </div>

        {/* Steps — clickable once the draft exists, so nothing forces a straight line. */}
        <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {STEPS.map((s, i) => {
            const current = i === index
            const isDone = done[s.key]
            const reachable = product !== null || i === 0
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => reachable && setStep(s.key)}
                  disabled={!reachable}
                  aria-current={current ? 'step' : undefined}
                  className={`flex items-center gap-2 text-xs font-semibold transition disabled:cursor-default ${
                    current
                      ? 'text-brand'
                      : isDone
                        ? 'text-fg hover:text-brand'
                        : 'text-muted hover:text-fg'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                      current
                        ? 'bg-brand text-brand-contrast'
                        : isDone
                          ? 'bg-brand/15 text-brand'
                          : 'bg-surface text-muted'
                    }`}
                  >
                    {isDone ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            )
          })}
        </ol>

        {product && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span>Product {product.completeness.percent}% complete</span>
              <span>
                Step {index + 1} of {STEPS.length}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${product.completeness.percent}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="px-5 py-5">
        {step === 'basics' && (
          <BasicsStep
            storeId={storeId}
            categories={categories}
            product={product}
            onSaved={saved}
            onNext={() => go(1)}
          />
        )}
        {product && step === 'photos' && (
          <PhotosStep
            storeId={storeId}
            product={product}
            onSaved={saved}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        )}
        {product && step === 'pricing' && (
          <PricingStep
            storeId={storeId}
            categories={categories}
            product={product}
            onSaved={saved}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        )}
        {product && step === 'details' && (
          <DetailsStep
            storeId={storeId}
            categories={categories}
            product={product}
            onSaved={saved}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        )}
        {product && step === 'delivery' && (
          <DeliveryStep
            storeId={storeId}
            product={product}
            onSaved={saved}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        )}
        {product && step === 'review' && (
          <ReviewStep
            storeId={storeId}
            categories={categories}
            product={product}
            onSaved={saved}
            onBack={() => go(-1)}
            onJump={setStep}
            onDone={onClose}
          />
        )}
      </div>
    </div>
  )
}

const CHECKS: { key: StoreProduct['completeness']['missing'][number]; label: string; step: StepKey; required: boolean }[] = [
  { key: 'photo', label: 'At least one photo', step: 'photos', required: true },
  { key: 'price', label: 'A selling price', step: 'pricing', required: true },
  { key: 'description', label: 'A description', step: 'details', required: false },
  { key: 'specifications', label: 'A few specifications', step: 'details', required: false },
]

/**
 * Step 6 — the product as a customer will see it, what is still missing, and
 * the button that makes it live. Publishing needs a photo and a price;
 * everything else is a nudge for later.
 */
function ReviewStep({
  storeId,
  categories,
  product,
  onSaved,
  onBack,
  onJump,
  onDone,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onJump: (step: StepKey) => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cover = product.media.find((m) => m.type === 'IMAGE')?.url ?? null
  const category = categoryOptions(categories).find((c) => c.id === product.category.id)
  const missing = new Set(product.completeness.missing)
  const canPublish = !missing.has('photo') && !missing.has('price')

  const publish = async () => {
    setError(null)
    setBusy(true)
    try {
      onSaved(await storeCatalogApi.updateProduct(storeId, product.id, { isActive: true }))
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <StepShell
      title={product.isActive ? 'All set' : 'Review & publish'}
      lead={
        product.isActive
          ? 'This product is live. Anything you changed is already saved.'
          : 'Here is how it will look. Publish when you are happy — you can keep improving it afterwards.'
      }
    >
      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        {/* The storefront card, honestly. */}
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex aspect-square items-center justify-center bg-surface-alt">
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <BoxIcon className="h-12 w-12 text-muted" />
            )}
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-semibold text-fg">{product.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{category?.label ?? product.category.name}</p>
            <p className="mt-1.5 text-sm font-bold text-brand">
              {product.price && Number(product.price) > 0
                ? product.priceMax && product.priceMax !== product.price
                  ? `${formatPrice(product.price)} – ${formatPrice(product.priceMax)}`
                  : formatPrice(product.price)
                : 'No price yet'}
            </p>
            {product.hasVariants && (
              <p className="mt-0.5 text-[11px] text-muted">
                {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-fg">Checklist</p>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
            {CHECKS.map((check) => {
              const done = !missing.has(check.key)
              return (
                <li key={check.key} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      done ? 'bg-success/15 text-success' : 'bg-surface-alt text-muted'
                    }`}
                  >
                    {done ? <CheckIcon className="h-3.5 w-3.5" /> : '·'}
                  </span>
                  <span className={`flex-1 text-sm ${done ? 'text-fg' : 'text-muted'}`}>
                    {check.label}
                    {!done && (
                      <span className="ml-1.5 text-xs">
                        {check.required ? '— needed to publish' : '— optional'}
                      </span>
                    )}
                  </span>
                  {!done && (
                    <button
                      type="button"
                      onClick={() => onJump(check.step)}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Add
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {product.completeness.percent}% complete. Products with photos, a
            description and specifications get noticed more — but only a photo
            and a price are needed to go live.
          </p>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {product.isActive ? (
        <StepButtons onBack={onBack} onNext={onDone} nextLabel="Done" />
      ) : (
        <StepButtons
          onBack={onBack}
          onNext={() => void publish()}
          nextLabel="Publish to my store"
          busy={busy}
          canNext={canPublish}
          skip={onDone}
        />
      )}
    </StepShell>
  )
}
