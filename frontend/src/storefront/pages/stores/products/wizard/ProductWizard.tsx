import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toApiError } from '../../../../../shared/auth/http'
import { useMediaQuery } from '../../../../../shared/useMediaQuery'
import { Dialog } from '../../../../../shared/ui/Dialog'
import { formatPrice, publicStoreUrl, storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { BoxIcon, CheckIcon, ChevronDownIcon, ClipboardIcon, CloseIcon, PlusIcon, StarIcon, TagIcon } from '../../../../layout/icons'
import { useManagedStore } from '../../../../features/stores/useManagedStore'
import { WhatsAppShareLink } from '../../ui/WhatsAppShareLink'
import { BasicsStep } from './BasicsStep'
import { DeliveryStep } from './DeliveryStep'
import { DetailsStep } from './DetailsStep'
import { PhotosStep } from './PhotosStep'
import { PricingStep } from './PricingStep'
import { categoryOptions, Notice, Section, StepButtons, StepError, stepLabel, STEPS, StepShell } from './shared'
import { readLocalDraft, writeLocalDraft } from './localDraft'
import { CameraIcon } from '../../media/icons'
import type { StepKey, VersionPlan } from './shared'
import { MediaImg } from '../../../../../shared/media/MediaImg'
import { Button } from '../../../../../shared/ui/Button'
import { ErrorNote } from '../../../../../shared/ui/form'
import { showToast } from '../../ui'
import {
  isOffered,
  OfferPrices,
  offerDraftOf,
  offerProblem,
  saveOffer,
  SuppliedDeliveryStep,
  SuppliedPricingStep,
  useSuppliedFor,
  useSupplyItem,
} from '../../../../../packages/dropship'
import type { OfferDraft } from '../../../../../packages/dropship'

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
 * On a PHONE it takes the whole screen (portalled to <body>, so the page
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
  onAddAnother,
  supplyOnly = false,
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
  /** "Add another product" on the success screen — opens a fresh wizard. */
  onAddAnother?: () => void
  /** A supplier account: no shop to publish to — the last step offers the product to sellers (D-28). */
  supplyOnly?: boolean
}) {
  const [product, setProduct] = useState<StoreProduct | null>(initial)
  const [step, setStep] = useState<StepKey>(initial ? startAt : 'basics')
  // The step-1 answer is wizard state, never saved on the product — so it is
  // kept on this device too, and a reopened draft still knows it.
  const [plan, setPlan] = useState<VersionPlan>(() =>
    initial ? readLocalDraft<VersionPlan>(initial.id, 'plan') : null,
  )
  useEffect(() => {
    if (product && plan) writeLocalDraft(product.id, 'plan', plan)
  }, [product, plan])
  /** Step 3's screen in view ("Options", "Colour photos", "Price & stock"). */
  const [subLabel, setSubLabel] = useState<string | null>(null)
  const { supplied, setSupplied } = useSuppliedFor(storeId, product?.id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const index = STEPS.findIndex((s) => s.key === step)
  const go = (delta: number) => {
    const target = STEPS[index + delta]
    if (target) setStep(target.key)
  }

  // Every new screen starts at its top with nothing focused: a step opened
  // half-scrolled (the last one's position) hid its first question, and a
  // field still focused kept the phone keyboard over the buttons.
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    else if (frameRef.current && frameRef.current.getBoundingClientRect().top < 0)
      frameRef.current.scrollIntoView({ block: 'start' })
  }, [step, subLabel])

  /** Leaving with the product kept as a draft says so — sellers weren't sure it saved. */
  const closeAsDraft = () => {
    if (product && !product.isActive) showToast('Saved as draft. You can finish it later.')
    onClose()
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
  const currentLabel = (step === 'pricing' && subLabel) || stepLabel(step, supplyOnly)
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
              className={`flex min-h-tap w-full items-center gap-3 rounded-md px-2.5 text-left text-base font-semibold transition disabled:cursor-default disabled:opacity-50 ${
                current ? 'bg-brand-soft text-brand' : 'text-fg hover:bg-fg/5'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  current
                    ? 'bg-brand text-brand-contrast'
                    : isDone
                      ? 'bg-success text-brand-contrast'
                      : 'ws-well text-muted'
                }`}
              >
                {isDone && !current ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </span>
              {stepLabel(s.key, supplyOnly)}
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
          className={`h-1 flex-1 rounded-full transition-colors ${
            i === index ? 'bg-brand' : done[s.key] ? 'bg-success/70' : 'bg-fg/10'
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
            plan={plan}
            onPlanChange={setPlan}
          />
        )}
        {product && step === 'photos' && (
          <PhotosStep
            storeId={storeId}
            product={product}
            plan={plan}
            onSaved={saved}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        )}
        {product && step === 'pricing' && (
          supplied === undefined ? (
            // Never a blank screen while the step loads — it read as "my tap did nothing".
            <div aria-busy="true" aria-label="Loading" className="space-y-3 px-4 sm:px-0">
              {[0, 1, 2].map((n) => (
                <div key={n} className="h-20 animate-pulse rounded-lg bg-fg/5" />
              ))}
            </div>
          ) : supplied ? (
            <SuppliedPricingStep
              storeId={storeId}
              product={product}
              supplied={supplied}
              onSupplied={setSupplied}
              onSaved={saved}
              onRemoved={() => {
                onCatalogChanged?.()
                onClose()
              }}
              onBack={() => go(-1)}
              onNext={() => go(1)}
            />
          ) : (
            <PricingStep
              storeId={storeId}
              categories={categories}
              product={product}
              plan={plan}
              onSaved={saved}
              onOtherProductChange={onProductChange}
              onCatalogChanged={() => onCatalogChanged?.()}
              onSwitchProduct={switchTo}
              onPartChange={setSubLabel}
              onBack={() => go(-1)}
              onNext={() => go(1)}
              supplyOnly={supplyOnly}
            />
          )
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
          supplied === undefined ? (
            <div aria-busy="true" aria-label="Loading" className="space-y-3 px-4 sm:px-0">
              {[0, 1].map((n) => (
                <div key={n} className="h-20 animate-pulse rounded-lg bg-fg/5" />
              ))}
            </div>
          ) : supplied ? (
            <SuppliedDeliveryStep
              product={product}
              supplied={supplied}
              onBack={() => go(-1)}
              onNext={() => go(1)}
            />
          ) : (
            <DeliveryStep
              storeId={storeId}
              product={product}
              onSaved={saved}
              onBack={() => go(-1)}
              onNext={() => go(1)}
              supplyOnly={supplyOnly}
            />
          )
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
            onDraft={closeAsDraft}
            onAddAnother={onAddAnother}
            supplyOnly={supplyOnly}
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
        <header className="shrink-0 border-b border-line bg-surface px-1.5 pt-[max(0.25rem,env(safe-area-inset-top))] pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={closeAsDraft}
              aria-label={product ? 'Close — your work is saved' : 'Cancel'}
              className="flex size-tap shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-fg/5 hover:text-fg"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{title}</p>
              <button
                type="button"
                onClick={() => setStepsOpen(true)}
                aria-haspopup="dialog"
                className="-ml-1 inline-flex min-h-7 max-w-full items-center gap-1 rounded-md px-1 text-sm font-semibold text-brand"
              >
                {/* One line always — a wrapped step name pushed the chevron
                    off on its own and doubled the header's height. */}
                <span className="truncate">
                  Step {index + 1} of {STEPS.length} · {currentLabel}
                </span>
                <ChevronDownIcon className="h-4 w-4 shrink-0" />
              </button>
            </div>
            {product && (
              <Button variant="ghost" size="sm"
                onClick={closeAsDraft}
                className="shrink-0 px-2.5"
              >
                {closeLabel}
              </Button>
            )}
          </div>
          <div className="mt-1.5 px-2.5">{progress}</div>
        </header>
        {/* No side padding: each step's sections run edge to edge, and its
            button bar is flush with the bottom of the screen. */}
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-3 [&>*]:flex-1">
          {steps}
        </div>
        {stepSheet}
      </FullScreen>
    )
  }

  return (
    <div ref={frameRef} className="ws-card ws-form mt-5 rounded-lg">
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
            onClick={closeAsDraft}
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
                  className={`flex min-h-9 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition disabled:cursor-default ${
                    current
                      ? 'bg-brand-soft text-brand'
                      : isDone
                        ? 'text-fg hover:bg-fg/5'
                        : 'text-muted hover:bg-fg/5 hover:text-fg'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      current
                        ? 'bg-brand text-brand-contrast'
                        : isDone
                          ? 'bg-success text-brand-contrast'
                          : 'ws-well text-muted'
                    }`}
                  >
                    {isDone && !current ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {stepLabel(s.key, supplyOnly)}
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
 * the workspace panel, with the page behind it locked so only the step scrolls.
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
      className="ws-form bg-bg fixed inset-0 z-40 flex flex-col"
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
 *
 * A supplier account has no shop (D-28), so for it this step is "Review &
 * offer": it asks the price for sellers in place, and one button switches the
 * product on and offers it — sellers only see a product once it is offered.
 */
function ReviewStep({
  storeId,
  categories,
  product,
  onSaved,
  onBack,
  onJump,
  onDone,
  onDraft,
  onAddAnother,
  supplyOnly,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onJump: (step: StepKey) => void
  onDone: () => void
  /** "Save as draft": leave, saying it was kept. */
  onDraft: () => void
  onAddAnother?: () => void
  supplyOnly: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Just published: the "Your product is live!" screen. */
  const [live, setLive] = useState(false)
  const { store } = useManagedStore()
  const offer = useSupplyItem(storeId, product.id, supplyOnly)
  const [draft, setDraft] = useState<OfferDraft | null>(null)
  if (offer.item && draft === null) setDraft(offerDraftOf(offer.item))

  const cover = product.media.find((m) => m.type === 'IMAGE')?.url ?? null
  const category = categoryOptions(categories).find((c) => c.id === product.category.id)
  const missing = new Set(product.completeness.missing)
  const canPublish = !missing.has('photo') && !missing.has('price')
  const offered = product.isActive && isOffered(offer.item)
  const offerChanged =
    !!offer.item && !!draft && JSON.stringify(draft) !== JSON.stringify(offerDraftOf(offer.item))

  const publish = async () => {
    setError(null)
    setBusy(true)
    try {
      onSaved(await storeCatalogApi.updateProduct(storeId, product.id, { isActive: true }))
      // A moment to celebrate and the two things sellers do next — share
      // it, or add the next one — instead of dropping back to the list.
      setLive(true)
      setBusy(false)
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  /** Switch the product on (if it isn't) and offer it at the typed prices. */
  const offerToSellers = async () => {
    if (!offer.item || !draft) return
    const problem = offerProblem(offer.item, draft)
    if (problem) return setError(problem)
    setError(null)
    setBusy(true)
    try {
      if (!product.isActive) {
        onSaved(await storeCatalogApi.updateProduct(storeId, product.id, { isActive: true }))
      }
      const saved = await saveOffer(storeId, offer.item, draft)
      offer.setItem(saved)
      setDraft(offerDraftOf(saved))
      showToast(offered ? 'Saved — your sellers see the new prices' : 'Offered — your sellers can add it to their shops')
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  const words = supplyOnly
    ? {
        title: offered ? 'Offered to sellers' : 'Offer to sellers',
        lead: offered ? 'Sellers can add it. Change your price for sellers below.' : 'Set your price for sellers, then offer it.',
        needed: 'Still needed to offer it',
        required: 'Needed',
        price: 'A suggested price',
      }
    : {
        title: product.isActive ? 'All set' : 'Publish',
        lead: product.isActive ? 'It is live. Changes are saved.' : 'Check it, then publish. You can change it later.',
        needed: 'Still needed to go live',
        required: 'Needed',
        price: 'A selling price',
      }
  const requiredDone = CHECKS.filter((check) => check.required && !missing.has(check.key)).length

  if (live) {
    const url = `${publicStoreUrl(store.slug)}/product/${product.slug}`
    const message = `🛍️ ${product.name}${product.price ? ` — ${formatPrice(product.price)}` : ''}\n\nOrder here 👉 ${url}`
    return (
      <StepShell title="Your product is live!">
        <div className="flex flex-col items-center px-4 pt-4 pb-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-brand-contrast">
            <CheckIcon className="h-9 w-9" />
          </span>
          <p className="mt-3 text-xl font-bold text-fg">Your product is live!</p>
          <p className="mt-1 text-base text-muted">Customers can see and buy {product.name} now.</p>
        </div>
        <div className="space-y-2.5 px-4 sm:px-0">
          <WhatsAppShareLink href={`https://wa.me/?text=${encodeURIComponent(message)}`} />
          {onAddAnother && (
            <Button type="button" variant="secondary" size="lg" full onClick={onAddAnother}>
              <PlusIcon className="h-5 w-5" />
              Add another product
            </Button>
          )}
          <Button type="button" variant="ghost" size="lg" full onClick={onDone}>
            Done
          </Button>
        </div>
      </StepShell>
    )
  }

  const blockers = CHECKS.filter((check) => check.required && missing.has(check.key))

  return (
    <StepShell title={words.title} lead={words.lead}>
      {!product.isActive &&
        blockers.map((check) => (
          <Notice
            key={check.key}
            icon={check.key === 'photo' ? CameraIcon : TagIcon}
            title={
              check.key === 'photo'
                ? 'Add 1 photo to show this product in your shop'
                : supplyOnly
                  ? 'Add a suggested price to offer it'
                  : 'Add a price to sell this product'
            }
            body={
              check.key === 'photo'
                ? 'Customers only see products with a photo. It stays hidden until then.'
                : 'Customers need a price to buy it.'
            }
            action={
              <Button type="button" onClick={() => onJump(check.step)} full>
                {check.key === 'photo' ? <CameraIcon className="h-5 w-5" /> : <TagIcon className="h-5 w-5" />}
                {check.key === 'photo' ? 'Add a photo' : 'Add a price'}
              </Button>
            }
          />
        ))}
      <div data-bleed className="flex flex-col gap-2 sm:gap-3 lg:grid lg:grid-cols-[16rem_1fr]">
        {/* The storefront card, honestly. A compact row on a phone — a
            full-width square (empty, before a photo) pushed the checklist
            and the reason Publish is greyed out below the fold. */}
        <section className="flex overflow-hidden border-y border-line bg-surface sm:rounded-lg sm:border lg:block">
          <div className="flex aspect-square w-24 shrink-0 items-center justify-center bg-surface-alt lg:w-auto">
            {cover ? (
              <MediaImg sizes="(min-width: 1024px) 256px, 96px" src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <BoxIcon className="h-8 w-8 text-muted lg:h-12 lg:w-12" />
            )}
          </div>
          <div className="min-w-0 flex-1 self-center p-3">
            <p className="truncate text-base font-semibold text-fg">{product.name}</p>
            <p className="truncate text-hint text-muted">{category?.label ?? product.category.name}</p>
            <p className="mt-1 text-base font-bold text-brand">
              {product.price && Number(product.price) > 0
                ? product.priceMax && product.priceMax !== product.price
                  ? `${formatPrice(product.price)} – ${formatPrice(product.priceMax)}`
                  : formatPrice(product.price)
                : 'No price yet'}
            </p>
            {product.hasVariants && (
              <p className="text-hint text-muted">
                {product.variants.length} option{product.variants.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </section>

        {product.hasVariants && product.variants.length > 0 && (
          <Section
            title="Price of each option"
            icon={TagIcon}
            aside={
              <Button type="button" variant="ghost" size="sm" onClick={() => onJump('pricing')} className="px-2.5">
                Change
              </Button>
            }
            flush
          >
            <ul className="divide-y divide-line">
              {product.variants.map((variant) => (
                <li key={variant.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                  <span className={`min-w-0 flex-1 text-sm break-words ${variant.isActive ? 'text-fg' : 'text-muted line-through'}`}>
                    {variant.name}
                  </span>
                  <span className="shrink-0 text-hint text-muted">
                    {variant.stockQuantity > 0 ? `${variant.stockQuantity} in stock` : 'Sold out'}
                  </span>
                  <span className="w-20 shrink-0 text-right font-figure text-base font-bold text-fg">
                    {formatPrice(variant.price)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* What still blocks publishing comes FIRST on a phone, so the
            greyed-out Publish button always has its reason in view. */}
        <div className={!canPublish && !product.isActive ? 'order-first lg:order-none' : ''}>
          {/* Only what is REQUIRED decides "ready": "Checklist 2/4" on a
              product that could go live made sellers think they weren't done.
              The rest is "Make it better", clearly optional. */}
          <Section
            title={canPublish ? (supplyOnly ? 'Ready to offer' : 'Ready to publish') : words.needed}
            icon={ClipboardIcon}
            aside={
              canPublish ? (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success text-brand-contrast">
                  <CheckIcon className="h-4 w-4" />
                </span>
              ) : (
                <span className="text-sm font-semibold text-muted">
                  {requiredDone}/{CHECKS.filter((check) => check.required).length}
                </span>
              )
            }
            flush
          >
            <ul className="divide-y divide-line">
              {CHECKS.filter((check) => check.required).map((check) => {
                const done = !missing.has(check.key)
                return (
                  <li key={check.key} className="flex min-h-14 items-center gap-2.5 px-4 py-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        done ? 'bg-success text-brand-contrast' : 'ws-well text-muted'
                      }`}
                    >
                      {done ? <CheckIcon className="h-3.5 w-3.5" /> : '·'}
                    </span>
                    <span className={`min-w-0 flex-1 text-sm ${done ? 'text-fg' : 'text-muted'}`}>
                      {check.key === 'price' ? words.price : check.label}
                      {!done && (
                        <span
                          className={`ml-1.5 text-hint ${check.required ? 'font-semibold text-pending' : ''}`}
                        >
                          {check.required ? words.required : 'Optional'}
                        </span>
                      )}
                    </span>
                    {!done && (
                      <Button
                        type="button"
                        onClick={() => onJump(check.step)}
                        variant={check.required ? 'primary' : 'secondary'}
                        size="sm"
                        className="px-3.5"
                      >
                        Add
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>
          <div className="mt-2 sm:mt-3">
            <Section title="Make it better (optional)" icon={StarIcon} flush>
              <ul className="divide-y divide-line">
                {CHECKS.filter((check) => !check.required).map((check) => {
                  const done = !missing.has(check.key)
                  return (
                    <li key={check.key} className="flex min-h-14 items-center gap-2.5 px-4 py-2">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          done ? 'bg-success text-brand-contrast' : 'ws-well text-muted'
                        }`}
                      >
                        {done ? <CheckIcon className="h-3.5 w-3.5" /> : '·'}
                      </span>
                      <span className={`min-w-0 flex-1 text-sm ${done ? 'text-fg' : 'text-muted'}`}>{check.label}</span>
                      {!done && (
                        <Button type="button" onClick={() => onJump(check.step)} variant="secondary" size="sm" className="px-3.5">
                          Add
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Section>
          </div>
        </div>
      </div>

      {supplyOnly && canPublish && (
        offer.item && draft ? (
          <OfferPrices item={offer.item} draft={draft} onChange={setDraft} disabled={busy} />
        ) : offer.item === undefined ? (
          <p className="text-sm text-muted">Loading your price for sellers…</p>
        ) : (
          <ErrorNote>{offer.error ?? 'This product can’t be offered right now — refresh and try again.'}</ErrorNote>
        )
      )}

      {error && <StepError>{error}</StepError>}

      {supplyOnly ? (
        offered ? (
          <StepButtons
            onBack={onBack}
            onNext={() => (offerChanged ? void offerToSellers() : onDone())}
            nextLabel={offerChanged ? 'Save prices' : 'Done'}
            busy={busy}
          />
        ) : (
          <StepButtons
            onBack={onBack}
            onNext={() => void offerToSellers()}
            nextLabel="Offer to sellers"
            busy={busy}
            canNext={canPublish && !!offer.item}
            skip={product.isActive ? onDone : onDraft}
            skipLabel={product.isActive ? 'Finish later' : 'Save as draft'}
          />
        )
      ) : product.isActive ? (
        <StepButtons onBack={onBack} onNext={onDone} nextLabel="Done" />
      ) : (
        <StepButtons
          onBack={onBack}
          onNext={() => void publish()}
          nextLabel="Publish to my shop"
          busy={busy}
          canNext={canPublish}
          skip={onDraft}
          skipLabel="Save as draft"
        />
      )}
    </StepShell>
  )
}
