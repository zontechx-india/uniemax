import { useState } from 'react'
import { ChipInput } from '../../../../shared/ui/ChipInput'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { TextField } from '../../../../shared/ui/form'
import {
  candidateMember,
  selfMember,
} from '../../../features/stores/productGroups'
import type { GroupDraft } from '../../../features/stores/productGroups'
import {
  OPTION_LIMITS,
  newKey,
} from '../../../features/stores/productOptions'
import type { OptionTypeDraft } from '../../../features/stores/productOptions'
import { formatPrice } from '../../../features/stores/storesApi'
import type { StoreProduct } from '../../../features/stores/storesApi'
import { BoxIcon, ChevronDownIcon, PlusIcon, TrashIcon } from '../../../layout/icons'
import { buttonClass } from '../../../../shared/ui/Button'
import { CreateMemberDialog } from './CreateMemberDialog'
import { GroupMemberPicker } from './GroupMemberPicker'
import { MediaImg } from '../../../../shared/media/MediaImg'

/** Everything the editor edits, changed together so the cards stay one list. */
export interface OptionsDraft {
  /** Typed options — their values become variants inside this product. */
  types: OptionTypeDraft[]
  /** Products options — their values are other products of the store. */
  groups: GroupDraft[]
  /** Card keys in display order (a key belongs to one of the two lists). */
  order: string[]
}

type Kind = 'typed' | 'products'

/**
 * The seller's options — up to three, each one of two kinds:
 *
 *   - **Type the values** — "Size: S, M, L". The values become variants of
 *     THIS product, each with its own price and stock (the matrix below).
 *   - **Other products** — "Colour: Maroon (this one), Blue, Tan". The values
 *     are other products of the store, each a full product with its own
 *     photos, price and variants; this card only ties them into a family.
 *
 * Both kinds sit in one ordered list, and a card can switch kind in place —
 * "Colour" typed by mistake becomes "Colour" from products without retyping.
 * The parent owns every list and reconciles the matrix on each change.
 *
 * In the seller's words the first kind is simply a **choice** ("Choice 1:
 * Size — S, M, L"). The second is an ADVANCED path, behind "More ways to add
 * choices": "Typed here / Other products" side by side on every card was the
 * most abstract decision in the whole product flow, and most sellers only
 * ever need the first.
 */
export function OptionTypesEditor({
  draft,
  product,
  storeId,
  onChange,
  onCreateMember,
  disabled = false,
}: {
  draft: OptionsDraft
  /** The product being edited — always a member of its own families. */
  product: StoreProduct
  storeId: string
  onChange: (next: OptionsDraft) => void
  /** "Create new product for this value" — the parent copies, groups and switches. */
  onCreateMember: (groupKey: string, value: string, name: string) => void
  disabled?: boolean
}) {
  const { types, groups, order } = draft
  const [picking, setPicking] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [toTyped, setToTyped] = useState<GroupDraft | null>(null)
  // The linked-products path opens itself when the product already uses it.
  const [advanced, setAdvanced] = useState(groups.length > 0)

  const total = types.length + groups.length
  const full = total >= OPTION_LIMITS.types

  // Cards in the seller's order; anything the order list does not know yet
  // (should not happen, but keys are cheap to be safe about) goes last.
  type Card = { key: string; kind: Kind }
  const known = new Set(order)
  const cards: Card[] = [
    ...order.flatMap((key): Card[] => {
      if (types.some((t) => t.key === key)) return [{ key, kind: 'typed' }]
      if (groups.some((g) => g.key === key)) return [{ key, kind: 'products' }]
      return []
    }),
    ...types.filter((t) => !known.has(t.key)).map((t): Card => ({ key: t.key, kind: 'typed' })),
    ...groups.filter((g) => !known.has(g.key)).map((g): Card => ({ key: g.key, kind: 'products' })),
  ]

  const updateType = (key: string, patch: (type: OptionTypeDraft) => OptionTypeDraft) =>
    onChange({ ...draft, types: types.map((t) => (t.key === key ? patch(t) : t)) })
  const updateGroup = (key: string, patch: (group: GroupDraft) => GroupDraft) =>
    onChange({ ...draft, groups: groups.map((g) => (g.key === key ? patch(g) : g)) })
  const remove = (key: string) =>
    onChange({
      types: types.filter((t) => t.key !== key),
      groups: groups.filter((g) => g.key !== key),
      order: order.filter((k) => k !== key),
    })

  const addTyped = () => {
    const key = newKey()
    onChange({ ...draft, types: [...types, { key, name: '', values: [] }], order: [...order, key] })
  }
  const addProducts = () => {
    const key = newKey()
    onChange({
      ...draft,
      groups: [...groups, { key, name: '', members: [selfMember(product)] }],
      order: [...order, key],
    })
  }

  /** Same card, other kind. Keeps the key (its place) and the name. */
  const convert = (key: string, to: Kind) => {
    if (to === 'products') {
      const type = types.find((t) => t.key === key)
      if (!type) return
      onChange({
        ...draft,
        types: types.filter((t) => t.key !== key),
        groups: [...groups, { key, name: type.name, members: [selfMember(product)] }],
      })
      return
    }
    const group = groups.find((g) => g.key === key)
    if (!group) return
    if (group.members.length > 1) {
      setToTyped(group)
      return
    }
    onChange({
      ...draft,
      groups: groups.filter((g) => g.key !== key),
      types: [...types, { key, name: group.name, values: [] }],
    })
  }

  const placeholders = ['e.g. Size', 'e.g. Colour', 'e.g. Material']

  return (
    <div className="space-y-3">
      {cards.map(({ key, kind }, index) => {
        const label = `Choice ${index + 1}`
        const placeholder = placeholders[index] ?? 'Name'

        if (kind === 'typed') {
          const type = types.find((t) => t.key === key)!
          return (
            <div key={key} className="rounded-2xl border border-line bg-surface/70 p-4">
              <div className="space-y-4">
                <TextField
                  label={label}
                  placeholder={placeholder}
                  hint="What customers choose — like Size, Colour or Weight."
                  value={type.name}
                  onChange={(e) =>
                    updateType(key, (t) => ({ ...t, name: e.target.value }))
                  }
                  maxLength={OPTION_LIMITS.nameLength}
                  disabled={disabled}
                />
                <ChipInput
                    label={type.name.trim() ? `${type.name.trim()} options` : 'Options to pick from'}
                    items={type.values}
                    placeholder="Type one, then tap Add — e.g. S"
                    maxItems={OPTION_LIMITS.valuesPerType}
                    maxLength={OPTION_LIMITS.nameLength}
                    disabled={disabled}
                    ariaLabel={`Values for ${type.name || `option ${index + 1}`}`}
                    onAdd={(v) =>
                      updateType(key, (t) => ({
                        ...t,
                        values: [...t.values, { key: newKey(), value: v }],
                      }))
                    }
                    onRemove={(valueKey) =>
                      updateType(key, (t) => ({
                        ...t,
                        values: t.values.filter((v) => v.key !== valueKey),
                      }))
                    }
                    onRename={(valueKey, v) =>
                      updateType(key, (t) => ({
                        ...t,
                        values: t.values.map((entry) =>
                          entry.key === valueKey ? { ...entry, value: v } : entry,
                        ),
                      }))
                    }
                  />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RemoveButton
                    label={`Remove ${type.name.trim() || `choice ${index + 1}`}`}
                    disabled={disabled}
                    onClick={() => remove(key)}
                  />
                  {advanced && (
                    <button
                      type="button"
                      onClick={() => convert(key, 'products')}
                      disabled={disabled}
                      className="min-h-tap rounded-xl px-3 text-hint font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-50"
                    >
                      These are my other products
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        }

        const group = groups.find((g) => g.key === key)!
        const name = group.name.trim()
        const memberIds = new Set(group.members.map((m) => m.productId))
        return (
          <div key={key} className="rounded-2xl border border-brand/25 bg-surface/70 p-4">
            <div>
              <div className="space-y-4">
                <p className="inline-flex items-center gap-1.5 rounded-pill bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand">
                  Linked products
                </p>
                <TextField
                  label={label}
                  placeholder={placeholder}
                  hint="Each option is a separate product in your shop."
                  value={group.name}
                  onChange={(e) =>
                    updateGroup(key, (g) => ({ ...g, name: e.target.value }))
                  }
                  maxLength={OPTION_LIMITS.nameLength}
                  disabled={disabled}
                />

                <div>
                  <span className="mb-2 block text-[14px] font-medium text-muted">
                    {name ? `${name} products` : 'Products'}
                  </span>
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {group.members.map((member) => {
                      const self = member.productId === product.id
                      return (
                        <li
                          key={member.productId}
                          className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap"
                        >
                          {member.imageUrl ? (
                            <MediaImg
                              sizes="40px"
                              src={member.imageUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-md border border-line object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted">
                              <BoxIcon className="h-4 w-4" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 basis-40">
                            <span className="block truncate text-sm font-semibold text-fg">
                              {member.name}
                              {self && (
                                <span className="ml-1.5 text-xs font-normal text-muted">
                                  (this product)
                                </span>
                              )}
                              {member.isDraft && !self && (
                                <span className="ml-1.5 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                  Draft
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {member.price && Number(member.price) > 0
                                ? formatPrice(member.price)
                                : 'No price yet'}
                            </span>
                          </span>
                          <input
                            value={member.value}
                            onChange={(e) =>
                              updateGroup(key, (g) => ({
                                ...g,
                                members: g.members.map((m) =>
                                  m.productId === member.productId
                                    ? { ...m, value: e.target.value }
                                    : m,
                                ),
                              }))
                            }
                            placeholder={name ? `Which ${name}?` : 'e.g. Blue'}
                            maxLength={OPTION_LIMITS.nameLength}
                            disabled={disabled}
                            aria-label={`${name || 'Value'} of ${member.name}`}
                            className="h-tap w-full rounded-md border border-line bg-input px-3 text-[15px] text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60 sm:w-40"
                          />
                          {self ? (
                            <span className="hidden h-tap w-tap shrink-0 sm:block" aria-hidden />
                          ) : (
                            <RemoveButton
                              small
                              label={`Remove ${member.name}`}
                              disabled={disabled}
                              onClick={() =>
                                updateGroup(key, (g) => ({
                                  ...g,
                                  members: g.members.filter(
                                    (m) => m.productId !== member.productId,
                                  ),
                                }))
                              }
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPicking(key)}
                    disabled={disabled || !name}
                    title={name ? undefined : 'Name the choice first'}
                    className={buttonClass({ variant: 'secondary', size: 'md' })}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Pick from my products
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(key)}
                    disabled={disabled || !name}
                    title={name ? undefined : 'Name the choice first'}
                    className={buttonClass({ variant: 'secondary', size: 'md' })}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Make a new product for this
                  </button>
                </div>
                {!name && (
                  <p className="text-hint text-muted">Type a name above first, like “Colour”.</p>
                )}
                <p className="text-hint text-muted">
                  Each one keeps its own photos, price and stock. On each
                  product’s page customers see the others as options to tap,
                  in this order.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RemoveButton
                    label={`Remove ${group.name.trim() || `choice ${index + 1}`}`}
                    disabled={disabled}
                    onClick={() => remove(key)}
                  />
                  <button
                    type="button"
                    onClick={() => convert(key, 'typed')}
                    disabled={disabled}
                    className="min-h-tap rounded-xl px-3 text-hint font-semibold text-brand transition hover:bg-brand-soft disabled:opacity-50"
                  >
                    Type the options instead
                  </button>
                </div>
              </div>
            </div>

            <GroupMemberPicker
              open={picking === key}
              storeId={storeId}
              productId={product.id}
              optionName={name || 'Option'}
              selectedIds={memberIds}
              onClose={() => setPicking(null)}
              onAdd={(candidates) =>
                updateGroup(key, (g) => ({
                  ...g,
                  members: [
                    ...g.members,
                    ...candidates
                      .filter((c) => !memberIds.has(c.id))
                      .map((c) => candidateMember(c, product.name)),
                  ],
                }))
              }
            />
            <CreateMemberDialog
              open={creating === key}
              optionName={name || 'option'}
              baseName={product.name}
              busy={disabled}
              onClose={() => setCreating(null)}
              onCreate={(value, newName) => {
                setCreating(null)
                onCreateMember(key, value, newName)
              }}
            />
          </div>
        )
      })}

      <div className="space-y-2">
        <button
          type="button"
          onClick={addTyped}
          disabled={disabled || full}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 px-4 text-[15px] font-semibold text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-5 w-5" />
          {cards.length === 0 ? 'Add a choice, like Size or Colour' : 'Add another choice'}
        </button>
        <p className="text-hint text-muted">
          Up to {OPTION_LIMITS.types} choices.
          {full && ' Remove one to add another.'}
        </p>

        {/* The advanced path — linking separate products — stays out of the
            way until asked for. */}
        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          aria-expanded={advanced}
          className="inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-[14px] font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
        >
          More ways to add choices
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
        </button>
        {advanced && (
          <div className="rounded-2xl bg-fg/[0.04] p-3.5">
            <p className="text-[14px] font-semibold text-fg">
              Link my other products (advanced)
            </p>
            <p className="mt-0.5 text-hint text-muted">
              Use this when each colour or size is already a separate product
              in your shop, with its own photos — for example a saree you
              sell in Maroon, Blue and Tan as three products.
            </p>
            <button
              type="button"
              onClick={() => {
                addProducts()
              }}
              disabled={disabled || full}
              className={buttonClass({ variant: 'secondary', size: 'md', className: 'mt-3' })}
            >
              <PlusIcon className="h-4 w-4" />
              Link my other products
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toTyped !== null}
        title="Type the options instead?"
        description={
          toTyped ? (
            <>
              <span className="font-medium text-fg">{toTyped.name || 'This option'}</span>{' '}
              will stop linking {toTyped.members.length - 1} other product
              {toTyped.members.length === 2 ? '' : 's'}. Those products stay
              in your shop; only the link between them goes.
            </>
          ) : null
        }
        confirmLabel="Yes, type them"
        onConfirm={() => {
          if (!toTyped) return
          const { key, name: groupName } = toTyped
          setToTyped(null)
          onChange({
            ...draft,
            groups: groups.filter((g) => g.key !== key),
            types: [...types, { key, name: groupName, values: [] }],
          })
        }}
        onCancel={() => setToTyped(null)}
      />
    </div>
  )
}

/**
 * Remove — with the word on it (a bare bin icon was the most-missed meaning
 * in the flow). `small` is the member-row version: icon-only at 44px, since
 * its row already names the product it removes.
 */
function RemoveButton({
  label,
  disabled,
  onClick,
  small = false,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40 ${
        small ? 'size-tap' : 'min-h-tap px-3'
      }`}
    >
      <TrashIcon className="h-4 w-4" />
      {!small && 'Remove'}
    </button>
  )
}
