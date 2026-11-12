import type { OptionValues, ProductOptionType } from './storesApi'

/**
 * Photos per look. A product photo may show one LOOK, a value of the
 * product's look option ("Colour" / "Pink"), or nothing (shared: a size
 * chart, the fabric). The seller ticks them on the wizard's Photos screen;
 * the server keeps them as `lookOption` / `lookValue` on each photo.
 *
 * A tag whose option or value no longer exists counts as shared, so a stale
 * tag can never hide a photo.
 */

interface LookMedia {
  id: string
  lookOption: string | null
  lookValue: string | null
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The look option the photos are tagged with, if it is still one of the product's options. */
export function lookOptionOf(
  media: readonly LookMedia[],
  optionTypes: readonly ProductOptionType[],
): ProductOptionType | null {
  for (const item of media) {
    if (!item.lookOption) continue
    const type = optionTypes.find((t) => same(t.name, item.lookOption!))
    if (type) return type
  }
  return null
}

/** The look a photo shows, or null when it is shared (or its tag is stale). */
export function lookOf(item: LookMedia, type: ProductOptionType | null): string | null {
  if (!type || !item.lookOption || !item.lookValue || !same(item.lookOption, type.name)) return null
  return type.values.find((v) => same(v, item.lookValue!)) ?? null
}

/**
 * The gallery for the shopper's current choice: that look's photos (its
 * variant photo first), then the shared ones; other looks' photos are left
 * out. Untagged products, no choice yet, or a look with no photos of its own
 * → every photo, as before.
 */
export function galleryFor<T extends LookMedia>(
  media: readonly T[],
  optionTypes: readonly ProductOptionType[],
  selection: OptionValues,
  leadId: string | null,
): T[] {
  const type = lookOptionOf(media, optionTypes)
  const picked = type ? selection[type.name] : undefined
  if (!type || !picked) return [...media]
  const mine = media.filter((item) => {
    const look = lookOf(item, type)
    return look !== null && same(look, picked)
  })
  if (mine.length === 0) return [...media]
  const shared = media.filter((item) => lookOf(item, type) === null)
  const lead = mine.find((item) => item.id === leadId)
  return [...(lead ? [lead] : []), ...mine.filter((item) => item !== lead), ...shared]
}
