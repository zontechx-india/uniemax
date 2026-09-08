import { Link } from 'react-router-dom'
import { useStores } from '../../features/stores/useStores'
import type { Store } from '../../features/stores/storesApi'
import { ChevronRightIcon, GlobeIcon, PlusIcon, StoreIcon } from '../../layout/icons'

/**
 * Store selection ("My Store" in the account menu): pick one of the
 * customer's stores — a click goes straight to that store's management
 * page — or create a new one. First-run visitors get an empty state.
 *
 * Cards carry the store's live status (Published / Draft) and its public
 * URL path, so the list doubles as an at-a-glance health check.
 */
export function StoresPage() {
  const { stores } = useStores()

  if (stores === null) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Loading…
      </div>
    )
  }

  if (stores.length === 0) return <EmptyState />

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
            My Stores
          </h1>
          <p className="mt-1 text-sm text-muted">
            Select a store to manage it.
          </p>
        </div>
        <Link
          to="/mystores/new"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          Create New Store
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </section>
    </div>
  )
}

function StoreCard({ store }: { store: Store }) {
  return (
    <Link
      to={`/mystores/${store.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-floating transition duration-200 hover:-translate-y-0.5 hover:border-brand/50 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        {store.logoUrl ? (
          <img
            src={store.logoUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <StoreIcon className="h-6 w-6" />
          </div>
        )}
        <StatusChip published={store.isPublished} />
      </div>

      {/* User-typed names render in the standard body face — the condensed
          display font is for page headings, not people's store names. */}
      <h2 className="mt-4 truncate font-body text-lg font-semibold tracking-normal text-fg">
        {store.name}
      </h2>
      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
        <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
        /store/{store.slug}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs text-muted">
          Created {new Date(store.createdAt).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-brand">
          Manage
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

/** Live-status chip: customers can only see Published stores. */
function StatusChip({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Published
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-line" />
      Draft
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-20 text-center shadow-floating">
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <StoreIcon className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-fg">
        Create Your First Store
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Start selling by creating your store. All you need is a name —
        everything else can be set up later.
      </p>
      <Link
        to="/mystores/new"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
      >
        <PlusIcon className="h-4 w-4" />
        Create Store
      </Link>
    </div>
  )
}
