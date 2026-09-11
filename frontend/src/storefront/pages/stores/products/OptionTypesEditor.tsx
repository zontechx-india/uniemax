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
import { BoxIcon, PlusIcon, TrashIcon } from '../../../layout/icons'
import { CreateMemberDialog } from './CreateMemberDialog'
import { GroupMemberPicker } from './GroupMemberPicker'

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
        const label = `Option ${index + 1}`
        const placeholder = placeholders[index] ?? 'Name'

        if (kind === 'typed') {
          const type = types.find((t) => t.key === key)!
          return (
            <div key={key} className="rounded-md border border-line bg-surface p-3.5">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_auto]">
                    <TextField
                      label={label}
                      placeholder={placeholder}
                      value={type.name}
                      onChange={(e) =>
                        updateType(key, (t) => ({ ...t, name: e.target.value }))
                      }
                      maxLength={OPTION_LIMITS.nameLength}
                      disabled={disabled}
                      className="!h-11"
                    />
                    <KindSwitch
                      kind="typed"
                      disabled={disabled}
                      onChange={(to) => convert(key, to)}
                    />
                  </div>
                  <ChipInput
                    label="Values"
                    items={type.values}
                    placeholder="Type a value and press Enter — e.g. S, M, L"
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
                </div>
                <RemoveButton
                  label={`Remove option ${type.name || index + 1}`}
                  disabled={disabled}
                  onClick={() => remove(key)}
                />
              </div>
            </div>
          )
        }

        const group = groups.find((g) => g.key === key)!
        const name = group.name.trim()
        const memberIds = new Set(group.members.map((m) => m.productId))
        return (
          <div key={key} className="rounded-md border border-line bg-surface p-3.5">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_auto]">
                  <TextField
                    label={label}
                    placeholder={placeholder}
                    value={group.name}
                    onChange={(e) =>
                      updateGroup(key, (g) => ({ ...g, name: e.target.value }))
                    }
                    maxLength={OPTION_LIMITS.nameLength}
                    disabled={disabled}
                    className="!h-11"
                  />
                  <KindSwitch
                    kind="products"
                    disabled={disabled}
                    onChange={(to) => convert(key, to)}
                  />
                </div>

                <div>
                  <span className="mb-2 block text-sm font-medium text-muted">
                    {name ? `${name} products` : 'Products'}
                  </span>
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {group.members.map((member) => {
                      const self = member.productId === product.id
                      return (
                        <li
                          key={member.productId}
                          className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap"
                        >
                          {member.imageUrl ? (
                            <img
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
                            className="h-9 w-full rounded-md border border-line bg-input px-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent disabled:opacity-60 sm:w-36"
                          />
                          {self ? (
                            <span className="h-9 w-9 shrink-0" aria-hidden />
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPicking(key)}
                    disabled={disabled || !name}
                    title={name ? undefined : 'Name the option first'}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Select products
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(key)}
                    disabled={disabled || !name}
                    title={name ? undefined : 'Name the option first'}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Create new product for this value
                  </button>
                </div>
                <p className="text-xs text-muted">
                  Each one is a separate product with its own photos, price
                  and stock, listed like any other. On each one’s page the
                  family shows as a row of swatches, in this order.
                </p>
              </div>
              <RemoveButton
                label={`Remove option ${group.name || index + 1}`}
                disabled={disabled}
                onClick={() => remove(key)}
              />
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addTyped}
          disabled={disabled || full}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add option — type the values
        </button>
        <button
          type="button"
          onClick={addProducts}
          disabled={disabled || full}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add option — other products
        </button>
        <p className="text-xs text-muted">
          Up to {OPTION_LIMITS.types} options. Typed values become variants of
          this product; “other products” link separate products of your store
          as one family.
        </p>
      </div>

      <ConfirmDialog
        open={toTyped !== null}
        title="Type the values instead?"
        description={
          toTyped ? (
            <>
              <span className="font-medium text-fg">{toTyped.name || 'This option'}</span>{' '}
              will stop linking {toTyped.members.length - 1} other product
              {toTyped.members.length === 2 ? '' : 's'}. Those products stay
              in your store; only the family goes.
            </>
          ) : null
        }
        confirmLabel="Yes, type the values"
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

/** "Type the values" | "Other products" — the kind of one option card. */
function KindSwitch({
  kind,
  disabled,
  onChange,
}: {
  kind: Kind
  disabled: boolean
  onChange: (to: Kind) => void
}) {
  const option = (value: Kind, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      disabled={disabled}
      onClick={() => kind !== value && onChange(value)}
      className={`h-9 rounded-md px-3 text-xs font-semibold transition disabled:opacity-60 ${
        kind === value ? 'bg-brand text-brand-contrast shadow-floating' : 'text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-medium text-muted">Values are</span>
      <div
        role="radiogroup"
        aria-label="Kind of values"
        className="inline-flex h-11 items-center gap-1 rounded-md border border-line bg-surface-alt p-1"
      >
        {option('typed', 'Typed here')}
        {option('products', 'Other products')}
      </div>
    </div>
  )
}

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
      className={`flex shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40 ${
        small ? 'h-9 w-9' : 'mt-7 h-10 w-10'
      }`}
      aria-label={label}
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  )
}
