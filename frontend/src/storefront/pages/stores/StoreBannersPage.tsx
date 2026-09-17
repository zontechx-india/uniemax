import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Button } from '../../../shared/ui/Button'
import { ErrorNote, Select, TextField } from '../../../shared/ui/form'
import {
  BANNER_LINK_TYPES,
  storeCatalogApi,
  storesApi,
} from '../../features/stores/storesApi'
import type {
  BannerLinkType,
  StoreBanner,
  StoreCategory,
  StoreProduct,
} from '../../features/stores/storesApi'
import {
  BANNER_ASPECT,
  BANNER_FORMAT,
  bannerSizeLabel,
  checkBannerImage,
  needsBannerCrop,
} from '../../features/stores/bannerSpec'
import { ImageEditDialog } from '../../../shared/media/ImageEditDialog'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ActiveSwitch } from './ActiveSwitch'
import { GripIcon, ImageIcon, PlusIcon, TrashIcon } from '../../layout/icons'

/**
 * Banners section of Store Management — the promo carousel above the
 * storefront hero.
 *
 * A **grid of previews**, not a form list: a banner is a picture, so the
 * picture is the row. Each card shows the artwork at the exact ratio the
 * storefront gives it, with its controls underneath.
 *
 * Two switches, deliberately separate:
 *  - **this page's per-banner switch** retires one banner while keeping its
 *    image for a future campaign;
 *  - **Homepage → Banners** hides the whole section.
 *
 * Every write returns the server's FULL list, so the screen never merges a row
 * into local state and never has to guess whether order and link labels still
 * agree.
 */

/** Mirrors MAX_STORE_BANNERS on the server, so Add stops before a 409 does. */
const MAX_BANNERS = 10

const LINK_LABEL: Record<BannerLinkType, string> = {
  NONE: 'No link',
  CATEGORY: 'A category',
  PRODUCT: 'A product',
  URL: 'A web address',
}

export function StoreBannersPage({
  embedded = false,
  onSaved,
}: {
  /**
   * Rendered inside the Store Builder's editor panel rather than as its own
   * management page: the page heading and the cross-link to Homepage are
   * dropped (the panel already names the section and holds its switch), and
   * the cards run in one column, because the panel is a column.
   */
  embedded?: boolean
  /** Fired after every successful write, so a live preview can repaint. */
  onSaved?: () => void
} = {}) {
  const { store } = useManagedStore()
  const [banners, setBanners] = useState<StoreBanner[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<StoreBanner | null>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Drag state, mirroring the Homepage arrange screen so reordering feels the
  // same in both places.
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  /** A picked file that is not 16:5 yet — held until it is cropped. */
  const [cropping, setCropping] = useState<{
    file: File
    bannerId?: string
  } | null>(null)

  // Destinations for the link picker. Loaded once — a store's catalog is
  // small, and the picker must not fire a request per keystroke.
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [products, setProducts] = useState<StoreProduct[]>([])

  const addInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      storesApi.listBanners(store.id),
      storeCatalogApi.listCategories(store.id),
      storeCatalogApi.listProducts(store.id),
    ])
      .then(([bannerList, categoryList, productList]) => {
        if (cancelled) return
        setBanners(bannerList)
        setCategories(categoryList)
        setProducts(productList)
      })
      .catch((err) => {
        if (!cancelled) {
          setBanners([])
          setError(toApiError(err).message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [store.id])

  /** One place to run a write: clears the error, applies the returned list. */
  const run = async (action: () => Promise<StoreBanner[]>) => {
    setError(null)
    setBusy(true)
    try {
      setBanners(await action())
      onSaved?.()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
      setUploadPct(null)
    }
  }

  /**
   * A picked file, measured. Already 16:5 → uploaded untouched, so a correctly
   * exported banner is never re-encoded. Anything else goes to the crop dialog
   * FIRST: a banner fills a fixed frame, so an off-ratio image has to lose
   * something, and the seller should be the one deciding what.
   */
  const pick = async (file: File, bannerId?: string) => {
    const [width, height] = await measure(file)
    setNotice(checkBannerImage(width, height))
    if (needsBannerCrop(width, height)) {
      setCropping(bannerId === undefined ? { file } : { file, bannerId })
      return
    }
    await send(file, file.name, bannerId)
  }

  /** The actual upload — a picked file, or the blob the crop dialog rendered. */
  const send = async (blob: Blob, filename: string, bannerId?: string) => {
    const onProgress = (fraction: number) =>
      setUploadPct(Math.round(fraction * 100))
    await run(() =>
      bannerId
        ? storesApi.replaceBannerImage(
            store.id,
            bannerId,
            blob,
            filename,
            onProgress,
          )
        : storesApi.createBanner(store.id, blob, filename, {}, onProgress),
    )
  }

  /** Drop `dragged` in front of `target` (or last), then send the whole order. */
  const reorder = (draggedId: string, targetId: string | null) => {
    if (!banners || draggedId === targetId) return
    const without = banners.filter((b) => b.id !== draggedId)
    const moved = banners.find((b) => b.id === draggedId)
    if (!moved) return
    const at = targetId ? without.findIndex((b) => b.id === targetId) : -1
    without.splice(at === -1 ? without.length : at, 0, moved)
    setBanners(without) // optimistic — dragging must feel immediate
    void run(() => storesApi.reorderBanners(store.id, without.map((b) => b.id)))
  }

  /** Keyboard and touch reordering — drag alone is not an accessible control. */
  const move = (index: number, delta: number) => {
    if (!banners) return
    const to = index + delta
    if (to < 0 || to >= banners.length) return
    const next = [...banners]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item!)
    setBanners(next)
    void run(() => storesApi.reorderBanners(store.id, next.map((b) => b.id)))
  }

  const full = (banners?.length ?? 0) >= MAX_BANNERS
  // One column inside the builder panel; the management page still spreads.
  const cardGrid = embedded ? '' : 'sm:grid-cols-2 xl:grid-cols-3'

  return (
    <div>
      {!embedded && (
        <>
          <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
            Banners
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Promo images at the top of your storefront. With more than one they
            rotate automatically, in the order below — drag a card by its
            handle to change it. Tapping a banner can take shoppers to a
            category, a product, or any web address.
          </p>
          <p className="mt-1 text-sm text-muted">
            The whole strip is switched on and off in the{' '}
            <Link
              to="../builder"
              className="font-semibold text-brand hover:underline"
            >
              Store Builder
            </Link>
            .
          </p>
        </>
      )}

      <SizeGuide />

      {error && (
        <div className="mt-4 max-w-md">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {notice && (
        <p className="mt-3 max-w-2xl rounded-md border border-line bg-surface-alt px-3 py-2 text-xs font-medium text-fg">
          {notice}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          ref={addInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // re-picking the same file must still fire
            if (file) void pick(file)
          }}
        />
        <Button
          variant="rise"
          size="sm"
          disabled={busy || full}
          onClick={() => addInput.current?.click()}
        >
          <PlusIcon className="h-4 w-4" />
          Add Banner
        </Button>
        {uploadPct !== null && (
          <span className="text-xs text-muted">Uploading… {uploadPct}%</span>
        )}
        {full && (
          <span className="text-xs text-muted">
            {MAX_BANNERS} is the maximum — delete one to add another.
          </span>
        )}
      </div>

      {banners === null ? (
        <div className={`mt-4 grid gap-4 ${cardGrid}`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-surface-alt" />
          ))}
        </div>
      ) : banners.length === 0 ? (
        <EmptyBanners onAdd={() => addInput.current?.click()} />
      ) : (
        <ul
          className={`mt-4 grid gap-4 ${cardGrid}`}
          // A drop past the last card appends, so the cards themselves are not
          // the only valid target.
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragId) reorder(dragId, null)
            setDragId(null)
            setOverId(null)
          }}
        >
          {banners.map((banner, index) => (
            <BannerCard
              key={banner.id}
              banner={banner}
              index={index}
              total={banners.length}
              categories={categories}
              products={products}
              busy={busy}
              dragging={dragId === banner.id}
              over={overId === banner.id && dragId !== banner.id}
              onDragStart={() => setDragId(banner.id)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onDragOver={() => setOverId(banner.id)}
              onDrop={() => {
                if (dragId) reorder(dragId, banner.id)
                setDragId(null)
                setOverId(null)
              }}
              onMove={(delta) => move(index, delta)}
              onPatch={(patch) =>
                run(() => storesApi.updateBanner(store.id, banner.id, patch))
              }
              onReplaceImage={(file) => void pick(file, banner.id)}
              onDelete={() => setToDelete(banner)}
            />
          ))}
        </ul>
      )}

      {/* Mandatory, not optional: the frame is fixed, so "use original" would
          just hand the crop back to the browser. */}
      {cropping && (
        <ImageEditDialog
          file={cropping.file}
          aspects={[{ label: BANNER_FORMAT.ratio, value: BANNER_ASPECT }]}
          allowOriginal={false}
          maxEdge={BANNER_FORMAT.width}
          title={`Crop to ${BANNER_FORMAT.ratio}`}
          confirmLabel="Use this crop"
          busy={busy}
          onCancel={() => setCropping(null)}
          onDone={(blob, filename) => {
            const target = cropping
            setCropping(null)
            void send(blob, filename, target.bannerId)
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete banner?"
        description={
          <>
            The image is removed for good. This is live on your storefront, so
            shoppers stop seeing it immediately.
          </>
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={async () => {
          const target = toDelete
          setToDelete(null)
          if (target) {
            await run(() => storesApi.deleteBanner(store.id, target.id))
          }
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}

/**
 * The upload size, stated BEFORE the seller picks a file rather than after
 * their artwork comes back cropped. The numbers come from `bannerSpec.ts` —
 * the same constants the storefront renders with, so this panel cannot drift
 * from what actually happens to the image.
 */
function SizeGuide() {
  return (
    <div className="mt-4 max-w-2xl rounded-lg border border-line bg-surface-alt px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Image size
      </p>
      <p className="mt-1.5 text-sm font-semibold text-fg">
        {bannerSizeLabel()} — one image, used on every screen
      </p>
      <p className="mt-1 text-xs text-muted">
        The banner keeps its {BANNER_FORMAT.ratio} shape everywhere and is
        scaled to the screen's width, so its height shrinks on smaller screens
        and the whole image always stays visible — nothing is cropped or
        letterboxed. On a 1920px monitor it is 600px tall, on a laptop about
        450px, and on a phone about 122px.
      </p>
      <p className="mt-2 text-[11px] text-muted">
        Because a phone shows the same artwork at roughly a third the height,
        keep text large and near the centre — small print will be unreadable
        there.
      </p>
    </div>
  )
}

function EmptyBanners({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg bg-surface-alt px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface text-brand shadow-floating">
        <ImageIcon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-fg">No banners yet</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Add a {bannerSizeLabel()} image and it appears at the top of your
        storefront.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 text-sm font-semibold text-brand hover:underline"
      >
        Add your first banner
      </button>
    </div>
  )
}

/**
 * One card: the preview at the storefront's own ratio, then its controls.
 *
 * Dragging is armed by **holding the grip**, not by grabbing the card — a card
 * full of inputs that slides away when you try to select text in a field would
 * be unusable.
 */
function BannerCard({
  banner,
  index,
  total,
  categories,
  products,
  busy,
  dragging,
  over,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  onPatch,
  onReplaceImage,
  onDelete,
}: {
  banner: StoreBanner
  index: number
  total: number
  categories: StoreCategory[]
  products: StoreProduct[]
  busy: boolean
  dragging: boolean
  over: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDrop: () => void
  onMove: (delta: number) => void
  onPatch: (patch: {
    title?: string | null
    linkType?: BannerLinkType
    linkValue?: string | null
    isActive?: boolean
  }) => void
  onReplaceImage: (file: File) => void
  onDelete: () => void
}) {
  const imageInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(banner.title ?? '')
  const [url, setUrl] = useState(
    banner.linkType === 'URL' ? (banner.linkValue ?? '') : '',
  )
  const [armed, setArmed] = useState(false)

  // The server is the source of truth: a rejected edit (or another tab) must
  // not leave an input showing something that was never saved.
  useEffect(() => setTitle(banner.title ?? ''), [banner.title])
  useEffect(() => {
    if (banner.linkType === 'URL') setUrl(banner.linkValue ?? '')
  }, [banner.linkType, banner.linkValue])

  return (
    <li
      draggable={armed && !busy}
      onDragStart={onDragStart}
      onDragEnd={() => {
        setArmed(false)
        onDragEnd()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation() // the list itself handles "dropped past the end"
        onDrop()
      }}
      className={`flex flex-col overflow-hidden rounded-lg border bg-surface transition-colors ${
        over ? 'border-brand' : 'border-line'
      } ${dragging ? 'opacity-50' : ''}`}
    >
      {/* Preview — the artwork at the exact shape the storefront gives it. */}
      <div
        className={`group relative ${BANNER_FORMAT.aspect} w-full bg-surface-alt`}
      >
        {banner.imageUrl ? (
          <img
            src={banner.imageUrl}
            alt=""
            className={`h-full w-full object-cover ${banner.isActive ? '' : 'opacity-50 grayscale'}`}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted">
            <ImageIcon className="h-6 w-6" />
          </span>
        )}

        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed"
        >
          Replace image
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onReplaceImage(file)
          }}
        />

        {/* Above the replace overlay, so the handle stays grabbable. */}
        <span
          onPointerDown={() => setArmed(true)}
          onPointerUp={() => setArmed(false)}
          title="Drag to reorder"
          className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-md bg-black/55 text-white active:cursor-grabbing"
        >
          <GripIcon className="h-4 w-4" />
        </span>

        <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-pill bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
          {index + 1} of {total}
        </span>

        {!banner.isActive && (
          <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Hidden
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy || index === 0}
              onClick={() => onMove(-1)}
              aria-label="Move banner earlier"
              className="rounded px-1.5 py-1 text-sm text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
            >
              ←
            </button>
            <button
              type="button"
              disabled={busy || index === total - 1}
              onClick={() => onMove(1)}
              aria-label="Move banner later"
              className="rounded px-1.5 py-1 text-sm text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-30"
            >
              →
            </button>
          </div>
          <div className="flex items-center gap-1">
            <ActiveSwitch
              checked={banner.isActive}
              disabled={busy}
              label={`${banner.isActive ? 'Hide' : 'Show'} this banner`}
              onChange={(next) => onPatch({ isActive: next })}
            />
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded-md p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
              aria-label="Delete banner"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <TextField
          label="Title"
          value={title}
          placeholder="Festive sale"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const next = title.trim()
            if (next !== (banner.title ?? '')) {
              onPatch({ title: next === '' ? null : next })
            }
          }}
        />

        <LinkPicker
          banner={banner}
          categories={categories}
          products={products}
          busy={busy}
          url={url}
          onUrlChange={setUrl}
          onPatch={onPatch}
        />
      </div>
    </li>
  )
}

/**
 * Where this banner goes when tapped. The kind picks which second control
 * appears — a category list, a product list, or an address field — so the
 * owner never types an id and a rename never breaks the link.
 */
function LinkPicker({
  banner,
  categories,
  products,
  busy,
  url,
  onUrlChange,
  onPatch,
}: {
  banner: StoreBanner
  categories: StoreCategory[]
  products: StoreProduct[]
  busy: boolean
  url: string
  onUrlChange: (value: string) => void
  onPatch: (patch: {
    linkType?: BannerLinkType
    linkValue?: string | null
  }) => void
}) {
  return (
    <div>
      <span className="block text-xs font-semibold text-fg">
        When tapped, go to
      </span>
      <div className="mt-1.5 space-y-2">
        <Select
          className="h-10"
          value={banner.linkType}
          disabled={busy}
          onChange={(e) => {
            const linkType = e.target.value as BannerLinkType
            // Switching kind clears the old destination — a category id would
            // be nonsense as a URL, and vice versa.
            onPatch({ linkType, linkValue: null })
          }}
        >
          {BANNER_LINK_TYPES.map((type) => (
            <option key={type} value={type}>
              {LINK_LABEL[type]}
            </option>
          ))}
        </Select>

        {banner.linkType === 'CATEGORY' && (
          <Select
            className="h-10"
            value={banner.linkValue ?? ''}
            disabled={busy}
            onChange={(e) =>
              onPatch({ linkType: 'CATEGORY', linkValue: e.target.value })
            }
          >
            <option value="">Pick a category…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        )}

        {banner.linkType === 'PRODUCT' && (
          <Select
            className="h-10"
            value={banner.linkValue ?? ''}
            disabled={busy}
            onChange={(e) =>
              onPatch({ linkType: 'PRODUCT', linkValue: e.target.value })
            }
          >
            <option value="">Pick a product…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
        )}

        {banner.linkType === 'URL' && (
          <input
            type="url"
            value={url}
            disabled={busy}
            placeholder="https://example.com/sale"
            onChange={(e) => onUrlChange(e.target.value)}
            onBlur={() => {
              const next = url.trim()
              if (next && next !== banner.linkValue) {
                onPatch({ linkType: 'URL', linkValue: next })
              }
            }}
            className="h-10 w-full rounded-md border border-line bg-input px-3.5 text-sm text-fg outline-none transition-colors hover:border-fg/30 focus:border-accent"
          />
        )}
      </div>

      {/* A link whose target was deleted or switched off is stated plainly —
          the admin showing a healthy-looking row while the storefront renders
          a dead banner is the failure worth preventing. */}
      {banner.target?.missing && (
        <p className="mt-1.5 text-[11px] font-semibold text-danger">
          {banner.target.label} is deleted or switched off — this banner shows
          without a link.
        </p>
      )}
      {banner.linkType !== 'NONE' && !banner.linkValue && (
        <p className="mt-1.5 text-[11px] text-muted">
          Pick a destination, or this banner stays unlinked.
        </p>
      )}
    </div>
  )
}

/**
 * An image's pixel dimensions, so the size check can talk about the actual
 * file. Resolves to 0×0 for anything the browser cannot decode; the caller
 * then says nothing rather than inventing a complaint.
 */
function measure(file: File): Promise<[number, number]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve([img.naturalWidth, img.naturalHeight])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve([0, 0])
    }
    img.src = url
  })
}
