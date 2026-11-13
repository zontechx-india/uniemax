import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { Button } from '../../../../../shared/ui/Button'
import { CategoryChooserSheet } from '../../ui/CategoryChooserSheet'
import { showToast } from '../../ui/Toast'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { exampleChoice, findNameHint, listWords, VersionCard, withoutWord } from './choicesHelp'
import { CategoryPick } from './CategoryPick'
import { BoxIcon, PaletteIcon, TagIcon } from '../../../../layout/icons'
import {
  Hint,
  inputClass,
  Section,
  StepButtons,
  StepError,
  StepShell,
} from './shared'
import type { VersionPlan } from './shared'

/**
 * Step 1 — the two answers that make a product exist: what it is called and
 * where it goes. Continue creates the draft (or renames / moves an existing
 * product), so from here on every other step saves against a real id.
 *
 * The category is picked in `CategoryPick` (main category chips, then
 * sub-category cards) instead of a dropdown of "Fashion › Women › Sarees"
 * paths. If the right one is missing, the last chip, **+ Add a category**,
 * opens the same chooser the Categories page uses (on the main category the
 * seller was looking at), adds it, and selects it, so the seller never has
 * to leave the product.
 *
 * It also asks, before any photo is taken, whether the product comes in more
 * than one colour or size. Sellers who met that question only at step 3 had
 * already named and photographed one colour, answered "no", and made a
 * product per colour. A colour or weight typed into the name gets a one-tap
 * "take it out". Neither blocks Continue; step 3 asks again if skipped.
 */
export function BasicsStep({
  storeId,
  categories,
  product,
  onSaved,
  onNext,
  onCategoriesChange,
  plan,
  onPlanChange,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct | null
  onSaved: (product: StoreProduct) => void
  onNext: () => void
  /** A category was added from here — the page's list must learn of it. */
  onCategoriesChange?: (categories: StoreCategory[]) => void
  plan: VersionPlan
  onPlanChange: (plan: VersionPlan) => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(
    product?.category.id ?? defaultCategoryId(categories),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  /** Platform category the chooser opens on (the main category in view). */
  const [chooseFrom, setChooseFrom] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** The name word the seller chose to keep ("it really is only pink"). */
  const [kept, setKept] = useState<string | null>(null)

  const shelf = categories.find((c) => c.id === categoryId) ?? null
  // Only a product not yet priced or split into choices — one that is has
  // answered this already, and step 3 is where it changes.
  const askPlan =
    !product ||
    (!product.hasVariants &&
      product.groups.length === 0 &&
      !(Number(product.defaultVariant?.price ?? 0) > 0))
  const example = exampleChoice(shelf?.taxonomy?.optionTemplates ?? [])
  const found = askPlan && plan !== 'one' ? findNameHint(name) : null
  const tip = found && found.word.toLowerCase() !== kept ? found : null
  const shorter = tip ? withoutWord(name, tip.word) : ''
  const addedIds = new Set(categories.flatMap((c) => (c.categoryId ? [c.categoryId] : [])))

  /** Add a platform category to the shop from inside the wizard, and pick it. */
  const addCategory = async (taxonomyId: string, name: string) => {
    setAdding(true)
    try {
      const created = await storeCatalogApi.createCategory(storeId, { categoryId: taxonomyId })
      const list = await storeCatalogApi.listCategories(storeId)
      onCategoriesChange?.(list)
      setCategoryId(created.id)
      setChoosing(false)
      setError(null)
      showToast(`${name} added`)
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setAdding(false)
    }
  }

  const next = async () => {
    if (!name.trim()) return setError('Give the product a name first.')
    if (!categoryId) return setError('Choose the sub-category it belongs in — tap one under “Which category is it in?”.')
    setError(null)

    const unchanged =
      product && name.trim() === product.name && categoryId === product.category.id
    if (unchanged) return onNext()

    setBusy(true)
    try {
      const saved = product
        ? await storeCatalogApi.updateProduct(storeId, product.id, {
            ...(name.trim() !== product.name ? { name: name.trim() } : {}),
            ...(categoryId !== product.category.id ? { categoryId } : {}),
          })
        : await storeCatalogApi.createProduct(storeId, {
            name: name.trim(),
            categoryId,
          })
      onSaved(saved)
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepShell title="What are you selling?">
      <Section title="Product name" icon={TagIcon}>
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoFocus
            aria-label="Product name"
            placeholder="e.g. Banarasi silk saree"
            className={inputClass}
          />
          <Hint>The words a customer would search for.</Hint>
        </div>

        {tip && (
          <div role="note" className="rounded-md border border-brand/30 bg-brand-soft p-3">
            <p className="text-sm font-semibold text-fg">
              {tip.kind === 'colour' ? 'Other colours too?' : 'Other weights or sizes too?'}
            </p>
            <p className="text-hint text-muted">
              Leave “{tip.word}” out — add every {tip.kind === 'colour' ? 'colour' : 'weight'} in
              step 3.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
            {shorter.length >= 2 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setName(shorter)
                  onPlanChange('many')
                }}
              >
                Take “{tip.word}” out
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setKept(tip.word.toLowerCase())}>
              Keep the name
            </Button>
          </div>
        </div>
        )}
      </Section>

      {askPlan && (
        <Section title="More than one colour or size?" icon={PaletteIcon}>
          <div role="radiogroup" aria-label="More than one colour, size or weight?" className="grid grid-cols-2 gap-2.5">
            <VersionCard
              many={false}
              values={example.values}
              active={plan === 'one'}
              title="Just one"
              body="One price, one stock"
              onClick={() => onPlanChange('one')}
            />
            <VersionCard
              many
              values={example.values}
              active={plan === 'many'}
              title="Many versions"
              body={listWords(example.values)}
              onClick={() => onPlanChange('many')}
            />
          </div>
        </Section>
      )}

      <Section title="Category" icon={BoxIcon}>
        <CategoryPick
          categories={categories}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id)
            setError(null)
          }}
          onAdd={(mainId) => {
            setChooseFrom(categories.find((c) => c.id === mainId)?.categoryId ?? null)
            setChoosing(true)
          }}
        />
      </Section>

      <CategoryChooserSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        addedIds={addedIds}
        busy={adding}
        startAt={chooseFrom}
        title="Add a category"
        onPick={(node) => void addCategory(node.id, node.name)}
      />

      {error && <StepError>{error}</StepError>}

      <StepButtons
        onNext={() => void next()}
        busy={busy}
        nextLabel={product ? 'Continue' : 'Create & continue'}
      />
    </StepShell>
  )
}

/**
 * A new product's category: chosen for the seller only when the shop has
 * exactly one place it can go. A pre-picked first card was tapped straight
 * past (the same trap as a pre-picked "No" on step 3), and defaulting to a
 * parent filed products one level too high.
 */
function defaultCategoryId(categories: StoreCategory[]): string {
  const parents = new Set(categories.map((c) => c.parentId))
  const leaves = categories.filter((c) => !parents.has(c.id))
  return leaves.length === 1 ? leaves[0]!.id : ''
}
