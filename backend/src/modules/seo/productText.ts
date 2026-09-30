/**
 * The product-page snippet, composed on the server.
 *
 * A **port** of the storefront's own logic — `parseDescription` and
 * `productMetaDescription` in
 * `frontend/src/storefront/features/publicStore/productDescription.ts`, and
 * `formatPrice` in `frontend/src/storefront/features/stores/storesApi.ts`.
 * The page shell writes the head a crawler sees in the first byte and the SPA
 * rewrites it after mount, so both must say the same thing: a change to one
 * side belongs in the other. Only the parts the snippet needs are here.
 */

/** A colon line only reads as a spec when both sides are short. */
const MAX_SPEC_LABEL = 28;
const MAX_SPEC_VALUE = 60;
/** Below this, detected specs are treated as ordinary prose instead. */
const MIN_SPECS = 2;

const BULLET = /^\s*[-*•●▪✔✓]\s+(.*\S)\s*$/;
const SPEC = /^\s*([^:]{2,}?)\s*:\s*(\S.*?)\s*$/;

interface ParsedDescription {
  /** Bullet lines, in the order written. */
  highlights: string[];
  /** Everything else — paragraphs, blank-line separated. */
  paragraphs: string[];
}

/**
 * Bullets → highlights, short "Label: value" lines → spec rows (only when at
 * least `MIN_SPECS` of them exist), everything else → prose paragraphs.
 */
export function parseDescription(description: string | null): ParsedDescription {
  if (!description?.trim()) return { highlights: [], paragraphs: [] };

  const highlights: string[] = [];
  let specCount = 0;
  const lines = description.split(/\r?\n/).map((line) => {
    const bullet = BULLET.exec(line);
    if (bullet) {
      highlights.push(bullet[1]!);
      return { kind: "bullet" as const, text: "" };
    }
    const spec = SPEC.exec(line);
    if (spec && spec[1]!.length <= MAX_SPEC_LABEL && spec[2]!.length <= MAX_SPEC_VALUE) {
      specCount += 1;
      return { kind: "spec" as const, text: line.trim() };
    }
    return { kind: "text" as const, text: line.trim() };
  });

  const specsWon = specCount >= MIN_SPECS;
  const proseLines = lines
    .filter((line) => line.kind !== "bullet" && !(specsWon && line.kind === "spec"))
    .map((line) => line.text);

  return { highlights, paragraphs: toParagraphs(proseLines) };
}

/** Collapse blank lines into paragraph breaks; drop leading/trailing blanks. */
function toParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === "") {
      if (current.length) paragraphs.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) paragraphs.push(current.join("\n"));
  return paragraphs;
}

/** "₹1,299" / "₹1,299.50" — Indian digit grouping, paise only when present. */
export function formatPrice(price: string | number): string {
  const value = Number(price);
  if (Number.isNaN(value)) return `₹${price}`;
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The seller's prose, else their highlight bullets, else a factual line
 * composed from name, price, category and store.
 */
export function productMetaDescription(
  product: {
    name: string;
    description: string | null;
    price: string | null;
    category: { name: string };
  },
  storeName: string,
): string {
  const parsed = parseDescription(product.description);
  const prose = parsed.paragraphs.join(" ").trim();
  if (prose) return prose;

  const highlights = parsed.highlights.join(". ").trim();
  if (highlights) return highlights;

  const price = product.price ? ` from ${formatPrice(product.price)}` : "";
  return `Buy ${product.name}${price} — ${product.category.name} from ${storeName} on UnieMax. Order online with delivery or store pickup.`;
}
