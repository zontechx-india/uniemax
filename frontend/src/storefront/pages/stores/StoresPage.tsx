import { usePrivatePageTitle } from '../../../shared/seo'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStores } from '../../features/stores/useStores'
import { isLaunchStep } from '../../features/stores/storeProfile'
import type { Store } from '../../features/stores/storesApi'
import { BoxIcon, ChevronRightIcon, PlusIcon, ShareIcon, StoreIcon } from '../../layout/icons'
import { buttonClass } from '../../../shared/ui/Button'
import { MediaImg } from '../../../shared/media/MediaImg'
import { StoreShareSheet } from './StorePublishCard'
import { EmptyState, PageHeader, StatusPill, ToastHost } from './ui'

/**
 * My Stores ("My Store" in the account menu): every shop the customer owns,
 * as glass cards that each answer the seller's first two questions — *is it
 * live?* and *what is left to do?* — and offer the two things they come here
 * for: **Manage** it, or **Share** it (Publish, until it is live).
 *
 * The share sheet is the same one the store strip opens inside management,
 * so a seller can send their link to a customer without opening the shop.
 * First-run visitors get a picture-led empty state instead of an empty grid.
 */
export function StoresPage() {
  usePrivatePageTitle('My Stores')
  const { stores } = useStores()
  // Publishing from a card's sheet returns the fresh store; this list has no
  // setter of its own, so the fresh copies overlay the fetched ones.
  const [fresh, setFresh] = useState<Record<string, Store>>({})
  const [sharing, setSharing] = useState<string | null>(null)

  const list = stores?.map((store) => fresh[store.id] ?? store) ?? null
  const shared = list?.find((store) => store.id === sharing) ?? null

  return (
    // Room at the bottom on phones for the floating New shop button.
    <div className="mx-auto max-w-6xl space-y-5 pb-24 sm:pb-6">
      {list === null ? (
        <LoadingCards />
      ) : list.length === 0 ? (
        <div className="glass mx-auto max-w-2xl rounded-glass">
          <EmptyState
            icon={StoreIcon}
            title="Open your first shop"
            description="All you need is a name. You can add your logo, products and everything else later."
            steps={[
              { icon: StoreIcon, label: 'Name your shop' },
              { icon: BoxIcon, label: 'Add products' },
              { icon: ShareIcon, label: 'Share the link' },
            ]}
            action={
              <Link to="/mystores/new" className={buttonClass({ size: 'lg', className: 'px-8' })}>
                <PlusIcon className="h-5 w-5" />
                Create my shop
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <PageHeader
            icon={StoreIcon}
            title="My shops"
            description="Tap Manage to work on a shop, or Share to send its link to customers."
            action={
              // Wrapped, not `hidden` on the link: the button's own
              // `inline-flex` would compete with an unprefixed `hidden`.
              <div className="hidden sm:block">
                <Link to="/mystores/new" className={buttonClass({ size: 'lg' })}>
                  <PlusIcon className="h-5 w-5" />
                  New shop
                </Link>
              </div>
            }
          />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((store) => (
              <StoreCard key={store.id} store={store} onShare={() => setSharing(store.id)} />
            ))}
          </section>

          {/* Phone: the create action floats under the thumb instead of
              sitting above the list, where it pushed the shops down. */}
          <Link
            to="/mystores/new"
            className={buttonClass({
              size: 'lg',
              className:
                'fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 rounded-pill px-6 shadow-[0_10px_30px_-8px_var(--cta-glow)] sm:hidden',
            })}
          >
            <PlusIcon className="h-5 w-5" />
            New shop
          </Link>
        </>
      )}

      {shared && (
        <StoreShareSheet
          open
          store={shared}
          onStoreChange={(next) => setFresh((current) => ({ ...current, [next.id]: next }))}
          onClose={() => setSharing(null)}
        />
      )}
      <ToastHost />
    </div>
  )
}

/** Launch-step progress — the same readiness the store's checklist reads. */
function setupProgress(store: Store): { done: number; total: number } {
  const steps = store.readiness.steps.filter(
    (step) => step.totalCount > 0 && isLaunchStep(step),
  )
  return { done: steps.filter((step) => step.complete).length, total: steps.length }
}

function StoreCard({ store, onShare }: { store: Store; onShare: () => void }) {
  const { done, total } = setupProgress(store)
  const showProgress = !store.isPublished && total > 0

  return (
    <article className="glass flex flex-col rounded-glass p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        {store.logoUrl ? (
          <MediaImg
            sizes="56px"
            src={store.logoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-[0_4px_14px_-6px_rgba(0,0,0,0.3)]"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <StoreIcon className="h-7 w-7" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {/* User-typed names render in the body face, two lines at most. */}
          <h2 className="line-clamp-2 font-body text-[17px] leading-snug font-bold tracking-normal break-words text-fg">
            {store.name}
          </h2>
          <div className="mt-1.5">
            {store.isPublished ? (
              <StatusPill tone="success">Live</StatusPill>
            ) : (
              <StatusPill tone="pending">Not live yet</StatusPill>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-h-[52px] items-center gap-3 rounded-xl bg-fg/[0.04] px-3 py-2.5">
        {showProgress ? (
          <>
            <ProgressRing done={done} total={total} />
            <p className="min-w-0 text-hint text-fg">
              <span className="font-semibold">
                {done} of {total} steps done
              </span>
              <span className="block text-muted">
                {done === total ? 'Ready to publish.' : 'Finish setup to open your shop.'}
              </span>
            </p>
          </>
        ) : (
          <p className="min-w-0 text-hint text-muted">
            {store.isPublished
              ? 'Customers can see your shop and place orders.'
              : 'Open your shop to finish setting it up.'}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Link
          to={`/mystores/${store.slug}`}
          className={buttonClass({ size: 'lg', full: true })}
        >
          Manage
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onShare}
          aria-haspopup="dialog"
          aria-label={store.isPublished ? `Share ${store.name}` : `Publish ${store.name}`}
          className={buttonClass({ variant: 'ring', size: 'lg', className: 'px-4' })}
        >
          <ShareIcon className="h-4 w-4" />
          {store.isPublished ? 'Share' : 'Publish'}
        </button>
      </div>
    </article>
  )
}

/** "3 of 5" as a ring — fills with the brand as setup completes. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 16
  const c = 2 * Math.PI * r
  const ratio = total === 0 ? 0 : done / total
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-fg/10" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        className={`transition-[stroke-dashoffset] duration-500 ${
          ratio === 1 ? 'stroke-success' : 'stroke-brand'
        }`}
      />
    </svg>
  )
}

/** Card-shaped placeholders while the list loads — not a bare "Loading…". */
function LoadingCards() {
  return (
    <div aria-busy="true" aria-label="Loading your shops" className="space-y-5">
      <div className="h-14 w-56 animate-pulse rounded-xl bg-fg/10" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="glass h-[232px] animate-pulse rounded-glass" />
        ))}
      </div>
    </div>
  )
}
