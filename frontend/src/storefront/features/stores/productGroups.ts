import { OPTION_LIMITS, newKey } from './productOptions'
import type {
  GroupCandidate,
  StoreProduct,
  StoreProductGroup,
  StoreProductGroupsInput,
} from './storesApi'

/**
 * The seller's draft of a product FAMILY — the "Other products" mode of an
 * option. Where a typed option's values become variants inside this product,
 * a products option's values are other products of the store, each a full
 * product of its own; the group is only what ties them together.
 *
 * Kept apart from `productOptions.ts` on purpose: that file's draft is the
 * cartesian matrix, and a family is not a dimension of it. The two meet only
 * in `PricingStep`, which renders both kinds as one ordered list of cards and
 * saves each through its own endpoint.
 */

export interface GroupMemberDraft {
  productId: string
  name: string
  imageUrl: string | null
  price: string | null
  isDraft: boolean
  /** Its position on the axis — "Maroon". What the seller types per member. */
  value: string
}

export interface GroupDraft {
  /** Client-side key, never sent. Shared with the cards list for ordering. */
  key: string
  /** The axis — "Colour". */
  name: string
  /** In the seller's order — the order of the storefront's swatch row. */
  members: GroupMemberDraft[]
}

/** This product as a member of its own family — always the first row. */
export function selfMember(product: StoreProduct, value = ''): GroupMemberDraft {
  return {
    productId: product.id,
    name: product.name,
    imageUrl: product.media.find((m) => m.type === 'IMAGE')?.url ?? null,
    price: product.price,
    isDraft: product.isDraft,
    value,
  }
}

/** A candidate from the picker as a member, with a first guess at its value. */
export function candidateMember(
  candidate: GroupCandidate,
  selfName: string,
): GroupMemberDraft {
  return {
    productId: candidate.id,
    name: candidate.name,
    imageUrl: candidate.imageUrl,
    price: candidate.price,
    isDraft: candidate.isDraft,
    value: guessValue(candidate.name, selfName),
  }
}

/** Start the drafts from what the server holds. */
export function toGroupDrafts(product: StoreProduct): GroupDraft[] {
  return product.groups.map((group) => ({
    key: newKey(),
    name: group.optionName,
    members: group.members.map((member) => ({
      productId: member.productId,
      name: member.name,
      imageUrl: member.imageUrl,
      price: member.price,
      isDraft: member.isDraft,
      value: member.value,
    })),
  }))
}

/**
 * The words in a member's name that are not in this product's name — "Alan
 * Jones Polo Blue" beside "Alan Jones Polo Maroon" guesses "Blue". Empty when
 * nothing differs; the seller always sees and can change it.
 */
export function guessValue(memberName: string, selfName: string): string {
  const own = new Set(
    selfName
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  )
  const rest = memberName
    .split(/\s+/)
    .filter((word) => word && !own.has(word.toLowerCase()))
  return rest.join(' ').slice(0, OPTION_LIMITS.nameLength)
}

const fold = (value: string) => value.trim().toLowerCase()

/**
 * Validate the drafts and build the PUT body — or say, in the seller's
 * words, what is wrong. `manualNames` are the typed options' names, because
 * an axis is one or the other, never both. `selfId` must be in every family.
 */
export function groupsToInput(
  groups: GroupDraft[],
  manualNames: string[],
  selfId: string,
): { input: StoreProductGroupsInput } | { error: string } {
  if (groups.length + manualNames.length > OPTION_LIMITS.types) {
    return { error: `Up to ${OPTION_LIMITS.types} options in total.` }
  }
  const seen = new Set(manualNames.map(fold).filter(Boolean))
  for (const group of groups) {
    const name = group.name.trim()
    if (!name) return { error: 'Give every option a name — Colour, Size…' }
    if (seen.has(fold(name))) {
      return { error: `"${name}" is used twice — each option needs its own name.` }
    }
    seen.add(fold(name))

    if (!group.members.some((member) => member.productId === selfId)) {
      return { error: `This product must be one of the "${name}" products.` }
    }
    if (group.members.length < 2) {
      return {
        error: `"${name}" needs at least one other product — select one from your store or create it.`,
      }
    }
    const values = new Set<string>()
    for (const member of group.members) {
      const value = member.value.trim()
      if (!value) {
        return { error: `Say which ${name} "${member.name}" is — e.g. Blue.` }
      }
      if (values.has(fold(value))) {
        return { error: `Two "${name}" products are both "${value}".` }
      }
      values.add(fold(value))
    }
  }
  return {
    input: {
      groups: groups.map((group) => ({
        optionName: group.name.trim(),
        members: group.members.map((member) => ({
          productId: member.productId,
          value: member.value.trim(),
        })),
      })),
    },
  }
}

/** True when saving the drafts would change nothing — skip the PUT. */
export function groupsEqual(drafts: GroupDraft[], saved: StoreProductGroup[]): boolean {
  if (drafts.length !== saved.length) return false
  return drafts.every((draft, i) => {
    const group = saved[i]
    if (!group || fold(draft.name) !== fold(group.optionName)) return false
    if (draft.name.trim() !== group.optionName) return false
    if (draft.members.length !== group.members.length) return false
    return draft.members.every((member, j) => {
      const other = group.members[j]
      return (
        other !== undefined &&
        other.productId === member.productId &&
        other.value === member.value.trim()
      )
    })
  })
}
