import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote } from '../../../../shared/ui/form'
import { fieldClass } from '../../../../shared/ui/field'
import { billsApi } from '../../../features/bills/billsApi'
import type { PickerCategory, PickerProduct, PickerVariant } from '../../../features/bills/billsApi'
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, MinusIcon, PlusIcon, SearchIcon, TrashIcon } from '../../../layout/icons'
import { lineKey, rupees, Thumb, variantLabel } from './billUi'
import type { DraftLine } from './billUi'

/**
 * "Add items" — built for big catalogs (1,000+ products, 20+ categories).
 *
 *  - Search first: every word matches the name, a size / colour, the SKU or
 *    the category (server-side, 30 a page, "Show more").
 *  - Category list with counts, as the second way in.
 *  - "Often billed": the variants this store bills most, one tap to add.
 *  - Picking follows the product's REAL options (optionTypes):
 *      none        → +, then − n +
 *      one or more → open the product: one row of choices per option (a value
 *                    greys out when no in-stock combination is left with it),
 *                    then quantity + "Add to bill". A value typed in the
 *                    search is pre-chosen, so is an option with one value left.
 *  - "On the bill" under an open product, with − / +.
 *
 * Choices are real radio inputs (a value is "one of"); actions are `Button`s.
 */

const PAGE_SIZE = 30

type Choice = { productId: string; values: Record<string, string>; qty: number }

const isSimple = (p: PickerProduct) => p.optionTypes.length === 0
const fits = (v: PickerVariant, values: Record<string, string>, skip?: string) =>
  Object.entries(values).every(([t, val]) => t === skip || v.optionValues?.[t] === val)

/** Pre-chosen values: one typed in the search, then any option left with one in-stock value. */
function autoChoice(p: PickerProduct, q: string): Record<string, string> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const values: Record<string, string> = {}
  for (const t of p.optionTypes) {
    const typed = t.values.find((val) => words.includes(val.toLowerCase()) || (val.includes(' ') && q.toLowerCase().includes(val.toLowerCase())))
    if (typed && p.variants.some((v) => v.stock > 0 && v.optionValues?.[t.name] === typed)) values[t.name] = typed
  }
  for (const t of p.optionTypes) {
    if (values[t.name]) continue
    const live = t.values.filter((val) => p.variants.some((v) => v.stock > 0 && v.optionValues?.[t.name] === val && fits(v, values, t.name)))
    if (live.length === 1) values[t.name] = live[0]!
  }
  return values
}

/** − qty + ; at 1 the − removes the line (a bin), unless `removeAtOne` is off. */
export function Stepper({
  qty,
  max,
  label,
  onChange,
  removeAtOne = true,
}: {
  qty: number
  max: number
  label: string
  onChange: (by: number) => void
  removeAtOne?: boolean
}) {
  const bin = removeAtOne && qty <= 1
  return (
    <div role="group" aria-label={`Quantity of ${label}`} className="inline-flex shrink-0 items-center rounded-md border border-line bg-surface">
      <Button variant="ghost" size="md" className="w-11 px-0!" onClick={() => onChange(-1)} disabled={!removeAtOne && qty <= 1} aria-label={bin ? 'Remove' : 'One less'}>
        {bin ? <TrashIcon className="h-5 w-5 shrink-0" /> : <MinusIcon className="h-5 w-5 shrink-0" />}
      </Button>
      <span className="w-7 text-center font-figure text-base font-semibold tabular-nums text-fg">{qty}</span>
      <Button variant="ghost" size="md" className="w-11 px-0!" onClick={() => onChange(1)} disabled={qty >= max} aria-label="One more">
        <PlusIcon className="h-5 w-5 shrink-0" />
      </Button>
    </div>
  )
}

/** One "pick one" value: a radio input dressed as a chip (solid ink when chosen). */
function ChoiceChip({ name, label, checked, disabled, onPick }: { name: string; label: string; checked: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <label
      className={`inline-flex min-h-10 min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
        checked
          ? 'border-fg bg-fg font-semibold text-surface'
          : disabled
            ? 'cursor-not-allowed border-dashed border-line font-medium text-muted opacity-60'
            : 'border-line bg-surface font-medium text-fg hover:border-fg/40'
      }`}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} disabled={disabled} onChange={onPick} />
      {label}
    </label>
  )
}

export function ItemPicker({
  storeId,
  open,
  lines,
  onAdd,
  onQty,
  onClose,
}: {
  storeId: string
  open: boolean
  lines: DraftLine[]
  onAdd: (product: PickerProduct, variant: PickerVariant, qty: number) => void
  onQty: (key: string, by: number) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [view, setView] = useState<'list' | 'cats'>('list')
  const [results, setResults] = useState<PickerProduct[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [often, setOften] = useState<{ product: PickerProduct; variant: PickerVariant }[]>([])
  const [categories, setCategories] = useState<PickerCategory[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const seq = useRef(0)

  // Always open on the whole shop — a filter left over from last time hides items.
  useEffect(() => {
    if (!open) return
    setSearch('')
    setQ('')
    setCategoryId('')
    setView('list')
    setOpenId(null)
    setChoice(null)
    billsApi.often(storeId).then(setOften).catch(() => setOften([]))
    billsApi.categories(storeId).then(setCategories).catch(() => setCategories([]))
  }, [open, storeId])

  useEffect(() => {
    const handle = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    if (!open) return
    const mine = ++seq.current
    setResults(null)
    setError(null)
    setPage(1)
    billsApi
      .catalog(storeId, { q: q || undefined, categoryId: categoryId || undefined, page: 1, pageSize: PAGE_SIZE })
      .then(({ items, meta }) => {
        if (seq.current !== mine) return
        setResults(items)
        setTotal(meta.total)
      })
      .catch((err) => {
        if (seq.current === mine) setError(toApiError(err).message)
      })
  }, [open, storeId, q, categoryId])

  const showMore = async () => {
    const mine = seq.current
    setLoadingMore(true)
    try {
      const next = await billsApi.catalog(storeId, { q: q || undefined, categoryId: categoryId || undefined, page: page + 1, pageSize: PAGE_SIZE })
      if (seq.current !== mine) return
      setResults((prev) => [...(prev ?? []), ...next.items])
      setPage(page + 1)
    } catch (err) {
      if (seq.current === mine) setError(toApiError(err).message)
    } finally {
      setLoadingMore(false)
    }
  }

  const onBill = useMemo(() => new Map(lines.map((l) => [l.key, l.qty])), [lines])
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  const subtotal = lines.reduce((s, l) => s + Number(l.price) * l.qty, 0)
  const category = categories?.find((c) => c.id === categoryId) ?? null
  const parent = category ? (categories?.find((c) => c.id === category.parentId) ?? null) : null
  const categoryLabel = category ? (parent ? `${parent.name} › ${category.name}` : category.name) : 'All categories'

  const setOpen = (p: PickerProduct, opening: boolean) => {
    if (opening) {
      setOpenId(p.id)
      setChoice({ productId: p.id, values: autoChoice(p, q), qty: 1 })
    } else if (openId === p.id) {
      setOpenId(null)
      setChoice(null)
    }
  }

  const choose = (p: PickerProduct, type: string, value: string) => {
    const values = { ...(choice?.productId === p.id ? choice.values : {}), [type]: value }
    // A choice that no longer fits the new one is dropped.
    for (const t of p.optionTypes) {
      if (t.name === type || !values[t.name]) continue
      if (!p.variants.some((v) => v.stock > 0 && fits(v, values))) delete values[t.name]
    }
    setChoice({ productId: p.id, values, qty: 1 })
  }

  const addButton = (p: PickerProduct, v: PickerVariant, label: string) => (
    <Button variant="secondary" size="md" className="w-11 px-0!" onClick={() => onAdd(p, v, 1)} disabled={v.stock === 0} aria-label={`Add ${label}`}>
      <PlusIcon className="h-5 w-5 shrink-0" />
    </Button>
  )

  function renderOnBill(p: PickerProduct) {
    const here = p.variants.filter((v) => onBill.get(lineKey(p.id, v.id)))
    if (here.length === 0) return null
    return (
      <ul className="mt-3 space-y-2 border-t border-line pt-3">
        <li className="text-xs font-medium text-muted">On the bill</li>
        {here.map((v) => (
          <li key={v.id ?? 'default'} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm text-fg">{variantLabel(p, v)}</span>
            <Stepper qty={onBill.get(lineKey(p.id, v.id))!} max={v.stock} label={variantLabel(p, v)} onChange={(by) => onQty(lineKey(p.id, v.id), by)} />
          </li>
        ))}
      </ul>
    )
  }

  function renderChooser(p: PickerProduct) {
    const c = choice?.productId === p.id ? choice : { productId: p.id, values: {}, qty: 1 }
    const complete = p.optionTypes.every((t) => c.values[t.name])
    const chosen = complete ? (p.variants.find((v) => fits(v, c.values)) ?? null) : null
    const left = chosen ? chosen.stock - (onBill.get(lineKey(p.id, chosen.id)) ?? 0) : 0
    const qty = Math.max(1, Math.min(c.qty, left))
    const missing = p.optionTypes.filter((t) => !c.values[t.name]).map((t) => t.name.toLowerCase())
    return (
      <div className="space-y-3">
        {p.optionTypes.map((t) => (
          <fieldset key={t.name}>
            <legend className="mb-1.5 text-xs font-medium text-muted">
              {t.name}
              {c.values[t.name] && <span className="text-fg">: {c.values[t.name]}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {t.values.map((val) => {
                const on = c.values[t.name] === val
                const live = p.variants.some((v) => v.optionValues?.[t.name] === val && v.stock > 0 && fits(v, c.values, t.name))
                return <ChoiceChip key={val} name={`${p.id}:${t.name}`} label={val} checked={on} disabled={!live && !on} onPick={() => choose(p, t.name, val)} />
              })}
            </div>
          </fieldset>
        ))}
        {chosen ? (
          <div className="rounded-md border border-line bg-surface-alt p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{variantLabel(p, chosen)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {rupees(chosen.price)} · {left > 0 ? `${left} left` : 'No more in stock'}
                  {onBill.get(lineKey(p.id, chosen.id)) ? ` · ${onBill.get(lineKey(p.id, chosen.id))} on the bill` : ''}
                </p>
              </div>
              {left > 0 && (
                <Stepper qty={qty} max={left} label={variantLabel(p, chosen)} removeAtOne={false} onChange={(by) => setChoice({ ...c, qty: Math.max(1, Math.min(left, qty + by)) })} />
              )}
            </div>
            <Button
              variant="ink"
              size="md"
              full
              className="mt-3"
              disabled={left <= 0}
              onClick={() => {
                onAdd(p, chosen, qty)
                setChoice({ ...c, qty: 1 })
              }}
            >
              {left > 0 ? `Add ${qty} to bill` : 'All in stock are on the bill'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Choose {missing.join(' and ')} to add. Greyed values are sold out with your other choice.</p>
        )}
      </div>
    )
  }

  function renderRow(p: PickerProduct) {
    const v0 = p.variants[0]
    const out = p.stock === 0
    const meta = [
      rupees(p.priceMin ?? v0?.price ?? 0),
      isSimple(p)
        ? out
          ? 'Sold out'
          : `${p.stock} left`
        : p.optionTypes.map((t) => `${t.values.length} ${t.name.toLowerCase()}${t.values.length === 1 ? '' : 's'}`).join(' · ') + (out ? ' · sold out' : ''),
    ].join(' · ')
    const text = (
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 text-sm leading-snug font-medium ${out ? 'text-muted' : 'text-fg'}`}>{p.name}</span>
        <span className="mt-0.5 block text-xs text-muted">{meta}</span>
      </span>
    )
    if (isSimple(p) && v0) {
      const n = onBill.get(lineKey(p.id, v0.id)) ?? 0
      return (
        <li className="flex items-center gap-3 px-4 py-2">
          <Thumb src={p.imageUrl} dim={out} />
          {text}
          {n ? <Stepper qty={n} max={v0.stock} label={p.name} onChange={(by) => onQty(lineKey(p.id, v0.id), by)} /> : addButton(p, v0, p.name)}
        </li>
      )
    }
    const isOpen = openId === p.id
    const qtyOnBill = p.variants.reduce((s, v) => s + (onBill.get(lineKey(p.id, v.id)) ?? 0), 0)
    // The chosen variant's own photo, when it has one.
    const chosenImage = isOpen && choice?.productId === p.id ? p.variants.find((v) => fits(v, choice.values) && v.imageUrl)?.imageUrl : null
    return (
      <li>
        {/* A disclosure: the product opens to its options (one product open at a time). */}
        <details open={isOpen} onToggle={(e) => setOpen(p, e.currentTarget.open)}>
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2 transition-colors hover:bg-fg/5 [&::-webkit-details-marker]:hidden">
            <Thumb src={chosenImage ?? p.imageUrl} dim={out} />
            {text}
            {qtyOnBill > 0 && (
              <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-fg px-2 font-figure text-sm font-semibold text-surface">{qtyOnBill}</span>
            )}
            <ChevronDownIcon className={`h-5 w-5 shrink-0 text-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
          </summary>
          {isOpen && (
            <div className="px-4 pt-1 pb-3 pl-[72px]">
              {renderChooser(p)}
              {renderOnBill(p)}
            </div>
          )}
        </details>
      </li>
    )
  }

  const listBody = (
    <>
      {!q && !categoryId && often.length > 0 && (
        <section className="pb-1">
          <h3 className="px-4 pt-3 pb-1 text-sm font-semibold text-fg">Often billed</h3>
          <ul>
            {often.map(({ product: p, variant: v }) => {
              const n = onBill.get(lineKey(p.id, v.id)) ?? 0
              const label = variantLabel(p, v)
              return (
                <li key={lineKey(p.id, v.id)} className="flex items-center gap-3 px-4 py-2">
                  <Thumb src={v.imageUrl ?? p.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug font-medium text-fg">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {label && <span className="font-medium text-fg">{label} · </span>}
                      {rupees(v.price)} · {v.stock ? `${v.stock} left` : 'Sold out'}
                    </span>
                  </span>
                  {n ? <Stepper qty={n} max={v.stock} label={p.name} onChange={(by) => onQty(lineKey(p.id, v.id), by)} /> : addButton(p, v, `${p.name} ${label}`)}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <h3 className={`flex items-baseline justify-between gap-3 px-4 pt-3 pb-1 text-sm font-semibold text-fg ${!q && !categoryId && often.length > 0 ? 'border-t border-line' : ''}`}>
        <span>{q ? `Results for “${q}”` : category ? category.name : 'All products'}</span>
        {results && <span className="font-figure text-xs font-normal tabular-nums text-muted">{total.toLocaleString('en-IN')}</span>}
      </h3>
      {error && (
        <div className="px-4 py-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {results === null ? (
        <div aria-busy="true" className="space-y-2 px-4 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-fg/6" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted">{q ? `Nothing in ${category ? category.name : 'your shop'} matches “${q}”.` : 'No products in this category.'}</p>
          {category && q && (
            <Button variant="secondary" size="md" className="mt-3" onClick={() => setCategoryId('')}>
              Search all categories
            </Button>
          )}
          {!category && q && <p className="mt-2 text-xs text-muted">Only products shown in your shop can go on a bill.</p>}
        </div>
      ) : (
        <ul>
          {results.map((p) => (
            <Fragment key={p.id}>{renderRow(p)}</Fragment>
          ))}
        </ul>
      )}
      {results && results.length < total && (
        <div className="px-4 py-3">
          <Button variant="secondary" size="md" full loading={loadingMore} onClick={showMore}>
            Show {Math.min(PAGE_SIZE, total - results.length)} more · {(total - results.length).toLocaleString('en-IN')} left
          </Button>
        </div>
      )}
    </>
  )

  const roots = (categories ?? []).filter((c) => !c.parentId)
  const catRow = (c: { id: string; name: string; count: number }, sub = false) => (
    <li key={c.id || 'all'}>
      <label className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 transition-colors hover:bg-fg/5 has-[:focus-visible]:bg-fg/5 ${sub ? 'pl-8' : ''}`}>
        <input
          type="radio"
          name="bill-category"
          className="sr-only"
          checked={categoryId === c.id}
          onChange={() => {
            setCategoryId(c.id)
            setView('list')
            setOpenId(null)
          }}
        />
        <span className={`min-w-0 flex-1 truncate text-base text-fg ${sub ? '' : 'font-semibold'}`}>{c.name}</span>
        <span className="font-figure text-sm tabular-nums text-muted">{c.count.toLocaleString('en-IN')}</span>
        {categoryId === c.id ? <CheckIcon className="h-5 w-5 shrink-0 text-fg" /> : <span className="w-5" />}
      </label>
    </li>
  )
  const catsBody = (
    <ul className="py-2" role="radiogroup" aria-label="Category">
      {catRow({ id: '', name: 'All categories', count: roots.reduce((s, c) => s + c.count, 0) })}
      {roots.map((root) => (
        <li key={root.id} className="mt-2 border-t border-line pt-2">
          <ul>
            {catRow(root)}
            {(categories ?? []).filter((c) => c.parentId === root.id).map((c) => catRow(c, true))}
          </ul>
        </li>
      ))}
    </ul>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fill
      flush
      title={view === 'cats' ? 'Categories' : 'Add items'}
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{itemCount ? `${itemCount} item${itemCount === 1 ? '' : 's'} on the bill` : 'Nothing added yet'}</p>
            <p className="font-figure text-lg font-semibold tabular-nums text-fg">{rupees(subtotal)}</p>
          </div>
          <Button size="md" variant={choice && openId === choice.productId ? 'secondary' : 'ink'} onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="ws-form flex h-full min-h-0 flex-col">
        {view === 'list' ? (
          <div className="space-y-2 border-b border-line px-4 py-3">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setOpenId(null)
                }}
                placeholder="Name, size, colour or code"
                autoComplete="off"
                className={fieldClass({ className: 'pl-11' })}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="max-w-full" onClick={() => setView('cats')}>
                <span className="truncate">{categoryLabel}</span>
                <ChevronDownIcon className="h-4 w-4 shrink-0" />
              </Button>
              {category && (
                <Button variant="ghost" size="sm" onClick={() => setCategoryId('')}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="border-b border-line px-2 py-2">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}>
              <ArrowLeftIcon className="h-4 w-4" />
              Back to items
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{view === 'list' ? listBody : catsBody}</div>
      </div>
    </Dialog>
  )
}
