import { useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, SuccessNote } from '../../../shared/ui/form'
import { storesApi } from '../../features/stores/storesApi'
import type {
  HomepageSection,
  HomepageSectionKey,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ActiveSwitch } from './ActiveSwitch'
import { ChevronDownIcon, GripIcon } from '../../layout/icons'

/**
 * Homepage section — arrange the storefront homepage.
 *
 * The owner reorders the sections (drag, or the ▲/▼ buttons for
 * keyboard/touch) and switches each on or off. Both are the same write: the
 * whole ordered list is sent to `PATCH /stores/:id/homepage` on every change.
 *
 * A switch only ever *hides* a section — turning one on does not force an
 * empty row to appear, because a merchandising row still needs products ticked
 * for it in the Products section. The header/top bar is not listed here: it is
 * fixed chrome (logo, search, cart, nav) and always at the top.
 */
const META: Record<HomepageSectionKey, { label: string; hint: string }> = {
  banners: {
    label: 'Banners',
    hint: 'Your promo images — manage them in Storefront → Banners',
  },
  // Named "Hero Banner" until banners were a real feature; two rows both
  // called a banner told the owner nothing about which was which.
  hero: {
    label: 'Welcome Hero',
    hint: 'Your store name, intro line and Start Shopping button',
  },
  categories: {
    label: 'Shop by Category',
    hint: 'A row of links, one per top-level category',
  },
  featured: {
    label: 'Featured Products',
    hint: 'Products you ticked as Featured',
  },
  newArrivals: {
    label: 'New Arrivals',
    hint: 'Products you ticked as New Arrival',
  },
  bestSellers: {
    label: 'Best Sellers',
    hint: 'Products you ticked as Best Seller',
  },
  // The two rows that need no ticking — what a shop shows before its owner has
  // curated anything, and the reason a new storefront is never just a hero.
  categoryRows: {
    label: 'Category Highlights',
    hint: 'A row of products for each of your first 3 categories — no ticking needed',
  },
  catalog: {
    label: 'All Products',
    hint: 'Your newest products, whatever you have ticked — no ticking needed',
  },
}

export function StoreHomepagePage() {
  const { store, onStoreChange } = useManagedStore()
  const [sections, setSections] = useState<HomepageSection[]>(store.homepage)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragKey, setDragKey] = useState<HomepageSectionKey | null>(null)
  const [overKey, setOverKey] = useState<HomepageSectionKey | null>(null)

  /** Persist the whole ordered list; roll back to the saved store on failure. */
  const commit = async (next: HomepageSection[]) => {
    const previous = sections
    setSections(next) // optimistic — the list should feel immediate
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      const updated = await storesApi.updateHomepage(store.id, next)
      onStoreChange(updated)
      setSections(updated.homepage)
      setSaved(true)
    } catch (err) {
      setError(toApiError(err).message)
      setSections(previous)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (key: HomepageSectionKey, enabled: boolean) =>
    commit(sections.map((s) => (s.key === key ? { ...s, enabled } : s)))

  /** Move `from` so it lands immediately before `to` (or at the end). */
  const reorder = (from: HomepageSectionKey, to: HomepageSectionKey | null) => {
    if (from === to) return
    const without = sections.filter((s) => s.key !== from)
    const moved = sections.find((s) => s.key === from)
    if (!moved) return
    const at = to ? without.findIndex((s) => s.key === to) : without.length
    without.splice(at === -1 ? without.length : at, 0, moved)
    void commit(without)
  }

  const move = (index: number, delta: number) => {
    const to = index + delta
    if (to < 0 || to >= sections.length) return
    const next = [...sections]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item!)
    void commit(next)
  }

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Homepage
      </h2>
      <p className="mt-1 text-sm text-muted">
        Drag to reorder the sections on your storefront homepage, and switch
        each one on or off.
      </p>

      <ul className="mt-5 max-w-xl space-y-2">
        {sections.map((section, index) => {
          const meta = META[section.key]
          const isDragging = dragKey === section.key
          const isOver = overKey === section.key && dragKey !== section.key
          return (
            <li
              key={section.key}
              draggable={!busy}
              onDragStart={() => setDragKey(section.key)}
              onDragEnd={() => {
                setDragKey(null)
                setOverKey(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (overKey !== section.key) setOverKey(section.key)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragKey) reorder(dragKey, section.key)
                setDragKey(null)
                setOverKey(null)
              }}
              className={`flex items-center gap-3 rounded-lg border bg-surface px-3 py-3 transition-colors ${
                isOver ? 'border-brand' : 'border-line'
              } ${isDragging ? 'opacity-50' : ''}`}
            >
              {/* Drag handle */}
              <span
                className="shrink-0 cursor-grab text-muted active:cursor-grabbing"
                aria-hidden
                title="Drag to reorder"
              >
                <GripIcon className="h-5 w-5" />
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    section.enabled ? 'text-fg' : 'text-muted'
                  }`}
                >
                  {meta.label}
                  {!section.enabled && (
                    <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Hidden
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">{meta.hint}</p>
              </div>

              {/* Keyboard / touch reordering */}
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${meta.label} up`}
                  className="rounded p-0.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
                >
                  <ChevronDownIcon className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  disabled={busy || index === sections.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${meta.label} down`}
                  className="rounded p-0.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
              </div>

              <ActiveSwitch
                checked={section.enabled}
                disabled={busy}
                label={`${section.enabled ? 'Hide' : 'Show'} ${meta.label}`}
                onChange={(next) => toggle(section.key, next)}
              />
            </li>
          )
        })}
      </ul>

      <p className="mt-3 max-w-xl text-xs text-muted">
        A hidden section stays off until you switch it back on — and even then
        it appears only once it has something to show (merchandising rows still
        need products ticked for them in the Products section). Your store
        header stays fixed at the top and can't be moved.
      </p>

      {error && (
        <div className="mt-4 max-w-xl">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {saved && !error && (
        <div className="mt-4 max-w-xl">
          <SuccessNote>Homepage updated.</SuccessNote>
        </div>
      )}
    </div>
  )
}
