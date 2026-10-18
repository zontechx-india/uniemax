import { MediaImg } from '../../../../../shared/media/MediaImg'
import type { ProductOptionType, StoreProductMediaItem } from '../../../../features/stores/storesApi'
import { PaletteIcon } from '../../../../layout/icons'

/**
 * Teaching "one product, many colours" without a demo. Sellers new to
 * online selling made a product per colour — "Banarasi saree red", "…blue" —
 * because the question came at step 3, after they had named it after one
 * colour and photographed only that one. These pieces ask earlier and show
 * the result instead of explaining it.
 */

/**
 * A how-to clip for the choices step. Null until one is recorded — nothing
 * renders while it is null, so there is never a dead link.
 */
export const CHOICES_VIDEO_URL: string | null = null

/** Longest first, so "sky blue" wins over "blue". */
const COLOURS = [
  'off white', 'off-white', 'sky blue', 'royal blue', 'navy blue', 'bottle green',
  'dark green', 'light green', 'baby pink', 'rani pink', 'dark blue', 'light blue',
  'multicolour', 'multicolor', 'turquoise', 'lavender', 'magenta', 'mustard', 'maroon',
  'golden', 'silver', 'purple', 'violet', 'orange', 'yellow', 'brown', 'beige', 'cream',
  'peach', 'coral', 'black', 'white', 'green', 'olive', 'grey', 'gray', 'navy', 'pink',
  'teal', 'wine', 'gold', 'mint', 'rust', 'blue', 'red',
]

const WEIGHT = /\b\d+(?:\.\d+)?\s?(?:kg|kgs|g|gm|gms|grams?|ml|ltr|litres?|liters?|l)\b/i

export type NameHint = { kind: 'colour' | 'weight'; word: string }

/** A colour or a weight written into a product name, if there is one. */
export function findNameHint(name: string): NameHint | null {
  const lower = name.toLowerCase()
  for (const colour of COLOURS) {
    const at = new RegExp(`(^|[^a-z])${colour.replace('-', '\\-')}(?=$|[^a-z])`).exec(lower)
    if (at) {
      const start = at.index + at[1]!.length
      return { kind: 'colour', word: name.slice(start, start + colour.length) }
    }
  }
  const weight = WEIGHT.exec(name)
  return weight ? { kind: 'weight', word: weight[0] } : null
}

/** The name with that word taken out, and the commas or dashes it leaves. */
export function withoutWord(name: string, word: string): string {
  const at = name.toLowerCase().indexOf(word.toLowerCase())
  if (at < 0) return name
  const joined = `${name.slice(0, at)} ${name.slice(at + word.length)}`
  return joined
    .replace(/\(\s*\)/g, '')
    .replace(/\s*([,\-–/|])(?:\s*[,\-–/|])+/g, ' $1')
    .replace(/^[\s,\-–/|]+|[\s,\-–/|]+$/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
}

/**
 * What a customer would choose for this category, from its own option
 * templates: Colour first when it has one (the case sellers get wrong),
 * else the first template, else plain colours.
 */
export function exampleChoice(presets: ProductOptionType[]): { name: string; values: string[] } {
  const colour = presets.find((p) => /colou?r/i.test(p.name) && p.values.length >= 2)
  const first = colour ?? presets.find((p) => p.values.length >= 2)
  return first
    ? { name: first.name, values: first.values.slice(0, 3) }
    : { name: 'Colour', values: ['Red', 'Blue', 'Green'] }
}

/** "Red, Blue and Green". */
export function listWords(values: string[]): string {
  if (values.length <= 1) return values.join('')
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

/**
 * A small drawing of the product page with a choice on it — the seller sees
 * what "choices" means before deciding, with their own photo and name.
 */
export function ChoicesPreview({
  name,
  photo,
  choice,
}: {
  name: string
  photo: StoreProductMediaItem | null
  choice: { name: string; values: string[] }
}) {
  return (
    <figure className="rounded-2xl border border-line bg-surface/70 p-4">
      <figcaption className="text-xs font-semibold tracking-wide text-muted uppercase">
        What your customer will see
      </figcaption>
      <div className="mt-3 flex gap-3" aria-hidden>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-fg/5 text-muted">
          {photo?.url ? (
            <MediaImg sizes="64px" src={photo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <PaletteIcon className="h-6 w-6" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-fg">{name}</span>
          <span className="mt-1 block text-sm text-muted">
            {choice.name}: <span className="font-semibold text-fg">{choice.values[0]}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {choice.values.map((value, i) => (
              <span
                key={value}
                className={`rounded-pill border px-3 py-1 text-sm font-semibold ${
                  i === 0 ? 'border-brand bg-brand-soft text-brand' : 'border-line text-fg'
                }`}
              >
                {value}
              </span>
            ))}
          </span>
        </span>
      </div>
      <p className="mt-3 text-hint text-muted">
        One product, one page. The customer taps a {choice.name.toLowerCase()} and buys — you
        see which one in the order.
      </p>
      {CHOICES_VIDEO_URL && (
        <a
          href={CHOICES_VIDEO_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-semibold text-brand underline-offset-2 hover:underline"
        >
          Watch how (30 sec)
        </a>
      )}
    </figure>
  )
}
