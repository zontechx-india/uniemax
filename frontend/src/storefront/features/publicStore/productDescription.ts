/**
 * Product description → highlights · prose · specifications.
 *
 * The catalog deliberately keeps ONE free-text field per product (see
 * CONTEXT.md — a product has a name, category and an optional description);
 * there is no highlights array and no specification table in the schema. So
 * rather than inventing selling points the seller never wrote, the product
 * page **reads the structure the seller already typed**:
 *
 * - `- Premium English Willow`  (`-`, `*`, `•` or `✔`) → a **highlight**
 * - `Material: English Willow`  (short label, short value) → a **spec row**
 * - anything else → **prose**, paragraph breaks preserved
 *
 * Nothing is fabricated: a plain paragraph description still renders exactly
 * as before, as one Description section. Two guards keep the heuristic honest:
 * a spec needs a short label AND a short value (so "Note: this bat is great
 * for club cricketers…" stays prose), and fewer than `MIN_SPECS` detected rows
 * fall back to prose (so a single colon line is never dressed up as a table).
 */

import type { ProductSpec } from '../stores/storesApi'

/**
 * The spec-row shape now lives with the API types (a product can carry real
 * `specifications`); re-exported here so the heuristic's callers are unchanged.
 * When a product has real specs they take precedence and this parser's rows
 * are ignored — see `SpecTable` in `StoreProductPage`.
 */
export type { ProductSpec }

export interface ParsedDescription {
  /** Bullet lines, in the order written. */
  highlights: string[]
  /** "Label: value" lines, in the order written. */
  specs: ProductSpec[]
  /** Everything else — paragraphs, blank-line separated. */
  paragraphs: string[]
}

/** A colon line only reads as a spec when both sides are short. */
const MAX_SPEC_LABEL = 28
const MAX_SPEC_VALUE = 60
/** Below this, detected specs are treated as ordinary prose instead. */
const MIN_SPECS = 2

const BULLET = /^\s*[-*•●▪✔✓]\s+(.*\S)\s*$/
const SPEC = /^\s*([^:]{2,}?)\s*:\s*(\S.*?)\s*$/

export function parseDescription(
  description: string | null,
): ParsedDescription {
  const empty: ParsedDescription = {
    highlights: [],
    specs: [],
    paragraphs: [],
  }
  if (!description?.trim()) return empty

  const highlights: string[] = []
  const specs: ProductSpec[] = []
  // Every line is classified first and the prose is assembled after, so
  // demoted spec lines fall back into their ORIGINAL position in the text.
  const lines = description.split(/\r?\n/).map((line) => {
    const bullet = BULLET.exec(line)
    if (bullet) {
      highlights.push(bullet[1]!)
      return { kind: 'bullet' as const, text: '' }
    }
    const spec = SPEC.exec(line)
    if (
      spec &&
      spec[1]!.length <= MAX_SPEC_LABEL &&
      spec[2]!.length <= MAX_SPEC_VALUE
    ) {
      specs.push({ label: spec[1]!, value: spec[2]! })
      return { kind: 'spec' as const, text: line.trim() }
    }
    return { kind: 'text' as const, text: line.trim() }
  })

  const specsWon = specs.length >= MIN_SPECS
  if (!specsWon) specs.length = 0

  const proseLines = lines
    .filter((line) => line.kind !== 'bullet' && !(specsWon && line.kind === 'spec'))
    .map((line) => line.text)

  return { highlights, specs, paragraphs: toParagraphs(proseLines) }
}

/** Collapse blank lines into paragraph breaks; drop leading/trailing blanks. */
function toParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (line === '') {
      if (current.length) paragraphs.push(current.join('\n'))
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) paragraphs.push(current.join('\n'))
  return paragraphs
}

/**
 * The `<meta name="description">` / `og:description` line for a product page.
 *
 * Google shows this verbatim as the result snippet, so it is written for a
 * shopper scanning a results list, not as a dump of the first 160 characters
 * of whatever the seller typed. Preference order:
 *
 *  1. the seller's own prose — it is the only text written about THIS product;
 *  2. their highlight bullets, joined — prose is absent but selling points
 *     were still written;
 *  3. a composed line from the facts the catalog always has (name, category,
 *     store, price), because an absent description is far worse for a snippet
 *     than a plain factual one, and most drafts ship with no description.
 *
 * The price is deliberately included in the fallback: a snippet carrying a
 * number earns clicks against ones that do not.
 */
export function productMetaDescription(
  product: {
    name: string
    description: string | null
    price: string | null
    category: { name: string }
  },
  storeName: string,
  formatPrice: (price: string | number) => string,
): string {
  const parsed = parseDescription(product.description)
  const prose = parsed.paragraphs.join(' ').trim()
  if (prose) return prose

  const highlights = parsed.highlights.join('. ').trim()
  if (highlights) return highlights

  const price = product.price ? ` from ${formatPrice(product.price)}` : ''
  return `Buy ${product.name}${price} — ${product.category.name} from ${storeName} on UnieMax. Order online with delivery or store pickup.`
}
