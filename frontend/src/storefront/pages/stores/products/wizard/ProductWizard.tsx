import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toApiError } from '../../../../../shared/auth/http'
import { useMediaQuery } from '../../../../../shared/useMediaQuery'
import { Dialog } from '../../../../../shared/ui/Dialog'
import { formatPrice, storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { BoxIcon, CheckIcon, ChevronDownIcon, CloseIcon } from '../../../../layout/icons'
import { BasicsStep } from './BasicsStep'
import { DeliveryStep } from './DeliveryStep'
import { DetailsStep } from './DetailsStep'
import { PhotosStep } from './PhotosStep'
import { PricingStep } from './PricingStep'
import { categoryOptions, StepButtons, StepError, STEPS, StepShell } from './shared'
import { buttonClass } from '../../../../../shared/ui/Button'
import type { StepKey } from './shared'
import { MediaImg } from '../../../../../shared/media/MediaImg'
import { Button } from '../../../../../shared/ui/Button'

/**
 * Adding — or finishing — a product, one question at a time.
 *
 * Six steps, a progress bar, and a draft on the server from the end of the
 * first step, so every later step saves on Continue and "finish later" always
 * keeps what was done. The same screen edits an existing product: the header
 * lets the seller jump to any step, and the review step says what is still
 * missing before it can go live (a photo and a price — nothing else is
 * required).
 *
 * On a PHONE it takes the whole screen (portalled to <body>, so the glass
 * panel it is opened from cannot trap it): a slim frosted header — close,
 * the product, "Step 2 of 6 · Photos" (a button that lists every step), a
 * segmented progress bar — over a scrolling step whose Continue bar is
 * sticky. The old inline version wrapped its six-step rail onto three lines
 * and pushed the first field below the fold. On a desktop it stays inline.
 */
export function ProductWizard({
  storeId,
  categories,
  product: initial,
  startAt = 'basics',
  onProductChange,
  onCatalogChanged,
  onCategoriesChange,
  onClose,
}: {
  storeId: string
  categories: StoreCategory[]
  /** null = adding a new product. */
  product: StoreProduct | null
  startAt?: StepKey
  onProductChange: (product: StoreProduct) => void
  /** Other products changed server-side (a family was saved) — reload the list. */
  onCatalogChanged?: () => void
  /** A category was added from inside the wizard. */
  onCategoriesChange?: (categories: StoreCategory[]) => void
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
  /** Carry on in another product — "Create new product for this value" lands on its Photos. */
  const switchTo = (next: StoreProduct, at: StepKey) => {
    setProduct(next)
    onProductChange(next)
    setStep(at)
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

  const [stepsOpen, setStepsOpen] = useState(false)
  const phone = !useMediaQuery('(min-width: 640px)')
  const title = product ? product.name : 'Add a product'
  const closeLabel = product ? 'Finish later' : 'Cancel'

  const stepList = (onPick?: () => void) => (
    <ol className="space-y-1">
      {STEPS.map((s, i) => {
        const current = i === index
        const isDone = done[s.key]
        const reachable = product !== null || i === 0
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => {
                if (!reachable) return
                setStep(s.key)
                onPick?.()
              }}
              disabled={!reachable}
              aria-current={current ? 'step' : undefined}
              className={`flex min-h-tap w-full items-center gap-3 rounded-xl px-2.5 text-left text-base font-semibold transition disabled:cursor-default disabled:opacity-50 ${
                current ? 'bg-brand-soft text-brand' : 'text-fg hover:bg-fg/5'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  current
                    ? 'bg-brand-gradient text-brand-contrast'
                    : isDone
                      ? 'bg-success text-brand-contrast'
                      : 'glass-inset text-muted'
                }`}
              >
                {isDone && !current ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </span>
              {s.label}
            </button>
          </li>
        )
      })}
    </ol>
  )

  const progress = (
    <div className="flex gap-1" aria-hidden>
      {STEPS.map((s, i) => (
        <span
          key={s.key}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i === index ? 'bg-brand-gradient' : done[s.key] ? 'bg-success/70' : 'bg-fg/10'
          }`}
        />
      ))}
    </div>
  )

  const steps = (
    <>
        {step === 'basics' && (
          <BasicsStep
            storeId={storeId}
            categories={categories}
            product={product}
            onSaved={saved}
            onNext={() => go(1)}
            onCategoriesChange={onCategoriesChange}
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
            onOtherProductChange={onProductChange}
            onCatalogChanged={() => onCatalogChanged?.()}
            onSwitchProduct={switchTo}
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

    </>
  )

  const stepSheet = (
    <Dialog open={stepsOpen} title="All steps" subtitle={title} onClose={() => setStepsOpen(false)}>
      {stepList(() => setStepsOpen(false))}
    </Dialog>
  )

  if (phone) {
    return (
      <FullScreen>
        <header className="glass-strong shrink-0 rounded-none border-x-0 border-t-0 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label={product ? 'Close — your work is saved' : 'Cancel'}
              className="flex size-tap shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-fg">{title}</p>
              <button
                type="button"
                onClick={() => setStepsOpen(true)}
                aria-haspopup="dialog"
                className="-ml-1 inline-flex min-h-8 max-w-full items-center gap-1 rounded-lg px-1 text-xs font-semibold text-brand"
              >
                {/* One line always — a wrapped step name pushed the chevron
                    off on its own and doubled the header's height. */}
                <span className="truncate">
                  Step {index + 1} of {STEPS.length} · {STEPS[index]!.label}
                </span>
                <ChevronDownIcon className="h-4 w-4 shrink-0" />
              </button>
            </div>
            {product && (
              <Button variant="ghost"
                onClick={onClose}
                className="shrink-0 px-3"
              >
                {closeLabel}
              </Button>
            )}
          </div>
          <div className="mt-2 px-1.5">{progress}</div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {steps}
        </div>
        {stepSheet}
      </FullScreen>
    )
  }

  return (
    <div className="glass-card mt-5 rounded-glass">
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 font-heading text-lg font-bold text-fg">
            <span className="truncate">{title}</span>
            {product?.isDraft && (
              <span className="shrink-0 rounded-pill bg-fg/6 px-2.5 py-0.5 text-xs font-semibold text-muted">
                Draft
              </span>
            )}
          </h2>
          <Button variant="ghost"
            onClick={onClose}
            className="px-3"
          >
            {closeLabel}
          </Button>
        </div>

        {/* Steps — clickable once the draft exists, so nothing forces a straight line. */}
        <ol className="mt-3 flex flex-wrap gap-1">
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
                  className={`flex min-h-tap items-center gap-2 rounded-xl px-2.5 text-sm font-semibold transition disabled:cursor-default ${
                    current
                      ? 'bg-brand-soft text-brand'
                      : isDone
                        ? 'text-fg hover:bg-fg/5'
                        : 'text-muted hover:bg-fg/5 hover:text-fg'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      current
                        ? 'bg-brand-gradient text-brand-contrast'
                        : isDone
                          ? 'bg-success text-brand-contrast'
                          : 'glass-inset text-muted'
                    }`}
                  >
                    {isDone && !current ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            )
          })}
        </ol>

        {product && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-hint font-semibold text-muted">
              <span>Product {product.completeness.percent}% complete</span>
              <span>
                Step {index + 1} of {STEPS.length}
              </span>
            </div>
            {progress}
          </div>
        )}
      </header>

      <div className="px-5 py-5">{steps}</div>
      {stepSheet}
    </div>
  )
}

/**
 * The phone frame: a full-screen layer on the seller canvas, portalled out of
 * the glass panel, with the page behind it locked so only the step scrolls.
 */
function FullScreen({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product editor"
      className="seller-canvas fixed inset-0 z-40 flex flex-col"
    >
      {children}
    </div>,
    document.body,
  )
}

const CHECKS: { key: StoreProduct['completeness']['missing'][number]; label: string; step: StepKey; required: boolean }[] = [
  { key: 'photo', label: 'At least one photo', step: 'photos', required: true },
  { key: 'price', label: 'A selling price', step: 'pricing', required: true },
  { key: 'description', label: 'A description', step: 'details', required: false },
  { key: 'specifications', label: 'A few product facts', step: 'details', required: false },
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
        {/* The storefront card, honestly. A compact row on a phone — a
            full-width square (empty, before a photo) pushed the checklist
            and the reason Publish is greyed out below the fold. */}
        <div className="flex overflow-hidden rounded-2xl border border-line bg-surface lg:block">
          <div className="flex aspect-square w-28 shrink-0 items-center justify-center bg-surface-alt lg:w-auto">
            {cover ? (
              <MediaImg sizes="(min-width: 1024px) 256px, 112px" src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <BoxIcon className="h-9 w-9 text-muted lg:h-12 lg:w-12" />
            )}
          </div>
          <div className="min-w-0 flex-1 self-center p-3">
            <p className="truncate text-base font-semibold text-fg">{product.name}</p>
            <p className="mt-0.5 truncate text-hint text-muted">{category?.label ?? product.category.name}</p>
            <p className="mt-1.5 text-base font-bold text-brand">
              {product.price && Number(product.price) > 0
                ? product.priceMax && product.priceMax !== product.price
                  ? `${formatPrice(product.price)} – ${formatPrice(product.priceMax)}`
                  : formatPrice(product.price)
                : 'No price yet'}
            </p>
            {product.hasVariants && (
              <p className="mt-0.5 text-hint text-muted">
                {product.variants.length} choice{product.variants.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        {/* What still blocks publishing comes FIRST on a phone, so the
            greyed-out Publish button always has its reason in view. */}
        <div className={!canPublish && !product.isActive ? 'order-first lg:order-none' : ''}>
          <p className="text-base font-semibold text-fg">
            {canPublish || product.isActive ? 'Checklist' : 'Still needed before it can go live'}
          </p>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {CHECKS.map((check) => {
              const done = !missing.has(check.key)
              return (
                <li key={check.key} className="flex min-h-[56px] items-center gap-3 px-3.5 py-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      done ? 'bg-success text-brand-contrast' : 'glass-inset text-muted'
                    }`}
                  >
                    {done ? <CheckIcon className="h-4 w-4" /> : '·'}
                  </span>
                  <span className={`min-w-0 flex-1 text-base ${done ? 'text-fg' : 'text-muted'}`}>
                    {check.label}
                    {!done && (
                      <span className="block text-hint">
                        {check.required ? 'Needed to publish' : 'Optional'}
                      </span>
                    )}
                  </span>
                  {!done && (
                    <button
                      type="button"
                      onClick={() => onJump(check.step)}
                      className={buttonClass({
                        variant: check.required ? 'primary' : 'secondary',
                        size: 'sm',
                        className: 'min-h-tap px-4',
                      })}
                    >
                      Add
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-hint text-muted">
            {product.completeness.percent}% complete. Products with photos, a
            description and a few facts get noticed more — but only a photo
            and a price are needed to go live.
          </p>
        </div>
      </div>

      {error && <StepError>{error}</StepError>}

      {product.isActive ? (
        <StepButtons onBack={onBack} onNext={onDone} nextLabel="Done" />
      ) : (
        <StepButtons
          onBack={onBack}
          onNext={() => void publish()}
          nextLabel="Publish to my shop"
          busy={busy}
          canNext={canPublish}
          skip={onDone}
          skipLabel="Save as draft"
        />
      )}
    </StepShell>
  )
}
